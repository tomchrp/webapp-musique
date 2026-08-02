/*
==============================================================================
Chemin : frontend/js/gemini.js
Utilité : Gestionnaire de l'assistant vocal IA. Initialise la connexion
          WebSocket et intercepte les nouvelles actions de contrôle.
==============================================================================
*/

import * as DOM from './constants.js';
import { AppState, clearCaches } from './state.js';
import { playMusic, PlayerStore, fadeIn, playNextTrack, playPrevTrack, skipCurrentPlaylist, restartCurrentPlaylist } from './player.js';
import { showToast, showLoadingState, removeLoadingState, closeAllDrawers, refreshActiveDrawer, updateQueuePreview, renderQueueDrawer } from './ui.js';

export const GeminiStore = {
    ws: null,
    captureContext: null,
    playbackContext: null,
    mediaStream: null,
    processor: null,
    nextPlayTime: 0,
    audioStartTime: 0,
    userAnalyser: null,
    geminiAnalyser: null,
    animationFrameId: null
};

export function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
}

export function visualizeAura() {
    let auraSize = 0;
    let auraColor = 'rgba(255, 255, 255, 0)';
    if (GeminiStore.userAnalyser) {
        const dataArray = new Float32Array(GeminiStore.userAnalyser.fftSize);
        GeminiStore.userAnalyser.getFloatTimeDomainData(dataArray);
        let sumSquares = 0.0;
        for (let i = 0; i < dataArray.length; i++) { sumSquares += dataArray[i] * dataArray[i]; }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        if (rms > 0.02) {
            auraSize = rms * 500;
            auraColor = `rgba(29, 185, 84, ${Math.min(rms * 5, 0.8)})`;
        }
    }
    if (auraSize === 0 && GeminiStore.geminiAnalyser) {
        const dataArray = new Float32Array(GeminiStore.geminiAnalyser.fftSize);
        GeminiStore.geminiAnalyser.getFloatTimeDomainData(dataArray);
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
    GeminiStore.animationFrameId = requestAnimationFrame(visualizeAura);
}

export async function setupAudioCapture() {
    GeminiStore.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    GeminiStore.captureContext = new AudioContextClass({ sampleRate: 16000 });
    const source = GeminiStore.captureContext.createMediaStreamSource(GeminiStore.mediaStream);
    GeminiStore.userAnalyser = GeminiStore.captureContext.createAnalyser();
    GeminiStore.userAnalyser.fftSize = 512;
    source.connect(GeminiStore.userAnalyser);
    GeminiStore.processor = GeminiStore.captureContext.createScriptProcessor(1024, 1, 1);
    GeminiStore.audioStartTime = Date.now();
    GeminiStore.processor.onaudioprocess = (e) => {
        if (!GeminiStore.ws || GeminiStore.ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - GeminiStore.audioStartTime < 500) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = convertFloat32ToInt16(inputData);
        GeminiStore.ws.send(pcmData);
    };
    GeminiStore.userAnalyser.connect(GeminiStore.processor);
    GeminiStore.processor.connect(GeminiStore.captureContext.destination);
}

export function setupAudioPlayback() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    GeminiStore.playbackContext = new AudioContextClass({ sampleRate: 24000 });
    GeminiStore.nextPlayTime = GeminiStore.playbackContext.currentTime;
    GeminiStore.geminiAnalyser = GeminiStore.playbackContext.createAnalyser();
    GeminiStore.geminiAnalyser.fftSize = 512;
    GeminiStore.geminiAnalyser.connect(GeminiStore.playbackContext.destination);
}

export function playAudio(arrayBuffer) {
    if (!GeminiStore.playbackContext) return;
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) { float32Array[i] = int16Array[i] / 32768.0; }
    const audioBuffer = GeminiStore.playbackContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = GeminiStore.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(GeminiStore.geminiAnalyser);
    if (GeminiStore.nextPlayTime < GeminiStore.playbackContext.currentTime) { GeminiStore.nextPlayTime = GeminiStore.playbackContext.currentTime; }
    source.start(GeminiStore.nextPlayTime);
    GeminiStore.nextPlayTime += audioBuffer.duration;
}

export function stopConversation() {
    if (GeminiStore.animationFrameId) {
        cancelAnimationFrame(GeminiStore.animationFrameId);
        GeminiStore.animationFrameId = null;
    }
    document.documentElement.style.setProperty('--aura-size', '0px');

    if (GeminiStore.ws) { GeminiStore.ws.close(); GeminiStore.ws = null; }
    if (GeminiStore.processor) { GeminiStore.processor.disconnect(); GeminiStore.processor = null; }
    if (GeminiStore.userAnalyser) { GeminiStore.userAnalyser.disconnect(); GeminiStore.userAnalyser = null; }
    if (GeminiStore.geminiAnalyser) { GeminiStore.geminiAnalyser.disconnect(); GeminiStore.geminiAnalyser = null; }
    if (GeminiStore.captureContext) { GeminiStore.captureContext.close(); GeminiStore.captureContext = null; }
    if (GeminiStore.mediaStream) { GeminiStore.mediaStream.getTracks().forEach(track => track.stop()); GeminiStore.mediaStream = null; }
    if (GeminiStore.playbackContext) { GeminiStore.playbackContext.close(); GeminiStore.playbackContext = null; }

    if (!PlayerStore.musicPlayer || PlayerStore.musicPlayer.paused) {
        DOM.statusText.textContent = "Assistant prêt";
        DOM.toggleBtn.className = "fab-btn btn-disconnected";
    }
}

export async function startConversation() {
    closeAllDrawers();
    try {
        DOM.statusText.textContent = "Connexion...";
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        GeminiStore.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        GeminiStore.ws.binaryType = "arraybuffer";

        GeminiStore.ws.onopen = async () => {
            DOM.statusText.textContent = "À votre écoute";
            DOM.toggleBtn.className = "fab-btn btn-connected";
            await setupAudioCapture();
            setupAudioPlayback();
            visualizeAura();
        };

        GeminiStore.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                playAudio(event.data);
            } else if (typeof event.data === "string") {
                try {
                    const message = JSON.parse(event.data);

                    if (message.action === "queue_updated") {
                        stopConversation();
                        showToast(message.message);
                        if (message.preview_queue) {
                            PlayerStore.currentPreviewQueue = message.preview_queue;
                            updateQueuePreview(message.preview_queue);
                            renderQueueDrawer(message.preview_queue);
                        }
                    }
                    else if (message.action === "control") {
                        stopConversation();
                        switch (message.command) {
                            case "pause":
                                if (PlayerStore.musicPlayer && !PlayerStore.musicPlayer.paused) {
                                    PlayerStore.musicPlayer.pause();
                                    DOM.btnPlayPause.innerHTML = DOM.SVG_PLAY;
                                }
                                break;
                            case "play":
                                if (PlayerStore.musicPlayer && PlayerStore.musicPlayer.paused) {
                                    PlayerStore.musicPlayer.play();
                                    DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
                                }
                                break;
                            case "next":
                                playNextTrack();
                                break;
                            case "prev":
                                playPrevTrack();
                                break;
                            case "skip_playlist":
                                skipCurrentPlaylist();
                                break;
                            case "restart_playlist":
                                restartCurrentPlaylist();
                                break;
                        }
                    }
                    else if (message.action === "library_updated") {
                        clearCaches();
                        refreshActiveDrawer();
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

        GeminiStore.ws.onclose = () => stopConversation();
        GeminiStore.ws.onerror = () => stopConversation();
    } catch (error) {
        DOM.statusText.textContent = "Erreur réseau";
    }
}