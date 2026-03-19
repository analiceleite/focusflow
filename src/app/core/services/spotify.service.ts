import { Injectable, computed, signal } from '@angular/core';
import { environment } from 'src/environments/environment';
import {
    SpotifyFlashMessage,
    SpotifyPlaybackTrack,
    SpotifyPlaylist,
    SpotifyUserProfile,
} from '../interfaces/spotify.interface';

// ─── SDK types ────────────────────────────────────────────────────────────────

interface SpotifySdkWindow extends Window {
    Spotify?: { Player: new (o: SpotifyPlayerInitOptions) => SpotifyPlayerInstance };
    onSpotifyWebPlaybackSDKReady?: () => void;
}

interface SpotifyPlayerInitOptions {
    name: string;
    getOAuthToken: (cb: (t: string) => void) => void;
    volume?: number;
    enableMediaSession?: boolean;
}

interface SpotifyPlayerInstance {
    addListener(event: string, cb: (p?: any) => void): boolean;
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement?(): Promise<void>;
    togglePlay(): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
}

// ─── Token state ──────────────────────────────────────────────────────────────

interface TokenState {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
    scopes: string[];
}

interface TokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
}

// ─── API types ────────────────────────────────────────────────────────────────

interface SpotifyProfileResponse {
    id: string;
    display_name: string;
    product: string;
    external_urls?: { spotify?: string };
}

interface SpotifyPlaylistsResponse {
    items: Array<{
        id: string;
        name: string;
        description: string;
        images: Array<{ url: string }>;
        external_urls?: { spotify?: string };
        uri: string;
        owner?: { display_name?: string };
        tracks?: { total?: number };
    }>;
}

interface SpotifyDevicesResponse {
    devices: Array<{
        id: string;
        is_active: boolean;
        is_restricted: boolean;
        name: string;
        type: string;
    }>;
}

class SpotifyHttpError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
const SCOPES = [
    'user-read-email',
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state',
    'streaming',
];

