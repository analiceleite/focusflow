import { Injectable, signal, computed, inject } from '@angular/core';
import { Firestore, doc, onSnapshot, setDoc, updateDoc, deleteDoc, Unsubscribe } from '@angular/fire/firestore';
import { serverTimestamp, Timestamp } from '@angular/fire/firestore';
import { FirebaseError } from 'firebase/app';

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
  updatedBy: string;
  timerState: {
    mode: TimerMode;
    totalSeconds: number;
  };
  paused: boolean;
  remaining: number;
  elapsed: number;
  // Activity info
  activityId: string | null;
  activityName: string | null;
  activityIcon: string | null;
  activityColor: string | null;
  lastUpdated: Timestamp;
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private readonly TIMER_STATE_KEY = 'focusflow_timer_state';
  private readonly DEVICE_ID_KEY = 'focusflow_device_id';

  private firestore = inject(Firestore);

  // Signals
  readonly mode = signal<TimerMode>('pomodoro');
  readonly state = signal<TimerState>('idle');
  readonly totalSeconds = signal(25 * 60); // Pomodoro default
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
    const secs = this.mode() === 'pomodoro'
      ? this.remaining()
      : this.elapsedSeconds();
    return this.formatTime(secs);
  });

  // Multi-device sync signals
  readonly activeDeviceId = signal<string | null>(null);
  readonly syncedActivity = signal<{ id: string | null; name: string | null; icon: string | null; color: string | null } | null>(null);
  readonly isSyncing = signal(false);
  readonly syncError = signal<string | null>(null);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimestamp: number = 0;
  private deviceId: string = '';
  private firestoreUnsubscribe: Unsubscribe | null = null;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SYNC_DEBOUNCE_MS = 500;

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
    this.startTimer(); // Usar método privado para evitar duplicação
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
    } catch (error) {
      console.warn('Erro ao salvar estado do timer:', error);
    }
  }

  private restoreState(): void {
    try {
      const saved = localStorage.getItem(this.TIMER_STATE_KEY);
      if (!saved) return;

      const stateData: TimerStateData = JSON.parse(saved);

      // Restaurar estados básicos
      this.mode.set(stateData.mode);
      this.totalSeconds.set(stateData.totalSeconds);
      this.elapsedSeconds.set(stateData.elapsedSeconds);
      this.startTimestamp = stateData.startTimestamp;

      // Se estava rodando, verificar se ainda é válido e continuar
      if (stateData.state === 'running') {
        const timeSinceLastUpdate = Date.now() - this.startTimestamp;
        const currentElapsed = Math.floor(timeSinceLastUpdate / 1000);

        // Verificar se ainda está dentro dos limites válidos
        if (stateData.mode === 'pomodoro' && currentElapsed >= stateData.totalSeconds) {
          // Timer já terminou enquanto estava fora
          this.elapsedSeconds.set(stateData.totalSeconds);
          this.state.set('finished');
        } else {
          // Continuar de onde parou
          this.elapsedSeconds.set(currentElapsed);
          this.state.set('running');
          this.startTimer(); // Reiniciar o interval
        }
      } else {
        // Restaurar outros estados (paused, finished, idle)
        this.state.set(stateData.state);
      }

      console.log('Estado do timer restaurado:', stateData);
    } catch (error) {
      console.warn('Erro ao restaurar estado do timer:', error);
      // Em caso de erro, manter estado padrão
    }
  }

  private startTimer(): void {
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

  // ── Multi-device Sync Methods ─────────────────────────────────────────────────

  /**
   * Gera e retorna deviceId único para este navegador/sessão
   * Armazenado em sessionStorage para duração da sessão
   */
  getDeviceId(): string {
    if (this.deviceId) return this.deviceId;

    // Tentar recuperar de sessionStorage
    let stored = sessionStorage.getItem(this.DEVICE_ID_KEY);
    if (stored) {
      this.deviceId = stored;
      return this.deviceId;
    }

    // Gerar novo deviceId usando uuid4-like logic
    this.deviceId = this.generateUUID();
    sessionStorage.setItem(this.DEVICE_ID_KEY, this.deviceId);
    return this.deviceId;
  }

  /**
   * Verifica se este device pode iniciar um novo timer
   * Retorna false se outro device já tem um timer ativo
   */
  canStartTimer(): boolean {
    const activeDevId = this.activeDeviceId();
    // Pode iniciar se não há device ativo ou se o device ativo é este mesmo
    return !activeDevId || activeDevId === this.deviceId;
  }

  /**
   * Inicia listener Firestore realtime para sincronização de timer
   * Deve ser chamado após autenticação bem-sucedida
   */
  syncFromFirestore(userId: string): void {
    if (!userId) return;

    this.deviceId = this.getDeviceId();

    // Unsubscribe do listener anterior se houver
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
    }

    try {
      const docRef = doc(this.firestore, 'timerSessions', userId);

      this.firestoreUnsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            // Não há timer sincronizado, resetar tudo
            this.activeDeviceId.set(null);
            this.syncedActivity.set(null);
            this.syncError.set(null);
            // Parar timer em todos os devices quando é descartado em qualquer um
            this.clearInterval();
            this.elapsedSeconds.set(0);
            this.state.set('idle');
            this.saveState();
            return;
          }

          const data = snapshot.data() as TimerSyncData;

          // Atualizar activeDeviceId para controlar UI (disable/enable botões)
          this.activeDeviceId.set(data.initiatedBy);

          // Sincronizar atividade
          this.syncedActivity.set({
            id: data.activityId ?? null,
            name: data.activityName ?? null,
            icon: data.activityIcon ?? null,
            color: data.activityColor ?? null
          });

          // Aplicar estado remoto em todos os devices (inclui o iniciador) para
          // garantir pausa/retomada imediata entre abas e dispositivos.
          this.mode.set(data.timerState.mode);
          this.totalSeconds.set(data.timerState.totalSeconds);
          this.elapsedSeconds.set(data.elapsed);

          if (data.paused) {
            this.clearInterval();
            this.state.set('paused');
          } else {
            this.startTimestamp = Date.now() - data.elapsed * 1000;
            this.state.set('running');
            this.startTimer();
          }

          this.saveState();

          this.syncError.set(null);
        },
        (error) => {
          console.error('Erro ao sincronizar timer:', error);
          this.syncError.set(error.message);
        }
      );
    } catch (error) {
      console.error('Erro ao iniciar listener Firestore:', error);
      this.syncError.set(error instanceof Error ? error.message : 'Erro de sincronização');
    }
  }

  /**
   * Para o listener Firestore (deve ser chamado ao logout)
   */
  stopSync(): void {
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }
    this.activeDeviceId.set(null);
    this.syncError.set(null);
  }

  /**
   * Publica estado do timer para Firestore
   * Action: 'create' (iniciar), 'update' (pausar/parar), 'delete' (finalizar)
   * activity: dados da atividade atual (opcional)
   */
  async publishTimerToFirestore(
    userId: string,
    action: 'create' | 'update' | 'delete',
    activity?: { id: string; name: string; icon: string; color: string } | null
  ): Promise<void> {
    if (!userId) return;

    // Garante deviceId sempre disponível para publicar sem delay/race no primeiro start.
    if (!this.deviceId) {
      this.deviceId = this.getDeviceId();
    }

    try {
      this.isSyncing.set(true);
      const docRef = doc(this.firestore, 'timerSessions', userId);

      if (action === 'create') {
        // Criar novo documento com initiatedBy = deviceId
        const syncData: TimerSyncData = {
          userId,
          initiatedBy: this.deviceId,
          updatedBy: this.deviceId,
          timerState: {
            mode: this.mode(),
            totalSeconds: this.totalSeconds()
          },
          paused: false,
          remaining: this.remaining(),
          elapsed: this.elapsedSeconds(),
          activityId: activity?.id ?? null,
          activityName: activity?.name ?? null,
          activityIcon: activity?.icon ?? null,
          activityColor: activity?.color ?? null,
          lastUpdated: serverTimestamp() as Timestamp
        };

        await setDoc(docRef, syncData);
      } else if (action === 'update') {
        // Atualizar apenas campos mutáveis
        const updateData: Partial<TimerSyncData> = {
          updatedBy: this.deviceId,
          paused: this.state() === 'paused',
          remaining: this.remaining(),
          elapsed: this.elapsedSeconds(),
          activityId: activity?.id ?? null,
          activityName: activity?.name ?? null,
          activityIcon: activity?.icon ?? null,
          activityColor: activity?.color ?? null,
          lastUpdated: serverTimestamp() as Timestamp
        };

        try {
          await updateDoc(docRef, updateData);
        } catch (error) {
          // Se o documento ainda não existir, cria um estado inicial para não quebrar o sync.
          const fbError = error as FirebaseError;
          if (fbError?.code === 'not-found') {
            const fallbackData: TimerSyncData = {
              userId,
              initiatedBy: this.activeDeviceId() ?? this.deviceId,
              updatedBy: this.deviceId,
              timerState: {
                mode: this.mode(),
                totalSeconds: this.totalSeconds()
              },
              paused: this.state() === 'paused',
              remaining: this.remaining(),
              elapsed: this.elapsedSeconds(),
              activityId: activity?.id ?? null,
              activityName: activity?.name ?? null,
              activityIcon: activity?.icon ?? null,
              activityColor: activity?.color ?? null,
              lastUpdated: serverTimestamp() as Timestamp
            };
            await setDoc(docRef, fallbackData, { merge: true });
          } else {
            throw error;
          }
        }
      } else if (action === 'delete') {
        // Deletar documento (apenas quem iniciou pode fazer via rules)
        await deleteDoc(docRef);
      }

      this.syncError.set(null);
    } catch (error) {
      console.error('Erro ao publicar timer no Firestore:', error);
      this.syncError.set(error instanceof Error ? error.message : 'Erro ao sincronizar');
      throw error;
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Publica timer com debounce para evitar escritas excessivas
   */
  async publishTimerWithDebounce(userId: string, action: 'update'): Promise<void> {
    if (!userId) return;

    // Limpar timer anterior
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    // Agendar publicação com debounce
    this.syncDebounceTimer = setTimeout(() => {
      this.publishTimerToFirestore(userId, action).catch(err => {
        console.error('Erro ao sincronizar com debounce:', err);
      });
    }, this.SYNC_DEBOUNCE_MS);
  }

  /**
   * Gera um UUID v4-like string para deviceId
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
