"""
==============================================================================
Chemin : backend/core/gemini_config.py
Utilité : Configuration centralisée de l'IA Gemini Live.
          Contient la déclaration des outils (Function Calling), le prompt 
          système et la configuration de la voix (Leda). Intègre la gestion
          de la file d'attente.
==============================================================================
"""

import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pathlib import Path

# Chargement des variables d'environnement
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

MODEL = "gemini-3.1-flash-live-preview"
client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

gemini_tools = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="gerer_musique",
            description="Recherche et lit une musique, un artiste ou une playlist PUBLIQUE sur YouTube. NE L'UTILISE PAS si l'utilisateur précise que la playlist lui appartient (ex: 'ma playlist').",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "action": types.Schema(type=types.Type.STRING, description="'play_now' ou 'add_to_queue'"),
                    "position": types.Schema(type=types.Type.STRING, description="'next' (juste après le titre actuel) ou 'last' (à la toute fin de la file). Par défaut utiliser 'next'."),
                    "type_recherche": types.Schema(type=types.Type.STRING, description="'chanson' ou 'playlist'"),
                    "requete": types.Schema(type=types.Type.STRING, description="Nom du titre ou de la playlist publique.")
                },
                required=["action", "type_recherche", "requete"]
            )
        ),
        types.FunctionDeclaration(
            name="jouer_playlist_personnelle",
            description="EXCLUSIVEMENT pour chercher et lancer la lecture d'une playlist PRIVÉE/PERSONNELLE appartenant à l'utilisateur. Utilise cet outil dès que l'utilisateur dit 'ma playlist', 'mes favoris' ou 'ma bibliothèque'.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Le nom précis de la playlist de l'utilisateur.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="sauvegarder_titre_actuel",
            description="Ajoute le titre en cours de lecture aux favoris (Likes)."
        ),
        types.FunctionDeclaration(
            name="creer_playlist_avec_titre",
            description="Crée une nouvelle playlist privée et y ajoute le titre en cours de lecture.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Nom de la future playlist.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="ajouter_titre_playlist_existante",
            description="Ajoute le titre en cours à une de tes playlists. ATTENTION : Tu dois fournir le nom EXACT. Si la requête échoue ou que tu as un doute, utilise D'ABORD l'outil 'lister_playlists_personnelles' pour lire la liste, puis rappelle cet outil avec le nom correct.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "nom_playlist": types.Schema(type=types.Type.STRING, description="Nom EXACT de la playlist cible.")
                },
                required=["nom_playlist"]
            )
        ),
        types.FunctionDeclaration(
            name="jouer_style_actuel",
            description="Génère une nouvelle radio de découverte basée sur le titre actuellement en cours de lecture."
        ),
        types.FunctionDeclaration(
            name="lister_playlists_personnelles",
            description="Récupère la liste des playlists privées de l'utilisateur. Utilise cet outil si l'utilisateur demande quelles sont ses playlists, ou si tu as un doute sur le nom exact avant de lancer la lecture."
        ),
        
        # NOUVEAUX OUTILS DE CONTRÔLE LECTEUR (Catégorie A)
        types.FunctionDeclaration(name="mettre_en_pause", description="Met la musique actuellement en cours de lecture en pause."),
        types.FunctionDeclaration(name="reprendre_lecture", description="Relance la musique qui était en pause."),
        types.FunctionDeclaration(name="passer_titre", description="Passe au titre suivant dans la file d'attente."),
        types.FunctionDeclaration(name="titre_precedent", description="Revient au titre précédent."),
        types.FunctionDeclaration(name="sauter_playlist", description="Passe la totalité de la file d'attente actuelle pour aller directement à la radio algorithmique."),
        types.FunctionDeclaration(name="recommencer_playlist", description="Recommence la session de lecture depuis tout le début."),
        types.FunctionDeclaration(name="vider_file_attente", description="Vide toutes les musiques qui ont été ajoutées manuellement à la file d'attente."),
    ]
)

# Configuration de la connexion Live avec voix forcée (Leda)
CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    tools=[gemini_tools],
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                voice_name="Leda"
            )
        )
    ),
    system_instruction=types.Content(parts=[
        types.Part(text=(
            "Tu es un assistant musical francophone direct et efficace. "
            "Tu gères la musique de l'utilisateur. "
            "RÈGLES STRICTES : "
            "1. Si l'utilisateur demande d'ajouter une musique SANS préciser où, utilise l'outil 'gerer_musique' avec action='add_to_queue' et position='next'. Ne mets position='last' QUE si l'utilisateur demande expressément 'à la fin'. "
            "2. Si l'utilisateur dit 'Joue ma playlist [Nom]', tu DOIS utiliser l'outil 'jouer_playlist_personnelle'. L'outil 'gerer_musique' est strictement réservé aux recherches publiques. "
            "3. Confirme toujours oralement de manière très courte (ex: 'Je lance ta playlist', 'Titre ajouté'). MAIS ATTENTION : pour les commandes de contrôle du lecteur (pause, suivant, précédent, sauter, recommencer), NE DIS STRICTEMENT RIEN, appelle uniquement l'outil pour que la musique ne soit pas interrompue par ta voix. "
            "4. Si un outil renvoie un message 'DÉFAUT D'AUTHENTIFICATION', tu dois annoncer le problème exact à l'utilisateur."
        ))
    ]),
)