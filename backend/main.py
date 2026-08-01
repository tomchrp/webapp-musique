"""
==============================================================================
Chemin : backend/main.py
Utilité : Point d'entrée principal de l'API FastAPI.
Mise à jour : Correction critique de la synchronisation d'état (State Management).
              - Création de la tâche asynchrone `notify_library_updated` pour 
                absorber la latence de cohérence éventuelle des serveurs Google (3s) 
                sans bloquer la boucle d'événements de l'agent IA.
              - Ajout du déclencheur de rafraîchissement sur l'outil de 
                sauvegarde des favoris (Likes) qui était jusqu'ici ignoré.
==============================================================================
"""

import os
import json
import asyncio
import traceback
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import yt_dlp
import httpx
from google import genai
from google.genai import types
from thefuzz import fuzz

from backend.services.ytmusic_service import ytmusic_service
from backend.core.player_state import player_state

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI()

MODEL = "gemini-3.1-flash-live-preview"
client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

gemini_tools = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="gerer_musique",
            description="Recherche et lit une musique, un artiste ou une playlist PUBLIQUE sur YouTube. NE L'UTILISE PAS si l'utilisateur précise que la playlist lui appartient (ex: 'ma playlist').",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "action": types.Schema(type=types.Type.STRING, description="'play_now' ou 'add_to_queue'"),
                    "type_recherche": types.Schema(type=types.Type.STRING, description="'chanson' ou 'playlist'"),
                    "requete": types.Schema(type=types.Type.STRING, description="Nom du titre ou de la playlist publique.")
                },
                required=["action", "type_recherche", "requete"]
            )
        ),
        types.FunctionDeclaration(
            name="jouer_playlist_personnelle",
            description="EXCLUSIVEMENT pour chercher et lancer la lecture d'une playlist PRIVÉE/PERSONNELLE appartenant à l'utilisateur. Utilise cet outil dès que l'utilisateur dit 'ma playlist', 'mes favoris' ou 'ma bibliothèque'.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Le nom précis de la playlist de l'utilisateur.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="sauvegarder_titre_actuel",
            description="Ajoute le titre en cours de lecture aux favoris (Likes)."
        ),
        types.FunctionDeclaration(
            name="creer_playlist_avec_titre",
            description="Crée une nouvelle playlist privée et y ajoute le titre en cours de lecture.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Nom de la future playlist.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="ajouter_titre_playlist_existante",
            description="Ajoute le titre en cours à une de tes playlists. ATTENTION : Tu dois fournir le nom EXACT. Si la requête échoue ou que tu as un doute, utilise D'ABORD l'outil 'lister_playlists_personnelles' pour lire la liste, puis rappelle cet outil avec le nom correct.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Nom EXACT de la playlist cible.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="jouer_style_actuel",
            description="Génère une nouvelle radio de découverte basée sur le titre actuellement en cours de lecture."
        ),
        types.FunctionDeclaration(
            name="lister_playlists_personnelles",
            description="Récupère la liste des playlists privées de l'utilisateur. Utilise cet outil si l'utilisateur demande quelles sont ses playlists, ou si tu as un doute sur le nom exact avant de lancer la lecture."
        ),
    ]
)

CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    tools=[gemini_tools],
    system_instruction=types.Content(parts=[
        types.Part(text=(
            "Tu es un assistant musical francophone direct et efficace. "
            "Tu gères la musique de l'utilisateur. "
            "RÈGLE ABSOLUE : Si l'utilisateur dit 'Joue ma playlist [Nom]', tu DOIS utiliser l'outil 'jouer_playlist_personnelle'. L'outil 'gerer_musique' est strictement réservé aux recherches publiques. "
            "Confirme toujours oralement de manière très courte (ex: 'Je lance ta playlist', 'Titre sauvegardé') après l'action. "
            "Si un outil renvoie un message 'DÉFAUT D'AUTHENTIFICATION', tu dois annoncer le problème exact à l'utilisateur."
        ))
    ]),
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    async def safe_send_text(text: str):
        try:
            await websocket.send_text(text)
        except Exception:
            pass 

    async def safe_send_bytes(data: bytes):
        try:
            await websocket.send_bytes(data)
        except Exception:
            pass 

    async def notify_library_updated(delai=3):
        """
        Descriptif :
        Tâche asynchrone exécutée en arrière-plan.
        Attend un délai spécifique avant d'envoyer le signal de mise à jour au client.
        Cela permet aux serveurs de Google (qui utilisent une base de données à 
        cohérence éventuelle) de synchroniser leurs données en interne avant que 
        le frontend ne tente de purger son cache et de rafraîchir son affichage.
        """
        await asyncio.sleep(delai)
        await safe_send_text(json.dumps({"action": "library_updated"}))

    try:
        async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
            async def receive_from_client():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await session.send_realtime_input(
                            audio={"data": data, "mime_type": "audio/pcm;rate=16000"}
                        )
                except Exception:
                    pass

            async def receive_from_gemini():
                try:
                    while True:
                        turn = session.receive()
                        async for response in turn:
                            
                            if server_content := getattr(response, "server_content", None):
                                if getattr(server_content, "interrupted", False):
                                    await safe_send_text(json.dumps({"action": "interrupted"}))

                            if data := response.data:
                                await safe_send_bytes(data)
                                
                            if tool_call := response.tool_call:
                                tool_responses_list = []
                                
                                for function_call in tool_call.function_calls:
                                    nom_outil = function_call.name
                                    args = function_call.args
                                    
                                    groupe = "C" 
                                    if nom_outil in ["gerer_musique", "jouer_playlist_personnelle", "jouer_style_actuel"]:
                                        groupe = "A" 
                                    elif nom_outil in ["sauvegarder_titre_actuel", "creer_playlist_avec_titre", "ajouter_titre_playlist_existante"]:
                                        groupe = "B" 
                                        
                                    await safe_send_text(json.dumps({"action": "tool_called", "group": groupe}))
                                    
                                    print(f"\n{'='*50}")
                                    print(f"[APPEL D'OUTIL PAR GEMINI] -> Groupe {groupe}")
                                    print(f"Outil appelé : {nom_outil}")
                                    print(f"Arguments    : {args}")
                                    print(f"{'='*50}\n")
                                    
                                    resultat_execution = {"status": "success", "message": "Opération réussie."}
                                    
                                    try:
                                        if nom_outil == "gerer_musique":
                                            action = args.get("action", "play_now")
                                            type_recherche = args.get("type_recherche", "chanson")
                                            requete = args.get("requete", "")
                                            
                                            await safe_send_text(json.dumps({"action": "loading"}))
                                            
                                            current = None
                                            queue = []
                                            
                                            if type_recherche == "playlist":
                                                search_results = await ytmusic_service.search(requete, filter="playlists", limit=1)
                                                if search_results:
                                                    browse_id = search_results[0]['browseId']
                                                    radio_data = await ytmusic_service.generate_radio(playlist_id=browse_id)
                                                    tracks = radio_data.get("tracks", [])
                                                    if tracks:
                                                        current = tracks[0]
                                                        queue = tracks[1:]
                                            else:
                                                search_results = await ytmusic_service.search(requete, filter="songs", limit=1)
                                                if search_results:
                                                    video_id = search_results[0]['videoId']
                                                    radio_data = await ytmusic_service.generate_radio(video_id=video_id)
                                                    tracks = radio_data.get("tracks", [])
                                                    if tracks:
                                                        current = tracks[0]
                                                        queue = tracks[1:]
                                            
                                            if current:
                                                artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                                thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
                                                thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
                                                
                                                if action == "play_now":
                                                    player_state.play_now(current, queue)
                                                
                                                next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
                                                
                                                payload = {
                                                    "action": "play_music",
                                                    "video_id": current['videoId'],
                                                    "title": current['title'],
                                                    "artist": artist_name,
                                                    "thumbnail": thumbnail_url,
                                                    "next_title": next_title
                                                }
                                                await safe_send_text(json.dumps(payload))
                                            else:
                                                resultat_execution = {"status": "error", "message": "Aucun titre trouvé."}
                                                await safe_send_text(json.dumps({"action": "error", "message": "Aucun résultat trouvé."}))

                                        else:
                                            needs_current_track = [
                                                "sauvegarder_titre_actuel", 
                                                "creer_playlist_avec_titre", 
                                                "ajouter_titre_playlist_existante",
                                                "jouer_style_actuel"
                                            ]
                                            
                                            if nom_outil in needs_current_track and not player_state.current_track:
                                                resultat_execution = {"status": "error", "message": "Aucune musique en cours de lecture. Demande à l'utilisateur de lancer un titre d'abord."}
                                            
                                            else:
                                                current_vid = player_state.current_track['videoId'] if player_state.current_track else None
                                                
                                                if nom_outil == "sauvegarder_titre_actuel":
                                                    await ytmusic_service.rate_song(current_vid, 'LIKE')
                                                    asyncio.create_task(notify_library_updated())
                                                
                                                elif nom_outil == "creer_playlist_avec_titre":
                                                    nom_playlist = args.get("nom_playlist")
                                                    await ytmusic_service.create_playlist(nom_playlist, [current_vid])
                                                    asyncio.create_task(notify_library_updated())
                                                
                                                elif nom_outil == "ajouter_titre_playlist_existante":
                                                    nom_cible = args.get("nom_playlist")
                                                    playlists = await ytmusic_service.get_user_playlists()
                                                    
                                                    if not playlists:
                                                        resultat_execution = {"status": "error", "message": "DÉFAUT D'AUTHENTIFICATION : Impossible de lire la bibliothèque."}
                                                    else:
                                                        id_trouve = None
                                                        for p in playlists:
                                                            if p['title'].strip().lower() == nom_cible.strip().lower():
                                                                id_trouve = p['playlistId']
                                                                break
                                                                
                                                        if id_trouve:
                                                            await ytmusic_service.add_to_playlist(id_trouve, [current_vid])
                                                            asyncio.create_task(notify_library_updated())
                                                        else:
                                                            resultat_execution = {"status": "error", "message": f"ÉCHEC : La playlist '{nom_cible}' est introuvable. Utilise l'outil 'lister_playlists_personnelles' pour trouver le nom exact puis recommence."}

                                                elif nom_outil == "jouer_playlist_personnelle":
                                                    nom_cible = args.get("nom_playlist")
                                                    playlists = await ytmusic_service.get_user_playlists()
                                                    
                                                    if not playlists:
                                                        resultat_execution = {"status": "error", "message": "DÉFAUT D'AUTHENTIFICATION : Impossible de lire la bibliothèque."}
                                                    else:
                                                        meilleur_score = 0
                                                        id_trouve = None
                                                        for p in playlists:
                                                            score = fuzz.partial_ratio(nom_cible.lower(), p['title'].lower())
                                                            if score > meilleur_score:
                                                                meilleur_score = score
                                                                id_trouve = p['playlistId']
                                                                
                                                        if meilleur_score > 60 and id_trouve:
                                                            await safe_send_text(json.dumps({"action": "loading"}))
                                                            radio_data = await ytmusic_service.generate_radio(playlist_id=id_trouve, radio=False)
                                                            tracks = radio_data.get("tracks", [])
                                                            if tracks:
                                                                current = tracks[0]
                                                                queue = tracks[1:]
                                                                artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                                                thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
                                                                thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
                                                                
                                                                player_state.play_now(current, queue)
                                                                next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
                                                                
                                                                payload = {
                                                                    "action": "play_music",
                                                                    "video_id": current['videoId'],
                                                                    "title": current['title'],
                                                                    "artist": artist_name,
                                                                    "thumbnail": thumbnail_url,
                                                                    "next_title": next_title
                                                                }
                                                                await safe_send_text(json.dumps(payload))
                                                            else:
                                                                resultat_execution = {"status": "error", "message": "Cette playlist est vide."}
                                                        else:
                                                            resultat_execution = {"status": "error", "message": f"Ta playlist {nom_cible} est introuvable."}

                                                elif nom_outil == "jouer_style_actuel":
                                                    await safe_send_text(json.dumps({"action": "loading"}))
                                                    radio_data = await ytmusic_service.generate_radio(video_id=current_vid)
                                                    tracks = radio_data.get("tracks", [])
                                                    
                                                    if len(tracks) > 1:
                                                        current = tracks[1]
                                                        queue = tracks[2:]
                                                        artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                                        thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
                                                        thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
                                                        
                                                        player_state.play_now(current, queue)
                                                        next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
                                                        
                                                        payload = {
                                                            "action": "play_music",
                                                            "video_id": current['videoId'],
                                                            "title": current['title'],
                                                            "artist": artist_name,
                                                            "thumbnail": thumbnail_url,
                                                            "next_title": next_title
                                                        }
                                                        await safe_send_text(json.dumps(payload))
                                                    else:
                                                        resultat_execution = {"status": "error", "message": "Impossible de générer une radio à partir de ce titre."}

                                                elif nom_outil == "lister_playlists_personnelles":
                                                    playlists = await ytmusic_service.get_user_playlists(limit=25)
                                                    if playlists:
                                                        noms_playlists = ", ".join([f"'{p.get('title', 'Inconnu')}'" for p in playlists])
                                                        resultat_execution = {
                                                            "status": "success",
                                                            "message": f"Voici les playlists actuelles : {noms_playlists}. (Attention : Si tu viens de créer une playlist, informe l'utilisateur que les serveurs de Google mettent parfois 30 secondes à la rendre visible)."
                                                        }
                                                    else:
                                                        resultat_execution = {
                                                            "status": "error",
                                                            "message": "DÉFAUT D'AUTHENTIFICATION : Aucune playlist trouvée. La connexion au compte a échoué."
                                                        }
                                                        
                                    except Exception as e:
                                        print(f"Erreur d'exécution de l'outil {nom_outil}: {e}")
                                        erreur_str = str(e)
                                        if "401" in erreur_str or "Unauthorized" in erreur_str or "403" in erreur_str:
                                            resultat_execution = {
                                                "status": "error",
                                                "message": "DÉFAUT D'AUTHENTIFICATION : Les droits de l'application ont expiré ou sont invalides. Informe l'utilisateur."
                                            }
                                        else:
                                            resultat_execution = {"status": "error", "message": erreur_str}

                                    tool_responses_list.append(
                                        types.FunctionResponse(
                                            id=function_call.id,
                                            name=nom_outil,
                                            response=resultat_execution
                                        )
                                    )
                                
                                if tool_responses_list:
                                    reponse_outil = types.LiveClientToolResponse(
                                        function_responses=tool_responses_list
                                    )
                                    try:
                                        await session.send(input=reponse_outil)
                                    except Exception:
                                        pass
                                    
                                    reponse_fin_tour = types.LiveClientContent(
                                        turn_complete=True
                                    )
                                    try:
                                        await session.send(input=reponse_fin_tour)
                                    except Exception:
                                        pass

                        await safe_send_text(json.dumps({"action": "turn_complete"}))
                                            
                except Exception as e:
                    print(f"Erreur de réception Gemini : {e}")
                    traceback.print_exc()

            async with asyncio.TaskGroup() as tg:
                tg.create_task(receive_from_client())
                tg.create_task(receive_from_gemini())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()

