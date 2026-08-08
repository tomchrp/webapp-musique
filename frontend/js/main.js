/*
==============================================================================
Chemin : frontend/js/main.js
Utilité : Point d'entrée principal (Contrôleur SPA). Initialise les vues, 
          attache les écouteurs d'événements et gère l'API History du navigateur.
Modifications :
  - Nettoyage : Suppression des événements de clic pour le bouton volume, 
    désormais entièrement géré en CSS via le survol (hover).
==============================================================================
*/

import * as DOM from './constants.js';
import * as API from './api.js';
import { AppState, clearCaches } from './state.js';
import { showToast, showView, showLoadingState, removeLoadingState, loadListenAgain, loadPlaylists, toggleFullPlayer, handleMarqueeEnter, handleMarqueeLeave, showContextMenu, hideContextMenu, toggleEditMode } from './ui.js';
import { PlayerStore, playMusic, playPrevTrack, playNextTrack, playSpecificTrack, fadeIn, fadeOut, addTrackToQueue, skipCurrentPlaylist, restartCurrentPlaylist } from './player.js';
import { stopConversation, startConversation, GeminiStore } from './gemini.js';

// ==========================================
// INITIALISATION DE LA SPA ET HISTORIQUE
// ==========================================

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        showView(e.state.view, e.state.data, false);
    } else {
        showView('view-home', null, false);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadListenAgain();
    loadPlaylists();
    showView('view-home', null, true);
});

// ==========================================
// MÉCANISME GLOBAL DE FERMETURE (CLICS EXTÉRIEURS)
// ==========================================

document.addEventListener('click', (e) => {
    if (!DOM.searchInput.contains(e.target) && !DOM.searchResults.contains(e.target)) {
        DOM.searchResults.classList.add('hidden');
    }

    if (!DOM.playlistAddModal.classList.contains('hidden')) {
        if (!DOM.playlistAddModal.querySelector('.modal-content').contains(e.target) && !DOM.btnAddPlaylist.contains(e.target)) {
            DOM.playlistAddModal.classList.add('hidden');
        }
    }

    if (AppState.contextMenuOpen && !DOM.contextMenu.contains(e.target) && !DOM.btnPlaylistOptions.contains(e.target)) {
        hideContextMenu();
    }
});

// ==========================================
// INTERACTIONS DES VUES (NAVIGATION)
// ==========================================

DOM.btnPlaylistBack.addEventListener('click', () => history.back());
DOM.btnCollectionBack.addEventListener('click', () => history.back());

DOM.btnPlaylistPlayAll.addEventListener('click', async () => {
    if (!AppState.currentPlaylistId) return;

    if (GeminiStore.ws && (GeminiStore.ws.readyState === WebSocket.OPEN || GeminiStore.ws.readyState === WebSocket.CONNECTING)) {
        stopConversation();
    }
    showLoadingState();
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
        showToast("Erreur lors de la lecture de la playlist.");
    }
});

// ==========================================
// MENU CONTEXTUEL ET ÉDITION PLAYLIST
// ==========================================

DOM.btnPlaylistOptions.addEventListener('click', (e) => {
    e.stopPropagation();
    if (AppState.contextMenuOpen) {
        hideContextMenu();
    } else {
        const rect = e.currentTarget.getBoundingClientRect();
        showContextMenu(rect.left, rect.bottom);
    }
});

DOM.menuEdit.addEventListener('click', () => {
    hideContextMenu();
    toggleEditMode(true);
});

DOM.menuDelete.addEventListener('click', () => {
    hideContextMenu();
    DOM.deletePlaylistModal.classList.remove('hidden');
});

DOM.btnCancelDelete.addEventListener('click', () => {
    DOM.deletePlaylistModal.classList.add('hidden');
});

DOM.btnConfirmDelete.addEventListener('click', async () => {
    DOM.deletePlaylistModal.classList.add('hidden');
    showLoadingState();
    try {
        const result = await API.deletePlaylist(AppState.currentPlaylistId);
        if (!result.error) {
            showToast("Playlist supprimée avec succès.");
            clearCaches();
            loadPlaylists();
            history.back();
        } else {
            showToast(result.error || "Erreur de suppression.");
        }
    } catch (e) {
        showToast("Erreur réseau.");
    }
    removeLoadingState();
});

