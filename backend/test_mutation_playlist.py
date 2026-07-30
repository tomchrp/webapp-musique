"""
==============================================================================
Chemin : backend/test_mutation_playlist.py
Utilité : Script de validation unitaire.
          Vérifie l'insertion d'une piste audio spécifique dans une playlist 
          personnelle préexistante. C'est l'opération la plus sensible aux 
          erreurs de type 'Bad Request' si les cookies sont mal formés.
==============================================================================
"""

from pathlib import Path
from ytmusicapi import YTMusic

def tester_ajout_playlist_existante():
    """
    Descriptif :
    Exécute l'ajout du titre 'Beat It' dans la playlist personnelle fournie par 
    l'utilisateur. Imprime le statut de retour, qui doit contenir un 'status': 'STATUS_SUCCEEDED'
    si l'opération est validée par les serveurs de Google.
    """
    chemin_auth = Path(__file__).parent / "browser.json"
    
    try:
        client = YTMusic(str(chemin_auth))
        video_id = "kOn-HdEg6AQ"
        playlist_id = "PLPBYXUs1x7aMVb-CqaEYTYopxuJ-Q52DQ"
        
        print(f"Ajout de la vidéo {video_id} à la playlist {playlist_id}...")
        reponse = client.add_playlist_items(playlist_id, [video_id])
        
        print("Résultat de l'opération :")
        print(reponse)
            
    except Exception as e:
        print(f"Erreur critique lors de l'exécution : {e}")

if __name__ == "__main__":
    tester_ajout_playlist_existante()