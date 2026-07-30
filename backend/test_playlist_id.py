"""
==============================================================================
Chemin : backend/test_playlist_id.py
Utilité : Script de test ciblé pour vérifier l'accès à une playlist spécifique 
          (notamment privée) via son identifiant unique. Cela permet de 
          déterminer si l'échec précédent est dû à un échec du scraping 
          général de la bibliothèque ou à un réel problème d'authentification.
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def tester_playlist_specifique(playlist_id: str):
    """
    Descriptif :
    Construit le chemin vers le fichier d'empreinte navigateur et initialise 
    le client YTMusic. Fait appel à la fonction 'get_playlist' avec l'ID 
    fourni pour interroger directement le point d'accès de la playlist.
    Extrait ensuite les métadonnées (titre, confidentialité) et boucle sur 
    les pistes pour afficher les trois premiers titres afin de confirmer la 
    lecture des données.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur d'initialisation YTMusic :")
        print(e)
        return
        
    print(f"Récupération des informations pour la playlist {playlist_id}...")
    try:
        # Appel direct à l'endpoint de la playlist
        playlist = ytmusic.get_playlist(playlist_id)
        
        titre = playlist.get('title', 'Inconnu')
        visibilite = playlist.get('privacy', 'Inconnue')
        pistes = playlist.get('tracks', [])
        
        print("\n=== Succès de la récupération ===")
        print(f"Titre de la playlist : {titre}")
        print(f"Visibilité : {visibilite}")
        print(f"Nombre de pistes : {len(pistes)}")
        
        if pistes:
            print("\nLes 3 premiers titres :")
            for i, piste in enumerate(pistes[:3], 1):
                nom_titre = piste.get('title', 'Titre inconnu')
                artistes = ", ".join([a.get('name', '') for a in piste.get('artists', [])])
                print(f"  {i}. {nom_titre} - {artistes}")
        print("=================================")
        
    except Exception as e:
        print(f"\nErreur : Impossible de lire la playlist {playlist_id}.")
        print("Si cette playlist est privée, cela confirme que tes en-têtes (headers) ne sont pas reconnus.")
        traceback.print_exc()

if __name__ == "__main__":
    # Remplace cette valeur par l'ID exact de ta playlist
    ID_PLAYLIST_A_TESTER = "PLPBYXUs1x7aP_OFLv-ol6Zlz05TCEefsT"
    tester_playlist_specifique(ID_PLAYLIST_A_TESTER)