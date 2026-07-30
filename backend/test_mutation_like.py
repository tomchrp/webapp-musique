"""
==============================================================================
Chemin : backend/test_mutation_like.py
Utilité : Script de validation unitaire.
          Vérifie la capacité du client YTMusic authentifié via browser.json 
          à modifier l'état d'appréciation d'un titre spécifique (Like).
          Permet de confirmer que les droits d'écriture (mutations) sont actifs.
==============================================================================
"""

from pathlib import Path
from ytmusicapi import YTMusic

def tester_like_titre():
    """
    Descriptif :
    Initialise le client API et envoie une requête pour liker le titre 'Beat It'.
    Affiche la réponse brute de l'API pour faciliter le débogage en cas d'erreur HTTP 400/401.
    """
    chemin_auth = Path(__file__).parent / "browser.json"
    print(f"Chargement de l'authentification depuis : {chemin_auth}")
    
    try:
        client = YTMusic(str(chemin_auth))
        video_id = "kOn-HdEg6AQ"  # Beat It
        
        print(f"Tentative de like sur la vidéo ID : {video_id}...")
        reponse = client.rate_song(video_id, 'LIKE')
        
        print("Résultat de l'opération :")
        print(reponse)
        
    except Exception as e:
        print(f"Erreur critique lors de l'exécution : {e}")

if __name__ == "__main__":
    tester_like_titre()