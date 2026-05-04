import { Injectable, signal, computed, inject } from '@angular/core';
import { Firestore, doc, onSnapshot, setDoc, deleteDoc, Unsubscribe } from '@angular/fire/firestore';
import { serverTimestamp, Timestamp } from '@angular/fire/firestore';

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

interface TimerStateData {
  mode: TimerMode;
  state: TimerState;
  totalSeconds: number;
  elapsedSeconds: number;
  startTimestamp: number;
}

interface TimerSyncData {
  userId: string;
  initiatedBy: string;
  mode: TimerMode;
  totalSeconds: number;
  startedAtMs: number;
  elapsed: number;
  paused: boolean;
  activityId: string | null;
  activityName: string | null;
  activityIcon: string | null;
  activityColor: string | null;
  updatedAt: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private readonly TIMER_STATE_KEY = 'focusflow_timer_state';
  private readonly DEVICE_ID_KEY = 'focusflow_device_id';

  private firestore = inject(Firestore);

  // Signals
  readonly mode = signal<TimerMode>('pomodoro');
  readonly state = signal<TimerState>('idle');
  readonly totalSeconds = signal(25 * 60);
  readonly elapsedSeconds = signal(0);

  readonly remaining = computed(() =>
    this.mode() === 'pomodoro'
      ? this.totalSeconds() - this.elapsedSeconds()
      : this.elapsedSeconds()
  );

  readonly progress = computed(() =>
    this.mode() === 'pomodoro'
      ? this.elapsedSeconds() / this.totalSeconds()
      : 0
  );

  readonly formattedTime = computed(() => {
    const secs = this.mode() === 'pomodoro' ? this.remaining() : this.elapsedSeconds();
    return this.formatTime(secs);
  });

  // Sync signals — populated from Firestore listener
  readonly activeDeviceId = signal<string | null>(null);
  readonly syncedActivity = signal<{ id: string | null; name: string | null; icon: string | null; color: string | null } | null>(null);
  // Dados brutos da sessão remota (para o device observador poder salvar)
  readonly remoteSession = signal<{
    mode: TimerMode;
    totalSeconds: number;
    startedAtMs: number;
    elapsed: number;
    paused: boolean;
  } | null>(null);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimestamp: number = 0;
  private deviceId: string = '';
  private firestoreUnsubscribe: Unsubscribe | null = null;

  constructor() {
    this.restoreState();
  }

  setMode(mode: TimerMode): void {
    this.stop();
    this.mode.set(mode);
    this.reset();
    this.saveState();
  }

  setPomodoroDuration(minutes: number): void {
    this.totalSeconds.set(minutes * 60);
    this.reset();
    this.saveState();
  }

  start(): void {
    if (this.state() === 'running') return;
    this.startTimestamp = Date.now() - this.elapsedSeconds() * 1000;
    this.state.set('running');
    this.saveState();
    this.startInterval();
  }

  pause(): void {
    if (this.state() !== 'running') return;
    this.clearInterval();
    this.state.set('paused');
    this.saveState();
  }

  resume(): void {
    if (this.state() !== 'paused') return;
    this.start();
  }

  stop(): void {
    this.clearInterval();
    this.state.set('idle');
    this.saveState();
  }

  reset(): void {
    this.clearInterval();
    this.elapsedSeconds.set(0);
    this.state.set('idle');
    this.saveState();
  }

  private finish(): void {
    this.clearInterval();
    this.state.set('finished');
    this.saveState();
    this.playNotificationSound();
  }

