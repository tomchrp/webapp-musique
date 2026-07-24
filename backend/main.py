"""
==============================================================================
Projet : POC Interface Vocale Gemini Live - WebApp
Fichier : backend/main.py
Description : 
Serveur backend finalisé pour la Phase 3.
La route de streaming audio (/stream/{video_id}) a été profondément modifiée.
Elle intercepte désormais les en-têtes HTTP 'Range' envoyés par le navigateur 
(FastAPI Request) et les relaie au flux YouTube via httpx. Elle récupère ensuite 
les en-têtes 'Content-Range' et 'Content-Length' pour construire une réponse 
HTTP 206 (Partial Content). Cela permet au lecteur HTML5 côté client de 
naviguer librement dans le flux audio (barre de progression).
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
        self.manual_queue = []
        self.autoplay_queue = autoplay_list

    def add_to_queue(self, track: dict, autoplay_list: list):
        self.manual_queue.append(track)
        self.autoplay_queue = autoplay_list

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
            description="Recherche une musique et contrôle la lecture. Doit être utilisé dès que l'utilisateur veut écouter un morceau, un artiste, ou l'ajouter à la suite.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "action": types.Schema(
                        type=types.Type.STRING,
                        description="Valeur stricte : 'play_now' pour jouer tout de suite (interrompt la musique en cours), ou 'add_to_queue' si l'utilisateur précise vouloir le mettre à la suite ou dans la file d'attente."
                    ),
                    "titre": types.Schema(
                        type=types.Type.STRING,
                        description="Nom du morceau. Laisser vide si non précisé."
                    ),
                    "artiste": types.Schema(
                        type=types.Type.STRING,
                        description="Nom de l'artiste. Laisser vide si non précisé."
                    )
                },
                required=["action"]
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
            "Quand tu fournis une réponse, demande toujours s'il a une autre question. "
            "Si l'utilisateur parle de musique, utilise immédiatement "
            "l'outil gerer_musique en identifiant correctement son intention "
            "(lecture immédiate ou ajout à la file) et les entités nommées."
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
                                        titre = function_call.args.get("titre", "")
                                        artiste = function_call.args.get("artiste", "")
                                        
                                        query = f"{titre} {artiste}".strip()
                                        if not query:
                                            continue
                                            
                                        search_results = await asyncio.to_thread(ytmusic.search, query, filter="songs", limit=5)
                                        
                                        if search_results:
                                            best_track = None
                                            highest_score = -1
                                            
                                            for res in search_results:
                                                res_title = res.get('title', '')
                                                res_artist = res.get('artists', [{'name': ''}])[0]['name']
                                                
                                                score_title = fuzz.ratio(titre.lower(), res_title.lower()) if titre else 100
                                                score_artist = fuzz.ratio(artiste.lower(), res_artist.lower()) if artiste else 100
                                                total_score = (score_title + score_artist) / 2
                                                
                                                if total_score > highest_score:
                                                    highest_score = total_score
                                                    best_track = res
                                            
                                            if best_track:
                                                video_id = best_track['videoId']
                                                watch_playlist = await asyncio.to_thread(ytmusic.get_watch_playlist, videoId=video_id)
                                                tracks = watch_playlist.get("tracks", [])
                                                
                                                if tracks:
                                                    current = tracks[0]
                                                    queue = tracks[1:]
                                                    
                                                    artist_name = current.get('artists', [{'name': 'Inconnu'}])[0]['name']
                                                    thumbnails = current.get('thumbnail', [{'url': ''}])
                                                    thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
                                                    
                                                    next_title = "Fin de la liste"
                                                    if action == "play_now":
                                                        player_state.play_now(current, queue)
                                                        next_title = queue[0]['title'] if queue else "Fin de la liste"
                                                    else:
                                                        player_state.add_to_queue(current, queue)
                                                        next_title = player_state.manual_queue[0]['title'] if player_state.manual_queue else queue[0]['title']
                                                    
                                                    payload = {
                                                        "action": "play_music" if action == "play_now" else "queue_music",
                                                        "video_id": current['videoId'],
                                                        "title": current['title'],
                                                        "artist": artist_name,
                                                        "thumbnail": thumbnail_url,
                                                        "next_title": next_title
                                                    }
                                                    
                                                    await websocket.send_text(json.dumps(payload))
                except Exception as e:
                    print(f"Erreur de réception : {e}")

            async with asyncio.TaskGroup() as tg:
                tg.create_task(receive_from_client())
                tg.create_task(receive_from_gemini())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()

class SearchRequest(BaseModel):
    query: str
    action: str = "play_now"

@app.post("/api/search")
async def api_search(request: SearchRequest):
    search_results = await asyncio.to_thread(ytmusic.search, request.query, filter="songs", limit=1)
    if not search_results:
        return {"error": "Aucun résultat trouvé"}
        
    best_track = search_results[0]
    video_id = best_track['videoId']
    watch_playlist = await asyncio.to_thread(ytmusic.get_watch_playlist, videoId=video_id)
    tracks = watch_playlist.get("tracks", [])
    
    if not tracks:
        return {"error": "Impossible de générer la lecture"}
        
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
        next_title = player_state.manual_queue[0]['title'] if player_state.manual_queue else queue[0]['title']
        
    return {
        "action": "play_music" if request.action == "play_now" else "queue_music",
        "video_id": current['videoId'],
        "title": current['title'],
        "artist": artist_name,
        "thumbnail": thumbnail_url,
        "next_title": next_title
    }

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
        
    thumbnails = track.get('thumbnail', [{'url': ''}])
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
        
    thumbnails = track.get('thumbnail', [{'url': ''}])
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
    """
    Correction : Instanciation correcte des en-têtes dans la StreamingResponse 
    pour autoriser le navigateur à naviguer dans le flux audio.
    """
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

        client_http = httpx.AsyncClient()
        req = client_http.build_request("GET", audio_url, headers=headers)
        r = await client_http.send(req, stream=True)
        
        # Extraction stricte des en-têtes pour la StreamingResponse
        resp_headers = {}
        for key, value in r.headers.items():
            if key.lower() in ['content-type', 'content-length', 'content-range', 'accept-ranges']:
                resp_headers[key] = value

        async def stream_generator():
            async for chunk in r.aiter_bytes(chunk_size=8192):
                yield chunk
            await r.aclose()
            await client_http.aclose()

        # Injection directe dans le constructeur (seule méthode valide)
        return StreamingResponse(
            stream_generator(), 
            status_code=r.status_code, 
            headers=resp_headers
        )
        
    except Exception as e:
        print(f"Erreur de flux : {e}")
        return {"error": "Impossible de lire le flux audio."}