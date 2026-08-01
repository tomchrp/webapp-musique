/*
==============================================================================
Fichier : frontend/app.js
Utilité : Script principal de l'interface client (Frontend).
          Gère les interactions UI, la communication WebSocket avec l'agent IA,
          et le contrôle du lecteur audio HTML5.
Mise à jour : Intégration globale des icônes SVG. Ajout du contrôle de volume
              avec mémorisation de l'état. Mise en place du volet d'ajout aux
              playlists avec vérification d'état. Système de radio de secours 
              en fin de playlist pour maintenir l'écoute continue.
==============================================================================
*/

// ==========================================
// CONSTANTES DES ICÔNES SVG VECTORIELLES
// ==========================================
const SVG_PLAY = `<svg class="svg-icon-large" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const SVG_PAUSE = `<svg class="svg-icon-large" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const SVG_ADD = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
const SVG_CHECK = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
const SVG_VOL_HIGH = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
const SVG_VOL_LOW = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
const SVG_VOL_MUTE = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

const toggleBtn = document.getElementById('toggle-btn');
const statusText = document.getElementById('status-text');

const playerContainer = document.getElementById('player-container');
const trackCover = document.getElementById('track-cover');
const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const nextTrackInfo = document.getElementById('next-track-info');
const btnPrev = document.getElementById('btn-prev');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnNext = document.getElementById('btn-next');
const backgroundBlur = document.getElementById('background-blur');

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const toastContainer = document.getElementById('toast-container');

// Éléments du DOM pour le volet de bibliothèque
const btnLibrary = document.getElementById('btn-library');
const libraryDrawer = document.getElementById('library-drawer');
const btnDrawerClose = document.getElementById('btn-drawer-close');
const btnDrawerBack = document.getElementById('btn-drawer-back');
const drawerTitle = document.getElementById('drawer-title');
const libraryContent = document.getElementById('library-content');
const drawerActions = document.getElementById('drawer-actions');
const btnDrawerPlay = document.getElementById('btn-drawer-play');
const tabPlaylists = document.getElementById('tab-playlists');
const tabDiscovery = document.getElementById('tab-discovery');
const discoveryContent = document.getElementById('discovery-content');
let cachedListenAgain = null;

let ws = null;
let captureContext = null;
let playbackContext = null;
let mediaStream = null;
let processor = null;
let nextPlayTime = 0;
let musicPlayer = null;
let audioStartTime = 0;

let userAnalyser = null;
let geminiAnalyser = null;
let animationFrameId = null;
let searchTimeout = null;
let isRefilling = false;

// État du volet et Cache Mémoire
let isDrawerOpen = false;
let currentDrawerState = 'list';
let currentPlaylistId = null;
let cachedPlaylists = null;
let cachedPlaylistDetails = {};

