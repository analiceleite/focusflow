import { Injectable, signal, computed } from '@angular/core';

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

interface TimerStateData {
  mode: TimerMode;
  state: TimerState;
  totalSeconds: number;
  elapsedSeconds: number;
  startTimestamp: number;
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private readonly TIMER_STATE_KEY = 'focusflow_timer_state';

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

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimestamp: number = 0;

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
