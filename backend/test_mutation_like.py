"""
==============================================================================
Chemin : backend/test_mutation_like.py
Utilité : Script de test unitaire pour isoler et valider la capacité du 
          compte à effectuer des requêtes de mutation (écriture) sur Google. 
          Tente d'ajouter un "J'aime" à un titre spécifique.
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def tester_like_musique(video_id: str):
    """
    Descriptif :
    Initialise la connexion via l'empreinte navigateur (browser.json).
    Fait appel à la fonction 'rate_song' avec l'action 'LIKE'.
    Capture et affiche l'erreur HTTP exacte si les jetons CSRF ou 
    l'identifiant de visiteur sont invalides ou expirés.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...\n")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur critique d'initialisation :", e)
        return

    print(f"Tentative de Like sur la vidéo ID : {video_id}...")
    try:
        # Appel de la méthode de mutation
        resultat = ytmusic.rate_song(video_id, 'LIKE')
        print("\n=== SUCCÈS ===")
        print(f"Réponse des serveurs Google : {resultat}")
        print("L'action d'écriture a été validée par ton compte.")
        print("=================")
        
    except Exception as e:
        print("\n=== ÉCHEC DE L'ÉCRITURE (HTTP 401) ===")
        print("Ton fichier browser.json est valide pour la lecture, mais rejeté pour l'écriture.")
        print("Erreur brute :")
        print(e)

if __name__ == "__main__":
    # ID de test (Kavinsky - Nightcall par exemple). Tu peux le remplacer.
    ID_VIDEO_A_TESTER = "MV_3Dpw-BRY" 
    tester_like_musique(ID_VIDEO_A_TESTER)