const savePlaylistTitle = async () => {
    const newTitle = DOM.editPlaylistTitle.value.trim();
    const oldTitle = DOM.viewPlaylistTitle.textContent;

    toggleEditMode(false);

    if (newTitle && newTitle !== oldTitle) {
        DOM.viewPlaylistTitle.textContent = newTitle;
        try {
            const result = await API.renamePlaylist(AppState.currentPlaylistId, newTitle);
            if (!result.error) {
                showToast("Playlist renommée avec succès.");
                clearCaches();
                loadPlaylists();
            } else {
                DOM.viewPlaylistTitle.textContent = oldTitle;
                showToast("Erreur lors du renommage.");
            }
        } catch (e) {
            DOM.viewPlaylistTitle.textContent = oldTitle;
            showToast("Erreur réseau.");
        }
    }
};

DOM.btnExitEditMode.addEventListener('click', savePlaylistTitle);
DOM.editPlaylistTitle.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') savePlaylistTitle();
});

// ==========================================
// DRAG AND DROP (RÉORGANISATION PLAYLIST)
// ==========================================

let draggedItem = null;

DOM.playlistTracksContainer.addEventListener('dragstart', (e) => {
    if (!AppState.isEditModeActive) {
        e.preventDefault();
        return;
    }
    draggedItem = e.target.closest('.library-item');
    if (draggedItem) {
        draggedItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedItem.dataset.setVideoId);
    }
});

DOM.playlistTracksContainer.addEventListener('dragover', (e) => {
    if (!AppState.isEditModeActive || !draggedItem) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest('.library-item');
    if (targetItem && targetItem !== draggedItem) {
        const rect = targetItem.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        document.querySelectorAll('.library-item.drag-over').forEach(el => el.classList.remove('drag-over'));

        if (e.clientY < midpoint) {
            targetItem.classList.add('drag-over');
            targetItem.dataset.dropPosition = 'before';
        } else {
            targetItem.classList.add('drag-over');
            targetItem.dataset.dropPosition = 'after';
        }
    }
});

DOM.playlistTracksContainer.addEventListener('dragleave', (e) => {
    const targetItem = e.target.closest('.library-item');
    if (targetItem) targetItem.classList.remove('drag-over');
});

DOM.playlistTracksContainer.addEventListener('drop', async (e) => {
    if (!AppState.isEditModeActive || !draggedItem) return;
    e.preventDefault();

    const targetItem = document.querySelector('.library-item.drag-over');
    if (!targetItem) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
        return;
    }

    targetItem.classList.remove('drag-over');
    draggedItem.classList.remove('dragging');

    const dropPosition = targetItem.dataset.dropPosition;
    let moveBeforeSetVideoId = null;

    if (dropPosition === 'before') {
        DOM.playlistTracksContainer.insertBefore(draggedItem, targetItem);
        moveBeforeSetVideoId = targetItem.dataset.setVideoId;
    } else {
        DOM.playlistTracksContainer.insertBefore(draggedItem, targetItem.nextSibling);
        const nextNode = targetItem.nextSibling;
        if (nextNode) moveBeforeSetVideoId = nextNode.dataset.setVideoId;
    }

    const setVideoId = draggedItem.dataset.setVideoId;
    draggedItem = null;

    try {
        const result = await API.reorderPlaylist(AppState.currentPlaylistId, setVideoId, moveBeforeSetVideoId);
        if (result.error) {
            showToast("Erreur lors de la synchronisation du déplacement.");
        } else {
            AppState.cachedPlaylistDetails[AppState.currentPlaylistId] = null;
        }
    } catch (error) {
        showToast("Erreur réseau lors du déplacement.");
    }
});

DOM.playlistTracksContainer.addEventListener('dragend', () => {
    if (draggedItem) draggedItem.classList.remove('dragging');
    document.querySelectorAll('.library-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedItem = null;
});

// ==========================================
// SYNCHRONISATION PAGINATION CARROUSEL
// ==========================================

const updatePaginationDots = (carousel, pagination) => {
    const pageIndex = Math.round(carousel.scrollLeft / carousel.clientWidth);
    const dots = pagination.querySelectorAll('.dot');
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === pageIndex);
    });
};

DOM.recentCarousel.addEventListener('scroll', () => updatePaginationDots(DOM.recentCarousel, DOM.recentPagination));
DOM.playlistsCarousel.addEventListener('scroll', () => updatePaginationDots(DOM.playlistsCarousel, DOM.playlistsPagination));

// ==========================================
// DÉFILEMENT TEXTE AU SURVOL (MARQUEE)
// ==========================================

[DOM.trackTitleContainer, DOM.trackArtistContainer, DOM.miniTrackTitleContainer, DOM.miniTrackArtistContainer].forEach(el => {
    if (el) {
        el.addEventListener('mouseenter', handleMarqueeEnter);
        el.addEventListener('mouseleave', handleMarqueeLeave);
    }
});

// ==========================================
// INTERACTIONS DU LECTEUR (MINI & FULL)
// ==========================================

