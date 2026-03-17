export interface SpotifyUserProfile {
    id: string;
    displayName: string;
    product: string;
    externalUrl: string | null;
}

export interface SpotifyPlaylist {
    id: string;
    name: string;
    description: string;
    imageUrl: string | null;
    externalUrl: string;
    uri: string;
    ownerName: string;
    totalTracks: number;
}

export interface SpotifyRecentTrack {
    id: string;
    name: string;
    artistNames: string;
    albumName: string;
    imageUrl: string | null;
    externalUrl: string;
    uri: string;
    playedAt: string;
}

export interface SpotifyPlaybackTrack {
    id: string;
    name: string;
    artistNames: string;
    albumName: string;
    imageUrl: string | null;
    uri: string;
}

export interface SpotifyFlashMessage {
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
}