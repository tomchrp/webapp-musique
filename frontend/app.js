/*
==============================================================================
Projet : POC Interface Vocale Gemini Live - WebApp
Fichier : frontend/app.js
Description : 
Implémentation des logiques complexes de la Phase 3 :
1. Barre de recherche : Envoi d'une requête POST vers l'API interne pour lire.
2. Gestion du temps : Formatage des secondes et synchronisation de l'événement 
   'ontimeupdate' avec l'input range pour la navigation temporelle.
3. Transitions audio (Fade In/Out) : Fonctions asynchrones modifiant 
   progressivement la propriété volume de l'AudioContext pour adoucir les 
   prises de paroles ou les changements de pistes.
4. Notifications (Toasts) : Affichage discret géré depuis les payloads JSON 
   'queue_music'.
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
const searchBtn = document.getElementById('search-btn');

// Nouveaux éléments Phase 3
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

// ==========================================
// OUTILS UI : Toasts et Formateurs
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
                audio.volume = 1; // Reset pour la prochaine lecture
                clearInterval(fade);
                resolve();
            }
        }, 50);
    });
}

function fadeIn(audio, duration = 400) {
    if (!audio) return;
    audio.volume = 0;
    audio.play();
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
// RECHERCHE TEXTUELLE
// ==========================================
searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, action: 'play_now' })
        });
        const data = await response.json();
        if (!data.error) {
            playMusic(data);
        } else {
            showToast("Aucun résultat");
        }
    } catch (e) {
        console.error("Erreur de recherche:", e);
    }
});

// ==========================================
// INTERACTION VOCALE
// ==========================================
toggleBtn.addEventListener('click', async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        stopConversation();
        if (musicPlayer && musicPlayer.src) {
            fadeIn(musicPlayer); // Reprise en douceur
        }
    } else {
        if (musicPlayer && !musicPlayer.paused) {
            await fadeOut(musicPlayer); // Arrêt en douceur avant de parler
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
                    if (message.action === "play_music") {
                        playMusic(message);
                    } else if (message.action === "queue_music") {
                        // Ajout silencieux sans interrompre la lecture
                        showToast(`Ajouté à la file d'attente`);
                        nextTrackInfo.textContent = `À suivre : ${message.next_title}`;
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
        timeCurrent.textContent = formatTime(musicPlayer.currentTime);
        if (musicPlayer.duration) {
            progressBar.value = (musicPlayer.currentTime / musicPlayer.duration) * 100;
            timeTotal.textContent = formatTime(musicPlayer.duration);
        }
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

async function playNextTrack() {
    try {
        const response = await fetch('/player/next');
        const data = await response.json();
        if (data && !data.error) {
            playMusic(data);
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