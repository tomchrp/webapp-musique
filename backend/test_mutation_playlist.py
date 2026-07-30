"""
==============================================================================
Chemin : backend/test_mutation_playlist.py
Utilité : Script de test unitaire pour isoler et valider la capacité du 
          compte à modifier ses propres playlists.
          Tente d'ajouter un titre spécifique à une playlist cible.
==============================================================================
"""
from ytmusicapi import YTMusic
from pathlib import Path
import traceback

def tester_ajout_playlist(playlist_id: str, video_id: str):
    """
    Descriptif :
    Initialise la connexion via le fichier browser.json.
    Fait appel à la fonction 'add_playlist_items' pour insérer le titre dans 
    la playlist spécifiée. Si l'opération réussit, l'API renvoie un objet 
    contenant le statut de l'action.
    """
    browser_path = Path(__file__).parent / "browser.json"
    print(f"Initialisation du client avec {browser_path}...\n")
    
    try:
        ytmusic = YTMusic(str(browser_path))
    except Exception as e:
        print("Erreur critique d'initialisation :", e)
        return

    print(f"Tentative d'ajout de la vidéo {video_id} à la playlist {playlist_id}...")
    try:
        # Appel de la méthode d'ajout
        resultat = ytmusic.add_playlist_items(playlist_id, [video_id])
        print("\n=== SUCCÈS ===")
        print(f"Réponse de l'API : {resultat}")
        print("Le titre a été inséré dans la playlist avec succès.")
        print("=================")
        
    except Exception as e:
        print("\n=== ÉCHEC DE L'ÉCRITURE (HTTP 401 ou 403) ===")
        print("Erreur brute :")
        print(e)

if __name__ == "__main__":
    # Ta playlist "5h du mat dans la faille"
    ID_PLAYLIST = "PLPBYXUs1x7aP_OFLv-ol6Zlz05TCEefsT" 
    # Même ID de test pour la vidéo
    ID_VIDEO = "MV_3Dpw-BRY"
    
    tester_ajout_playlist(ID_PLAYLIST, ID_VIDEO)