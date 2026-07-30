"""
==============================================================================
Chemin : backend/services/ytmusic_service.py
Utilité : Couche d'abstraction (Service) pour interagir avec l'API YouTube Music.
          Implémente une architecture à double client (CQRS) pour contourner
          les restrictions de sécurité de Google :
          - client_read : Dédié à l'exploration (utilise browser_read.json)
          - client_write : Dédié aux mutations (utilise browser_write.json)
==============================================================================
"""

import asyncio
from pathlib import Path
from ytmusicapi import YTMusic

class YTMusicService:
    def __init__(self):
        """
        Descriptif :
        Initialise deux connexions distinctes pour séparer les droits de lecture
        et d'écriture. Charge les fichiers browser_read.json et browser_write.json.
        """
        backend_dir = Path(__file__).parent.parent
        read_path = backend_dir / "browser_read.json"
        write_path = backend_dir / "browser_write.json"
        
        print(f"[Service YTMusic] Initialisation du client READ ({read_path.name})...")
        self.client_read = YTMusic(str(read_path))
        
        print(f"[Service YTMusic] Initialisation du client WRITE ({write_path.name})...")
        self.client_write = YTMusic(str(write_path))

    # ==========================================
    # OPÉRATIONS DE LECTURE (Utilise client_read)
    # ==========================================

    async def get_user_playlists(self, limit: int = 100):
        """
        Descriptif :
        Récupère la liste des playlists de la bibliothèque personnelle de l'utilisateur.
        """
        return await asyncio.to_thread(self.client_read.get_library_playlists, limit=limit)

    async def get_playlist_details(self, playlist_id: str):
        """
        Descriptif :
        Récupère les détails et les pistes d'une playlist spécifique.
        """
        return await asyncio.to_thread(self.client_read.get_playlist, playlist_id)

    async def generate_radio(self, video_id: str = None, playlist_id: str = None):
        """
        Descriptif :
        Génère une file d'attente continue (radio) basée sur une graine (titre ou playlist).
        """
        if video_id:
            return await asyncio.to_thread(self.client_read.get_watch_playlist, videoId=video_id, radio=True)
        elif playlist_id:
            return await asyncio.to_thread(self.client_read.get_watch_playlist, playlistId=playlist_id, radio=True)
        return {"tracks": []}

    async def search_live(self, query: str, limit: int = 5):
        """
        Descriptif :
        Recherche textuelle optimisée pour l'autocomplétion du client web (frontend).
        """
        return await asyncio.to_thread(self.client_read.search, query, filter="songs", limit=limit)

    async def search(self, query: str, filter: str = None, limit: int = 1):
        """
        Descriptif :
        Encapsulation de la recherche générale utilisée par l'outil gerer_musique
        de l'IA pour trouver des titres ou des playlists publiques.
        """
        return await asyncio.to_thread(self.client_read.search, query, filter=filter, limit=limit)

    # ==========================================
    # OPÉRATIONS D'ÉCRITURE (Utilise client_write)
    # ==========================================

    async def rate_song(self, video_id: str, rating: str = 'LIKE'):
        """
        Descriptif :
        Modifie le statut "J'aime" d'un titre dans la bibliothèque.
        """
        return await asyncio.to_thread(self.client_write.rate_song, video_id, rating)

    async def create_playlist(self, title: str, video_ids: list):
        """
        Descriptif :
        Crée une nouvelle playlist privée contenant les vidéos spécifiées.
        """
        return await asyncio.to_thread(self.client_write.create_playlist, title, "", "PRIVATE", video_ids)

    async def add_to_playlist(self, playlist_id: str, video_ids: list):
        """
        Descriptif :
        Ajoute des vidéos à une playlist existante.
        """
        return await asyncio.to_thread(self.client_write.add_playlist_items, playlist_id, video_ids)

ytmusic_service = YTMusicService()