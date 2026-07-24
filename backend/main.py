"""
==============================================================================
Projet : POC Interface Vocale Gemini Live - WebApp
Fichier : backend/main.py
Description : 
Serveur backend finalisé.
Ajouts :
1. Route GET /api/search/live pour alimenter l'autocomplétion textuelle du 
   frontend de manière optimisée (renvoie uniquement 5 résultats légers).
2. Route POST /api/play_specific pour déclencher la lecture immédiate ou 
   l'ajout en file d'attente d'un videoId précis sélectionné par l'utilisateur 
   depuis les résultats de recherche.
==============================================================================
"""

import os
import asyncio
import traceback
import json
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types
from ytmusicapi import YTMusic
import yt_dlp
import httpx
from thefuzz import fuzz

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI()
ytmusic = YTMusic()

MODEL = "gemini-3.1-flash-live-preview"
client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

class PlayerState:
    def __init__(self):
        self.history = []
        self.current_track = None
        self.manual_queue = []
        self.autoplay_queue = []

    def play_now(self, track: dict, autoplay_list: list):
        if self.current_track:
            self.history.append(self.current_track)
        self.current_track = track
        self.manual_queue = autoplay_list
        self.autoplay_queue = []

    def add_to_queue(self, track: dict, autoplay_list: list):
        self.manual_queue.append(track)
        self.manual_queue.extend(autoplay_list)

    def next_track(self):
        if self.current_track:
            self.history.append(self.current_track)
            
        if self.manual_queue:
            self.current_track = self.manual_queue.pop(0)
        elif self.autoplay_queue:
            self.current_track = self.autoplay_queue.pop(0)
        else:
            self.current_track = None
            
        return self.current_track

    def prev_track(self):
        if not self.history:
            return None
        if self.current_track:
            self.manual_queue.insert(0, self.current_track)
        self.current_track = self.history.pop()
        return self.current_track

player_state = PlayerState()

manage_music_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="gerer_musique",
            description="Recherche une musique ou une playlist et contrôle la lecture.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "action": types.Schema(
                        type=types.Type.STRING,
                        description="Valeur stricte : 'play_now' ou 'add_to_queue'."
                    ),
                    "type_recherche": types.Schema(
                        type=types.Type.STRING,
                        description="Valeur stricte : 'chanson' ou 'playlist'."
                    ),
                    "requete": types.Schema(
                        type=types.Type.STRING,
                        description="Le nom du titre, de l'artiste ou de la playlist."
                    )
                },
                required=["action", "type_recherche", "requete"]
            )
        )
    ]
)

CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    tools=[manage_music_tool],
    system_instruction=types.Content(parts=[
        types.Part(text=(
            "Tu es un agent de conversation francophone utile et direct. "
            "Tu dois converser naturellement avec l'utilisateur en français. "
            "Ne traduis jamais les propos de l'utilisateur. "
            "Si l'utilisateur parle de musique ou de playlist, utilise immédiatement "
            "l'outil gerer_musique en identifiant correctement son intention."
        ))
    ]),
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
            async def receive_from_client():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await session.send_realtime_input(
                            audio={"data": data, "mime_type": "audio/pcm;rate=16000"}
                        )
                except WebSocketDisconnect:
                    pass

            async def receive_from_gemini():
                try:
                    while True:
                        turn = session.receive()
                        async for response in turn:
                            if data := response.data:
                                await websocket.send_bytes(data)
                                
                            if tool_call := response.tool_call:
                                for function_call in tool_call.function_calls:
                                    if function_call.name == "gerer_musique":
                                        action = function_call.args.get("action", "play_now")
                                        type_recherche = function_call.args.get("type_recherche", "chanson")
                                        requete = function_call.args.get("requete", "")
                                        
                                        if not requete:
                                            continue
                                            
                                        await websocket.send_text(json.dumps({"action": "loading"}))
                                        
                                        current = None
                                        queue = []
                                        
                                        if type_recherche == "playlist":
                                            search_results = await asyncio.to_thread(ytmusic.search, requete, filter="playlists", limit=1)
                                            if search_results:
                                                browse_id = search_results[0]['browseId']
                                                playlist_data = await asyncio.to_thread(ytmusic.get_playlist, browse_id)
                                                tracks = playlist_data.get("tracks", [])
                                                if tracks:
                                                    current = tracks[0]
                                                    queue = tracks[1:]
                                        else:
                                            search_results = await asyncio.to_thread(ytmusic.search, requete, filter="songs", limit=1)
                                            if search_results:
                                                video_id = search_results[0]['videoId']
                                                watch_playlist = await asyncio.to_thread(ytmusic.get_watch_playlist, videoId=video_id)
                                                tracks = watch_playlist.get("tracks", [])
                                                if tracks:
                                                    current = tracks[0]
                                                    queue = tracks[1:]
                                        
                                        if current:
                                            artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                            thumbnails = current.get('thumbnail', current.get('thumbnails', [{'url': ''}]))
                                            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
                                            
                                            next_title = "Fin de la liste"
                                            if action == "play_now":
                                                player_state.play_now(current, queue)
                                                next_title = queue[0]['title'] if queue else "Fin de la liste"
                                            else:
                                                player_state.add_to_queue(current, queue)
                                                next_title = player_state.manual_queue[0]['title'] if player_state.manual_queue else (queue[0]['title'] if queue else "Fin de la liste")
                                            
                                            payload = {
                                                "action": "play_music" if action == "play_now" else "queue_music",
                                                "video_id": current['videoId'],
                                                "title": current['title'],
                                                "artist": artist_name,
                                                "thumbnail": thumbnail_url,
                                                "next_title": next_title
                                            }
                                            
                                            await websocket.send_text(json.dumps(payload))
                                        else:
                                            await websocket.send_text(json.dumps({"action": "error", "message": "Aucun résultat trouvé."}))
                                            
                except Exception as e:
                    print(f"Erreur de réception : {e}")

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

