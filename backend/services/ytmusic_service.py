"""
==============================================================================
Chemin : backend/services/ytmusic_service.py
Utilité : Couche d'abstraction (Service) pour interagir avec l'API YouTube Music.
          Gère l'authentification et les requêtes vers le compte de l'utilisateur.
          Mise à jour : Intégration des fonctions de suppression, de renommage 
          et de réarrangement des pistes au sein des playlists.
==============================================================================
"""

import time
import hashlib
import asyncio
import browser_cookie3
from ytmusicapi import YTMusic

class YTMusicService:
    def __init__(self):
        """
        Descriptif :
        Initialise le service en déclenchant immédiatement la première 
        génération dynamique des en-têtes via Firefox.
        """
        self.client = None
        self._initialize_client()

    def _initialize_client(self):
        """
        Descriptif :
        Extrait les cookies YouTube depuis la base de données de Mozilla Firefox,
        isole le cookie SAPISID, et calcule le hash SHA-1 (SAPISIDHASH) basé 
        sur l'horodatage actuel. Injecte ensuite ce dictionnaire d'en-têtes
        dans l'instance de YTMusic pour valider la session.
        """
        print("[Service YTMusic] Extraction dynamique des cookies depuis Firefox...")
        try:
            cj = browser_cookie3.firefox(domain_name='.youtube.com')
            cookie_string = "; ".join([f"{c.name}={c.value}" for c in cj])
            sapisid = next((c.value for c in cj if c.name == 'SAPISID'), None)
            
            if not sapisid:
                raise ValueError("Le cookie SAPISID est introuvable. Connexion requise sur Firefox.")
                
            timestamp = int(time.time())
            chaine_a_hasher = f"{timestamp} {sapisid} https://music.youtube.com"
            hash_result = hashlib.sha1(chaine_a_hasher.encode('utf-8')).hexdigest()
            authorization_dynamique = f"SAPISIDHASH {timestamp}_{hash_result}"
            
            headers = {
                "Accept": "*/*",
                "Authorization": authorization_dynamique,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
                "X-Goog-AuthUser": "0",
                "x-origin": "https://music.youtube.com",
                "Cookie": cookie_string
            }
            
            self.client = YTMusic(auth=headers)
            print("[Service YTMusic] Authentification dynamique réussie.")
        except Exception as e:
            print(f"[Service YTMusic] Échec critique de l'authentification : {e}")
            raise

    async def _execute_with_retry(self, func, *args, **kwargs):
        """
        Descriptif :
        Fonction d'enrobage (Wrapper) asynchrone interceptant toutes les requêtes.
        Si la requête initiale échoue (potentiellement due à un roulement de 
        sécurité de Google), cette fonction force la régénération immédiate des 
        en-têtes d'authentification et effectue une seconde tentative transparente.
        """
        try:
            return await asyncio.to_thread(func, *args, **kwargs)
        except Exception as e:
            print(f"[Service YTMusic] Erreur interceptée ({e}). Régénération des en-têtes en cours...")
            try:
                self._initialize_client()
                return await asyncio.to_thread(func, *args, **kwargs)
            except Exception as retry_error:
                print(f"[Service YTMusic] Échec définitif après tentative de récupération : {retry_error}")
                raise

    # ==========================================
    # OPÉRATIONS DE LECTURE
    # ==========================================

    async def get_user_playlists(self, limit: int = 100):
        return await self._execute_with_retry(self.client.get_library_playlists, limit=limit)

    async def get_playlist_details(self, playlist_id: str):
        if playlist_id.startswith('RD'):
            data = await self._execute_with_retry(self.client.get_watch_playlist, playlistId=playlist_id)
            return {
                'title': 'Mix',
                'trackCount': len(data.get('tracks', [])),
                'tracks': data.get('tracks', [])
            }
        return await self._execute_with_retry(self.client.get_playlist, playlist_id)

    async def generate_radio(self, video_id: str = None, playlist_id: str = None, radio: bool = True):
        kwargs = {}
        if video_id:
            kwargs['videoId'] = video_id
        if playlist_id:
            kwargs['playlistId'] = playlist_id
            
        if not kwargs:
            return {"tracks": []}
            
        kwargs['radio'] = radio
        return await self._execute_with_retry(self.client.get_watch_playlist, **kwargs)

    async def search_live(self, query: str, limit: int = 5):
        return await self._execute_with_retry(self.client.search, query, filter="songs", limit=limit)

    async def search(self, query: str, filter: str = None, limit: int = 1):
        return await self._execute_with_retry(self.client.search, query, filter=filter, limit=limit)

    async def get_listen_again(self):
        try:
            home = await self._execute_with_retry(self.client.get_home, limit=3)
            for row in home:
                if row.get('title') == 'Listen again':
                    return row.get('contents', [])
            return []
        except Exception as e:
            print(f"Erreur get_listen_again : {e}")
            return []

    # ==========================================
    # OPÉRATIONS D'ÉCRITURE
    # ==========================================

    async def rate_song(self, video_id: str, rating: str = 'LIKE'):
        return await self._execute_with_retry(self.client.rate_song, video_id, rating)

    async def create_playlist(self, title: str, video_ids: list):
        return await self._execute_with_retry(self.client.create_playlist, title, "", "PRIVATE", video_ids)

    async def add_to_playlist(self, playlist_id: str, video_ids: list):
        return await self._execute_with_retry(self.client.add_playlist_items, playlist_id, video_ids)

    async def delete_playlist(self, playlist_id: str):
        """
        Descriptif :
        Supprime définitivement une playlist de la bibliothèque de l'utilisateur.
        """
        return await self._execute_with_retry(self.client.delete_playlist, playlist_id)

    async def rename_playlist(self, playlist_id: str, new_title: str):
        """
        Descriptif :
        Modifie le titre d'une playlist existante.
        """
        return await self._execute_with_retry(self.client.edit_playlist, playlist_id, title=new_title)

    async def reorder_playlist(self, playlist_id: str, set_video_id: str, move_before_set_video_id: str = None):
        """
        Descriptif :
        Déplace une piste dans une playlist. ytmusicapi requiert un tuple contenant 
        le setVideoId de l'élément à déplacer, et le setVideoId de l'élément 
        devant lequel il doit être placé (None pour le mettre à la toute fin).
        """
        move_item = (set_video_id, move_before_set_video_id)
        return await self._execute_with_retry(self.client.edit_playlist, playlist_id, moveItem=move_item)

ytmusic_service = YTMusicService()