// ==========================================
// OUTILS UI : Toasts, Formateurs et Skeletons
// ==========================================
function showToast(message) {
    toastContainer.textContent = message;
    toastContainer.classList.remove('hidden');
    setTimeout(() => toastContainer.classList.add('hidden'), 3000);
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function showLoadingState() {
    playerContainer.classList.remove("hidden");
    trackTitle.textContent = "Recherche en cours...";
    trackTitle.classList.add("skeleton");
    trackArtist.textContent = "Veuillez patienter";
    trackArtist.classList.add("skeleton");
    trackCover.classList.add("skeleton-cover");
    trackCover.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    trackCover.classList.remove("hidden");
    nextTrackInfo.textContent = "À suivre : ...";
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";
    progressBar.value = 0;
}

function removeLoadingState() {
    trackTitle.classList.remove("skeleton");
    trackArtist.classList.remove("skeleton");
    trackCover.classList.remove("skeleton-cover");
}

// ==========================================
// TRANSITIONS AUDIO DOUCES & VOLUME
// ==========================================

const btnVolume = document.getElementById('btn-volume');
const volumeSlider = document.getElementById('volume-slider');

btnVolume.addEventListener('click', () => {
    volumeSlider.classList.toggle('hidden');
});

volumeSlider.addEventListener('input', (e) => {
    if (musicPlayer) {
        musicPlayer.volume = e.target.value;
        if (e.target.value == 0) btnVolume.innerHTML = SVG_VOL_MUTE;
        else if (e.target.value < 0.5) btnVolume.innerHTML = SVG_VOL_LOW;
        else btnVolume.innerHTML = SVG_VOL_HIGH;
    }
});

// Cache le slider si on clique ailleurs
document.addEventListener('click', (e) => {
    if (!btnVolume.contains(e.target) && !volumeSlider.contains(e.target)) {
        volumeSlider.classList.add('hidden');
    }
});

/**
 * Descriptif :
 * Effectue un fondu sortant de l'audio jusqu'au silence, puis met en pause,
 * avant de restaurer la valeur du volume en cache pour être prêt pour 
 * la lecture du morceau suivant sans perte du paramétrage utilisateur.
 */
function fadeOut(audio, duration = 400) {
    return new Promise(resolve => {
        if (!audio || audio.paused) return resolve();
        const targetVolume = parseFloat(document.getElementById('volume-slider').value) || 1;
        const step = targetVolume / (duration / 50);
        const fade = setInterval(() => {
            if (audio.volume > step) {
                audio.volume -= step;
            } else {
                audio.volume = 0;
                audio.pause();
                audio.volume = targetVolume;
                clearInterval(fade);
                resolve();
            }
        }, 50);
    });
}

/**
 * Descriptif :
 * Commence à jouer un fichier depuis un volume 0 et l'augmente progressivement
 * jusqu'à atteindre la limite définie par le slider de volume de l'utilisateur.
 */
function fadeIn(audio, duration = 400) {
    if (!audio) return;
    const targetVolume = parseFloat(document.getElementById('volume-slider').value) || 1;
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("Échec critique de la lecture audio :", error);
            showToast("Erreur de lecture du flux sonore.");
        });
    }
    const step = targetVolume / (duration / 50);
    const fade = setInterval(() => {
        if (audio.volume < targetVolume - step) {
            audio.volume += step;
        } else {
            audio.volume = targetVolume;
            clearInterval(fade);
        }
    }, 50);
}

