"""
==============================================================================
Chemin : backend/services/ytmusic_service.py
Utilité : Couche d'abstraction (Service) pour interagir avec l'API YouTube Music.
          Gère l'authentification et les requêtes vers le compte de l'utilisateur.
Mise à jour : Intégration de l'authentification dynamique via Firefox. 
              Génère le jeton SAPISIDHASH à la volée pour contrer l'expiration
              des sessions et l'App-Bound Encryption de Chrome. Inclut un 
              mécanisme de "retry" automatique pour reconstruire les en-têtes
              silencieusement en cas de rejet par les serveurs de Google.
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
                # Blocage thread synchrone court pour recréer le client
                self._initialize_client()
                # Seconde tentative
                return await asyncio.to_thread(func, *args, **kwargs)
            except Exception as retry_error:
                print(f"[Service YTMusic] Échec définitif après tentative de récupération : {retry_error}")
                raise

    # ==========================================
    # OPÉRATIONS DE LECTURE
    # ==========================================

    async def get_user_playlists(self, limit: int = 100):
        """
        Descriptif :
        Récupère la liste des playlists appartenant à l'utilisateur.
        Passe par le wrapper de sécurité pour garantir la validité de la session.
        """
        return await self._execute_with_retry(self.client.get_library_playlists, limit=limit)

    async def get_playlist_details(self, playlist_id: str):
        """
        Descriptif :
        Récupère l'intégralité des métadonnées et la liste des pistes associées.
        Intègre une sécurité pour les "Mix" (ID commençant par RD) qui nécessitent 
        une méthode d'extraction différente des playlists standards.
        """
        if playlist_id.startswith('RD'):
            data = await self._execute_with_retry(self.client.get_watch_playlist, playlistId=playlist_id)
            return {
                'title': 'Mix',
                'trackCount': len(data.get('tracks', [])),
                'tracks': data.get('tracks', [])
            }
        return await self._execute_with_retry(self.client.get_playlist, playlist_id)

    async def generate_radio(self, video_id: str = None, playlist_id: str = None, radio: bool = True):
        """
        Descriptif :
        Génère une file d'attente continue ou lit strictement une playlist.
        Accepte la combinaison d'une playlist ET d'une vidéo de départ,
        ainsi que la désactivation de l'autocomplétion (radio=False).
        """
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
        """
        Descriptif :
        Effectue une recherche rapide ciblée uniquement sur les chansons.
        Cette fonction est optimisée pour fournir les résultats de l'autocomplétion 
        dans la barre de recherche du frontend.
        """
        return await self._execute_with_retry(self.client.search, query, filter="songs", limit=limit)

    async def search(self, query: str, filter: str = None, limit: int = 1):
        """
        Descriptif :
        Exécute une recherche générale avec possibilité de filtrer par type 
        (chansons, playlists, artistes). Utilisée principalement par les outils 
        d'intelligence artificielle pour résoudre les requêtes vocales.
        """
        return await self._execute_with_retry(self.client.search, query, filter=filter, limit=limit)

    # ==========================================
    # OPÉRATIONS D'ÉCRITURE
    # ==========================================

    async def rate_song(self, video_id: str, rating: str = 'LIKE'):
        """
        Descriptif :
        Modifie l'état d'appréciation d'un titre pour l'utilisateur authentifié.
        Utilisé pour ajouter rapidement le titre en cours de lecture aux favoris.
        """
        return await self._execute_with_retry(self.client.rate_song, video_id, rating)

    async def create_playlist(self, title: str, video_ids: list):
        """
        Descriptif :
        Génère une nouvelle playlist avec un statut privé par défaut et y 
        insère la liste des identifiants vidéo fournis en paramètres.
        """
        return await self._execute_with_retry(self.client.create_playlist, title, "", "PRIVATE", video_ids)

    async def add_to_playlist(self, playlist_id: str, video_ids: list):
        """
        Descriptif :
        Insère une liste de vidéos dans une playlist préexistante appartenant 
        à l'utilisateur.
        """
        return await self._execute_with_retry(self.client.add_playlist_items, playlist_id, video_ids)

    async def get_listen_again(self):
        """
        Descriptif :
        Récupère la page d'accueil avec une limite très basse (pour la rapidité) 
        et filtre uniquement la section de recommandations de type "Listen again".
        """
        try:
            home = await self._execute_with_retry(self.client.get_home, limit=3)
            for row in home:
                if row.get('title') == 'Listen again':
                    return row.get('contents', [])
            return []
        except Exception as e:
            print(f"Erreur get_listen_again : {e}")
            return []

ytmusic_service = YTMusicService()