DOM.miniPlayer.addEventListener('click', (e) => {
    if (e.target.closest('#btn-mini-play-pause') || e.target.closest('#btn-mini-next')) {
        return;
    }
    toggleFullPlayer(true);
});

DOM.btnMinimizePlayer.addEventListener('click', () => {
    toggleFullPlayer(false);
});

// ==========================================
// MODALE AJOUT PLAYLIST
// ==========================================

DOM.btnCloseModal.addEventListener('click', () => {
    DOM.playlistAddModal.classList.add('hidden');
});

DOM.btnAddPlaylist.addEventListener('click', async () => {
    if (!PlayerStore.musicPlayer || !PlayerStore.musicPlayer.src) {
        showToast("Aucune musique en cours.");
        return;
    }
    if (DOM.btnAddPlaylist.innerHTML.includes("16.17")) return;

    DOM.playlistAddModal.classList.remove('hidden');
    DOM.addModalList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Chargement...</div>';

    let playlists = AppState.cachedPlaylists;
    if (!playlists) {
        try {
            playlists = await API.getPlaylists();
            AppState.cachedPlaylists = playlists;
        } catch (e) {
            DOM.addModalList.innerHTML = '<div style="color:red; text-align:center;">Erreur.</div>';
            return;
        }
    }

    DOM.addModalList.innerHTML = '';
    playlists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'library-item';
        const thumb = p.thumbnail ? p.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

        item.innerHTML = `
            <img src="${thumb}" alt="Cover">
            <div class="library-item-info">
                <span class="library-item-title">${p.title}</span>
            </div>
        `;

        item.addEventListener('click', async () => {
            DOM.playlistAddModal.classList.add('hidden');
            showToast("Ajout en cours...");
            const currentVideoId = PlayerStore.musicPlayer.src.split('/').pop();
            try {
                const data = await API.addToPlaylist(p.playlistId, currentVideoId);
                if (!data.error) {
                    showToast("Ajouté avec succès !");
                    DOM.btnAddPlaylist.innerHTML = DOM.SVG_CHECK;
                    AppState.cachedPlaylistDetails[p.playlistId] = null;
                    AppState.cachedPlaylists = null;
                } else {
                    showToast(data.error);
                }
            } catch (e) {
                showToast("Erreur réseau.");
            }
        });
        DOM.addModalList.appendChild(item);
    });
});

// ==========================================
// CONTRÔLES AUDIO (VOLUME ET PLAYBACK)
// ==========================================

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

DOM.progressBar.addEventListener('input', () => {
    if (PlayerStore.musicPlayer && PlayerStore.musicPlayer.duration) {
        PlayerStore.musicPlayer.currentTime = (DOM.progressBar.value / 100) * PlayerStore.musicPlayer.duration;
    }
});

DOM.btnPrev.addEventListener('click', playPrevTrack);
DOM.btnNext.addEventListener('click', playNextTrack);
DOM.btnMiniNext.addEventListener('click', (e) => { e.stopPropagation(); playNextTrack(); });
DOM.btnSkipPlaylist.addEventListener('click', skipCurrentPlaylist);
DOM.btnRestartPlaylist.addEventListener('click', restartCurrentPlaylist);

const togglePlayPauseLogic = () => {
    if (!PlayerStore.musicPlayer) return;
    if (GeminiStore.ws && (GeminiStore.ws.readyState === WebSocket.OPEN || GeminiStore.ws.readyState === WebSocket.CONNECTING)) {
        stopConversation();
    }
    if (PlayerStore.musicPlayer.paused) {
        PlayerStore.musicPlayer.play();
        DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
        DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PAUSE;
    } else {
        PlayerStore.musicPlayer.pause();
        DOM.btnPlayPause.innerHTML = DOM.SVG_PLAY;
        DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PLAY;
    }
};

DOM.btnPlayPause.addEventListener('click', togglePlayPauseLogic);
DOM.btnMiniPlayPause.addEventListener('click', (e) => { e.stopPropagation(); togglePlayPauseLogic(); });

// ==========================================
// RECHERCHE EN DIRECT
// ==========================================

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
                        <button class="btn-icon btn-add-queue" aria-label="Ajouter à la file">${DOM.SVG_ADD_QUEUE}</button>
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
        } catch (e) { console.error("Erreur de live search :", e); }
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
            DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PAUSE;
        }
    } else {
        if (PlayerStore.musicPlayer && !PlayerStore.musicPlayer.paused) {
            await fadeOut(PlayerStore.musicPlayer);
            DOM.btnPlayPause.innerHTML = DOM.SVG_PLAY;
            DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PLAY;
        }
        startConversation();
    }
});