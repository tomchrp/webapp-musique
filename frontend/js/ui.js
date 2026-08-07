/*
==============================================================================
Chemin : frontend/js/ui.js
Utilité : Fonctions de manipulation visuelle et gestionnaire de Vues (SPA).
Modifications :
  - Centralisation et export de handleMarqueeEnter et handleMarqueeLeave.
  - Modification de renderListenAgain et renderPlaylistsList pour injecter
    les titres en surcouche (overlay) dans l'image.
  - Attachement dynamique des écouteurs de survol sur chaque carte générée.
  - Skeletons simplifiés (uniquement des blocs carrés).
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

// ==========================================
// MÉCANIQUE DÉFILEMENT TEXTE (MARQUEE)
// ==========================================

export const handleMarqueeEnter = (e) => {
    const container = e.currentTarget;
    const textNode = container.firstElementChild;
    if (!textNode) return;

    const overflow = textNode.offsetWidth - container.clientWidth;
    if (overflow > 0) {
        container.style.textOverflow = 'clip';
        const duration = Math.max(overflow * 15, 1000);
        textNode.style.transition = `transform ${duration}ms linear`;
        textNode.style.transform = `translateX(-${overflow}px)`;
    }
};

export const handleMarqueeLeave = (e) => {
    const container = e.currentTarget;
    const textNode = container.firstElementChild;
    if (!textNode) return;

    textNode.style.transition = 'transform 0.3s ease';
    textNode.style.transform = 'translateX(0)';
    setTimeout(() => {
        if (textNode.style.transform === 'translateX(0)' || textNode.style.transform === 'translateX(0px)') {
            container.style.textOverflow = 'ellipsis';
        }
    }, 300);
};

export function showLoadingState() {
    if (DOM.fullPlayerStatus) DOM.fullPlayerStatus.textContent = "Recherche en cours...";
    if (DOM.trackTitle) {
        DOM.trackTitle.textContent = "Recherche en cours...";
        DOM.trackTitle.classList.add("skeleton");
    }
    if (DOM.trackArtist) {
        DOM.trackArtist.textContent = "Veuillez patienter";
        DOM.trackArtist.classList.add("skeleton");
    }
    if (DOM.trackCover) {
        DOM.trackCover.classList.add("skeleton-cover");
        DOM.trackCover.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    }
    if (DOM.timeCurrent) DOM.timeCurrent.textContent = "0:00";
    if (DOM.timeTotal) DOM.timeTotal.textContent = "0:00";
    if (DOM.progressBar) DOM.progressBar.value = 0;
}

export function removeLoadingState() {
    if (DOM.trackTitle) DOM.trackTitle.classList.remove("skeleton");
    if (DOM.trackArtist) DOM.trackArtist.classList.remove("skeleton");
    if (DOM.trackCover) DOM.trackCover.classList.remove("skeleton-cover");
}

export function showView(viewId, stateData = null, pushToHistory = true) {
    DOM.viewHome.classList.add('hidden');
    DOM.viewPlaylist.classList.add('hidden');
    DOM.viewCollection.classList.add('hidden');

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        AppState.currentView = viewId.replace('view-', '');
        DOM.appContent.scrollTop = 0;
    }

    if (pushToHistory) {
        history.pushState({ view: viewId, data: stateData }, '', `#${AppState.currentView}`);
    }
}

export function updatePhantomPadding() {
    if (!DOM.miniPlayer.classList.contains('hidden')) {
        const miniPlayerHeight = DOM.miniPlayer.offsetHeight;
        document.documentElement.style.setProperty('--phantom-padding', `${miniPlayerHeight + 15}px`);
    } else {
        document.documentElement.style.setProperty('--phantom-padding', '0px');
    }
}

export function showMiniPlayer(trackData) {
    DOM.miniTrackTitle.textContent = trackData.title || "Titre inconnu";
    DOM.miniTrackArtist.textContent = trackData.artist || "Artiste inconnu";

    if (trackData.thumbnail) {
        DOM.miniTrackCover.src = trackData.thumbnail;
    }

    DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PAUSE;
    DOM.miniPlayer.classList.remove('hidden');
    updatePhantomPadding();
}

export function toggleFullPlayer(show) {
    if (show) {
        DOM.fullPlayer.classList.remove('hidden');
        void DOM.fullPlayer.offsetWidth;
        DOM.fullPlayer.classList.add('player-active');
    } else {
        DOM.fullPlayer.classList.remove('player-active');
        setTimeout(() => {
            DOM.fullPlayer.classList.add('hidden');
        }, 400);
    }
}

export function highlightActiveTrack(videoId) {
    AppState.activeVideoId = videoId;

    document.querySelectorAll('.track-active').forEach(el => {
        el.classList.remove('track-active');
    });

    if (!videoId) return;

    document.querySelectorAll(`[data-video-id="${videoId}"]`).forEach(el => {
        el.classList.add('track-active');
    });
}

export function renderListenAgainSkeleton() {
    DOM.recentCarousel.innerHTML = '';
    DOM.recentPagination.innerHTML = '';
    const pageDiv = document.createElement('div');
    pageDiv.className = 'carousel-page';
    for (let i = 0; i < 9; i++) {
        const item = document.createElement('div');
        // Structure purgée de tout texte pour le Skeleton
        item.className = 'recent-item skeleton';
        pageDiv.appendChild(item);
    }
    DOM.recentCarousel.appendChild(pageDiv);
}

export function renderPlaylistsSkeleton() {
    DOM.playlistsCarousel.innerHTML = '';
    DOM.playlistsPagination.innerHTML = '';
    const pageDiv = document.createElement('div');
    pageDiv.className = 'carousel-page playlist-page';
    for (let i = 0; i < 6; i++) {
        const item = document.createElement('div');
        item.className = 'playlist-card skeleton';
        pageDiv.appendChild(item);
    }
    DOM.playlistsCarousel.appendChild(pageDiv);
}

export function renderCollectionList(items, title, isPlaylistMode = false) {
    DOM.viewCollectionTitle.textContent = title;
    DOM.collectionListContainer.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'library-item';

        if (!isPlaylistMode && item.type !== 'playlist' && item.type !== 'other') {
            div.dataset.videoId = item.id;
            if (AppState.activeVideoId === item.id) div.classList.add('track-active');
        }

        const thumbSrc = item.thumbnail ? item.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const itemSubtitle = isPlaylistMode ? `${item.count} titres` : item.subtitle;

        div.innerHTML = `
            <img src="${thumbSrc}" alt="Cover">
            <div class="library-item-info">
                <span class="library-item-title">${item.title}</span>
                <span class="library-item-subtitle">${itemSubtitle}</span>
            </div>
        `;

        div.addEventListener('click', () => {
            if (isPlaylistMode || item.type === 'playlist' || item.type === 'other') {
                loadPlaylistDetails(item.id || item.playlistId, item.title);
            } else {
                playSpecificTrack(item.id);
            }
        });
        DOM.collectionListContainer.appendChild(div);
    });

    showView('view-collection');
}

export async function loadListenAgain() {
    if (AppState.cachedListenAgain) {
        renderListenAgain(AppState.cachedListenAgain);
        return;
    }
    renderListenAgainSkeleton();
    try {
        AppState.cachedListenAgain = await API.getListenAgain();
        renderListenAgain(AppState.cachedListenAgain);
    } catch (e) {
        DOM.recentCarousel.innerHTML = '<div style="padding: 20px; color: red;">Erreur de chargement.</div>';
    }
}

export function renderListenAgain(items) {
    DOM.recentCarousel.innerHTML = '';
    DOM.recentPagination.innerHTML = '';

    if (items.length === 0) {
        DOM.recentCarousel.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Rien à afficher.</div>';
        return;
    }

    const maxItems = 27;
    const displayItems = items.slice(0, maxItems);

    const showCollection = () => renderCollectionList(items, "Écoutés récemment");
    if (DOM.titleRecent) {
        DOM.titleRecent.onclick = showCollection;
        DOM.titleRecent.classList.add('clickable-title');
    }

    if (items.length > maxItems) {
        if (DOM.btnRecentAll) {
            DOM.btnRecentAll.classList.remove('hidden');
            DOM.btnRecentAll.onclick = showCollection;
        }
    } else {
        if (DOM.btnRecentAll) DOM.btnRecentAll.classList.add('hidden');
    }

    const pagesCount = Math.ceil(displayItems.length / 9);

    for (let i = 0; i < pagesCount; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'carousel-page';

        const chunk = displayItems.slice(i * 9, i * 9 + 9);
        chunk.forEach(item => {
            const div = document.createElement('div');
            div.className = 'recent-item';

            if (item.type !== 'playlist' && item.type !== 'other') {
                div.dataset.videoId = item.id;
                if (AppState.activeVideoId === item.id) div.classList.add('track-active');
            }

            // Injection du titre en surcouche (Overlay) avec l'effet Marquee prêt
            div.innerHTML = `
                <img src="${item.thumbnail}" alt="Cover">
                <div class="cover-overlay">
                    <div class="marquee-container cover-title-container">
                        <span class="marquee-text cover-title">${item.title}</span>
                    </div>
                </div>
            `;

            // On capte le survol de la carte entière pour animer le texte interne
            div.addEventListener('mouseenter', (e) => {
                const container = div.querySelector('.marquee-container');
                if (container) handleMarqueeEnter({ currentTarget: container });
            });
            div.addEventListener('mouseleave', (e) => {
                const container = div.querySelector('.marquee-container');
                if (container) handleMarqueeLeave({ currentTarget: container });
            });

            div.addEventListener('click', () => {
                if (item.type === 'playlist' || item.type === 'other') {
                    loadPlaylistDetails(item.id, item.title);
                } else {
                    playSpecificTrack(item.id);
                }
            });
            pageDiv.appendChild(div);
        });

        DOM.recentCarousel.appendChild(pageDiv);

        const dot = document.createElement('div');
        dot.className = i === 0 ? 'dot active' : 'dot';
        DOM.recentPagination.appendChild(dot);
    }

    if (pagesCount <= 1) {
        if (DOM.recentPagination) DOM.recentPagination.classList.add('hidden');
    } else {
        if (DOM.recentPagination) DOM.recentPagination.classList.remove('hidden');
    }
}

export async function loadPlaylists() {
    if (AppState.cachedPlaylists) {
        renderPlaylistsList(AppState.cachedPlaylists);
        return;
    }
    renderPlaylistsSkeleton();
    try {
        AppState.cachedPlaylists = await API.getPlaylists();
        renderPlaylistsList(AppState.cachedPlaylists);
    } catch (e) {
        DOM.playlistsCarousel.innerHTML = '<div style="padding: 20px; color: red;">Erreur de chargement.</div>';
    }
}

export function renderPlaylistsList(playlists) {
    DOM.playlistsCarousel.innerHTML = '';
    DOM.playlistsPagination.innerHTML = '';

    if (playlists.length === 0) {
        DOM.playlistsCarousel.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Aucune playlist trouvée.</div>';
        return;
    }

    const maxItems = 18;
    const displayItems = playlists.slice(0, maxItems);

    const showCollection = () => renderCollectionList(playlists, "Mes Playlists", true);
    if (DOM.titlePlaylists) {
        DOM.titlePlaylists.onclick = showCollection;
        DOM.titlePlaylists.classList.add('clickable-title');
    }

    const pagesCount = Math.ceil(displayItems.length / 6);

    for (let i = 0; i < pagesCount; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'carousel-page playlist-page';

        const chunk = displayItems.slice(i * 6, i * 6 + 6);
        chunk.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'playlist-card';
            const thumbSrc = playlist.thumbnail ? playlist.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

            // Injection du titre en surcouche (Overlay), suppression du sous-titre complet
            item.innerHTML = `
                <img src="${thumbSrc}" alt="Cover">
                <div class="cover-overlay">
                    <div class="marquee-container cover-title-container">
                        <span class="marquee-text cover-title">${playlist.title}</span>
                    </div>
                </div>
            `;

            // Animation du texte au survol de la carte
            item.addEventListener('mouseenter', (e) => {
                const container = item.querySelector('.marquee-container');
                if (container) handleMarqueeEnter({ currentTarget: container });
            });
            item.addEventListener('mouseleave', (e) => {
                const container = item.querySelector('.marquee-container');
                if (container) handleMarqueeLeave({ currentTarget: container });
            });

            item.addEventListener('click', () => {
                loadPlaylistDetails(playlist.playlistId, playlist.title);
            });
            pageDiv.appendChild(item);
        });

        DOM.playlistsCarousel.appendChild(pageDiv);

        const dot = document.createElement('div');
        dot.className = i === 0 ? 'dot active' : 'dot';
        DOM.playlistsPagination.appendChild(dot);
    }

    if (pagesCount <= 1) {
        if (DOM.playlistsPagination) DOM.playlistsPagination.classList.add('hidden');
    } else {
        if (DOM.playlistsPagination) DOM.playlistsPagination.classList.remove('hidden');
    }
}

export async function loadPlaylistDetails(playlistId, title) {
    AppState.currentPlaylistId = playlistId;
    DOM.viewPlaylistTitle.textContent = title;

    showView('view-playlist', { id: playlistId, title: title });

    if (AppState.cachedPlaylistDetails[playlistId]) {
        renderPlaylistTracks(AppState.cachedPlaylistDetails[playlistId]);
        return;
    }

    DOM.playlistTracksContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Chargement de la liste...</div>';
    try {
        const data = await API.getPlaylistDetails(playlistId);
        AppState.cachedPlaylistDetails[playlistId] = data;
        renderPlaylistTracks(data);
    } catch (e) {
        DOM.playlistTracksContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Erreur de chargement.</div>';
    }
}

export function renderPlaylistTracks(data) {
    DOM.playlistTracksContainer.innerHTML = '';
    if (!data.tracks || data.tracks.length === 0) {
        DOM.playlistTracksContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Playlist vide.</div>';
        return;
    }
    data.tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.dataset.videoId = track.video_id;

        if (AppState.activeVideoId === track.video_id) {
            item.classList.add('track-active');
        }

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
        DOM.playlistTracksContainer.appendChild(item);
    });
}

export function renderQueue(previewQueue) {
    const container = DOM.queueTracksContainer;
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
            const groupDiv = document.createElement('div');
            groupDiv.className = 'queue-group';

            const titleEl = document.createElement('div');
            titleEl.className = 'queue-sticky-header';
            titleEl.textContent = group.title;
            groupDiv.appendChild(titleEl);

            group.items.forEach(track => {
                const item = document.createElement('div');
                item.className = 'queue-item';
                const vidId = track.videoId || track.video_id;
                item.dataset.videoId = vidId;

                if (AppState.activeVideoId === vidId) {
                    item.classList.add('track-active');
                }

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
                    playQueueTrack(vidId);
                });

                groupDiv.appendChild(item);
            });

            container.appendChild(groupDiv);
        }
    });
}