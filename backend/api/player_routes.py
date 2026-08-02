"""
==============================================================================
Chemin : backend/api/player_routes.py
Utilité : Définition des routes gérant le contrôle de la lecture musicale.
          Intègre la pré-génération (tampon) de la radio dès le chargement 
          d'une playlist pour garantir une fluidité totale lors d'un skip.
==============================================================================
"""

import asyncio
import yt_dlp
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.player_state import player_state
from backend.services.ytmusic_service import ytmusic_service

router = APIRouter()

class PlaySpecificRequest(BaseModel):
    video_id: str
    action: str = "play_now"

class PlayPlaylistRequest(BaseModel):
    playlist_id: str
    video_id: str = None 
    
class AddQueueRequest(BaseModel):
    video_id: str
    position: str = "next"

class JumpRequest(BaseModel):
    video_id: str

@router.post("/api/player/jump")
async def api_jump_to_track(request: JumpRequest):
    track = player_state.jump_to(request.video_id)
    if not track:
        return {"error": "Titre introuvable dans la file."}
    
    preview = player_state.get_preview_queue()
    next_title = preview[0]['title'] if preview else "Fin de la liste"
    
    return {
        "action": "play_music",
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": track.get('artist', 'Inconnu'),
        "thumbnail": track.get('thumbnail', ''),
        "next_title": next_title,
        "preview_queue": preview
    }

@router.post("/api/player/queue/add")
async def api_add_to_queue(request: AddQueueRequest):
    try:
        radio_data = await ytmusic_service.generate_radio(video_id=request.video_id)
        tracks = radio_data.get("tracks", [])
        if not tracks:
            return {"error": "Titre introuvable"}
            
        current = tracks[0]
        if request.position == "last":
            player_state.enqueue_last(current)
        else:
            player_state.enqueue_next(current)
            
        return {
            "status": "success",
            "preview_queue": player_state.get_preview_queue()
        }
    except Exception as e:
        return {"error": "Erreur lors de l'ajout"}

@router.post("/api/player/skip_playlist")
async def api_skip_playlist():
    player_state.skip_playlist()
    
    if player_state.get_queue_length() == 0:
        last_track = player_state.history[-1] if player_state.history else None
        if last_track:
            radio_data = await ytmusic_service.generate_radio(video_id=last_track.get('videoId'))
            player_state.append_radio_tracks(radio_data.get("tracks", []))
        
    track = player_state.next_track()
    if not track:
        return {"error": "File d'attente vide"}
    
    preview = player_state.get_preview_queue()
    next_title = preview[0]['title'] if preview else "Fin de la liste"
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": track.get('artist', 'Inconnu'),
        "thumbnail": track.get('thumbnail', ''),
        "next_title": next_title,
        "preview_queue": preview,
        "remaining_queue_length": player_state.get_queue_length()
    }

@router.post("/api/player/restart_playlist")
async def api_restart_playlist():
    track = player_state.restart_playlist()
    if not track:
        return {"error": "Aucun historique"}
    
    preview = player_state.get_preview_queue()
    next_title = preview[0]['title'] if preview else "Fin de la liste"
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": track.get('artist', 'Inconnu'),
        "thumbnail": track.get('thumbnail', ''),
        "next_title": next_title,
        "preview_queue": preview,
        "remaining_queue_length": player_state.get_queue_length()
    }

@router.post("/api/play_playlist")
async def api_play_playlist(request: PlayPlaylistRequest):
    """
    Descriptif :
    Lance une playlist et pré-génère immédiatement la radio en arrière-plan 
    basée sur le dernier titre de la liste pour garantir un skip instantané.
    """
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
        
        player_state.play_now(current, queue, is_radio=False)

        # PRÉ-GÉNÉRATION TAMPON DE LA RADIO : 
        # Si la playlist a des morceaux, on prend le dernier pour préparer la suite en douce
        if queue:
            last_item_id = queue[-1].get('videoId')
            if last_item_id:
                asyncio.create_task(pre_fetch_radio(last_item_id))

        preview = player_state.get_preview_queue()
        next_title = preview[0]['title'] if preview else "Fin de la liste"
            
        return {
            "action": "play_music",
            "video_id": player_state.current_track['videoId'],
            "title": player_state.current_track['title'],
            "artist": player_state.current_track.get('artist', 'Inconnu'),
            "thumbnail": player_state.current_track.get('thumbnail', ''),
            "next_title": next_title,
            "preview_queue": preview
        }
    except Exception as e:
        print(f"Erreur api_play_playlist : {e}")
        return {"error": "Erreur lors du chargement de la playlist."}

