/*
==============================================================================
Chemin : frontend/js/main.js
Utilité : Point d'entrée principal. Importe tous les modules et attache 
          les écouteurs d'événements aux éléments du DOM.
Mise à jour : Ajout du mécanisme global de fermeture des tiroirs lors
              d'un clic à l'extérieur. Suppression des références aux 
              anciennes croix de fermeture.
==============================================================================
*/

import * as DOM from './constants.js';
import * as API from './api.js';
import { AppState, clearCaches } from './state.js';
import { showToast, openDrawer, refreshActiveDrawer, loadPlaylists, loadListenAgain, showLoadingState, removeLoadingState, openQueueDrawer, closeAllDrawers, openAddPlaylistDrawer } from './ui.js';
import { PlayerStore, playPrevTrack, playNextTrack, playMusic, playSpecificTrack, fadeIn, fadeOut, addTrackToQueue, skipCurrentPlaylist, restartCurrentPlaylist } from './player.js';
import { stopConversation, startConversation, GeminiStore } from './gemini.js';

// ==========================================
// MÉCANISME GLOBAL DE FERMETURE
// ==========================================
document.addEventListener('click', (e) => {
    // 1. Fermeture du slider de volume
    if (!DOM.btnVolume.contains(e.target) && !DOM.volumeSlider.contains(e.target)) {
        DOM.volumeSlider.classList.add('hidden');
    }

    // 2. Fermeture de la recherche textuelle
    if (!DOM.searchInput.contains(e.target) && !DOM.searchResults.contains(e.target)) {
        DOM.searchResults.classList.add('hidden');
    }

    // 3. Fermeture des volets (Drawers)
    const isAnyDrawerOpen = AppState.isDrawerOpen ||
        !DOM.queueDrawer.classList.contains('hidden') ||
        !DOM.playlistAddDrawer.classList.contains('hidden');

    if (isAnyDrawerOpen) {
        // Est-ce qu'on a cliqué à l'intérieur d'un tiroir ?
        const clickedInsideLibrary = DOM.libraryDrawer.contains(e.target);
        const clickedInsideQueue = DOM.queueDrawer.contains(e.target);
        const clickedInsideAddPlaylist = DOM.playlistAddDrawer.contains(e.target);

        // Est-ce qu'on a cliqué sur un bouton qui sert à OUVRIR un tiroir ?
        const clickedLibraryBtn = DOM.btnLibrary.contains(e.target);
        const clickedQueuePreview = DOM.queuePreviewContainer.contains(e.target);
        const clickedAddPlaylistBtn = DOM.btnAddPlaylist.contains(e.target);

        // Si ce n'est ni l'un ni l'autre, on clique sur le fond : on ferme tout.
        if (!clickedInsideLibrary && !clickedInsideQueue && !clickedInsideAddPlaylist &&
            !clickedLibraryBtn && !clickedQueuePreview && !clickedAddPlaylistBtn) {
            closeAllDrawers();
        }
    }
});

DOM.btnVolume.addEventListener('click', () => {
    DOM.volumeSlider.classList.toggle('hidden');
});

DOM.volumeSlider.addEventListener('input', (e) => {
    if (PlayerStore.musicPlayer) {
        const rawValue = parseFloat(e.target.value);
        const cubicVolume = Math.pow(rawValue, 3);
        PlayerStore.musicPlayer.volume = cubicVolume;

        if (rawValue === 0) DOM.btnVolume.innerHTML = DOM.SVG_VOL_MUTE;
        else if (rawValue < 0.5) DOM.btnVolume.innerHTML = DOM.SVG_VOL_LOW;
        else DOM.btnVolume.innerHTML = DOM.SVG_VOL_HIGH;
    }
});

// ==========================================
// RECHERCHE EN DIRECT
// ==========================================
DOM.searchInput.addEventListener('focus', () => {
    closeAllDrawers();
});

