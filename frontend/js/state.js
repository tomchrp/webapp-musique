/*
==============================================================================
Chemin : frontend/js/state.js
Utilité : Gestionnaire d'état global de l'application frontend.
Modifications :
  - Ajout de l'état du menu contextuel (contextMenuOpen).
  - Ajout de l'état du mode édition (isEditModeActive).
==============================================================================
*/

export const AppState = {
    currentView: 'home',
    currentPlaylistId: null,
    cachedPlaylists: null,
    cachedPlaylistDetails: {},
    cachedListenAgain: null,
    activeVideoId: null,
    contextMenuOpen: false,
    isEditModeActive: false
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