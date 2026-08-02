/*
==============================================================================
Chemin : frontend/js/state.js
Utilité : Gestionnaire d'état global de l'application frontend.
          Stocke les données de cache (playlists, écoutes récentes) 
          et l'état de l'interface (tiroirs ouverts, onglets actifs).
==============================================================================
*/

export const AppState = {
    isDrawerOpen: false,
    currentDrawerState: 'list',
    currentPlaylistId: null,
    cachedPlaylists: null,
    cachedPlaylistDetails: {},
    cachedListenAgain: null
};

export function clearCaches() {
    /*
    Descriptif : 
    Purge les caches de l'application pour forcer le retéléchargement des 
    données via l'API lors du prochain affichage d'un volet.
    */
    AppState.cachedPlaylists = null;
    AppState.cachedPlaylistDetails = {};
    AppState.cachedListenAgain = null;
}