// ==========================================
// RECHERCHE TEXTUELLE AUTOCOMPLÉTÉÉ
// ==========================================
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) {
        searchResults.classList.add('hidden');
        return;
    }
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/search/live?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            searchResults.innerHTML = '';
            if (results.length > 0) {
                results.forEach(track => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.innerHTML = `
                        <img src="${track.thumbnail}" alt="Cover">
                        <div class="search-item-info">
                            <span class="search-item-title">${track.title}</span>
                            <span class="search-item-artist">${track.artist}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        searchInput.value = '';
                        searchResults.classList.add('hidden');
                        playSpecificTrack(track.video_id);
                    });
                    searchResults.appendChild(item);
                });
                searchResults.classList.remove('hidden');
            } else {
                searchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Aucun résultat</div>';
                searchResults.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Erreur de live search :", e);
        }
    }, 300);
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
    }
});

async function playSpecificTrack(videoId) {
    stopConversation();
    showLoadingState();
    closeDrawer();
    try {
        const response = await fetch('/api/play_specific', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: videoId, action: 'play_now' })
        });
        const data = await response.json();
        if (!data.error) {
            playMusic(data);
        } else {
            removeLoadingState();
            showToast(data.error);
        }
    } catch (e) {
        removeLoadingState();
        console.error("Erreur play_specific :", e);
    }
}

// ==========================================
// INTERACTION VOCALE & CONTRÔLE UI GLOBAL
// ==========================================
toggleBtn.addEventListener('click', async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        stopConversation();
        if (musicPlayer && musicPlayer.src) {
            fadeIn(musicPlayer);
            btnPlayPause.innerHTML = SVG_PAUSE;
        }
    } else {
        if (musicPlayer && !musicPlayer.paused) {
            await fadeOut(musicPlayer);
            btnPlayPause.innerHTML = SVG_PLAY;
        }
        startConversation();
    }
});

async function startConversation() {
    closeDrawer();
    try {
        statusText.textContent = "Connexion...";
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        ws.binaryType = "arraybuffer";

        ws.onopen = async () => {
            statusText.textContent = "À votre écoute";
            toggleBtn.className = "fab-btn btn-connected";
            await setupAudioCapture();
            setupAudioPlayback();
            visualizeAura();
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                playAudio(event.data);
            } else if (typeof event.data === "string") {
                try {
                    const message = JSON.parse(event.data);

                    if (message.action === "library_updated") {
                        cachedPlaylists = null;
                        cachedPlaylistDetails = {};
                        if (isDrawerOpen && currentDrawerState === 'list') {
                            loadPlaylists();
                        }
                    }
                    else if (message.action === "loading") {
                        showLoadingState();
                    }
                    else if (message.action === "play_music") {
                        playMusic(message);
                    }
                    else if (message.action === "error") {
                        removeLoadingState();
                        showToast(message.message || "Erreur de traitement");
                    }
                } catch (e) {
                    console.error("Erreur JSON :", e);
                }
            }
        };

        ws.onclose = () => stopConversation();
        ws.onerror = () => stopConversation();
    } catch (error) {
        statusText.textContent = "Erreur réseau";
    }
}

function visualizeAura() {
    let auraSize = 0;
    let auraColor = 'rgba(255, 255, 255, 0)';
    if (userAnalyser) {
        const dataArray = new Float32Array(userAnalyser.fftSize);
        userAnalyser.getFloatTimeDomainData(dataArray);
        let sumSquares = 0.0;
        for (let i = 0; i < dataArray.length; i++) { sumSquares += dataArray[i] * dataArray[i]; }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        if (rms > 0.02) {
            auraSize = rms * 500;
            auraColor = `rgba(29, 185, 84, ${Math.min(rms * 5, 0.8)})`;
        }
    }
    if (auraSize === 0 && geminiAnalyser) {
        const dataArray = new Float32Array(geminiAnalyser.fftSize);
        geminiAnalyser.getFloatTimeDomainData(dataArray);
        let sumSquares = 0.0;
        for (let i = 0; i < dataArray.length; i++) { sumSquares += dataArray[i] * dataArray[i]; }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        if (rms > 0.01) {
            auraSize = rms * 400;
            auraColor = `rgba(180, 0, 255, ${Math.min(rms * 4, 0.8)})`;
        }
    }
    document.documentElement.style.setProperty('--aura-size', `${auraSize}px`);
    document.documentElement.style.setProperty('--aura-color', auraColor);
    animationFrameId = requestAnimationFrame(visualizeAura);
}

async function setupAudioCapture() {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    captureContext = new AudioContextClass({ sampleRate: 16000 });
    const source = captureContext.createMediaStreamSource(mediaStream);
    userAnalyser = captureContext.createAnalyser();
    userAnalyser.fftSize = 512;
    source.connect(userAnalyser);
    processor = captureContext.createScriptProcessor(1024, 1, 1);
    audioStartTime = Date.now();
    processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - audioStartTime < 500) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = convertFloat32ToInt16(inputData);
        ws.send(pcmData);
    };
    userAnalyser.connect(processor);
    processor.connect(captureContext.destination);
}

function setupAudioPlayback() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    playbackContext = new AudioContextClass({ sampleRate: 24000 });
    nextPlayTime = playbackContext.currentTime;
    geminiAnalyser = playbackContext.createAnalyser();
    geminiAnalyser.fftSize = 512;
    geminiAnalyser.connect(playbackContext.destination);
}

function playAudio(arrayBuffer) {
    if (!playbackContext) return;
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) { float32Array[i] = int16Array[i] / 32768.0; }
    const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(geminiAnalyser);
    if (nextPlayTime < playbackContext.currentTime) { nextPlayTime = playbackContext.currentTime; }
    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
}

// ==========================================
// GESTION DU LECTEUR ET DE LA PROGRESSION
// ==========================================
function setupMusicPlayerEvents() {
    if (!musicPlayer) return;
    musicPlayer.ontimeupdate = () => {
        if (!musicPlayer.duration || isNaN(musicPlayer.duration)) return;
        timeCurrent.textContent = formatTime(musicPlayer.currentTime);
        progressBar.value = (musicPlayer.currentTime / musicPlayer.duration) * 100;
        timeTotal.textContent = formatTime(musicPlayer.duration);
    };
    musicPlayer.onended = playNextTrack;
}

progressBar.addEventListener('input', () => {
    if (musicPlayer && musicPlayer.duration) {
        musicPlayer.currentTime = (progressBar.value / 100) * musicPlayer.duration;
    }
});

function playMusic(trackData) {
    stopConversation();
    closeDrawer();

    statusText.textContent = "Lecture en cours";
    toggleBtn.className = "fab-btn btn-disconnected";
    removeLoadingState();

    progressBar.value = 0;
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";

    playerContainer.classList.remove("hidden");
    trackTitle.textContent = trackData.title || "Titre inconnu";
    trackArtist.textContent = trackData.artist || "Artiste inconnu";
    nextTrackInfo.textContent = `À suivre : ${trackData.next_title || "Fin de la liste"}`;

    if (trackData.thumbnail) {
        trackCover.src = trackData.thumbnail;
        trackCover.classList.remove("hidden");
        backgroundBlur.style.backgroundImage = `url('${trackData.thumbnail}')`;
    }

    if (!musicPlayer) {
        musicPlayer = new Audio();
        musicPlayer.volume = parseFloat(document.getElementById('volume-slider').value) || 1;
        setupMusicPlayerEvents();
    }

    const btnAdd = document.getElementById('btn-add-playlist');
    if (btnAdd) btnAdd.innerHTML = SVG_ADD;

    musicPlayer.src = `/stream/${trackData.video_id}`;
    fadeIn(musicPlayer);
    btnPlayPause.innerHTML = SVG_PAUSE;
}

/**
 * Descriptif :
 * Demande au backend d'étendre la file d'attente à partir du dernier
 * morceau joué. Retourne vrai en cas de succès, faux sinon.
 */
async function triggerRefill(videoId) {
    if (isRefilling) return false;
    isRefilling = true;
    try {
        const response = await fetch('/api/player/refill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_video_id: videoId })
        });
        const result = await response.json();
        if (result.status === "success") {
            console.log(`Radio étendue : ${result.added} nouveaux titres.`);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Erreur lors du refill :", e);
        return false;
    } finally {
        isRefilling = false;
    }
}

/**
 * Descriptif :
 * Passe au morceau suivant de la file d'attente. Si la liste est vide,
 * intercepte l'erreur pour déclencher silencieusement une radio de secours
 * basée sur le titre venant de se terminer.
 */
async function playNextTrack() {
    stopConversation();
    try {
        const response = await fetch('/player/next');
        const data = await response.json();

        if (data && !data.error) {
            playMusic(data);
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill(data.video_id);
            }
        } else {
            // Radio de secours
            if (musicPlayer && musicPlayer.src) {
                const currentVideoId = musicPlayer.src.split('/').pop();
                if (currentVideoId) {
                    showToast("Génération d'une radio...");
                    const success = await triggerRefill(currentVideoId);
                    if (success) {
                        const retryResponse = await fetch('/player/next');
                        const retryData = await retryResponse.json();
                        if (retryData && !retryData.error) {
                            playMusic(retryData);
                            return;
                        }
                    }
                }
            }
            showToast("Fin de la file d'attente");
        }
    } catch (error) { console.error(error); }
}

async function playPrevTrack() {
    stopConversation();
    if (musicPlayer && musicPlayer.currentTime > 3) {
        musicPlayer.currentTime = 0;
        return;
    }
    try {
        const response = await fetch('/player/prev');
        const data = await response.json();
        if (data && !data.error) {
            playMusic(data);
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill(data.video_id);
            }
        }
    } catch (error) { console.error(error); }
}

function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
}

function stopConversation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    document.documentElement.style.setProperty('--aura-size', '0px');

    if (ws) { ws.close(); ws = null; }
    if (processor) { processor.disconnect(); processor = null; }
    if (userAnalyser) { userAnalyser.disconnect(); userAnalyser = null; }
    if (geminiAnalyser) { geminiAnalyser.disconnect(); geminiAnalyser = null; }
    if (captureContext) { captureContext.close(); captureContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
    if (playbackContext) { playbackContext.close(); playbackContext = null; }

    if (!musicPlayer || musicPlayer.paused) {
        statusText.textContent = "Assistant prêt";
        toggleBtn.className = "fab-btn btn-disconnected";
    }
}

btnPrev.addEventListener('click', playPrevTrack);
btnNext.addEventListener('click', playNextTrack);
btnPlayPause.addEventListener('click', () => {
    if (!musicPlayer) return;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        stopConversation();
    }

    if (musicPlayer.paused) {
        musicPlayer.play();
        btnPlayPause.innerHTML = SVG_PAUSE;
    } else {
        musicPlayer.pause();
        btnPlayPause.innerHTML = SVG_PLAY;
    }
});

// ==========================================
// GESTION DU VOLET DE BIBLIOTHÈQUE ET CACHE
// ==========================================

function openDrawer() {
    isDrawerOpen = true;
    libraryDrawer.classList.remove('hidden');

    drawerTitle.classList.add('hidden');
    document.getElementById('drawer-tabs').classList.remove('hidden');
    btnDrawerBack.classList.add('hidden');
    drawerActions.classList.add('hidden');

    // Vérifie quel onglet était actif pour restaurer l'état
    if (tabDiscovery.classList.contains('active')) {
        currentDrawerState = 'discovery';
        libraryContent.classList.add('hidden');
        discoveryContent.classList.remove('hidden');
        loadListenAgain();
    } else {
        currentDrawerState = 'list';
        discoveryContent.classList.add('hidden');
        libraryContent.classList.remove('hidden');
        loadPlaylists();
    }
}

function closeDrawer() {
    isDrawerOpen = false;
    libraryDrawer.classList.add('hidden');
}

function renderSkeletonList() {
    libraryContent.innerHTML = '';
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
        libraryContent.appendChild(item);
    }
}

function renderPlaylistsList(playlists) {
    libraryContent.innerHTML = '';

    if (playlists.length === 0) {
        libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucune playlist trouvée.</div>';
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

        libraryContent.appendChild(item);
    });
}

async function loadPlaylists() {
    currentDrawerState = 'list';
    currentPlaylistId = null;
    drawerTitle.textContent = "Mes Playlists";
    btnDrawerBack.classList.add('hidden');
    drawerActions.classList.add('hidden');

    if (cachedPlaylists) {
        renderPlaylistsList(cachedPlaylists);
        return;
    }

    renderSkeletonList();

    try {
        const response = await fetch('/api/playlists');
        cachedPlaylists = await response.json();
        renderPlaylistsList(cachedPlaylists);
    } catch (e) {
        libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Erreur de chargement.</div>';
        console.error("Erreur chargement playlists :", e);
    }
}

function renderPlaylistTracks(data) {
    libraryContent.innerHTML = '';

    if (!data.tracks || data.tracks.length === 0) {
        libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Playlist vide.</div>';
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
            playPlaylistTrack(currentPlaylistId, track.video_id);
        });

        libraryContent.appendChild(item);
    });
}

async function loadPlaylistDetails(playlistId, title) {
    currentDrawerState = 'detail';
    currentPlaylistId = playlistId;
    drawerTitle.textContent = title;

    drawerTitle.classList.remove('hidden');
    document.getElementById('drawer-tabs').classList.add('hidden');
    btnDrawerBack.classList.remove('hidden');
    drawerActions.classList.remove('hidden');

    discoveryContent.classList.add('hidden');
    libraryContent.classList.remove('hidden');

    if (cachedPlaylistDetails[playlistId]) {
        renderPlaylistTracks(cachedPlaylistDetails[playlistId]);
        return;
    }

    renderSkeletonList();

    try {
        const response = await fetch(`/api/playlists/${playlistId}`);
        const data = await response.json();
        cachedPlaylistDetails[playlistId] = data;
        renderPlaylistTracks(data);
    } catch (e) {
        libraryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Erreur de chargement.</div>';
        console.error("Erreur chargement détails playlist :", e);
    }
}

// ==========================================
// ÉCOUTEURS D'ÉVÉNEMENTS DU VOLET
// ==========================================

btnLibrary.addEventListener('click', () => {
    if (isDrawerOpen) {
        closeDrawer();
    } else {
        openDrawer();
    }
});

btnDrawerClose.addEventListener('click', closeDrawer);

btnDrawerBack.addEventListener('click', () => {
    if (currentDrawerState === 'detail') {
        document.getElementById('drawer-tabs').classList.remove('hidden');
        drawerTitle.classList.add('hidden');

        if (tabPlaylists.classList.contains('active')) {
            loadPlaylists();
        } else {
            currentDrawerState = 'discovery';
            btnDrawerBack.classList.add('hidden');
            drawerActions.classList.add('hidden');
            libraryContent.classList.add('hidden');
            discoveryContent.classList.remove('hidden');
        }
    }
});

btnDrawerPlay.addEventListener('click', async () => {
    if (!currentPlaylistId) return;

    stopConversation();
    showLoadingState();
    closeDrawer();

    try {
        const response = await fetch('/api/play_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlist_id: currentPlaylistId })
        });
        const data = await response.json();

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

// ==========================================
// GESTION DES ONGLETS ET "LISTEN AGAIN"
// ==========================================

tabPlaylists.addEventListener('click', () => {
    tabPlaylists.classList.add('active');
    tabDiscovery.classList.remove('active');
    libraryContent.classList.remove('hidden');
    discoveryContent.classList.add('hidden');
    drawerTitle.classList.add('hidden');
    document.getElementById('drawer-tabs').classList.remove('hidden');
    currentDrawerState = 'list';
    loadPlaylists();
});

tabDiscovery.addEventListener('click', () => {
    tabDiscovery.classList.add('active');
    tabPlaylists.classList.remove('active');
    discoveryContent.classList.remove('hidden');
    libraryContent.classList.add('hidden');
    btnDrawerBack.classList.add('hidden');
    drawerActions.classList.add('hidden');
    drawerTitle.classList.add('hidden');
    document.getElementById('drawer-tabs').classList.remove('hidden');
    currentDrawerState = 'discovery';
    loadListenAgain();
});

/**
 * Descriptif :
 * Fonction asynchrone pour lire un titre spécifique au sein d'une playlist.
 * Envoie simultanément l'identifiant de la playlist et l'identifiant de la vidéo 
 * au backend. Cela permet de démarrer la lecture sur le bon titre tout en 
 * conservant le contexte strict de la playlist (désactivation de la radio infinie).
 */
async function playPlaylistTrack(playlistId, videoId) {
    stopConversation();
    showLoadingState();
    closeDrawer();

    try {
        const response = await fetch('/api/play_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlist_id: playlistId, video_id: videoId })
        });
        const data = await response.json();

        if (!data.error) {
            playMusic(data);
        } else {
            removeLoadingState();
            showToast(data.error);
        }
    } catch (e) {
        removeLoadingState();
        showToast("Erreur lors de la lecture.");
        console.error("Erreur playPlaylistTrack :", e);
    }
}

async function loadListenAgain() {
    if (cachedListenAgain) {
        renderListenAgain(cachedListenAgain);
        return;
    }

    discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); width: 100%;">Génération de la grille...</div>';

    try {
        const response = await fetch('/api/home/listen-again');
        cachedListenAgain = await response.json();
        renderListenAgain(cachedListenAgain);
    } catch (e) {
        discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: red; width: 100%;">Erreur de chargement.</div>';
    }
}

function renderListenAgain(items) {
    discoveryContent.innerHTML = '';

    if (items.length === 0) {
        discoveryContent.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); width: 100%;">Rien à afficher pour le moment.</div>';
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

        discoveryContent.appendChild(div);
    });
}

// ==========================================
// DRAWER D'AJOUT À LA PLAYLIST
// ==========================================
const btnAddPlaylist = document.getElementById('btn-add-playlist');
const playlistAddDrawer = document.getElementById('playlist-add-drawer');
const btnCloseAddDrawer = document.getElementById('btn-close-add-drawer');
const addDrawerList = document.getElementById('add-drawer-list');

btnAddPlaylist.addEventListener('click', async () => {
    if (!musicPlayer || !musicPlayer.src) {
        showToast("Aucune musique en cours.");
        return;
    }

    // Le bouton affiche le SVG de coche une fois ajouté. On empêche un double ajout via son chemin SVG.
    if (btnAddPlaylist.innerHTML.includes("16.17")) return;

    playlistAddDrawer.classList.remove('hidden');
    addDrawerList.innerHTML = '<div style="text-align:center; padding: 20px;">Chargement...</div>';

    let playlists = cachedPlaylists;
    if (!playlists) {
        try {
            const res = await fetch('/api/playlists');
            playlists = await res.json();
            cachedPlaylists = playlists;
        } catch (e) {
            addDrawerList.innerHTML = '<div style="color:red; text-align:center;">Erreur.</div>';
            return;
        }
    }

    addDrawerList.innerHTML = '';
    playlists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'add-list-item';
        const thumb = p.thumbnail ? p.thumbnail : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        item.innerHTML = `
            <img src="${thumb}">
            <span>${p.title}</span>
        `;

        item.addEventListener('click', async () => {
            playlistAddDrawer.classList.add('hidden');
            showToast("Ajout en cours...");

            const currentVideoId = musicPlayer.src.split('/').pop();

            try {
                const res = await fetch(`/api/playlists/${p.playlistId}/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ video_id: currentVideoId })
                });
                const data = await res.json();
                if (!data.error) {
                    showToast("Ajouté avec succès !");
                    btnAddPlaylist.innerHTML = SVG_CHECK;
                    cachedPlaylistDetails[p.playlistId] = null;
                } else {
                    showToast(data.error);
                }
            } catch (e) {
                showToast("Erreur réseau.");
            }
        });
        addDrawerList.appendChild(item);
    });
});

btnCloseAddDrawer.addEventListener('click', () => {
    playlistAddDrawer.classList.add('hidden');
});