let searchTimeout = null;
DOM.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) {
        DOM.searchResults.classList.add('hidden');
        return;
    }
    searchTimeout = setTimeout(async () => {
        try {
            const results = await API.searchLive(query);
            DOM.searchResults.innerHTML = '';
            if (results.length > 0) {
                results.forEach(track => {
                    const item = document.createElement('div');
                    item.className = 'search-item';

                    item.innerHTML = `
                        <div class="search-item-clickable" title="Écouter maintenant">
                            <img src="${track.thumbnail}" alt="Cover">
                            <div class="search-item-info">
                                <span class="search-item-title">${track.title}</span>
                                <span class="search-item-artist">${track.artist}</span>
                            </div>
                        </div>
                        <button class="btn-icon btn-add-queue" aria-label="Ajouter à la file" title="Ajouter à la file">
                            ${DOM.SVG_ADD_QUEUE}
                        </button>
                    `;

                    item.querySelector('.search-item-clickable').addEventListener('click', () => {
                        DOM.searchInput.value = '';
                        DOM.searchResults.classList.add('hidden');
                        playSpecificTrack(track.video_id);
                    });

                    item.querySelector('.btn-add-queue').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        DOM.searchInput.value = '';
                        DOM.searchResults.classList.add('hidden');
                        addTrackToQueue(track.video_id);
                    });

                    DOM.searchResults.appendChild(item);
                });
                DOM.searchResults.classList.remove('hidden');
            } else {
                DOM.searchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Aucun résultat</div>';
                DOM.searchResults.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Erreur de live search :", e);
        }
    }, 300);
});

// ==========================================
// BOUTON MICROPHONE GEMINI
// ==========================================
DOM.toggleBtn.addEventListener('click', async () => {
    if (GeminiStore.ws && GeminiStore.ws.readyState === WebSocket.OPEN) {
        stopConversation();
        if (PlayerStore.musicPlayer && PlayerStore.musicPlayer.src) {
            fadeIn(PlayerStore.musicPlayer);
            DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
        }
    } else {
        if (PlayerStore.musicPlayer && !PlayerStore.musicPlayer.paused) {
            await fadeOut(PlayerStore.musicPlayer);
            DOM.btnPlayPause.innerHTML = DOM.SVG_PLAY;
        }
        startConversation();
    }
});

// ==========================================
// CONTROLES DU LECTEUR
// ==========================================
DOM.progressBar.addEventListener('input', () => {
    if (PlayerStore.musicPlayer && PlayerStore.musicPlayer.duration) {
        PlayerStore.musicPlayer.currentTime = (DOM.progressBar.value / 100) * PlayerStore.musicPlayer.duration;
    }
});

DOM.btnPrev.addEventListener('click', playPrevTrack);
DOM.btnNext.addEventListener('click', playNextTrack);
DOM.btnSkipPlaylist.addEventListener('click', skipCurrentPlaylist);
DOM.btnRestartPlaylist.addEventListener('click', restartCurrentPlaylist);

DOM.btnPlayPause.addEventListener('click', () => {
    if (!PlayerStore.musicPlayer) return;

    if (GeminiStore.ws && (GeminiStore.ws.readyState === WebSocket.OPEN || GeminiStore.ws.readyState === WebSocket.CONNECTING)) {
        stopConversation();
    }

    if (PlayerStore.musicPlayer.paused) {
        PlayerStore.musicPlayer.play();
        DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
    } else {
        PlayerStore.musicPlayer.pause();
        DOM.btnPlayPause.innerHTML = DOM.SVG_PLAY;
    }
});

// ==========================================
// TIROIR FILE D'ATTENTE (QUEUE DRAWER)
// ==========================================
DOM.queuePreviewContainer.addEventListener('click', openQueueDrawer);

// ==========================================
// VOLETS LATERAUX (LIBRARY DRAWERS)
// ==========================================
DOM.btnLibrary.addEventListener('click', () => {
    if (AppState.isDrawerOpen) {
        closeAllDrawers();
    } else {
        openDrawer();
    }
});

