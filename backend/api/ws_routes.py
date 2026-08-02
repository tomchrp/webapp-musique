"""
==============================================================================
Chemin : backend/api/ws_routes.py
Utilité : Gestion de la route WebSocket principale pour l'interaction vocale
          avec Gemini Live. Coordonne le flux audio bi-directionnel, le 
          routage des outils de contrôle et la gestion de la file d'attente.
==============================================================================
"""

import json
import asyncio
import traceback
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from thefuzz import fuzz
from google.genai import types

from backend.core.gemini_config import client, MODEL, CONFIG
from backend.core.player_state import player_state
from backend.services.ytmusic_service import ytmusic_service

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Descriptif :
    Gère la connexion WebSocket persistante entre le client et l'API Gemini.
    Crée deux tâches asynchrones parallèles pour le microphone et le haut-parleur.
    """
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
        Tâche asynchrone exécutée en arrière-plan pour pallier la cohérence 
        éventuelle des serveurs Google lors des ajouts de playlists.
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
                                    
                                    # Le Groupe A coupe immédiatement le microphone côté client
                                    groupe = "C" 
                                    if nom_outil in [
                                        "gerer_musique", "jouer_playlist_personnelle", "jouer_style_actuel",
                                        "mettre_en_pause", "reprendre_lecture", "passer_titre", "titre_precedent",
                                        "sauter_playlist", "recommencer_playlist", "vider_file_attente"
                                    ]:
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
                                        # GESTION DES CONTRÔLES SIMPLES
                                        if nom_outil == "mettre_en_pause":
                                            await safe_send_text(json.dumps({"action": "control", "command": "pause"}))
                                        elif nom_outil == "reprendre_lecture":
                                            await safe_send_text(json.dumps({"action": "control", "command": "play"}))
                                        elif nom_outil == "passer_titre":
                                            await safe_send_text(json.dumps({"action": "control", "command": "next"}))
                                        elif nom_outil == "titre_precedent":
                                            await safe_send_text(json.dumps({"action": "control", "command": "prev"}))
                                        elif nom_outil == "sauter_playlist":
                                            await safe_send_text(json.dumps({"action": "control", "command": "skip_playlist"}))
                                        elif nom_outil == "recommencer_playlist":
                                            await safe_send_text(json.dumps({"action": "control", "command": "restart_playlist"}))
                                        elif nom_outil == "vider_file_attente":
                                            player_state.clear_user_queue()
                                            await safe_send_text(json.dumps({
                                                "action": "queue_updated", 
                                                "message": "File d'attente vidée",
                                                "preview_queue": player_state.get_preview_queue()
                                            }))

                                        elif nom_outil == "gerer_musique":
                                            action = args.get("action", "play_now")
                                            position = args.get("position", "next")
                                            type_recherche = args.get("type_recherche", "chanson")
                                            requete = args.get("requete", "")
                                            
                                            await safe_send_text(json.dumps({"action": "loading"}))
                                            
                                            current = None
                                            queue = []
                                            is_radio = True
                                            
                                            if type_recherche == "playlist":
                                                search_results = await ytmusic_service.search(requete, filter="playlists", limit=1)
                                                if search_results:
                                                    browse_id = search_results[0]['browseId']
                                                    radio_data = await ytmusic_service.generate_radio(playlist_id=browse_id, radio=False)
                                                    tracks = radio_data.get("tracks", [])
                                                    if tracks:
                                                        current = tracks[0]
                                                        queue = tracks[1:]
                                                        is_radio = False
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
                                                if isinstance(thumbnails, list) and len(thumbnails) > 0:
                                                    thumbnail_url = thumbnails[-1].get('url', '')
                                                elif isinstance(thumbnails, str):
                                                    thumbnail_url = thumbnails
                                                else:
                                                    thumbnail_url = ""
                                                current['thumbnail'] = thumbnail_url 
                                                
                                                if action == "add_to_queue":
                                                    if position == "last":
                                                        player_state.enqueue_last(current)
                                                    else:
                                                        player_state.enqueue_next(current)
                                                        
                                                    await safe_send_text(json.dumps({
                                                        "action": "queue_updated",
                                                        "message": f"Ajouté : {current['title']}",
                                                        "preview_queue": player_state.get_preview_queue()
                                                    }))
                                                else:
                                                    player_state.play_now(current, queue, is_radio=is_radio)
                                                    preview = player_state.get_preview_queue()
                                                    next_title = preview[0]['title'] if preview else "Fin de la liste"
                                                    
                                                    payload = {
                                                        "action": "play_music",
                                                        "video_id": current['videoId'],
                                                        "title": current['title'],
                                                        "artist": artist_name,
                                                        "thumbnail": thumbnail_url,
                                                        "next_title": next_title,
                                                        "preview_queue": preview
                                                    }
                                                    await safe_send_text(json.dumps(payload))
                                            else:
                                                resultat_execution = {"status": "error", "message": "Aucun titre trouvé."}
                                                await safe_send_text(json.dumps({"action": "error", "message": "Aucun résultat trouvé."}))

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
                                                        if isinstance(thumbnails, list) and len(thumbnails) > 0:
                                                            thumbnail_url = thumbnails[-1].get('url', '')
                                                        elif isinstance(thumbnails, str):
                                                            thumbnail_url = thumbnails
                                                        else:
                                                            thumbnail_url = ""
                                                        
                                                        player_state.play_now(current, queue, is_radio=False)
                                                        preview = player_state.get_preview_queue()
                                                        next_title = preview[0]['title'] if preview else "Fin de la liste"
                                                        
                                                        payload = {
                                                            "action": "play_music",
                                                            "video_id": current['videoId'],
                                                            "title": current['title'],
                                                            "artist": artist_name,
                                                            "thumbnail": thumbnail_url,
                                                            "next_title": next_title,
                                                            "preview_queue": preview
                                                        }
                                                        await safe_send_text(json.dumps(payload))
                                                    else:
                                                        resultat_execution = {"status": "error", "message": "Cette playlist est vide."}
                                                else:
                                                    resultat_execution = {"status": "error", "message": f"Ta playlist {nom_cible} est introuvable."}

                                        elif nom_outil == "jouer_style_actuel":
                                            await safe_send_text(json.dumps({"action": "loading"}))
                                            current_vid = player_state.current_track['videoId'] if player_state.current_track else None
                                            radio_data = await ytmusic_service.generate_radio(video_id=current_vid)
                                            tracks = radio_data.get("tracks", [])
                                            
                                            if len(tracks) > 1:
                                                current = tracks[1]
                                                queue = tracks[2:]
                                                artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                                thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
                                                if isinstance(thumbnails, list) and len(thumbnails) > 0:
                                                    thumbnail_url = thumbnails[-1].get('url', '')
                                                elif isinstance(thumbnails, str):
                                                    thumbnail_url = thumbnails
                                                else:
                                                    thumbnail_url = ""
                                                
                                                player_state.play_now(current, queue, is_radio=True)
                                                preview = player_state.get_preview_queue()
                                                next_title = preview[0]['title'] if preview else "Fin de la liste"
                                                
                                                payload = {
                                                    "action": "play_music",
                                                    "video_id": current['videoId'],
                                                    "title": current['title'],
                                                    "artist": artist_name,
                                                    "thumbnail": thumbnail_url,
                                                    "next_title": next_title,
                                                    "preview_queue": preview
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

                                        # Outils nécessitant une piste en cours de lecture
                                        elif nom_outil in ["sauvegarder_titre_actuel", "creer_playlist_avec_titre", "ajouter_titre_playlist_existante"]:
                                            current_vid = player_state.current_track['videoId'] if player_state.current_track else None
                                            
                                            if not current_vid:
                                                resultat_execution = {"status": "error", "message": "Aucune musique en cours de lecture. Demande à l'utilisateur de lancer un titre d'abord."}
                                            else:
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