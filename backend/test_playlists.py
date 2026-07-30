"""
==============================================================================
Chemin : backend/test_playlists.py
Utilité : Script de validation unitaire.
          Vérifie la capacité du client à lire les données privées du compte.
          Récupère et affiche la liste des playlists de la bibliothèque pour 
          confirmer que la session simule bien l'utilisateur authentifié.
==============================================================================
"""

from pathlib import Path
from ytmusicapi import YTMusic

def tester_lecture_playlists():
    """
    Descriptif :
    Interroge la bibliothèque de l'utilisateur pour récupérer ses playlists.
    Itère sur les résultats pour afficher le titre et l'identifiant de chacune,
    ce qui est crucial pour le ciblage lors des ajouts de titres ultérieurs.
    """
    chemin_auth = Path(__file__).parent / "browser.json"
    
    try:
        client = YTMusic(str(chemin_auth))
        
        print("Récupération de la bibliothèque de playlists...")
        playlists = client.get_library_playlists(limit=50)
        
        print(f"{len(playlists)} playlists trouvées :")
        for p in playlists:
            titre = p.get('title', 'Sans titre')
            id_playlist = p.get('playlistId', 'ID inconnu')
            print(f"- {titre} (ID: {id_playlist})")
            
    except Exception as e:
        print(f"Erreur critique lors de l'exécution : {e}")

if __name__ == "__main__":
    tester_lecture_playlists()