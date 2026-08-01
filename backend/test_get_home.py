"""
==============================================================================
Chemin : backend/test_get_home.py
Utilité : Script de diagnostic et d'exploration de l'endpoint get_home() de ytmusicapi.
          Permet d'analyser la structure dynamique des recommandations 
          algorithmiques de YouTube Music pour l'utilisateur authentifié.
          L'objectif est d'identifier les titres de carrousels pertinents 
          (ex: "Mix sur mesure", "Recommandé pour vous") afin de les filtrer 
          lors de l'intégration dans l'application finale.
==============================================================================
"""

import json
from pathlib import Path
from ytmusicapi import YTMusic

def analyser_algorithme_ytmusic():
    """
    Descriptif :
    Initialise le client YTMusic avec le fichier de configuration local.
    Appelle la fonction get_home avec une limite généreuse pour capturer une 
    large portion de la page d'accueil.
    Parcourt ensuite la réponse complexe et affiche de manière formatée et 
    lisible le titre de chaque section (carrousel) et le nom des 3 premiers 
    éléments qu'elle contient pour identifier les catégories algorithmiques.
    """
    chemin_auth = Path(__file__).parent / "browser.json"
    
    if not chemin_auth.exists():
        print("Erreur : Le fichier browser.json est introuvable.")
        return

    print("Connexion à YouTube Music et récupération de l'algorithme...\n")
    client = YTMusic(str(chemin_auth))
    
    try:
        # Récupération de 5 lignes (carrousels) de la page d'accueil
        home_data = client.get_home(limit=5)
        
        print("================ ANALYSE DE LA PAGE D'ACCUEIL ================\n")
        
        for index, ligne in enumerate(home_data):
            titre_ligne = ligne.get('title', 'Titre inconnu')
            contenus = ligne.get('contents', [])
            
            print(f"[{index + 1}] CARROUSEL : {titre_ligne} (Contient {len(contenus)} éléments)")
            
            # Affichage d'un échantillon des contenus pour comprendre le type de données
            for i, item in enumerate(contenus[:3]):
                titre_item = item.get('title', 'Sans titre')
                type_item = "Playlist/Mix" if 'playlistId' in item else ("Video/Chanson" if 'videoId' in item else "Autre")
                print(f"    -> {titre_item} ({type_item})")
                
            if len(contenus) > 3:
                print("    -> ... et d'autres.")
            print("-" * 60)
            
        print("\nObjectif : Identifiez ci-dessus les carrousels qui vous intéressent")
        print("(généralement ceux liés aux 'Mix' ou 'Recommandations') pour la suite.")
        
    except Exception as e:
        print(f"Erreur lors de la récupération : {e}")

if __name__ == "__main__":
    analyser_algorithme_ytmusic()