  private clearInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private startInterval(): void {
    if (this.intervalId) this.clearInterval();

    this.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTimestamp) / 1000);
      this.elapsedSeconds.set(elapsed);
      this.saveState();

      if (this.mode() === 'pomodoro' && elapsed >= this.totalSeconds()) {
        this.elapsedSeconds.set(this.totalSeconds());
        this.finish();
      }
    }, 250);
  }

  // ── Multi-device Sync ─────────────────────────────────────────────────────

  getDeviceId(): string {
    if (this.deviceId) return this.deviceId;
    const stored = sessionStorage.getItem(this.DEVICE_ID_KEY);
    if (stored) { this.deviceId = stored; return this.deviceId; }
    this.deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    sessionStorage.setItem(this.DEVICE_ID_KEY, this.deviceId);
    return this.deviceId;
  }

  /** Retorna false apenas quando há sessão de OUTRO dispositivo ativa no Firestore */
  canStartTimer(): boolean {
    const active = this.activeDeviceId();
    return !active || active === this.getDeviceId();
  }

  syncFromFirestore(userId: string): void {
    if (!userId) return;
    this.deviceId = this.getDeviceId();
    if (this.firestoreUnsubscribe) this.firestoreUnsubscribe();

    const docRef = doc(this.firestore, 'timerSessions', userId);
    this.firestoreUnsubscribe = onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        // Cache local pode emitir "missing" transitório — ignorar se timer local ativo
        if (snapshot.metadata.fromCache && (this.state() === 'running' || this.state() === 'paused')) return;

        // Documento deletado: sessão encerrada (por qualquer dispositivo)
        this.activeDeviceId.set(null);
        this.syncedActivity.set(null);
        this.remoteSession.set(null);
        return;
      }

      const data = snapshot.data() as TimerSyncData;
      this.activeDeviceId.set(data.initiatedBy);
      this.syncedActivity.set({
        id: data.activityId,
        name: data.activityName,
        icon: data.activityIcon,
        color: data.activityColor,
      });

      // Se este dispositivo iniciou a sessão, não sobrescrever o timer local
      if (data.initiatedBy === this.deviceId) return;

      // Dispositivo observador: apenas armazena dados da sessão remota para permitir save.
      // NÃO espelha nem inicia timer localmente.
      this.remoteSession.set({
        mode: data.mode,
        totalSeconds: data.totalSeconds,
        startedAtMs: data.startedAtMs,
        elapsed: data.elapsed,
        paused: data.paused,
      });
    });
  }

  stopSync(): void {
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }
    this.activeDeviceId.set(null);
    this.syncedActivity.set(null);
    this.remoteSession.set(null);
  }

  /** Calcula o elapsed real da sessão remota no momento da chamada */
  getRemoteElapsedNow(): number {
    const rs = this.remoteSession();
    if (!rs) return 0;
    if (rs.paused) return rs.elapsed;
    const elapsed = Math.floor((Date.now() - rs.startedAtMs) / 1000);
    return rs.mode === 'pomodoro'
      ? Math.max(0, Math.min(elapsed, rs.totalSeconds))
      : Math.max(0, elapsed);
  }

  /**
   * Publica o estado do timer no Firestore.
   * 'create' e 'update' fazem setDoc (sobrescreve). 'delete' remove o documento.
   */
  async publishTimerToFirestore(
    userId: string,
    action: 'create' | 'update' | 'delete',
    activity?: { id: string; name: string; icon: string; color: string } | null
  ): Promise<void> {
    if (!userId) return;
    if (!this.deviceId) this.deviceId = this.getDeviceId();

    const docRef = doc(this.firestore, 'timerSessions', userId);

    if (action === 'delete') {
      await deleteDoc(docRef);
      return;
    }

    const syncData: TimerSyncData = {
      userId,
      initiatedBy: this.deviceId,
      mode: this.mode(),
      totalSeconds: this.totalSeconds(),
      startedAtMs: this.startTimestamp,
      elapsed: this.elapsedSeconds(),
      paused: this.state() === 'paused',
      activityId: activity?.id ?? null,
      activityName: activity?.name ?? null,
      activityIcon: activity?.icon ?? null,
      activityColor: activity?.color ?? null,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await setDoc(docRef, syncData);
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  private playNotificationSound(): void {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch { }
  }

  private saveState(): void {
    try {
      const stateData: TimerStateData = {
        mode: this.mode(),
        state: this.state(),
        totalSeconds: this.totalSeconds(),
        elapsedSeconds: this.elapsedSeconds(),
        startTimestamp: this.startTimestamp
      };
      localStorage.setItem(this.TIMER_STATE_KEY, JSON.stringify(stateData));
    } catch { }
  }

  private restoreState(): void {
    try {
      const saved = localStorage.getItem(this.TIMER_STATE_KEY);
      if (!saved) return;
      const stateData: TimerStateData = JSON.parse(saved);
      this.mode.set(stateData.mode);
      this.totalSeconds.set(stateData.totalSeconds);
      this.elapsedSeconds.set(stateData.elapsedSeconds);
      this.startTimestamp = stateData.startTimestamp;
      if (stateData.state === 'running') {
        const currentElapsed = Math.floor((Date.now() - this.startTimestamp) / 1000);
        if (stateData.mode === 'pomodoro' && currentElapsed >= stateData.totalSeconds) {
          this.elapsedSeconds.set(stateData.totalSeconds);
          this.state.set('finished');
        } else {
          this.elapsedSeconds.set(currentElapsed);
          this.state.set('running');
          this.startInterval();
        }
      } else {
        this.state.set(stateData.state);
      }
    } catch { }
  }
}