async def pre_fetch_radio(video_id: str):
    """Tâche asynchrone pour alimenter la radio de secours en arrière-plan."""
    try:
        r_data = await ytmusic_service.generate_radio(video_id=video_id)
        r_tracks = r_data.get("tracks", [])
        if r_tracks:
            player_state.append_radio_tracks(r_tracks[1:])
    except Exception:
        pass

@router.post("/api/play_specific")
async def api_play_specific(request: PlaySpecificRequest):
    try:
        radio_data = await ytmusic_service.generate_radio(video_id=request.video_id)
        tracks = radio_data.get("tracks", [])
        if not tracks:
            return {"error": "Impossible de générer la lecture pour ce titre."}
            
        current = tracks[0]
        queue = tracks[1:]
        
        player_state.play_now(current, queue, is_radio=True)
        preview = player_state.get_preview_queue()
        next_title = preview[0]['title'] if preview else "Fin de la liste"
            
        return {
            "action": "play_music",
            "video_id": player_state.current_track['videoId'],
            "title": player_state.current_track['title'],
            "artist": player_state.current_track.get('artist', 'Inconnu'),
            "thumbnail": player_state.current_track.get('thumbnail', ''),
            "next_title": next_title,
            "preview_queue": preview
        }
    except Exception as e:
        print(f"Erreur play_specific : {e}")
        return {"error": "Erreur lors du traitement du titre."}
    
@router.post("/api/player/refill")
async def api_player_refill():
    last_track = None
    if player_state.radio_queue:
        last_track = player_state.radio_queue[-1]
    elif player_state.context_queue:
        last_track = player_state.context_queue[-1]
    elif player_state.priority_queue:
        last_track = player_state.priority_queue[-1]
    else:
        last_track = player_state.current_track
        
    if not last_track:
        return {"error": "Aucune piste pour baser la radio."}
        
    try:
        radio_data = await ytmusic_service.generate_radio(video_id=last_track['videoId'])
        tracks = radio_data.get("tracks", [])
        player_state.append_radio_tracks(tracks[1:]) 
        return {
            "status": "success", 
            "added": len(tracks) - 1, 
            "preview_queue": player_state.get_preview_queue()
        }
    except Exception as e:
        print(f"Erreur refill : {e}")
        return {"error": "Impossible de recharger la radio."}

@router.get("/player/next")
async def player_next():
    if player_state.get_queue_length() == 0 and player_state.current_track:
        radio_data = await ytmusic_service.generate_radio(video_id=player_state.current_track['videoId'])
        player_state.append_radio_tracks(radio_data.get("tracks", []))
        
    track = player_state.next_track()
    if not track:
        return {"error": "File d'attente vide"}
    
    preview = player_state.get_preview_queue()
    next_title = preview[0]['title'] if preview else "Fin de la liste"
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": track.get('artist', 'Inconnu'),
        "thumbnail": track.get('thumbnail', ''),
        "next_title": next_title,
        "preview_queue": preview,
        "remaining_queue_length": player_state.get_queue_length()
    }

@router.get("/player/prev")
async def player_prev():
    track = player_state.prev_track()
    if not track:
        return {"error": "Pas d'historique"}
    
    preview = player_state.get_preview_queue()
    next_title = preview[0]['title'] if preview else "Fin de la liste"
    
    return {
        "video_id": track['videoId'],
        "title": track['title'],
        "artist": track.get('artist', 'Inconnu'),
        "thumbnail": track.get('thumbnail', ''),
        "next_title": next_title,
        "preview_queue": preview,
        "remaining_queue_length": player_state.get_queue_length()
    }

@router.get("/stream/{video_id}")
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