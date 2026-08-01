"""
==============================================================================
Chemin : backend/test_auto_cookie.py
Utilité : Script de diagnostic (Proof of Concept) pour l'extraction 
          automatisée de l'authentification YouTube Music en utilisant 'rookiepy'.
          - Contourne les verrous SQLite sans exiger les droits administrateur.
          - Déchiffre les clés AES-GCM modernes de Chrome.
          - Génère dynamiquement le fichier de test JSON.
==============================================================================
"""

import os
import json
import rookiepy
from ytmusicapi import YTMusic

def tester_extraction_chrome():
    """
    Descriptif :
    Orchestre le processus d'extraction et de test avec la nouvelle librairie.
    1. Utilise rookiepy pour cibler spécifiquement le domaine youtube.com.
    2. Formate la liste de dictionnaires renvoyée en une chaîne de cookies HTTP valide.
    3. Injecte la chaîne dans un dictionnaire d'entêtes.
    4. Teste l'authentification directe auprès des serveurs de YouTube.
    """
    print("1. Tentative d'accès à la base de données Chrome via rookiepy...")
    
    try:
        # Extraction ultra-ciblée qui gère nativement le contournement des verrous
        cj = rookiepy.chrome(["youtube.com"])
    except Exception as e:
        print(f"\n[ERREUR FATALE] Impossible d'extraire les cookies : {e}")
        return

    # Rookiepy renvoie une liste de dictionnaires, on la formate en chaîne
    cookie_string = "; ".join([f"{cookie['name']}={cookie['value']}" for cookie in cj])

    if not cookie_string:
        print("\n[ÉCHEC] Aucun cookie YouTube n'a été trouvé. Connecte-toi sur Chrome d'abord.")
        return

    print("2. Cookies déchiffrés avec succès. Génération des entêtes...")

    headers = {
        "accept": "*/*",
        "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        "cookie": cookie_string,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    }

    fichier_temporaire = "test_auto_auth.json"
    
    with open(fichier_temporaire, "w", encoding="utf-8") as f:
        json.dump(headers, f, indent=4)

    print(f"3. Fichier {fichier_temporaire} généré. Lancement du test d'authentification...")
    
    try:
        yt = YTMusic(fichier_temporaire)
        playlists = yt.get_library_playlists(limit=2)
        
        print("\n================ RÉSULTAT DU TEST ================")
        print("SUCCES TOTAL ! L'API a reconnu ton compte. Voici tes playlists :")
        for p in playlists:
            titre = p.get('title', 'Sans titre')
            compte = p.get('count', '0')
            print(f" -> {titre} ({compte} titres)")
            
    except Exception as e:
        print(f"\n[ECHEC] YTMusicAPI a rejeté l'authentification : {e}")

if __name__ == "__main__":
    tester_extraction_chrome()