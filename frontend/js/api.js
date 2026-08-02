/*
==============================================================================
Chemin : frontend/js/api.js
Utilité : Couche réseau du frontend. Encapsule tous les appels asynchrones 
          (fetch) vers l'API backend REST et renvoie les données JSON.
==============================================================================
*/

export async function searchLive(query) {
    const response = await fetch(`/api/search/live?q=${encodeURIComponent(query)}&t=${Date.now()}`);
    return response.json();
}

export async function playSpecific(videoId, action = 'play_now') {
    const response = await fetch('/api/play_specific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, action })
    });
    return response.json();
}

export async function playPlaylist(playlistId, videoId = null) {
    const body = { playlist_id: playlistId };
    if (videoId) body.video_id = videoId;
    const response = await fetch('/api/play_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return response.json();
}

export async function playerRefill() {
    const response = await fetch('/api/player/refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
}

export async function playerNext() {
    const response = await fetch(`/player/next?t=${Date.now()}`);
    return response.json();
}

export async function playerPrev() {
    const response = await fetch(`/player/prev?t=${Date.now()}`);
    return response.json();
}

export async function getPlaylists() {
    const response = await fetch(`/api/playlists?t=${Date.now()}`);
    return response.json();
}

export async function getPlaylistDetails(playlistId) {
    const response = await fetch(`/api/playlists/${playlistId}?t=${Date.now()}`);
    return response.json();
}

export async function getListenAgain() {
    const response = await fetch(`/api/home/listen-again?t=${Date.now()}`);
    return response.json();
}

export async function addToPlaylist(playlistId, videoId) {
    const response = await fetch(`/api/playlists/${playlistId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId })
    });
    return response.json();
}

export async function addToQueue(videoId, position = 'next') {
    const response = await fetch('/api/player/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, position })
    });
    return response.json();
}

export async function skipPlaylist() {
    const response = await fetch('/api/player/skip_playlist', {
        method: 'POST'
    });
    return response.json();
}

export async function restartPlaylist() {
    const response = await fetch('/api/player/restart_playlist', {
        method: 'POST'
    });
    return response.json();
}

export async function jumpToTrack(videoId) {
    const response = await fetch('/api/player/jump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId })
    });
    return response.json();
}