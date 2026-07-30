"""
==============================================================================
Chemin : backend/test_auto_playlists.py
Utilité : Script de validation unitaire.
          Combine deux opérations d'écriture consécutives : la création d'une 
          toute nouvelle playlist privée, suivie de l'injection immédiate d'un 
          titre à l'intérieur de celle-ci dès sa création.
==============================================================================
"""

from pathlib import Path
from ytmusicapi import YTMusic

def tester_creation_et_ajout():
    """
    Descriptif :
    Demande à l'API de créer une nouvelle entité de type playlist. ytmusicapi 
    permet de passer directement une liste de video_ids lors de la création pour 
    l'initialiser avec du contenu. Affiche l'identifiant unique de la nouvelle playlist.
    """
    chemin_auth = Path(__file__).parent / "browser.json"
    
    try:
        client = YTMusic(str(chemin_auth))
        video_id = "kOn-HdEg6AQ"
        titre_playlist = "Test API Gemini - Auto Creation"
        description = "Playlist générée automatiquement par le script de test unitaire."
        
        print(f"Création de la playlist '{titre_playlist}' avec le titre {video_id}...")
        nouveau_playlist_id = client.create_playlist(
            title=titre_playlist,
            description=description,
            privacy_status="PRIVATE",
            video_ids=[video_id]
        )
        
        print(f"Succès ! Nouvelle playlist créée avec l'ID : {nouveau_playlist_id}")
            
    except Exception as e:
        print(f"Erreur critique lors de l'exécution : {e}")

if __name__ == "__main__":
    tester_creation_et_ajout()