# ==========================================
# ROUTES API RECHERCHE ET LECTURE
# ==========================================

class PlaySpecificRequest(BaseModel):
    video_id: str
    action: str = "play_now"

class RefillRequest(BaseModel):
    last_video_id: str

class PlayPlaylistRequest(BaseModel):
    playlist_id: str
    video_id: str = None 

@app.get("/api/playlists")
async def api_get_playlists():
    try:
        playlists_brutes = await ytmusic_service.get_user_playlists(limit=50)
        playlists_formatees = []
        for p in playlists_brutes:
            thumbnails = p.get('thumbnails', [{'url': ''}])
            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
            playlists_formatees.append({
                "playlistId": p.get('playlistId'),
                "title": p.get('title', 'Sans titre'),
                "count": p.get('count', '0'),
                "thumbnail": thumbnail_url
            })
        return playlists_formatees
    except Exception as e:
        print(f"Erreur api_get_playlists : {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération des playlists.")

@app.get("/api/playlists/{playlist_id}")
async def api_get_playlist_details(playlist_id: str):
    try:
        details = await ytmusic_service.get_playlist_details(playlist_id)
        tracks_formatees = []
        for track in details.get('tracks', []):
            artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
            thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
            tracks_formatees.append({
                "video_id": track.get('videoId'),
                "title": track.get('title', 'Titre inconnu'),
                "artist": artist_name,
                "thumbnail": thumbnail_url
            })
        
        return {
            "title": details.get('title', 'Playlist'),
            "trackCount": details.get('trackCount', 0),
            "tracks": tracks_formatees
        }
    except Exception as e:
        print(f"Erreur api_get_playlist_details : {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération de la playlist.")

