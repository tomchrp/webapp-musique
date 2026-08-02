"""
==============================================================================
Chemin : backend/api/music_routes.py
Utilité : Définition des routes de l'API REST liées à la gestion de la
          bibliothèque musicale (Playlists, recherche textuelle, écoutes récentes).
==============================================================================
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.ytmusic_service import ytmusic_service

router = APIRouter()

class AddTrackRequest(BaseModel):
    video_id: str

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

@router.get("/api/search/live")
async def api_search_live(q: str):
    """
    Descriptif :
    Route appelée lors de la frappe dans la barre de recherche du client.
    Renvoie les suggestions de pistes correspondantes.
    """
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
    """
    Descriptif :
    Ajoute un titre spécifique à une playlist de l'utilisateur.
    """
    try:
        await ytmusic_service.add_to_playlist(playlist_id, [request.video_id])
        return {"status": "success"}
    except Exception as e:
        print(f"Erreur api_add_to_playlist : {e}")
        return {"error": "Impossible d'ajouter le titre à la playlist."}
    
@router.get("/api/home/listen-again")
async def api_get_listen_again():
    """
    Descriptif :
    Récupère la section 'Écoutés récemment' depuis la page d'accueil de 
    YouTube Music pour la découverte rapide dans le tiroir latéral.
    """
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