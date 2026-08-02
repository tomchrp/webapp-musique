/*
==============================================================================
Chemin : frontend/js/player.js
Utilité : Moteur de lecture audio. Gère l'instance globale de l'élément Audio, 
          le contrôle du volume, et interagit avec l'API pour récupérer 
          les pistes ou manipuler la nouvelle file d'attente (Queue).
Mise à jour : Application de la courbe cubique sur les fondus sonores.
==============================================================================
*/

import * as DOM from './constants.js';
import * as API from './api.js';
import { showToast, formatTime, showLoadingState, removeLoadingState, closeAllDrawers, updateQueuePreview, renderQueueDrawer } from './ui.js';
import { stopConversation } from './gemini.js';

export const PlayerStore = {
    musicPlayer: null,
    isRefilling: false,
    currentPreviewQueue: []
};

export function fadeOut(audio, duration = 400) {
    return new Promise(resolve => {
        if (!audio || audio.paused) return resolve();
        // Récupération et conversion cubique de la valeur du slider
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

export function fadeIn(audio, duration = 400) {
    if (!audio) return;
    // Récupération et conversion cubique de la valeur du slider
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

export function playMusic(trackData) {
    stopConversation();
    closeAllDrawers();

    DOM.statusText.textContent = "Lecture en cours";
    DOM.toggleBtn.className = "fab-btn btn-disconnected";
    removeLoadingState();

    DOM.progressBar.value = 0;
    DOM.timeCurrent.textContent = "0:00";
    DOM.timeTotal.textContent = "0:00";

    DOM.playerContainer.classList.remove("hidden");
    DOM.trackTitle.textContent = trackData.title || "Titre inconnu";
    DOM.trackArtist.textContent = trackData.artist || "Artiste inconnu";

    if (trackData.preview_queue) {
        PlayerStore.currentPreviewQueue = trackData.preview_queue;
        updateQueuePreview(trackData.preview_queue);
        renderQueueDrawer(trackData.preview_queue);
    }

    if (trackData.thumbnail) {
        DOM.trackCover.src = trackData.thumbnail;
        DOM.trackCover.classList.remove("hidden");
        DOM.backgroundBlur.style.backgroundImage = `url('${trackData.thumbnail}')`;
    }

    if (!PlayerStore.musicPlayer) {
        PlayerStore.musicPlayer = new Audio();
        // Initialisation de l'audio avec le cube de la valeur affichée
        PlayerStore.musicPlayer.volume = Math.pow(parseFloat(DOM.volumeSlider.value) || 1, 3);
        setupMusicPlayerEvents();
    }

    if (DOM.btnAddPlaylist) DOM.btnAddPlaylist.innerHTML = DOM.SVG_ADD;

    PlayerStore.musicPlayer.src = `/stream/${trackData.video_id}`;
    fadeIn(PlayerStore.musicPlayer);
    DOM.btnPlayPause.innerHTML = DOM.SVG_PAUSE;
}

export async function triggerRefill() {
    if (PlayerStore.isRefilling) return false;
    PlayerStore.isRefilling = true;
    try {
        const result = await API.playerRefill();
        if (result.status === "success") {
            if (result.preview_queue) {
                PlayerStore.currentPreviewQueue = result.preview_queue;
                updateQueuePreview(result.preview_queue);
                renderQueueDrawer(result.preview_queue);
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
    closeAllDrawers();
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
    closeAllDrawers();
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
            updateQueuePreview(data.preview_queue);
            renderQueueDrawer(data.preview_queue);
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
    closeAllDrawers();
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