const STORAGE_KEY = 'focusflow_spotify_token';
const VERIFIER_KEY = 'focusflow_spotify_pkce_verifier';
const STATE_KEY = 'focusflow_spotify_auth_state';
const REFRESH_GRACE_MS = 60_000;
const PLAYER_READY_TIMEOUT_MS = 8_000;
const PLAYER_SCOPE_WARNING = 'O player do Spotify não está disponível nesta sessão. Se isso persistir, reconecte sua conta uma vez.';
const HANDLED_PLAYER_ERROR = '__spotify_handled_player_error__';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SpotifyService {

    // ── Public signals ────────────────────────────────────────────────────────

    readonly profile = signal<SpotifyUserProfile | null>(null);
    readonly playlists = signal<SpotifyPlaylist[]>([]);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly flashMessage = signal<SpotifyFlashMessage | null>(null);
    readonly currentTrack = signal<SpotifyPlaybackTrack | null>(null);
    readonly isPlaying = signal(false);
    readonly activePlaylistId = signal<string | null>(null);

    /** True assim que o Web Playback SDK estiver pronto (device_id obtido). */
    readonly playerReady = signal(false);
    /** Loading usado apenas durante a inicialização do SDK na 1ª vez. */
    readonly playerLoading = signal(false);
    /** Mensagem de status do player (apenas erros relevantes ao usuário). */
    readonly playerMessage = signal<string | null>(null);

    // ── Computed ──────────────────────────────────────────────────────────────

    readonly isConfigured = computed(() => !!environment.spotify?.clientId?.trim());
    readonly isConnected = computed(() => !!this.accessToken());
    readonly isPremium = computed(() => this.profile()?.product === 'premium');

    // ── Private signals ───────────────────────────────────────────────────────

    private readonly accessToken = signal<string | null>(null);
    private readonly refreshToken = signal<string | null>(null);
    private readonly expiresAt = signal<number | null>(null);
    private readonly deviceId = signal<string | null>(null);
    private readonly grantedScopes = signal<string[]>([]);

    private player: SpotifyPlayerInstance | null = null;
    private sdkLoader: Promise<void> | null = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        if (!this.isConfigured()) return;
        if (!this.restoreSession()) return;

        try {
            await this.loadProfile();
            await this.loadPlaylists();
            void this.bootstrapPlayer();
        } catch {
            this.clearSession(false);
        }
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    async connect(): Promise<void> {
        if (!this.isConfigured()) throw new Error('Configure o clientId do Spotify.');

        const verifier = this.randomString(64);
        const state = this.randomString(24);
        const challenge = await this.pkceChallenge(verifier);
        const redirectUri = this.redirectUri();

        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(STATE_KEY, state);

        const params = new URLSearchParams({
            client_id: environment.spotify.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            state,
            scope: SCOPES.join(' '),
            show_dialog: 'true',
        });

        globalThis.location.assign(`${AUTH_URL}?${params}`);
    }

    async handleAuthCallback(code: string | null, state: string | null, authError: string | null): Promise<void> {
        if (authError || !code) throw new Error('Autenticação cancelada ou inválida.');

        const savedState = sessionStorage.getItem(STATE_KEY);
        const verifier = sessionStorage.getItem(VERIFIER_KEY);
        if (!savedState || !verifier || state !== savedState) throw new Error('Estado PKCE inválido.');

        this.loading.set(true);
        try {
            const tokens = await this.fetchTokens(new URLSearchParams({
                client_id: environment.spotify.clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri(),
                code_verifier: verifier,
            }));
            const scopes = this.resolveScopes(tokens, SCOPES);
            this.assertRequiredScopes(scopes);
            this.persistTokens(tokens, undefined, scopes);
            await this.loadProfile();
            await this.loadPlaylists();
            this.playerMessage.set(null);
            await this.bootstrapPlayer();
            this.flashMessage.set({ type: 'success', message: 'Spotify conectado.' });
        } finally {
            sessionStorage.removeItem(VERIFIER_KEY);
            sessionStorage.removeItem(STATE_KEY);
            this.loading.set(false);
        }
    }

    disconnect(): void {
        this.player?.disconnect();
        this.player = null;
        this.clearSession();
    }

    consumeFlashMessage(): SpotifyFlashMessage | null {
        const msg = this.flashMessage();
        if (msg) this.flashMessage.set(null);
        return msg;
    }

    isHandledPlayerError(error: unknown): boolean {
        return error instanceof Error && error.message === HANDLED_PLAYER_ERROR;
    }

    // ── Library ───────────────────────────────────────────────────────────────

    async refreshLibrary(): Promise<void> {
        if (!this.isConnected()) return;
        this.loading.set(true);
        this.error.set(null);
        try {
            await this.loadPlaylists();
        } catch (e) {
            this.error.set(e instanceof Error ? e.message : 'Erro ao carregar playlists.');
        } finally {
            this.loading.set(false);
        }
    }

    // ── Playback ──────────────────────────────────────────────────────────────

    /**
     * Toca uma playlist. Inicializa o SDK automaticamente se Premium.
     * Fallback: abre no Spotify externo.
     */
    async playPlaylist(playlist: SpotifyPlaylist): Promise<void> {
        if (!this.isPremium()) {
            this.activePlaylistId.set(playlist.id);
            this.openExternal(playlist.externalUrl);
            return;
        }

        this.playerMessage.set(null);
        this.error.set(null);
        this.activePlaylistId.set(playlist.id);

        try {
            this.playerMessage.set('Ativando player...');
            await this.ensurePlayer();
            await this.transferPlayback(false);
            this.playerMessage.set('Iniciando playlist...');
            await this.startPlayback({ context_uri: playlist.uri });
            this.playerMessage.set(null);
        } catch (error) {
            if (this.isHandledPlayerError(error)) {
                return;
            }
            const message = error instanceof Error
                ? error.message
                : 'Não foi possível ativar o player do Spotify nesta tentativa.';
            this.playerMessage.set(message);
            this.error.set(null);
            throw error instanceof Error ? error : new Error(message);
        }
    }

    async togglePlayback(): Promise<void> {
        if (!this.activePlaylistId() || !this.currentTrack()) {
            const firstPlaylist = this.playlists()[0];
            if (firstPlaylist) {
                await this.playPlaylist(firstPlaylist);
            }
            return;
        }

        if (!this.playerReady() || !this.player) return;
        await this.player.togglePlay();
    }

    async activatePlayerElement(): Promise<void> {
        if (!this.player) return;
        await this.player.activateElement?.();
    }

    async nextTrack(): Promise<void> {
        if (!this.playerReady() || !this.player) return;
        await this.player.nextTrack();
    }

    async previousTrack(): Promise<void> {
        if (!this.playerReady() || !this.player) return;
        await this.player.previousTrack();
    }

    openExternal(url: string): void {
        globalThis.open(url, '_blank', 'noopener,noreferrer');
    }

    private async bootstrapPlayer(): Promise<void> {
        if (!this.isPremium() || !this.isConnected()) return;

        this.playerLoading.set(true);
        try {
            this.playerMessage.set('Preparando player do Spotify...');
            await this.preparePlayer();
            if (this.playerReady()) {
                this.playerMessage.set(null);
            } else {
                this.playerMessage.set('Player preparado, aguardando ficar pronto.');
            }
        } catch (error) {
            if (!this.isHandledPlayerError(error)) {
                this.playerMessage.set(error instanceof Error ? error.message : 'Falha ao preparar o player.');
            }
        } finally {
            this.playerLoading.set(false);
        }
    }

    private async ensurePlayer(): Promise<void> {
        if (!this.hasAllScopes(SCOPES)) {
            this.handlePlayerScopeIssue();
            throw new Error(HANDLED_PLAYER_ERROR);
        }

        if (this.playerReady() && this.player) {
            this.playerMessage.set('Ativando elemento de áudio...');
            await this.player.activateElement?.();
            return;
        }

        await this.preparePlayer();
        this.playerMessage.set('Ativando elemento de áudio...');
        await this.player?.activateElement?.();
    }

    private async preparePlayer(): Promise<void> {
        if (this.playerReady() && this.player) {
            return;
        }

        this.playerMessage.set('Carregando SDK do Spotify...');
        await this.loadSdk();
        this.playerMessage.set('Conectando player do Spotify...');
        await this.initPlayer();
        this.playerMessage.set('Aguardando device ficar pronto...');
        await this.waitForPlayerReady();
    }

    private async loadSdk(): Promise<void> {
        const win = globalThis as unknown as SpotifySdkWindow;
        if (win.Spotify?.Player) return;

        this.sdkLoader ??= new Promise<void>((resolve, reject) => {
            const existing = document.getElementById('spotify-sdk') as HTMLScriptElement | null;
            if (existing) {
                if (win.Spotify?.Player) {
                    resolve();
                } else {
                    win.onSpotifyWebPlaybackSDKReady = resolve;
                }
                existing.onerror = () => reject(new Error('Falha ao carregar SDK.'));
                return;
            }

            const s = document.createElement('script');
            s.id = 'spotify-sdk';
            s.src = 'https://sdk.scdn.co/spotify-player.js';
            s.async = true;
            s.onerror = () => reject(new Error('Falha ao carregar SDK.'));
            win.onSpotifyWebPlaybackSDKReady = resolve;
            document.body.appendChild(s);
        });

        await this.sdkLoader;
    }

    private async initPlayer(): Promise<void> {
        if (this.player) {
            if (!this.playerReady()) {
                const ok = await this.player.connect();
                if (!ok) throw new Error('Reconexão falhou.');
            }
            return;
        }

        const win = globalThis as unknown as SpotifySdkWindow;
        const Sdk = win.Spotify;
        if (!Sdk?.Player) throw new Error('SDK indisponível.');

        this.player = new Sdk.Player({
            name: 'FocusFlow',
            getOAuthToken: cb => void this.validToken().then(t => cb(t ?? '')),
            volume: 0.8,
            enableMediaSession: true,
        });

        this.attachPlayerListeners(this.player);

        const connected = await this.player.connect();
        if (!connected) throw new Error('Não foi possível conectar o player.');
    }

    private attachPlayerListeners(p: SpotifyPlayerInstance): void {
        p.addListener('ready', ({ device_id }: { device_id: string }) => {
            this.deviceId.set(device_id);
            this.playerReady.set(true);
            this.playerMessage.set(null); // limpa mensagens de erro anteriores
        });

        p.addListener('not_ready', () => {
            this.playerReady.set(false);
            this.deviceId.set(null);
            this.playerMessage.set('O player perdeu o estado de pronto.');
        });

        p.addListener('player_state_changed', (state: any) => {
            const track = state?.track_window?.current_track;
            if (!track) return;

            this.currentTrack.set({
                id: track.id ?? '',
                name: track.name,
                artistNames: (track.artists ?? []).map((a: { name: string }) => a.name).join(', '),
                albumName: track.album?.name ?? '',
                imageUrl: track.album?.images?.[0]?.url ?? null,
                uri: track.uri,
            });
            this.isPlaying.set(!state.paused);
            // Limpa qualquer mensagem de erro/status anterior quando o player muda de estado com sucesso
            this.playerMessage.set(null);
            this.error.set(null);
        });

        p.addListener('autoplay_failed', () => {
            this.playerMessage.set('Clique em ▶ para iniciar.');
        });

        for (const evt of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
            p.addListener(evt, (payload?: { message?: string }) => {
                if (evt === 'authentication_error' && this.isScopeAuthenticationError(payload?.message)) {
                    this.handlePlayerScopeIssue();
                    return;
                }

                const msg = evt === 'authentication_error'
                    ? this.authenticationErrorMessage(payload?.message)
                    : payload?.message ?? 'Erro no player.';
                this.playerMessage.set(msg);
                if (evt !== 'playback_error') {
                    this.flashMessage.set({ type: 'error', message: msg });
                }
            });
        }
    }

    // ── Playback helpers ──────────────────────────────────────────────────────

    private async transferPlayback(play: boolean): Promise<void> {
        await this.runWithDeviceRetry(async id => {
            await this.put('/me/player', { device_ids: [id], play });
        });
    }

    private async startPlayback(body: Record<string, unknown>): Promise<void> {
        await this.runWithDeviceRetry(async id => {
            await this.put(`/me/player/play?device_id=${encodeURIComponent(id)}`, body);
        });
    }

    private async runWithDeviceRetry(operation: (deviceId: string) => Promise<void>, attempts = 3): Promise<void> {
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            const id = await this.ensureUsableDeviceId();
            try {
                await operation(id);
                return;
            } catch (error) {
                lastError = error;
                if (!this.isDeviceUnavailableError(error) || attempt === attempts) {
                    throw error;
                }

                this.playerMessage.set('Sincronizando device do Spotify...');
                await this.player?.activateElement?.();
                await this.waitForPlayerReady();
                await this.waitForDeviceAvailable(this.deviceId(), 6_000);
            }
        }

        if (lastError instanceof Error) {
            throw lastError;
        }
        throw new Error('Não foi possível sincronizar o device do Spotify.');
    }

    private async ensureUsableDeviceId(): Promise<string> {
        const id = this.deviceId();
        if (!id) throw new Error('Device não pronto.');

        await this.waitForDeviceAvailable(id, 6_000);
        return id;
    }

    private async waitForDeviceAvailable(expectedId: string | null, timeoutMs: number): Promise<void> {
        if (!expectedId) {
            throw new Error('Device não pronto.');
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const devices = await this.get<SpotifyDevicesResponse>('/me/player/devices');
            const exists = devices.devices.some(device => device.id === expectedId && !device.is_restricted);
            if (exists) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        throw new Error('Device do Spotify não ficou disponível a tempo. Verifique se o player está ativo neste navegador.');
    }

    private isDeviceUnavailableError(error: unknown): boolean {
        const status = error instanceof SpotifyHttpError ? error.status : null;
        const message = error instanceof Error ? error.message.toLowerCase() : '';

        if (status === 404) {
            return true;
        }

        return message.includes('no active device')
            || message.includes('device not found')
            || message.includes('device não')
            || message.includes('device nao');
    }

    // ── API helpers ───────────────────────────────────────────────────────────

    private async loadProfile(): Promise<void> {
        const p = await this.get<SpotifyProfileResponse>('/me');
        this.profile.set({
            id: p.id,
            displayName: p.display_name,
            product: p.product,
            externalUrl: p.external_urls?.spotify ?? null,
        });
    }

    private async loadPlaylists(): Promise<void> {
        const r = await this.get<SpotifyPlaylistsResponse>('/me/playlists', { limit: 5 });
        const playlists =
            r.items
                .filter(i => !!i.external_urls?.spotify)
                .map(i => ({
                    id: i.id,
                    name: i.name,
                    description: i.description || '',
                    imageUrl: i.images?.[0]?.url ?? null,
                    externalUrl: i.external_urls?.spotify ?? '',
                    uri: i.uri,
                    ownerName: i.owner?.display_name ?? 'Spotify',
                    totalTracks: i.tracks?.total ?? 0,
                }))
                .filter(i => !!i.externalUrl);

        this.playlists.set(playlists);

        if (!playlists.some(playlist => playlist.id === this.activePlaylistId())) {
            this.activePlaylistId.set(null);
        }
    }

    private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
        const token = await this.validToken();
        if (!token) throw new Error('Não conectado.');

        const url = new URL(`${API_URL}${path}`);
        Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));

        const headers = { Authorization: `Bearer ${token}` };
        let res = await fetch(url.toString(), { headers });

        if (res.status === 401 && this.refreshToken()) {
            await this.doRefresh();
            res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${this.accessToken()}` } });
        }

        if (!res.ok) {
            const message = await this.apiError(res);
            throw new SpotifyHttpError(res.status, message);
        }
        return res.json() as Promise<T>;
    }

    private async put(path: string, body?: Record<string, unknown>): Promise<void> {
        const token = await this.validToken();
        if (!token) throw new Error('Não conectado.');

        const opts = {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        };

        let res = await fetch(`${API_URL}${path}`, opts);

        if (res.status === 401 && this.refreshToken()) {
            await this.doRefresh();
            res = await fetch(`${API_URL}${path}`, {
                ...opts,
                headers: { ...opts.headers, Authorization: `Bearer ${this.accessToken()}` },
            });
        }

        if (!res.ok) {
            const message = await this.apiError(res);
            throw new SpotifyHttpError(res.status, message);
        }
    }

    // ── Token management ──────────────────────────────────────────────────────

    private async validToken(): Promise<string | null> {
        const token = this.accessToken();
        if (!token) return null;

        const exp = this.expiresAt();
        if (!exp || Date.now() < exp - REFRESH_GRACE_MS) return token;
        if (!this.refreshToken()) { this.clearSession(false); return null; }

        await this.doRefresh();
        return this.accessToken();
    }

    private async doRefresh(): Promise<void> {
        const rt = this.refreshToken();
        if (!rt) throw new Error('Sessão expirada.');

        const tokens = await this.fetchTokens(new URLSearchParams({
            client_id: environment.spotify.clientId,
            grant_type: 'refresh_token',
            refresh_token: rt,
        }));

        const scopes = this.resolveScopes(tokens, this.grantedScopes());
        this.assertRequiredScopes(scopes);
        this.persistTokens(tokens, rt, scopes);
    }

    private async fetchTokens(body: URLSearchParams): Promise<TokenResponse> {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        if (!res.ok) {
            const p = await res.json().catch(() => ({})) as { error_description?: string };
            throw new Error(p.error_description ?? 'Falha na autenticação.');
        }

        return res.json() as Promise<TokenResponse>;
    }

    private persistTokens(t: TokenResponse, fallbackRt?: string | null, resolvedScopes?: string[]): void {
        const scopes = resolvedScopes ?? this.resolveScopes(t, this.grantedScopes());
        const state: TokenState = {
            accessToken: t.access_token,
            refreshToken: t.refresh_token ?? fallbackRt ?? null,
            expiresAt: Date.now() + t.expires_in * 1000,
            scopes,
        };
        this.accessToken.set(state.accessToken);
        this.refreshToken.set(state.refreshToken);
        this.expiresAt.set(state.expiresAt);
        this.grantedScopes.set(scopes);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    private restoreSession(): boolean {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const s = JSON.parse(raw) as TokenState;
            const scopes = Array.isArray(s.scopes) ? s.scopes : [];
            if (!this.hasAllScopes(SCOPES, scopes)) {
                localStorage.removeItem(STORAGE_KEY);
                return false;
            }
            this.accessToken.set(s.accessToken);
            this.refreshToken.set(s.refreshToken);
            this.expiresAt.set(s.expiresAt);
            this.grantedScopes.set(scopes);
            return true;
        } catch {
            return false;
        }
    }

    private clearSession(resetFlash = true): void {
        this.player = null;
        this.playerReady.set(false);
        this.playerLoading.set(false);
        this.playerMessage.set(null);
        this.currentTrack.set(null);
        this.isPlaying.set(false);
        this.activePlaylistId.set(null);
        this.deviceId.set(null);
        this.accessToken.set(null);
        this.refreshToken.set(null);
        this.expiresAt.set(null);
        this.grantedScopes.set([]);
        this.profile.set(null);
        this.playlists.set([]);
        this.error.set(null);
        localStorage.removeItem(STORAGE_KEY);
        if (resetFlash) this.flashMessage.set({ type: 'info', message: 'Spotify desconectado.' });
    }

    // ── Misc helpers ──────────────────────────────────────────────────────────

    private async apiError(res: Response): Promise<string> {
        if (res.status === 401) return 'Sessão expirada.';
        if (res.status === 403) return 'Operação não permitida.';
        if (res.status === 404) return 'Device do Spotify não encontrado no momento.';
        if (res.status === 429) return 'Muitas requisições. Tente em instantes.';
        try {
            const p = await res.json() as { error?: { message?: string } };
            return p.error?.message ?? 'Erro no Spotify.';
        } catch {
            return 'Erro no Spotify.';
        }
    }

    private redirectUri(): string {
        return environment.spotify?.redirectUri?.trim()
            || `${globalThis.location.origin}/auth/spotify/callback`;
    }

    private resolveScopes(tokens: TokenResponse, fallback: string[]): string[] {
        return tokens.scope?.split(' ').filter(Boolean) ?? fallback;
    }

    private assertRequiredScopes(scopes: string[]): void {
        if (!this.hasAllScopes(SCOPES, scopes)) {
            throw new Error('O Spotify não concedeu as permissões do player. Conecte novamente para autorizar o player uma única vez.');
        }
    }

    private authenticationErrorMessage(originalMessage?: string): string {
        if (!this.hasAllScopes(SCOPES)) {
            return 'Reconecte sua conta Spotify para conceder as permissões do player.';
        }

        return originalMessage?.trim()
            || 'Não foi possível autenticar o player do Spotify agora. Tente novamente em instantes.';
    }

    private isScopeAuthenticationError(message?: string): boolean {
        const normalized = message?.toLowerCase() ?? '';
        return normalized.includes('scope') || normalized.includes('scopes') || normalized.includes('403');
    }

    private handlePlayerScopeIssue(): void {
        this.player?.disconnect();
        this.player = null;
        this.playerReady.set(false);
        this.playerLoading.set(false);
        this.deviceId.set(null);
        const msg = PLAYER_SCOPE_WARNING;
        this.playerMessage.set(msg);
    }

    private async waitForPlayerReady(timeoutMs = PLAYER_READY_TIMEOUT_MS): Promise<void> {
        if (this.playerReady() && this.deviceId()) {
            return;
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (this.playerReady() && this.deviceId()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error('O player do Spotify ainda não ficou pronto. Tente tocar novamente em instantes.');
    }

    private hasAllScopes(required: string[], candidate = this.grantedScopes()): boolean {
        return required.every(scope => candidate.includes(scope));
    }

    private randomString(len: number): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(crypto.getRandomValues(new Uint8Array(len)), v => chars[v % chars.length]).join('');
    }

    private async pkceChallenge(verifier: string): Promise<string> {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        let out = '';
        new Uint8Array(digest).forEach(v => (out += String.fromCodePoint(v)));
        return btoa(out).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    }
}