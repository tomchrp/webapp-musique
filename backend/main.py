"""
==============================================================================
Chemin : backend/main.py
Utilité : Point d'entrée allégé de l'API FastAPI.
          Se charge d'instancier l'application, de monter les fichiers 
          statiques du frontend et d'inclure les différents routeurs.
==============================================================================
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# Import des routeurs (qui seront créés dans la prochaine étape)
from backend.api.ws_routes import router as ws_router
from backend.api.music_routes import router as music_router
from backend.api.player_routes import router as player_routes

app = FastAPI(title="Gemini Music AI")

# Inclusion des routeurs pour séparer la logique
app.include_router(ws_router)
app.include_router(music_router)
app.include_router(player_routes)

# Montage du frontend statique (doit être fait après les routes d'API)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")