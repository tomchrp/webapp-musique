"""
==============================================================================
Chemin : backend/test_auto_playlists.py
Utilité : Script d'automatisation et de diagnostic de la bibliothèque musicale.
          Il vérifie la capacité du compte à extraire dynamiquement ses propres 
          données sans aucun identifiant codé en dur (Playlists et Titres Likés).
          Il sert à valider le parsing de la librairie ytmusicapi.
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def auditer_bibliotheque_automatique():
    """
    Descriptif :
    1. Initialise la connexion via l'empreinte navigateur (browser.json).
    2. Lance une requête automatique pour récupérer les playlists de la bibliothèque.
    3. Lance une seconde requête automatique pour récupérer les "Titres Likés".
       Cette double vérification permet de savoir si un éventuel échec est ciblé 
       (uniquement les playlists) ou global (toute la bibliothèque est illisible).
    4. Affiche les résultats dans la console.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...\n")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur critique d'initialisation :", e)
        return

    # --- TEST 1 : Récupération automatique des playlists ---
    print("=== TEST 1 : Playlists de la bibliothèque ===")
    try:
        playlists = ytmusic.get_library_playlists(limit=100)
        if not playlists:
            print("-> ÉCHEC : La requête automatique a renvoyé 0 playlist.")
        else:
            print(f"-> SUCCÈS : {len(playlists)} playlists trouvées automatiquement.")
            # Affichage des 3 premières pour confirmer la lecture
            for i, p in enumerate(playlists[:3], 1):
                print(f"   {i}. {p.get('title')} (ID: {p.get('playlistId')})")
    except Exception as e:
        print("-> ERREUR LORS DU PARSING DES PLAYLISTS :")
        print(e)

    print("\n=== TEST 2 : Titres Likés (Vérification de l'accès bibliothèque) ===")
    try:
        # get_liked_songs tape sur un autre point d'accès de la bibliothèque
        liked = ytmusic.get_liked_songs(limit=5)
        pistes = liked.get('tracks', [])
        if not pistes:
            print("-> ÉCHEC : Aucun titre liké trouvé ou impossible à lire.")
        else:
            print(f"-> SUCCÈS : Récupération automatique validée (Ex: '{pistes[0].get('title')}').")
    except Exception as e:
        print("-> ERREUR LORS DU PARSING DES TITRES LIKÉS :")
        print(e)
    
    print("\nFin de l'audit automatique.")

if __name__ == "__main__":
    auditer_bibliotheque_automatique()