@app.post("/api/play_playlist")
async def api_play_playlist(request: PlayPlaylistRequest):
    try:
        radio_data = await ytmusic_service.generate_radio(
            playlist_id=request.playlist_id, 
            video_id=request.video_id,
            radio=False 
        )
        tracks = radio_data.get("tracks", [])
        if not tracks:
            return {"error": "Cette playlist semble vide ou illisible."}
            
        current_index = 0
        if request.video_id:
            for i, t in enumerate(tracks):
                if t.get('videoId') == request.video_id:
                    current_index = i
                    break
                    
        current = tracks[current_index]
        queue = tracks[current_index + 1:]
        
        artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
        thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
        thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
        
        player_state.play_now(current, queue)
        next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
            
        return {
            "action": "play_music",
            "video_id": current['videoId'],
            "title": current['title'],
            "artist": artist_name,
            "thumbnail": thumbnail_url,
            "next_title": next_title
        }
    except Exception as e:
        print(f"Erreur api_play_playlist : {e}")
        return {"error": "Erreur lors du chargement de la playlist."}

@app.get("/api/search/live")
async def api_search_live(q: str):
    if not q:
        return []
    try:
        search_results = await ytmusic_service.search_live(q, limit=5)
        formatted_results = []
        for res in search_results:
            artist_name = res.get('artists', [{'name': 'Inconnu'}])[0]['name']
            thumbnails = res.get('thumbnails', [{'url': ''}])
            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
            formatted_results.append({
                "video_id": res['videoId'],
                "title": res['title'],
                "artist": artist_name,
                "thumbnail": thumbnail_url
            })
        return formatted_results
    except Exception as e:
        print(f"Erreur recherche live : {e}")
        return []

