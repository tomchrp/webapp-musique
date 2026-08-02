/*
==============================================================================
Chemin : frontend/js/ui.js
Utilité : Fonctions de manipulation visuelle de l'interface utilisateur.
          Mise à jour : Implémentation du système d'exclusivité des volets
          via la fonction maîtresse closeAllDrawers().
==============================================================================
*/

import * as DOM from './constants.js';
import * as API from './api.js';
import { AppState } from './state.js';
import { playPlaylistTrack, playSpecificTrack, playQueueTrack } from './player.js';

export function showToast(message) {
    DOM.toastContainer.textContent = message;
    DOM.toastContainer.classList.remove('hidden');
    setTimeout(() => DOM.toastContainer.classList.add('hidden'), 3000);
}

export function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export function showLoadingState() {
    DOM.playerContainer.classList.remove("hidden");
    DOM.trackTitle.textContent = "Recherche en cours...";
    DOM.trackTitle.classList.add("skeleton");
    DOM.trackArtist.textContent = "Veuillez patienter";
    DOM.trackArtist.classList.add("skeleton");
    DOM.trackCover.classList.add("skeleton-cover");
    DOM.trackCover.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    DOM.trackCover.classList.remove("hidden");
    DOM.timeCurrent.textContent = "0:00";
    DOM.timeTotal.textContent = "0:00";
    DOM.progressBar.value = 0;
}

export function removeLoadingState() {
    DOM.trackTitle.classList.remove("skeleton");
    DOM.trackArtist.classList.remove("skeleton");
    DOM.trackCover.classList.remove("skeleton-cover");
}

// ==========================================
// GESTIONNAIRE CENTRALISÉ DES VOLETS
// ==========================================

export function closeAllDrawers() {
    /* 
    Descriptif :
    Coupe-circuit garantissant qu'un seul volet est ouvert à la fois.
    Ferme tous les tiroirs et réinitialise l'état global.
    */
    DOM.libraryDrawer.classList.add('hidden');
    DOM.queueDrawer.classList.add('hidden');
    DOM.playlistAddDrawer.classList.add('hidden');
    AppState.isDrawerOpen = false;
}

export function openDrawer() {
    closeAllDrawers(); // Nettoyage de l'écran avant ouverture
    AppState.isDrawerOpen = true;
    DOM.libraryDrawer.classList.remove('hidden');
    DOM.drawerTitle.classList.add('hidden');
    DOM.drawerTabs.classList.remove('hidden');
    DOM.btnDrawerBack.classList.add('hidden');
    DOM.drawerActions.classList.add('hidden');

    if (DOM.tabDiscovery.classList.contains('active')) {
        AppState.currentDrawerState = 'discovery';
        DOM.libraryContent.classList.add('hidden');
        DOM.discoveryContent.classList.remove('hidden');
        loadListenAgain();
    } else {
        AppState.currentDrawerState = 'list';
        DOM.discoveryContent.classList.add('hidden');
        DOM.libraryContent.classList.remove('hidden');
        loadPlaylists();
    }
}

export function closeDrawer() {
    closeAllDrawers();
}

export function openQueueDrawer() {
    closeAllDrawers(); // Nettoyage de l'écran avant ouverture
    DOM.queueDrawer.classList.remove('hidden');
}

export function closeQueueDrawer() {
    closeAllDrawers();
}

export function openAddPlaylistDrawer() {
    closeAllDrawers(); // Nettoyage de l'écran avant ouverture
    DOM.playlistAddDrawer.classList.remove('hidden');
}

export function closeAddPlaylistDrawer() {
    closeAllDrawers();
}

// ==========================================
// RENDU DES LISTES ET DONNÉES
// ==========================================

