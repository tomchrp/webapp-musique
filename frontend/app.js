/*
==============================================================================
Chemin : frontend/app.js
Utilité : Script principal de l'interface client (Frontend).
          Gère les interactions UI, la communication WebSocket avec l'agent IA,
          et le contrôle du lecteur audio HTML5.
Mise à jour : Implémentation de la Phase 1 (File d'attente infinie). Ajout de 
              la surveillance de remaining_queue_length et de la fonction de 
              recharge silencieuse (triggerRefill) pour générer une radio continue.
==============================================================================
*/

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

// Verrou pour éviter de lancer plusieurs recharges en même temps
let isRefilling = false;

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
// TRANSITIONS AUDIO DOUCES (FADE IN / OUT)
// ==========================================
function fadeOut(audio, duration = 400) {
    return new Promise(resolve => {
        if (!audio || audio.paused) return resolve();
        const step = 50 / duration;
        const fade = setInterval(() => {
            if (audio.volume > step) {
                audio.volume -= step;
            } else {
                audio.volume = 0;
                audio.pause();
                audio.volume = 1;
                clearInterval(fade);
                resolve();
            }
        }, 50);
    });
}

function fadeIn(audio, duration = 400) {
    if (!audio) return;
    audio.volume = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("Échec critique de la lecture audio :", error);
            showToast("Erreur de lecture du flux sonore.");
        });
    }

    const step = 50 / duration;
    const fade = setInterval(() => {
        if (audio.volume < 1 - step) {
            audio.volume += step;
        } else {
            audio.volume = 1;
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
    showLoadingState();
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
// INTERACTION VOCALE
// ==========================================
toggleBtn.addEventListener('click', async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        stopConversation();
        if (musicPlayer && musicPlayer.src) {
            fadeIn(musicPlayer);
        }
    } else {
        if (musicPlayer && !musicPlayer.paused) {
            await fadeOut(musicPlayer);
        }
        startConversation();
    }
});

async function startConversation() {
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

                    if (message.action === "loading") {
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
        setupMusicPlayerEvents();
    }

    musicPlayer.src = `/stream/${trackData.video_id}`;
    fadeIn(musicPlayer);
    btnPlayPause.textContent = "||";
}

/**
 * Descriptif :
 * Fonction asynchrone appelée silencieusement pour étendre la file d'attente.
 * Verrouille l'exécution avec 'isRefilling' pour éviter de spammer le serveur.
 */
async function triggerRefill(videoId) {
    if (isRefilling) return;
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
        }
    } catch (e) {
        console.error("Erreur lors du refill :", e);
    } finally {
        isRefilling = false;
    }
}

async function playNextTrack() {
    try {
        const response = await fetch('/player/next');
        const data = await response.json();
        if (data && !data.error) {
            playMusic(data);

            // Si la file d'attente s'épuise, on déclenche le script de recharge
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill(data.video_id);
            }
        } else {
            showToast("Fin de la file d'attente");
        }
    } catch (error) { console.error(error); }
}

async function playPrevTrack() {
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

function stopMusic() {
    if (musicPlayer) {
        musicPlayer.pause();
        musicPlayer.src = "";
    }
    playerContainer.classList.add("hidden");
    backgroundBlur.style.backgroundImage = 'none';
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
btnPlayPause.addEventListener('click', () => {
    if (!musicPlayer) return;
    if (musicPlayer.paused) {
        musicPlayer.play();
        btnPlayPause.textContent = "||";
    } else {
        musicPlayer.pause();
        btnPlayPause.textContent = "►";
    }
});
btnNext.addEventListener('click', playNextTrack);