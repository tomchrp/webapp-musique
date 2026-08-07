/*
==============================================================================
Chemin : frontend/js/player.js
Utilité : Moteur de lecture audio. Gère le flux audio, les contrôles et 
          l'alimentation de la file d'attente (Queue).
Modifications :
  - Suppression de l'injection par défaut du texte "Lecture en cours" dans 
    fullPlayerStatus pour laisser l'espace vierge ou disponible pour Gemini.
==============================================================================
*/

import * as DOM from './constants.js';
import * as API from './api.js';
import { showToast, formatTime, showLoadingState, removeLoadingState, renderQueue, showMiniPlayer, highlightActiveTrack } from './ui.js';
import { stopConversation } from './gemini.js';

export const PlayerStore = {
    musicPlayer: null,
    isRefilling: false,
    currentPreviewQueue: []
};

/*
Descriptif :
Applique une réduction logarithmique (cubique) du volume sur une durée donnée
pour offrir une transition sonore naturelle à l'oreille humaine avant de 
mettre le flux en pause.
*/
export function fadeOut(audio, duration = 400) {
    return new Promise(resolve => {
        if (!audio || audio.paused) return resolve();
        const rawVolume = parseFloat(DOM.volumeSlider.value) || 1;
        const targetVolume = Math.pow(rawVolume, 3);
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

/*
Descriptif :
Démarre la lecture avec un volume à zéro puis l'augmente progressivement
selon une courbe cubique jusqu'au volume ciblé par l'utilisateur.
*/
export function fadeIn(audio, duration = 400) {
    if (!audio) return;
    const rawVolume = parseFloat(DOM.volumeSlider.value) || 1;
    const targetVolume = Math.pow(rawVolume, 3);

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

export function setupMusicPlayerEvents() {
    if (!PlayerStore.musicPlayer) return;
    PlayerStore.musicPlayer.ontimeupdate = () => {
        if (!PlayerStore.musicPlayer.duration || isNaN(PlayerStore.musicPlayer.duration)) return;
        DOM.timeCurrent.textContent = formatTime(PlayerStore.musicPlayer.currentTime);
        DOM.progressBar.value = (PlayerStore.musicPlayer.currentTime / PlayerStore.musicPlayer.duration) * 100;
        DOM.timeTotal.textContent = formatTime(PlayerStore.musicPlayer.duration);
    };
    PlayerStore.musicPlayer.onended = playNextTrack;
}

/*
Descriptif :
Fonction centrale du lecteur. Initialise ou réinitialise le flux audio avec 
les nouvelles données du backend. Met à jour les métadonnées dans le DOM,
affiche le mini-lecteur et applique la surbrillance visuelle sur la vue active.
*/
export function playMusic(trackData) {
    stopConversation();
    removeLoadingState();

    // Suppression de l'injection statique "Lecture en cours" ici
    // if (DOM.fullPlayerStatus) DOM.fullPlayerStatus.textContent = "Lecture en cours";
    if (DOM.fullPlayerStatus && DOM.fullPlayerStatus.textContent === "Recherche en cours...") {
        DOM.fullPlayerStatus.textContent = "";
    }
    
    DOM.toggleBtn.className = "fab-btn btn-disconnected";

    DOM.progressBar.value = 0;
    DOM.timeCurrent.textContent = "0:00";
    DOM.timeTotal.textContent = "0:00";

    DOM.trackTitle.textContent = trackData.title || "Titre inconnu";
    DOM.trackArtist.textContent = trackData.artist || "Artiste inconnu";

    if (trackData.preview_queue) {
        PlayerStore.currentPreviewQueue = trackData.preview_queue;
        renderQueue(trackData.preview_queue);
    }

    if (trackData.thumbnail) {
        DOM.trackCover.src = trackData.thumbnail;
        DOM.backgroundBlur.style.backgroundImage = `url('${trackData.thumbnail}')`;
    }

    showMiniPlayer(trackData);
    highlightActiveTrack(trackData.video_id);

    if (!PlayerStore.musicPlayer) {
        PlayerStore.musicPlayer = new Audio();
        PlayerStore.musicPlayer.volume = Math.pow(parseFloat(DOM.volumeSlider.value) || 1, 3);
        setupMusicPlayerEvents();
    }

    if (DOM.btnAddPlaylist) DOM.btnAddPlaylist.innerHTML = DOM.SVG_ADD;

    PlayerStore.musicPlayer.src = `/stream/${trackData.video_id}`;
    fadeIn(PlayerStore.musicPlayer);

    DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
    DOM.btnMiniPlayPause.innerHTML = DOM.SVG_MINI_PAUSE;
}

export async function triggerRefill() {
    if (PlayerStore.isRefilling) return false;
    PlayerStore.isRefilling = true;
    try {
        const result = await API.playerRefill();
        if (result.status === "success") {
            if (result.preview_queue) {
                PlayerStore.currentPreviewQueue = result.preview_queue;
                renderQueue(result.preview_queue);
            }
            return true;
        }
        return false;
    } catch (e) {
        console.error("Erreur lors du refill :", e);
        return false;
    } finally {
        PlayerStore.isRefilling = false;
    }
}

export async function playNextTrack() {
    stopConversation();
    try {
        const data = await API.playerNext();
        if (data && !data.error) {
            playMusic(data);
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill();
            }
        } else {
            showToast("Fin de la file d'attente");
        }
    } catch (error) { console.error(error); }
}

export async function playPrevTrack() {
    stopConversation();
    if (PlayerStore.musicPlayer && PlayerStore.musicPlayer.currentTime > 3) {
        PlayerStore.musicPlayer.currentTime = 0;
        return;
    }
    try {
        const data = await API.playerPrev();
        if (data && !data.error) {
            playMusic(data);
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill();
            }
        }
    } catch (error) { console.error(error); }
}

export async function playSpecificTrack(videoId) {
    stopConversation();
    showLoadingState();
    try {
        const data = await API.playSpecific(videoId);
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

export async function playPlaylistTrack(playlistId, videoId) {
    stopConversation();
    showLoadingState();
    try {
        const data = await API.playPlaylist(playlistId, videoId);
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

export async function addTrackToQueue(videoId) {
    try {
        showToast("Ajout en cours...");
        const data = await API.addToQueue(videoId, 'next');
        if (data.status === "success" && data.preview_queue) {
            showToast("Titre ajouté à la file.");
            PlayerStore.currentPreviewQueue = data.preview_queue;
            renderQueue(data.preview_queue);
        } else {
            showToast("Erreur lors de l'ajout.");
        }
    } catch (e) {
        showToast("Erreur réseau.");
    }
}

export async function skipCurrentPlaylist() {
    stopConversation();
    try {
        const data = await API.skipPlaylist();
        if (data && !data.error) {
            playMusic(data);
        } else {
            showToast("Rien à sauter.");
        }
    } catch (error) { console.error(error); }
}

export async function restartCurrentPlaylist() {
    stopConversation();
    try {
        const data = await API.restartPlaylist();
        if (data && !data.error) {
            playMusic(data);
        } else {
            showToast("Aucun historique.");
        }
    } catch (error) { console.error(error); }
}

export async function playQueueTrack(videoId) {
    stopConversation();
    showLoadingState();
    try {
        const data = await API.jumpToTrack(videoId);
        if (!data.error) {
            playMusic(data);
            if (data.remaining_queue_length !== undefined && data.remaining_queue_length <= 3) {
                triggerRefill();
            }
        } else {
            removeLoadingState();
            showToast(data.error);
        }
    } catch (e) {
        removeLoadingState();
        console.error("Erreur jump :", e);
    }
}