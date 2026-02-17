import { Injectable, signal, computed } from '@angular/core';

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

@Injectable({ providedIn: 'root' })
export class TimerService {
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

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTimestamp: number = 0;

  setMode(mode: TimerMode): void {
    this.stop();
    this.mode.set(mode);
    this.reset();
  }

  setPomodoroDuration(minutes: number): void {
    this.totalSeconds.set(minutes * 60);
    this.reset();
  }

  start(): void {
    if (this.state() === 'running') return;
    this.startTimestamp = Date.now() - this.elapsedSeconds() * 1000;
    this.state.set('running');

    this.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTimestamp) / 1000);
      this.elapsedSeconds.set(elapsed);

      if (this.mode() === 'pomodoro' && elapsed >= this.totalSeconds()) {
        this.elapsedSeconds.set(this.totalSeconds());
        this.finish();
      }
    }, 250);
  }

  pause(): void {
    if (this.state() !== 'running') return;
    this.clearInterval();
    this.state.set('paused');
  }

  resume(): void {
    if (this.state() !== 'paused') return;
    this.start();
  }

  stop(): void {
    this.clearInterval();
    this.state.set('idle');
  }

  reset(): void {
    this.clearInterval();
    this.elapsedSeconds.set(0);
    this.state.set('idle');
  }

  private finish(): void {
    this.clearInterval();
    this.state.set('finished');
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
    } catch {}
  }
}