class SearchRequest(BaseModel):
    query: str
    action: str = "play_now"

class PlaySpecificRequest(BaseModel):
    video_id: str
    action: str = "play_now"

@app.get("/api/search/live")
async def api_search_live(q: str):
    """
    Rôle : Renvoie rapidement les 5 meilleurs résultats pour l'autocomplétion.
    Cette route évite de déclencher la lourde fonction get_watch_playlist 
    et se contente d'extraire les métadonnées de surface.
    """
    if not q:
        return []
    
    try:
        search_results = await asyncio.to_thread(ytmusic.search, q, filter="songs", limit=5)
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
    """
    Rôle : Initialise la file d'attente et la lecture à partir d'un identifiant exact.
    Appelée lorsque l'utilisateur clique sur un résultat de l'autocomplétion.
    """
    try:
        watch_playlist = await asyncio.to_thread(ytmusic.get_watch_playlist, videoId=request.video_id)
        tracks = watch_playlist.get("tracks", [])
        
        if not tracks:
            return {"error": "Impossible de générer la lecture pour ce titre."}
            
        current = tracks[0]
        queue = tracks[1:]
        
        artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
        thumbnails = current.get('thumbnail', [{'url': ''}])
        thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
        
        if request.action == "play_now":
            player_state.play_now(current, queue)
            next_title = queue[0]['title'] if queue else "Fin de la liste"
        else:
            player_state.add_to_queue(current, queue)
            next_title = player_state.manual_queue[0]['title'] if player_state.manual_queue else (queue[0]['title'] if queue else "Fin de la liste")
            
        return {
            "action": "play_music" if request.action == "play_now" else "queue_music",
            "video_id": current['videoId'],
            "title": current['title'],
            "artist": artist_name,
            "thumbnail": thumbnail_url,
            "next_title": next_title
        }
    except Exception as e:
        print(f"Erreur play_specific : {e}")
        return {"error": "Erreur lors du traitement du titre."}

@app.post("/api/search")
async def api_search(request: SearchRequest):
    # Consolidé par souci de rétrocompatibilité si besoin
    search_results = await asyncio.to_thread(ytmusic.search, request.query, filter="songs", limit=1)
    if not search_results:
        return {"error": "Aucun résultat trouvé"}
        
    best_track = search_results[0]
    video_id = best_track['videoId']
    
    # Redirige la logique vers la nouvelle fonction spécialisée
    fake_request = PlaySpecificRequest(video_id=video_id, action=request.action)
    return await api_play_specific(fake_request)

# ==========================================
# ROUTES API LECTEUR
# ==========================================

@app.get("/player/next")
async def player_next():
    track = player_state.next_track()
    if not track:
        return {"error": "File d'attente vide"}
    
    artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
    
    next_title = "Fin de la liste"
    if player_state.manual_queue:
        next_title = player_state.manual_queue[0]['title']
    elif player_state.autoplay_queue:
        next_title = player_state.autoplay_queue[0]['title']
        
    thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
    thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": artist_name,
        "thumbnail": thumbnail_url,
        "next_title": next_title
    }

@app.get("/player/prev")
async def player_prev():
    track = player_state.prev_track()
    if not track:
        return {"error": "Pas d'historique"}
    
    artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
    
    next_title = "Fin de la liste"
    if player_state.manual_queue:
        next_title = player_state.manual_queue[0]['title']
    elif player_state.autoplay_queue:
        next_title = player_state.autoplay_queue[0]['title']
        
    thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
    thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": artist_name,
        "thumbnail": thumbnail_url,
        "next_title": next_title
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