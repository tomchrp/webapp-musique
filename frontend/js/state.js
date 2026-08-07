/*
==============================================================================
Chemin : frontend/js/state.js
Utilité : Gestionnaire d'état global de l'application frontend.
Modifications (Refonte SPA) :
  - Suppression de l'état lié aux tiroirs (isDrawerOpen, currentDrawerState).
  - Ajout du suivi de la vue active (currentView).
==============================================================================
*/

export const AppState = {
    currentView: 'home', // Peut être 'home', 'playlist', 'queue'
    currentPlaylistId: null,
    cachedPlaylists: null,
    cachedPlaylistDetails: {},
    cachedListenAgain: null,
    activeVideoId: null // Utilisé pour la surbrillance
};

export function clearCaches() {
    /*
    Descriptif : 
    Purge les caches de l'application pour forcer le retéléchargement des 
    données via l'API lors d'un rafraîchissement manuel ou d'une modification.
    */
    AppState.cachedPlaylists = null;
    AppState.cachedPlaylistDetails = {};
    AppState.cachedListenAgain = null;
}