@app.post("/api/play_specific")
async def api_play_specific(request: PlaySpecificRequest):
    try:
        radio_data = await ytmusic_service.generate_radio(video_id=request.video_id)
        tracks = radio_data.get("tracks", [])
        if not tracks:
            return {"error": "Impossible de générer la lecture pour ce titre."}
            
        current = tracks[0]
        queue = tracks[1:]
        
        artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
        thumbnails = current.get('thumbnail', [{'url': ''}])
        thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
        
        player_state.play_now(current, queue)
        next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
            
        return {
            "action": "play_music",
            "video_id": current['videoId'],
            "title": current['title'],
            "artist": artist_name,
            "thumbnail": thumbnail_url,
            "next_title": next_title
        }
    except Exception as e:
        print(f"Erreur play_specific : {e}")
        return {"error": "Erreur lors du traitement du titre."}

class AddTrackRequest(BaseModel):
    video_id: str

@app.post("/api/playlists/{playlist_id}/add")
async def api_add_to_playlist(playlist_id: str, request: AddTrackRequest):
    try:
        await ytmusic_service.add_to_playlist(playlist_id, [request.video_id])
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_add_to_playlist : {e}")
        return {"error": "Impossible d'ajouter le titre à la playlist."}
    
@app.post("/api/player/refill")
async def api_player_refill(request: RefillRequest):
    try:
        radio_data = await ytmusic_service.generate_radio(video_id=request.last_video_id)
        tracks = radio_data.get("tracks", [])
        player_state.append_radio_tracks(tracks)
        return {"status": "success", "added": len(tracks) - 1}
    except Exception as e:
        print(f"Erreur refill : {e}")
        return {"error": "Impossible de recharger la radio."}

