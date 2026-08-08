"""
==============================================================================
Chemin : backend/api/music_routes.py
Utilité : Définition des routes de l'API REST liées à la gestion de la
          bibliothèque musicale (Playlists, recherche textuelle, écoutes récentes).
          Mise à jour : Ajout des méthodes DELETE et PATCH pour la suppression, 
          le renommage et le réarrangement, ainsi que l'extraction du setVideoId.
==============================================================================
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.services.ytmusic_service import ytmusic_service

router = APIRouter()

class AddTrackRequest(BaseModel):
    video_id: str

class RenamePlaylistRequest(BaseModel):
    new_title: str

class ReorderPlaylistRequest(BaseModel):
    set_video_id: str
    move_before_set_video_id: Optional[str] = None

@router.get("/api/playlists")
async def api_get_playlists():
    """
    Descriptif :
    Récupère la liste des playlists de l'utilisateur avec un formatage 
    adapté pour l'interface graphique (Extraction de l'URL de la miniature 
    la plus grande).
    """
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

@router.get("/api/playlists/{playlist_id}")
async def api_get_playlist_details(playlist_id: str):
    """
    Descriptif :
    Récupère les détails d'une playlist spécifique incluant la liste de ses pistes.
    Inclut désormais le setVideoId indispensable pour cibler précisément un 
    élément lors d'un déplacement ou d'une suppression au sein de la playlist.
    """
    try:
        details = await ytmusic_service.get_playlist_details(playlist_id)
        tracks_formatees = []
        for track in details.get('tracks', []):
            artist_name = track.get('artists', [{'name': 'Inconnu'}])[0]['name']
            thumbnails = track.get('thumbnail', track.get('thumbnails', [{'url': ''}]))
            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ""
            tracks_formatees.append({
                "video_id": track.get('videoId'),
                "set_video_id": track.get('setVideoId'),
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

@router.delete("/api/playlists/{playlist_id}")
async def api_delete_playlist(playlist_id: str):
    """
    Descriptif :
    Transmet l'instruction de suppression définitive de la playlist ciblée.
    """
    try:
        await ytmusic_service.delete_playlist(playlist_id)
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_delete_playlist : {e}")
        raise HTTPException(status_code=500, detail="Impossible de supprimer la playlist.")

@router.patch("/api/playlists/{playlist_id}/rename")
async def api_rename_playlist(playlist_id: str, request: RenamePlaylistRequest):
    """
    Descriptif :
    Modifie le titre de la playlist spécifiée.
    """
    try:
        await ytmusic_service.rename_playlist(playlist_id, request.new_title)
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_rename_playlist : {e}")
        raise HTTPException(status_code=500, detail="Impossible de renommer la playlist.")

@router.patch("/api/playlists/{playlist_id}/reorder")
async def api_reorder_playlist(playlist_id: str, request: ReorderPlaylistRequest):
    """
    Descriptif :
    Réordonne la playlist. L'élément cible (set_video_id) sera déplacé juste 
    avant l'élément de référence (move_before_set_video_id). Si ce dernier est 
    nul, l'élément sera placé à la toute fin de la liste.
    """
    try:
        await ytmusic_service.reorder_playlist(playlist_id, request.set_video_id, request.move_before_set_video_id)
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_reorder_playlist : {e}")
        raise HTTPException(status_code=500, detail="Impossible de déplacer ce titre.")

@router.get("/api/search/live")
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

@router.post("/api/playlists/{playlist_id}/add")
async def api_add_to_playlist(playlist_id: str, request: AddTrackRequest):
    try:
        await ytmusic_service.add_to_playlist(playlist_id, [request.video_id])
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_add_to_playlist : {e}")
        return {"error": "Impossible d'ajouter le titre à la playlist."}
    
@router.get("/api/home/listen-again")
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