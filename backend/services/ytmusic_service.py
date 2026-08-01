"""
==============================================================================
Chemin : backend/services/ytmusic_service.py
Utilité : Couche d'abstraction (Service) pour interagir avec l'API YouTube Music.
          Suite aux limitations du parseur d'environnement, l'authentification 
          repose de nouveau sur un fichier physique unique 'browser.json'. 
          Ce module charge ce fichier pour instancier un client API unique,
          garantissant la synchronisation de la session pour la lecture et l'écriture.
==============================================================================
"""

import asyncio
from pathlib import Path
from ytmusicapi import YTMusic

class YTMusicService:
    def __init__(self):
        """
        Descriptif :
        Initialise une connexion unique à l'API YouTube Music.
        Construit le chemin absolu vers 'browser.json' situé à la racine du 
        dossier backend. Interrompt l'exécution de manière explicite si le fichier 
        est manquant afin d'éviter les erreurs de requêtes indéchiffrables plus tard.
        """
        chemin_fichier_auth = Path(__file__).parent.parent / "browser.json"
        
        if not chemin_fichier_auth.exists():
            raise FileNotFoundError(
                "Fichier d'authentification introuvable. Assurez-vous d'avoir "
                "placé votre fichier 'browser.json' dans le répertoire 'backend'."
            )
            
        print(f"[Service YTMusic] Initialisation du client unique unifié via {chemin_fichier_auth.name}...")
        self.client = YTMusic(str(chemin_fichier_auth))

    # ==========================================
    # OPÉRATIONS DE LECTURE
    # ==========================================

    async def get_user_playlists(self, limit: int = 100):
        """
        Descriptif :
        Délègue la récupération des playlists de l'utilisateur à un thread séparé.
        L'utilisation de asyncio.to_thread est requise car ytmusicapi effectue 
        des requêtes HTTP synchrones (via la librairie requests) qui bloqueraient 
        la boucle d'événements principale de FastAPI.
        """
        return await asyncio.to_thread(self.client.get_library_playlists, limit=limit)

    async def get_playlist_details(self, playlist_id: str):
        """
        Descriptif :
        Récupère l'intégralité des métadonnées et la liste des pistes associées.
        Intègre une sécurité pour les "Mix" (ID commençant par RD) qui nécessitent 
        une méthode d'extraction différente des playlists standards.
        """
        if playlist_id.startswith('RD'):
            data = await asyncio.to_thread(self.client.get_watch_playlist, playlistId=playlist_id)
            return {
                'title': 'Mix',
                'trackCount': len(data.get('tracks', [])),
                'tracks': data.get('tracks', [])
            }
        return await asyncio.to_thread(self.client.get_playlist, playlist_id)

    async def generate_radio(self, video_id: str = None, playlist_id: str = None, radio: bool = True):
        """
        Descriptif :
        Génère une file d'attente continue ou lit strictement une playlist.
        Accepte désormais la combinaison d'une playlist ET d'une vidéo de départ,
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
        return await asyncio.to_thread(self.client.get_watch_playlist, **kwargs)

    async def search_live(self, query: str, limit: int = 5):
        """
        Descriptif :
        Effectue une recherche rapide ciblée uniquement sur les chansons.
        Cette fonction est optimisée pour fournir les résultats de l'autocomplétion 
        dans la barre de recherche du frontend.
        """
        return await asyncio.to_thread(self.client.search, query, filter="songs", limit=limit)

    async def search(self, query: str, filter: str = None, limit: int = 1):
        """
        Descriptif :
        Exécute une recherche générale avec possibilité de filtrer par type 
        (chansons, playlists, artistes). Utilisée principalement par les outils 
        d'intelligence artificielle pour résoudre les requêtes vocales.
        """
        return await asyncio.to_thread(self.client.search, query, filter=filter, limit=limit)

    # ==========================================
    # OPÉRATIONS D'ÉCRITURE
    # ==========================================

    async def rate_song(self, video_id: str, rating: str = 'LIKE'):
        """
        Descriptif :
        Modifie l'état d'appréciation d'un titre pour l'utilisateur authentifié.
        Utilisé pour ajouter rapidement le titre en cours de lecture aux favoris.
        """
        return await asyncio.to_thread(self.client.rate_song, video_id, rating)

    async def create_playlist(self, title: str, video_ids: list):
        """
        Descriptif :
        Génère une nouvelle playlist avec un statut privé par défaut et y 
        insère la liste des identifiants vidéo fournis en paramètres.
        """
        return await asyncio.to_thread(self.client.create_playlist, title, "", "PRIVATE", video_ids)

    async def add_to_playlist(self, playlist_id: str, video_ids: list):
        """
        Descriptif :
        Insère une liste de vidéos dans une playlist préexistante appartenant 
        à l'utilisateur.
        """
        return await asyncio.to_thread(self.client.add_playlist_items, playlist_id, video_ids)

    async def get_listen_again(self):
        """
        Descriptif :
        Récupère la page d'accueil avec une limite très basse (pour la rapidité) 
        et filtre uniquement la section "Listen again".
        """
        try:
            home = await asyncio.to_thread(self.client.get_home, limit=3)
            for row in home:
                if row.get('title') == 'Listen again':
                    return row.get('contents', [])
            return []
        except Exception as e:
            print(f"Erreur get_listen_again : {e}")
            return []
ytmusic_service = YTMusicService()