export function refreshActiveDrawer() {
    if (!AppState.isDrawerOpen) return;
    if (AppState.currentDrawerState === 'list') {
        loadPlaylists();
    } else if (AppState.currentDrawerState === 'discovery') {
        loadListenAgain();
    } else if (AppState.currentDrawerState === 'detail') {
        if (AppState.currentPlaylistId) {
            loadPlaylistDetails(AppState.currentPlaylistId, DOM.drawerTitle.textContent);
        }
    }
}

export function renderSkeletonList() {
    DOM.libraryContent.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
            <div style="width: 55px; height: 55px; border-radius: 8px;" class="skeleton"></div>
            <div class="library-item-info">
                <span class="library-item-title skeleton" style="width: 60%; margin-bottom: 5px;">Chargement</span>
                <span class="library-item-subtitle skeleton" style="width: 40%;">...</span>
            </div>
        `;
        DOM.libraryContent.appendChild(item);
    }
}

export function renderPlaylistsList(playlists) {
    DOM.libraryContent.innerHTML = '';
    if (playlists.length === 0) {
        DOM.libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucune playlist trouvée.</div>';
        return;
    }
    playlists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'library-item';
        const thumbSrc = playlist.thumbnail ? playlist.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        item.innerHTML = `
            <img src="${thumbSrc}" alt="Cover">
            <div class="library-item-info">
                <span class="library-item-title">${playlist.title}</span>
                <span class="library-item-subtitle">${playlist.count} titres</span>
            </div>
        `;
        item.addEventListener('click', () => {
            loadPlaylistDetails(playlist.playlistId, playlist.title);
        });
        DOM.libraryContent.appendChild(item);
    });
}

export async function loadPlaylists() {
    AppState.currentDrawerState = 'list';
    AppState.currentPlaylistId = null;
    DOM.drawerTitle.textContent = "Mes Playlists";
    DOM.btnDrawerBack.classList.add('hidden');
    DOM.drawerActions.classList.add('hidden');

    if (AppState.cachedPlaylists) {
        renderPlaylistsList(AppState.cachedPlaylists);
        return;
    }
    renderSkeletonList();
    try {
        AppState.cachedPlaylists = await API.getPlaylists();
        renderPlaylistsList(AppState.cachedPlaylists);
    } catch (e) {
        DOM.libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Erreur de chargement.</div>';
        console.error("Erreur chargement playlists :", e);
    }
}

export function renderPlaylistTracks(data) {
    DOM.libraryContent.innerHTML = '';
    if (!data.tracks || data.tracks.length === 0) {
        DOM.libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Playlist vide.</div>';
        return;
    }
    data.tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'library-item';
        const thumbSrc = track.thumbnail ? track.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        item.innerHTML = `
            <img src="${thumbSrc}" alt="Cover">
            <div class="library-item-info">
                <span class="library-item-title">${track.title}</span>
                <span class="library-item-subtitle">${track.artist}</span>
            </div>
        `;
        item.addEventListener('click', () => {
            playPlaylistTrack(AppState.currentPlaylistId, track.video_id);
        });
        DOM.libraryContent.appendChild(item);
    });
}

export async function loadPlaylistDetails(playlistId, title) {
    AppState.currentDrawerState = 'detail';
    AppState.currentPlaylistId = playlistId;
    DOM.drawerTitle.textContent = title;

    DOM.drawerTitle.classList.remove('hidden');
    DOM.drawerTabs.classList.add('hidden');
    DOM.btnDrawerBack.classList.remove('hidden');
    DOM.drawerActions.classList.remove('hidden');

    DOM.discoveryContent.classList.add('hidden');
    DOM.libraryContent.classList.remove('hidden');

    if (AppState.cachedPlaylistDetails[playlistId]) {
        renderPlaylistTracks(AppState.cachedPlaylistDetails[playlistId]);
        return;
    }
    renderSkeletonList();
    try {
        const data = await API.getPlaylistDetails(playlistId);
        AppState.cachedPlaylistDetails[playlistId] = data;
        renderPlaylistTracks(data);
    } catch (e) {
        DOM.libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Erreur de chargement.</div>';
        console.error("Erreur chargement détails playlist :", e);
    }
}

export function renderListenAgain(items) {
    DOM.discoveryContent.innerHTML = '';
    if (items.length === 0) {
        DOM.discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); width: 100%;">Rien à afficher pour le moment.</div>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.innerHTML = `
            <img src="${item.thumbnail}" alt="Cover">
            <div class="grid-item-info">
                <span class="grid-item-title">${item.title}</span>
                <span class="grid-item-subtitle">${item.subtitle}</span>
            </div>
        `;
        div.addEventListener('click', () => {
            if (item.type === 'playlist' || item.type === 'other') {
                loadPlaylistDetails(item.id, item.title);
            } else {
                playSpecificTrack(item.id);
            }
        });
        DOM.discoveryContent.appendChild(div);
    });
}

export async function loadListenAgain() {
    if (AppState.cachedListenAgain) {
        renderListenAgain(AppState.cachedListenAgain);
        return;
    }
    DOM.discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); width: 100%;">Génération de la grille...</div>';
    try {
        AppState.cachedListenAgain = await API.getListenAgain();
        renderListenAgain(AppState.cachedListenAgain);
    } catch (e) {
        DOM.discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red; width: 100%;">Erreur de chargement.</div>';
    }
}

export function updateQueuePreview(previewQueue) {
    const container = DOM.queuePreviewContainer;
    container.innerHTML = '';

    if (!previewQueue || previewQueue.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'queue-preview-header';
    header.textContent = 'À suivre';
    container.appendChild(header);

    previewQueue.slice(0, 3).forEach(track => {
        const item = document.createElement('div');
        item.className = 'library-item';

        item.style.padding = '8px 10px';
        item.style.borderRadius = '10px';

        const thumbSrc = track.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const artistName = track.artist || 'Artiste inconnu';

        item.innerHTML = `
            <img src="${thumbSrc}" alt="Cover" style="width: 45px; height: 45px; min-width: 45px;">
            <div class="library-item-info" style="text-align: left;">
                <span class="library-item-title">${track.title}</span>
                <span class="library-item-subtitle">${artistName}</span>
            </div>
        `;

        item.addEventListener('click', () => {
            openQueueDrawer();
        });

        container.appendChild(item);
    });
}

export function renderQueueDrawer(previewQueue) {
    const container = document.getElementById('queue-content');
    container.innerHTML = '';

    if (!previewQueue || previewQueue.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucune musique en attente.</div>';
        return;
    }

    const groups = {
        priority: { title: "Ajouté manuellement", items: [] },
        context: { title: "Playlist en cours", items: [] },
        radio: { title: "Radio automatique", items: [] }
    };

    previewQueue.forEach(track => {
        const source = track.source || 'radio';
        if (groups[source]) {
            groups[source].items.push(track);
        }
    });

    Object.values(groups).forEach(group => {
        if (group.items.length > 0) {
            const titleEl = document.createElement('div');
            titleEl.className = 'queue-section-title';
            titleEl.textContent = group.title;
            container.appendChild(titleEl);

            group.items.forEach(track => {
                const item = document.createElement('div');
                item.className = 'queue-item';
                const thumbSrc = track.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                const artistName = track.artist || 'Artiste inconnu';

                item.innerHTML = `
                    <img src="${thumbSrc}" alt="Cover" style="width: 40px; height: 40px; min-width: 40px; border-radius: 6px; object-fit: cover;">
                    <div class="library-item-info" style="margin-left: 5px;">
                        <span class="library-item-title" style="font-size: 0.9rem;">${track.title}</span>
                        <span class="library-item-subtitle" style="font-size: 0.75rem;">${artistName}</span>
                    </div>
                `;

                item.addEventListener('click', () => {
                    playQueueTrack(track.videoId || track.video_id);
                });

                container.appendChild(item);
            });
        }
    });
}