"""
==============================================================================
Chemin : backend/test_playlists.py
Utilité : Script de test unitaire pour vérifier la bonne communication entre 
          la librairie ytmusicapi, l'empreinte navigateur (browser.json) et la 
          bibliothèque personnelle de l'utilisateur sur YouTube Music. 
Mise à jour : Remplacement total de l'authentification OAuth (qui retourne 
              une erreur 400) par l'authentification par navigateur (headers).
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def tester_recuperation_playlists():
    """
    Descriptif détaillé de la fonction :
    1. Construit dynamiquement le chemin vers le fichier 'browser.json' situé 
       dans le même dossier que ce script.
    2. Initialise le client YTMusic en utilisant ce fichier d'empreinte 
       navigateur pour contourner définitivement le blocage OAuth de Google.
    3. Fait appel à la fonction 'get_library_playlists' pour interroger 
       les serveurs et récupérer jusqu'à 100 playlists.
    4. Parcourt les résultats pour extraire et afficher le titre et l'ID 
       de chaque playlist personnelle trouvée.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur d'initialisation YTMusic :")
        print(e)
        return
    
    print("Récupération des playlists en cours...\n")
    try:
        playlists = ytmusic.get_library_playlists(limit=100)
        
        if not playlists:
            print("Aucune playlist trouvée dans cette bibliothèque.")
            return

        print(f"=== {len(playlists)} Playlists trouvées ===")
        for index, playlist in enumerate(playlists, start=1):
            titre = playlist.get('title', 'Titre inconnu')
            playlist_id = playlist.get('playlistId', 'ID inconnu')
            print(f"{index}. {titre} (ID: {playlist_id})")
        print("================================")
        
    except Exception as e:
        print("Erreur lors de la récupération des playlists :")
        traceback.print_exc()

if __name__ == "__main__":
    tester_recuperation_playlists()