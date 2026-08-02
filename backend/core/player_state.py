"""
==============================================================================
Chemin : backend/core/player_state.py
Utilité : Gestionnaire de l'état de la file d'attente (State Management).
          Normalise systématiquement les métadonnées (artiste, miniatures) 
          pour garantir la stabilité de l'API et de l'affichage frontend.
==============================================================================
"""

class PlayerState:
    def __init__(self):
        self.history = []
        self.current_track = None
        self.priority_queue = []
        self.context_queue = []
        self.radio_queue = []
        self.played_ids = set()

    def _normalize_track(self, track: dict):
        """
        Descriptif :
        Normalise chaque piste pour s'assurer que la miniature est une URL 
        valide et que l'artiste est une chaîne de caractères exploitable.
        """
        if not track:
            return track
            
        # Normalisation miniature
        thumbnails = track.get('thumbnail', track.get('thumbnails', []))
        if isinstance(thumbnails, list) and len(thumbnails) > 0:
            track['thumbnail'] = thumbnails[-1].get('url', '')
        elif isinstance(thumbnails, str):
            track['thumbnail'] = thumbnails
        else:
            track['thumbnail'] = ""
            
        # Normalisation ID
        if 'video_id' in track and 'videoId' not in track:
            track['videoId'] = track['video_id']

        # Normalisation Artiste (string)
        if 'artists' in track and isinstance(track['artists'], list) and len(track['artists']) > 0:
            track['artist'] = track['artists'][0].get('name', 'Inconnu')
        elif not track.get('artist'):
            track['artist'] = 'Inconnu'
            
        return track

    def get_preview_queue(self, limit=20):
        preview = []
        for t in self.priority_queue:
            tc = t.copy()
            tc['source'] = 'priority'
            preview.append(tc)
        for t in self.context_queue:
            tc = t.copy()
            tc['source'] = 'context'
            preview.append(tc)
        for t in self.radio_queue:
            tc = t.copy()
            tc['source'] = 'radio'
            preview.append(tc)
            
        return preview[:limit]
        
    def get_queue_length(self):
        return len(self.priority_queue) + len(self.context_queue) + len(self.radio_queue)

    def play_now(self, track: dict, subsequent_tracks: list, is_radio=False):
        if self.current_track:
            self.history.append(self.current_track)
        
        track['source'] = 'radio' if is_radio else 'context'
        self.current_track = self._normalize_track(track)
        self.played_ids.add(self.current_track.get('videoId'))
        
        self.priority_queue = []
        normalized_sub = [self._normalize_track(t) for t in subsequent_tracks if t.get('videoId') != track.get('videoId')]
        
        if is_radio:
            self.context_queue = []
            self.radio_queue = normalized_sub
        else:
            self.context_queue = normalized_sub
            self.radio_queue = []

    def enqueue_next(self, track: dict):
        track['source'] = 'priority'
        self.priority_queue.insert(0, self._normalize_track(track))

    def enqueue_last(self, track: dict):
        track['source'] = 'priority'
        self.priority_queue.append(self._normalize_track(track))

    def append_radio_tracks(self, radio_tracks: list):
        if not radio_tracks:
            return
            
        for track in radio_tracks:
            vid_id = track.get('videoId')
            if vid_id and vid_id not in self.played_ids:
                t = self._normalize_track(track)
                t['source'] = 'radio'
                self.radio_queue.append(t)
                self.played_ids.add(vid_id)

    def next_track(self):
        if self.current_track:
            self.history.append(self.current_track)
            
        if self.priority_queue:
            self.current_track = self.priority_queue.pop(0)
            self.radio_queue = [] 
        elif self.context_queue:
            self.current_track = self.context_queue.pop(0)
        elif self.radio_queue:
            self.current_track = self.radio_queue.pop(0)
        else:
            self.current_track = None
            
        if self.current_track:
            self.played_ids.add(self.current_track.get('videoId'))
            
        return self.current_track

    def prev_track(self):
        if self.current_track:
            source = self.current_track.get('source', 'radio')
            if source == 'priority':
                self.priority_queue.insert(0, self.current_track)
            elif source == 'context':
                self.context_queue.insert(0, self.current_track)
            else:
                self.radio_queue.insert(0, self.current_track)
            
        if self.history:
            self.current_track = self.history.pop()
        else:
            self.current_track = None
            
        return self.current_track

    def skip_playlist(self):
        if self.current_track:
            self.history.append(self.current_track)
            self.current_track = None
            
        for t in self.context_queue:
            t['source'] = 'context'
            self.history.append(t)
            
        self.context_queue = []
        return None

    def restart_playlist(self):
        context_tracks = []
        while self.history and self.history[-1].get('source') == 'context':
            context_tracks.insert(0, self.history.pop())
            
        if self.current_track and self.current_track.get('source') == 'context':
            context_tracks.append(self.current_track)
        elif self.current_track:
            source = self.current_track.get('source', 'radio')
            if source == 'priority':
                self.priority_queue.insert(0, self.current_track)
            else:
                self.radio_queue.insert(0, self.current_track)
                
        if not context_tracks:
            return self.current_track
            
        self.current_track = context_tracks.pop(0)
        self.context_queue = context_tracks + self.context_queue
        return self.current_track

    def clear_user_queue(self):
        self.priority_queue = []
        
    def jump_to(self, video_id: str):
        def search_and_consume(queue):
            for i, t in enumerate(queue):
                if t.get('videoId') == video_id or t.get('video_id') == video_id:
                    self.history.extend(queue[:i])
                    track = queue.pop(i)
                    del queue[:i]
                    return track
            return None

        if self.current_track:
            self.history.append(self.current_track)
            self.current_track = None

        track = search_and_consume(self.priority_queue)
        if track:
            self.current_track = track
            return track
            
        track = search_and_consume(self.context_queue)
        if track:
            self.current_track = track
            return track
            
        track = search_and_consume(self.radio_queue)
        if track:
            self.current_track = track
            self.context_queue = [] 
            return track

        return self.next_track()

player_state = PlayerState()