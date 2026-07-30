"""
==============================================================================
Chemin : backend/test_all_playlists_tracks.py
Utilité : Script de diagnostic approfondi. 
          Tente de récupérer toutes les playlists de la bibliothèque de 
          l'utilisateur, puis interroge chacune d'entre elles individuellement 
          pour lister ses 3 premiers titres. Permet de vérifier l'accès global 
          et l'accès détaillé.
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def tester_toutes_playlists_et_titres():
    """
    Descriptif :
    1. Initialise le client avec browser.json.
    2. Appelle get_library_playlists() pour obtenir la liste complète.
    3. Boucle sur chaque playlist trouvée et appelle get_playlist() via son ID.
    4. Affiche les 3 premières pistes pour confirmer la lecture détaillée.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...\n")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur critique d'initialisation :", e)
        return

    print("=== ÉTAPE 1 : Récupération de la liste des playlists ===")
    try:
        playlists = ytmusic.get_library_playlists(limit=100)
        if not playlists:
            print("-> ÉCHEC ou VIDE : Aucune playlist trouvée dans la bibliothèque.")
            return
        print(f"-> SUCCÈS : {len(playlists)} playlists trouvées.\n")
    except Exception as e:
        print("-> ERREUR LORS DU PARSING DE LA BIBLIOTHÈQUE :")
        traceback.print_exc()
        print("\nConclusion : Ton browser.json actuel bloque l'accès à la bibliothèque globale.")
        return

    print("=== ÉTAPE 2 : Analyse détaillée de chaque playlist ===")
    for index, p in enumerate(playlists, start=1):
        titre_playlist = p.get('title', 'Titre inconnu')
        playlist_id = p.get('playlistId')
        
        print(f"\n[{index}/{len(playlists)}] Playlist : {titre_playlist} (ID: {playlist_id})")
        
        if not playlist_id:
            print("  -> Erreur : Aucun ID de playlist fourni par l'API.")
            continue
            
        try:
            # Récupération des détails de la playlist
            details = ytmusic.get_playlist(playlist_id)
            pistes = details.get('tracks', [])
            
            if not pistes:
                print("  -> Playlist vide ou impossible d'en lire les pistes.")
            else:
                print(f"  -> {len(pistes)} pistes au total. Voici les 3 premières :")
                for i, piste in enumerate(pistes[:3], 1):
                    nom_titre = piste.get('title', 'Titre inconnu')
                    artistes = ", ".join([a.get('name', '') for a in piste.get('artists', [])])
                    print(f"     {i}. {nom_titre} - {artistes}")
        except Exception as e:
            print(f"  -> ERREUR lors de la lecture de la playlist {playlist_id} : {e}")

if __name__ == "__main__":
    tester_toutes_playlists_et_titres()