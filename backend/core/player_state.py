"""
==============================================================================
Chemin : backend/core/player_state.py
Utilité : Gestionnaire de l'état de la file d'attente (State Management).
          Remplace la liste d'attente basique par une structure capable de 
          gérer l'injection de sessions "Radio" sans créer de doublons.
          Note : Ce module implémente un Singleton. Il maintient l'état global 
          de la lecture pour le serveur.
==============================================================================
"""

class PlayerState:
    def __init__(self):
        """
        Descriptif :
        Initialise le gestionnaire d'état de la lecture musicale.
        Crée les listes nécessaires pour stocker l'historique des morceaux joués,
        la file d'attente à venir, et un registre unique (Set) des identifiants 
        pour bloquer les répétitions non désirées lors de l'ajout de radios.
        """
        self.history = []
        self.current_track = None
        self.queue = []
        self.played_ids = set() 

    def play_now(self, track: dict, subsequent_tracks: list):
        """
        Descriptif :
        Écrase la file d'attente actuelle pour forcer la lecture immédiate d'un nouveau titre.
        Enregistre la piste actuellement en cours (si elle existe) dans l'historique 
        avant de procéder au remplacement. Purge la file d'attente des doublons potentiels.
        
        Args:
            track (dict): Les métadonnées du titre à jouer immédiatement.
            subsequent_tracks (list): La liste des titres suivants (la nouvelle file d'attente).
        """
        if self.current_track:
            self.history.append(self.current_track)
        
        self.current_track = track
        self.played_ids.add(track.get('videoId'))
        
        self.queue = [t for t in subsequent_tracks if t.get('videoId') != track.get('videoId')]

    def append_radio_tracks(self, radio_tracks: list):
        """
        Descriptif :
        Étend la file d'attente de manière transparente. Analyse une liste de titres 
        renvoyée par l'algorithme radio de YouTube, rejette le titre de base (index 0) 
        et filtre tous les identifiants déjà présents dans l'historique de la session 
        pour garantir une écoute sans répétition.
        
        Args:
            radio_tracks (list): La liste des recommandations générées par l'API.
        """
        if not radio_tracks or len(radio_tracks) < 2:
            return

        new_tracks = radio_tracks[1:]
        
        for track in new_tracks:
            vid_id = track.get('videoId')
            if vid_id and vid_id not in self.played_ids:
                self.queue.append(track)
                self.played_ids.add(vid_id)

    def next_track(self):
        """
        Descriptif :
        Avance la lecture d'un cran. Archive le titre actuel dans la liste de l'historique 
        et extrait le premier élément disponible dans la file d'attente pour le définir 
        comme nouvelle piste active.
        
        Returns:
            dict ou None: Le nouveau titre à jouer, ou None si la file est vide.
        """
        if self.current_track:
            self.history.append(self.current_track)
            
        if self.queue:
            self.current_track = self.queue.pop(0)
            if self.current_track:
                self.played_ids.add(self.current_track.get('videoId'))
        else:
            self.current_track = None
            
        return self.current_track

    def prev_track(self):
        """
        Descriptif :
        Retourne au titre précédent. Annule l'action précédente en réinsérant le titre 
        actuel au sommet de la file d'attente, et restaure le dernier élément de 
        l'historique comme piste active.
        
        Returns:
            dict ou None: Le titre précédent, ou None si l'historique est vide.
        """
        if not self.history:
            return None
            
        if self.current_track:
            self.queue.insert(0, self.current_track)
            
        self.current_track = self.history.pop()
        return self.current_track

player_state = PlayerState()