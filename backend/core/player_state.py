"""
==============================================================================
Chemin : backend/core/player_state.py
Utilité : Gestionnaire de l'état de la file d'attente (State Management).
          Remplace la liste d'attente basique par une structure capable de 
          gérer l'injection de sessions "Radio" sans créer de doublons.
==============================================================================
"""

class PlayerState:
    def __init__(self):
        self.history = []
        self.current_track = None
        self.queue = []
        # Historique des identifiants pour éviter de jouer deux fois le même titre dans une radio
        self.played_ids = set() 

    def play_now(self, track: dict, subsequent_tracks: list):
        """
        Descriptif :
        Écrase la file d'attente actuelle pour jouer un nouveau titre immédiatement.
        Enregistre la piste actuelle dans l'historique avant de la remplacer.
        """
        if self.current_track:
            self.history.append(self.current_track)
        
        self.current_track = track
        self.played_ids.add(track.get('videoId'))
        
        # Filtre de sécurité : retire le titre en cours s'il est présent dans la nouvelle liste
        self.queue = [t for t in subsequent_tracks if t.get('videoId') != track.get('videoId')]

    def append_radio_tracks(self, radio_tracks: list):
        """
        Descriptif :
        Logique de "Refill" intelligent (Phase 1 de la roadmap). 
        Prend une liste de titres issus d'une requête Radio, ignore la position 0 
        (qui est toujours la graine/seed ayant servi à générer la radio), et 
        ajoute uniquement les titres qui n'ont pas encore été joués dans cette session.
        """
        if not radio_tracks or len(radio_tracks) < 2:
            return

        # On ignore le premier élément (index 0) car c'est le morceau de référence
        new_tracks = radio_tracks[1:]
        
        for track in new_tracks:
            vid_id = track.get('videoId')
            if vid_id and vid_id not in self.played_ids:
                self.queue.append(track)
                # On pré-enregistre l'ID pour éviter qu'un futur refill ne le réinjecte
                self.played_ids.add(vid_id)

    def next_track(self):
        """
        Descriptif :
        Passe au titre suivant. Transfère le titre actuel dans l'historique 
        et dépile le premier élément de la file d'attente.
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
        Recule d'un titre. Réinsère le titre actuel au début de la file 
        d'attente et récupère le dernier élément de l'historique.
        """
        if not self.history:
            return None
            
        if self.current_track:
            self.queue.insert(0, self.current_track)
            
        self.current_track = self.history.pop()
        return self.current_track

# Instance globale à utiliser dans les routes FastAPI
player_state = PlayerState()