DOM.btnDrawerBack.addEventListener('click', () => {
    if (AppState.currentDrawerState === 'detail') {
        DOM.drawerTabs.classList.remove('hidden');
        DOM.drawerTitle.classList.add('hidden');

        if (DOM.tabPlaylists.classList.contains('active')) {
            loadPlaylists();
        } else {
            AppState.currentDrawerState = 'discovery';
            DOM.btnDrawerBack.classList.add('hidden');
            DOM.drawerActions.classList.add('hidden');
            DOM.libraryContent.classList.add('hidden');
            DOM.discoveryContent.classList.remove('hidden');
        }
    }
});

DOM.btnDrawerPlay.addEventListener('click', async () => {
    if (!AppState.currentPlaylistId) return;

    stopConversation();
    showLoadingState();
    closeAllDrawers();

    try {
        const data = await API.playPlaylist(AppState.currentPlaylistId);
        if (!data.error) {
            playMusic(data);
        } else {
            removeLoadingState();
            showToast(data.error);
        }
    } catch (e) {
        removeLoadingState();
        showToast("Erreur lors de la lecture.");
        console.error("Erreur play_playlist :", e);
    }
});

DOM.tabPlaylists.addEventListener('click', () => {
    DOM.tabPlaylists.classList.add('active');
    DOM.tabDiscovery.classList.remove('active');
    DOM.libraryContent.classList.remove('hidden');
    DOM.discoveryContent.classList.add('hidden');
    DOM.drawerTitle.classList.add('hidden');
    DOM.drawerTabs.classList.remove('hidden');
    AppState.currentDrawerState = 'list';
    loadPlaylists();
});

DOM.tabDiscovery.addEventListener('click', () => {
    DOM.tabDiscovery.classList.add('active');
    DOM.tabPlaylists.classList.remove('active');
    DOM.discoveryContent.classList.remove('hidden');
    DOM.libraryContent.classList.add('hidden');
    DOM.btnDrawerBack.classList.add('hidden');
    DOM.drawerActions.classList.add('hidden');
    DOM.drawerTitle.classList.add('hidden');
    DOM.drawerTabs.classList.remove('hidden');
    AppState.currentDrawerState = 'discovery';
    loadListenAgain();
});

DOM.btnDrawerRefresh.addEventListener('click', () => {
    clearCaches();
    refreshActiveDrawer();
});

// ==========================================
// AJOUT AUX PLAYLISTS PERSONNELLES
// ==========================================
DOM.btnAddPlaylist.addEventListener('click', async () => {
    if (!PlayerStore.musicPlayer || !PlayerStore.musicPlayer.src) {
        showToast("Aucune musique en cours.");
        return;
    }

    if (DOM.btnAddPlaylist.innerHTML.includes("16.17")) return;

    openAddPlaylistDrawer();
    DOM.addDrawerList.innerHTML = '<div style="text-align:center; padding: 20px;">Chargement...</div>';

    let playlists = AppState.cachedPlaylists;
    if (!playlists) {
        try {
            playlists = await API.getPlaylists();
            AppState.cachedPlaylists = playlists;
        } catch (e) {
            DOM.addDrawerList.innerHTML = '<div style="color:red; text-align:center;">Erreur.</div>';
            return;
        }
    }

    DOM.addDrawerList.innerHTML = '';
    playlists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'add-list-item';
        const thumb = p.thumbnail ? p.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        item.innerHTML = `
            <img src="${thumb}">
            <span>${p.title}</span>
        `;

        item.addEventListener('click', async () => {
            closeAllDrawers();
            showToast("Ajout en cours...");

            const currentVideoId = PlayerStore.musicPlayer.src.split('/').pop();

            try {
                const data = await API.addToPlaylist(p.playlistId, currentVideoId);
                if (!data.error) {
                    showToast("Ajouté avec succès !");
                    DOM.btnAddPlaylist.innerHTML = DOM.SVG_CHECK;

                    AppState.cachedPlaylistDetails[p.playlistId] = null;
                    AppState.cachedPlaylists = null;
                    refreshActiveDrawer();
                } else {
                    showToast(data.error);
                }
            } catch (e) {
                showToast("Erreur réseau.");
            }
        });
        DOM.addDrawerList.appendChild(item);
    });
});