@app.get("/api/home/listen-again")
async def api_get_listen_again():
    try:
        contents = await ytmusic_service.get_listen_again()
        formatted = []
        for item in contents:
            thumbnails = item.get('thumbnails', [{'url': ''}])
            thumb_url = thumbnails[-1]['url'] if thumbnails else ""
            formatted.append({
                "title": item.get('title', 'Sans titre'),
                "type": "video" if 'videoId' in item else ("playlist" if 'playlistId' in item else "other"),
                "id": item.get('videoId') or item.get('playlistId') or item.get('browseId'),
                "thumbnail": thumb_url,
                "subtitle": item.get('artists', [{'name': ''}])[0]['name'] if 'artists' in item else "Mix personnalisé"
            })
        return formatted
    except Exception as e:
        print(f"Erreur api_get_listen_again : {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération des écoutes récentes.")

# ==========================================
# ROUTES API LECTEUR ET STREAMING
# ==========================================

@app.get("/player/next")
async def player_next():
    track = player_state.next_track()
    if not track:
        return {"error": "File d'attente vide"}
    
    artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
    next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
        
    thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
    thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": artist_name,
        "thumbnail": thumbnail_url,
        "next_title": next_title,
        "remaining_queue_length": len(player_state.queue)
    }

@app.get("/player/prev")
async def player_prev():
    track = player_state.prev_track()
    if not track:
        return {"error": "Pas d'historique"}
    
    artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
    next_title = player_state.queue[0]['title'] if player_state.queue else "Fin de la liste"
        
    thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
    thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": artist_name,
        "thumbnail": thumbnail_url,
        "next_title": next_title,
        "remaining_queue_length": len(player_state.queue)
    }

@app.get("/stream/{video_id}")
async def stream_audio(video_id: str, request: Request):
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
    }
    
    def extract_info():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            
    try:
        info = await asyncio.to_thread(extract_info)
        audio_url = info['url']
        
        headers = {}
        range_header = request.headers.get("Range")
        if range_header:
            headers["Range"] = range_header

        client_http = httpx.AsyncClient(follow_redirects=True)
        req = client_http.build_request("GET", audio_url, headers=headers)
        r = await client_http.send(req, stream=True)
        
        r.raise_for_status()
        
        resp_headers = {}
        for key, value in r.headers.items():
            if key.lower() in ['content-type', 'content-length', 'content-range', 'accept-ranges']:
                resp_headers[key] = value

        async def stream_generator():
            async for chunk in r.aiter_bytes(chunk_size=8192):
                yield chunk
            await r.aclose()
            await client_http.aclose()

        return StreamingResponse(
            stream_generator(), 
            status_code=r.status_code, 
            headers=resp_headers
        )
        
    except Exception as e:
        print(f"Erreur backend sur le flux audio : {e}")
        raise HTTPException(status_code=500, detail="Impossible de lire le flux audio.")

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")