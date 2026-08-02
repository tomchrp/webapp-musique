/*
==============================================================================
Chemin : frontend/js/constants.js
Utilité : Référentiel des éléments du DOM et des icônes SVG vectorielles.
Mise à jour : Suppression des références aux boutons de fermeture des tiroirs.
==============================================================================
*/

export const SVG_PLAY = `<svg class="svg-icon-large" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
export const SVG_PAUSE = `<svg class="svg-icon-large" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
export const SVG_ADD = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
export const SVG_CHECK = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
export const SVG_VOL_HIGH = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
export const SVG_VOL_LOW = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
export const SVG_VOL_MUTE = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

export const SVG_SKIP_FWD = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`;
export const SVG_SKIP_BWD = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`;
export const SVG_ADD_QUEUE = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>`;

export const toggleBtn = document.getElementById('toggle-btn');
export const statusText = document.getElementById('status-text');

export const playerContainer = document.getElementById('player-container');
export const trackCover = document.getElementById('track-cover');
export const trackTitle = document.getElementById('track-title');
export const trackArtist = document.getElementById('track-artist');

export const btnPrev = document.getElementById('btn-prev');
export const btnPlayPause = document.getElementById('btn-play-pause');
export const btnNext = document.getElementById('btn-next');
export const btnRestartPlaylist = document.getElementById('btn-restart-playlist');
export const btnSkipPlaylist = document.getElementById('btn-skip-playlist');

export const backgroundBlur = document.getElementById('background-blur');
export const searchInput = document.getElementById('search-input');
export const searchResults = document.getElementById('search-results');
export const progressBar = document.getElementById('progress-bar');
export const timeCurrent = document.getElementById('time-current');
export const timeTotal = document.getElementById('time-total');
export const toastContainer = document.getElementById('toast-container');

export const btnLibrary = document.getElementById('btn-library');
export const libraryDrawer = document.getElementById('library-drawer');
export const btnDrawerBack = document.getElementById('btn-drawer-back');
export const drawerTitle = document.getElementById('drawer-title');
export const drawerTabs = document.getElementById('drawer-tabs');
export const libraryContent = document.getElementById('library-content');
export const drawerActions = document.getElementById('drawer-actions');
export const btnDrawerPlay = document.getElementById('btn-drawer-play');
export const tabPlaylists = document.getElementById('tab-playlists');
export const tabDiscovery = document.getElementById('tab-discovery');
export const discoveryContent = document.getElementById('discovery-content');
export const btnDrawerRefresh = document.getElementById('btn-drawer-refresh');

export const btnVolume = document.getElementById('btn-volume');
export const volumeSlider = document.getElementById('volume-slider');

export const btnAddPlaylist = document.getElementById('btn-add-playlist');
export const playlistAddDrawer = document.getElementById('playlist-add-drawer');
export const addDrawerList = document.getElementById('add-drawer-list');

export const queuePreviewContainer = document.getElementById('queue-preview-container');
export const queueDrawer = document.getElementById('queue-drawer');
export const queueTitleManual = document.getElementById('queue-title-manual');
export const userQueueList = document.getElementById('user-queue-list');
export const queueTitleRadio = document.getElementById('queue-title-radio');
export const radioQueueList = document.getElementById('radio-queue-list');