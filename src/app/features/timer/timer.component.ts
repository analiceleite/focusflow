import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { NavbarComponent } from 'src/app/shared/navbar/navbar.component';
import { ToastComponent } from 'src/app/shared/toast/toast.component';
import { ThemeToggleComponent } from 'src/app/shared/theme-toggle/theme-toggle.component';
import { ToastService } from 'src/app/core/services/toast.service';

import { TimerService, TimerMode } from '../../core/services/timer.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityType, Preset, Session } from 'src/app/core/interfaces/timer.interface';
import { AuthService } from '../../core/services/auth.service';
import { PipService } from '../../core/services/pip.service';

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, ToastComponent, ThemeToggleComponent],
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
})
export class TimerComponent implements OnInit, OnDestroy {
  timerSvc = inject(TimerService);
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);
  private toastService = inject(ToastService);
  pipSvc = inject(PipService);

  activityTypes = signal<ActivityType[]>([]);
  presets = signal<Preset[]>([]);
  selectedType = signal<ActivityType | null>(null);
  allSessions = signal<Session[]>([]);

  private readonly SELECTED_ACTIVITY_KEY = 'focusflow_selected_activity';
  private readonly CYCLE_ACTIVITY_KEY = 'focusflow_cycle_activity';
  private readonly NOTIFICATION_ACK_KEY = 'focusflow_notification_ack';

  private currentCycleSaved = false;
  private lastTimerState = 'idle';
  private currentCycleActivity: ActivityType | null = null;

  private autoSaveEffect = effect(() => {
    const currentState = this.timerSvc.state();
    const availableTypes = this.activityTypes();

    if (currentState === 'finished' &&
      this.lastTimerState !== 'finished' &&
      !this.currentCycleSaved &&
      availableTypes.length > 0) {
      this.ensureValidActivityForSave(availableTypes);
      this.currentCycleSaved = true;
      this.saveCurrentSessionSilently().then((saved) => {
        this.showCompletionNotification();
        setTimeout(() => this.resetAfterCompletion(), 2000);
      });
    }
    this.lastTimerState = currentState;
  }, { allowSignalWrites: true });

  showAddType = signal(false);
  showAddPreset = signal(false);
  showSaveBanner = signal(false);
  savedDuration = signal('');
  savedActivity = signal('');

  customMinutes = 25;
  newTypeName = '';
  newTypeIcon = '📌';
  newTypeColor = '#6C63FF';
  presetMinutesInput = 25;
  presetLabel = '';

  private subs: Subscription[] = [];
  private bannerTimeout?: ReturnType<typeof setTimeout>;
  private audioContext: AudioContext | null = null;
  private audioInitialized = false;
  private wakeLock: WakeLockSentinel | null = null;
  private isAppVisible = true;
  private notificationPermissionGranted = false;

  readonly userEmail = computed(() => this.authSvc.currentUser?.email ?? '');
  readonly currentMinutes = computed(() => Math.round(this.timerSvc.totalSeconds() / 60));
  readonly ringOffset = computed(() => {
    const circumference = 2 * Math.PI * 88;
    return circumference * (1 - this.timerSvc.progress());
  });

  // ─── Helpers de data ──────────────────────────────────────────────────────

  public getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dateNDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return this.getLocalDateString(d);
  }

  private dateNMonthsAgo(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return this.getLocalDateString(d);
  }

  private getYearMonth(dateStr: string): string {
    // 'YYYY-MM-DD' → 'YYYY-MM'
    return dateStr.slice(0, 7);
  }

  // ─── Computed: estatísticas de foco ──────────────────────────────────────

  /** Hoje */
  readonly todayTotalSeconds = computed(() => {
    const today = this.getLocalDateString();
    return this.allSessions()
      .filter(s => s.date === today)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
  });

  /** Últimos 7 dias (total) */
  readonly last7TotalSeconds = computed(() => {
    const cutoff = this.dateNDaysAgo(7);
    return this.allSessions()
      .filter(s => s.date >= cutoff)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
  });

  /** Últimos 30 dias (total) */
  readonly last30TotalSeconds = computed(() => {
    const cutoff = this.dateNDaysAgo(30);
    return this.allSessions()
      .filter(s => s.date >= cutoff)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
  });

  /** Média diária — últimos 7 dias */
  readonly avgDailyLast7Seconds = computed(() =>
    Math.round(this.last7TotalSeconds() / 7)
  );

  /** Média semanal — últimas 4 semanas (28 dias) */
  readonly avgWeeklyLast4Seconds = computed(() => {
    const cutoff = this.dateNDaysAgo(28);
    const total = this.allSessions()
      .filter(s => s.date >= cutoff)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
    return Math.round(total / 4);
  });

  /** Média mensal — últimos 12 meses */
  readonly avgMonthlyLast12Seconds = computed(() => {
    const cutoff = this.dateNMonthsAgo(12);
    const total = this.allSessions()
      .filter(s => s.date >= cutoff)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
    return Math.round(total / 12);
  });

  /**
   * Sparkline diária — últimos 7 dias como array [{label, seconds}]
   * Usado para renderizar as barrinhas mini no card.
   */
  readonly dailySparkline = computed(() => {
    const map = new Map<string, number>();
    const today = new Date();
    const labels: { date: string; label: string; seconds: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = this.getLocalDateString(d);
      labels.push({
        date: dateStr,
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        seconds: 0,
      });
      map.set(dateStr, 0);
    }

    for (const s of this.allSessions()) {
      if (map.has(s.date)) map.set(s.date, (map.get(s.date) ?? 0) + s.durationSeconds);
    }

    const result = labels.map(l => ({ ...l, seconds: map.get(l.date) ?? 0 }));
    const maxSec = Math.max(...result.map(l => l.seconds), 1);
    return result.map(l => ({ ...l, percent: Math.round((l.seconds / maxSec) * 100) }));
  });

  /**
   * Sparkline semanal — últimas 4 semanas como array [{label, seconds}]
   */
  readonly weeklySparkline = computed(() => {
    const today = new Date();
    const weeks: { label: string; seconds: number; percent: number; isCurrent: boolean }[] = [];

    for (let w = 3; w >= 0; w--) {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - w * 7 - 6);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - w * 7);

      const startStr = this.getLocalDateString(startDate);
      const endStr = this.getLocalDateString(endDate);
      const weekNum = 4 - w;

      const seconds = this.allSessions()
        .filter(s => s.date >= startStr && s.date <= endStr)
        .reduce((acc, s) => acc + s.durationSeconds, 0);

      weeks.push({ label: `S${weekNum}`, seconds, percent: 0, isCurrent: w === 0 });
    }

    const maxSec = Math.max(...weeks.map(w => w.seconds), 1);
    return weeks.map(w => ({ ...w, percent: Math.round((w.seconds / maxSec) * 100) }));
  });

  /**
   * Sparkline mensal — últimos 6 meses como array [{label, seconds}]
   */
  readonly monthlySparkline = computed(() => {
    const today = new Date();
    const months: { label: string; seconds: number; percent: number; isCurrent: boolean }[] = [];

    for (let m = 5; m >= 0; m--) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

      const seconds = this.allSessions()
        .filter(s => s.date.startsWith(yearMonth))
        .reduce((acc, s) => acc + s.durationSeconds, 0);

      months.push({ label, seconds, percent: 0, isCurrent: m === 0 });
    }

    const maxSec = Math.max(...months.map(m => m.seconds), 1);
    return months.map(m => ({ ...m, percent: Math.round((m.seconds / maxSec) * 100) }));
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.sessionSvc.seedDefaultData();
    this.initializeAudioContext();
    this.setupBackgroundFeatures();

    this.subs.push(
      this.sessionSvc.getActivityTypes$().subscribe(types => {
        this.activityTypes.set(types);
        this.restoreSelectedActivity(types);
      }),
      this.sessionSvc.getPresets$().subscribe(presets => {
        this.presets.set(presets);
      }),
      this.sessionSvc.getSessions$().subscribe(sessions => {
        this.allSessions.set(sessions);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close();
    this.releaseWakeLock();
    this.removeBackgroundListeners();
  }

  // ─── Formatação pública ───────────────────────────────────────────────────

  formatDurationPublic(seconds: number): string {
    return this.formatDuration(seconds);
  }

  /** Ex.: 5400 → "1h 30min" | 3600 → "1h" | 1800 → "30min" */
  formatHours(seconds: number): string {
    if (seconds === 0) return '0min';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  }

  // ─── Timer actions ────────────────────────────────────────────────────────

  isTimerRunning(): boolean {
    const state = this.timerSvc.state();
    return state === 'running' || state === 'paused';
  }

  selectActivityType(type: ActivityType): void {
    if (this.isTimerRunning()) {
      this.toastService.warning('Não é possível trocar de atividade enquanto o timer está rodando.', 4000);
      return;
    }
    this.ensureAudioReady();
    this.selectedType.set(type);
    this.saveSelectedActivity(type);
    if (this.pipSvc.active) this.pipSvc.updateActivity(type.color, type.name);
  }

  setMode(mode: TimerMode): void {
    const currentState = this.timerSvc.state();
    if (currentState === 'running' || currentState === 'paused') {
      this.toastService.warning('Finalize o ciclo atual antes de trocar de modo.', 5000);
      return;
    }
    this.timerSvc.setMode(mode);
  }

  stopTimer(): void {
    this.currentCycleSaved = false;
    this.currentCycleActivity = null;
    this.clearCurrentCycleActivity();
    this.lastTimerState = 'idle';
    this.releaseWakeLock();
    this.timerSvc.stop();
    this.toastService.info('Timer descartado.', 2000);
  }

  startTimer(): void {
    if (!this.selectedType()) { this.toastService.warning('Selecione um tipo de atividade primeiro!'); return; }
    if (this.timerSvc.state() === 'finished') this.timerSvc.reset();
    this.ensureAudioReady();
    if (!this.notificationPermissionGranted && Notification.permission === 'default') this.requestNotificationPermission();
    this.currentCycleActivity = this.selectedType();
    this.currentCycleSaved = false;
    this.lastTimerState = 'idle';
    this.saveCurrentCycleActivity(this.currentCycleActivity!);
    if (this.pipSvc.active && this.currentCycleActivity) this.pipSvc.updateActivity(this.currentCycleActivity.color, this.currentCycleActivity.name);
    if (!this.isAppVisible) this.acquireWakeLock();
    this.timerSvc.start();
  }

  stopAndSave(): void {
    this.ensureAudioReady();
    this.currentCycleActivity ??= this.selectedType();
    const elapsed = this.timerSvc.elapsedSeconds();

    if (elapsed < 60) {
      this.toastService.info('Sessão muito curta, continuando o timer.', 3000);
      return;
    }

    if (!this.currentCycleSaved) {
      this.currentCycleSaved = true;
      this.saveCurrentSession().then(() => {
        this.currentCycleActivity = null;
        this.clearCurrentCycleActivity();
        this.resetAfterCompletion();
      });
    }
    this.timerSvc.stop();
  }

  discardTimer(): void {
    this.stopTimer();
    this.resetAfterCompletion();
  }

  pauseTimer(): void { this.ensureAudioReady(); this.timerSvc.pause(); }
  resumeTimer(): void { this.ensureAudioReady(); this.timerSvc.resume(); }

  applyPreset(minutes: number): void { this.timerSvc.setPomodoroDuration(minutes); this.customMinutes = minutes; }
  applyCustomTime(): void { this.timerSvc.setPomodoroDuration(Math.max(1, Math.min(480, Number(this.customMinutes)))); }

  async addActivityType(): Promise<void> {
    if (!this.newTypeName.trim()) return;
    await this.sessionSvc.addActivityType({ name: this.newTypeName.trim(), icon: this.newTypeIcon || '📌', color: this.newTypeColor });
    this.newTypeName = ''; this.newTypeIcon = '📌'; this.newTypeColor = '#6C63FF';
    this.showAddType.set(false);
  }

  async deletePreset(id: string): Promise<void> { await this.sessionSvc.deletePreset(id); }

  async deleteActivityType(id: string): Promise<void> {
    if (this.selectedType()?.id === id) this.selectedType.set(null);
    await this.sessionSvc.deleteActivityType(id);
  }

  async addPreset(): Promise<void> {
    const mins = Math.max(1, Math.min(480, Number(this.presetMinutesInput)));
    await this.sessionSvc.addPreset({ label: this.presetLabel.trim() || `${mins} min`, minutes: mins });
    this.presetLabel = ''; this.presetMinutesInput = 25;
    this.showAddPreset.set(false);
  }

  async togglePip(): Promise<void> {
    try {
      await this.pipSvc.toggle(this.selectedType()?.color ?? '#6C63FF', this.selectedType()?.name ?? '');
    } catch (err) {
      console.error(err);
    }
  }

  // ─── Save helpers ─────────────────────────────────────────────────────────

  private async saveCurrentSession(): Promise<void> {
    const elapsed = this.timerSvc.elapsedSeconds();
    const selectedType = this.currentCycleActivity || this.selectedType();
    if (!selectedType) { this.toastService.error('Selecione uma atividade antes de iniciar o timer!'); return; }
    if (elapsed < 60) { this.toastService.error('Sessão muito curta! É necessário pelo menos 1 minuto para salvar.', 3000); return; }
    await this.performSave(selectedType, elapsed);
  }

  private async saveCurrentSessionSilently(): Promise<boolean> {
    const elapsed = this.timerSvc.elapsedSeconds();
    const selectedType = this.currentCycleActivity;
    if (!selectedType || elapsed < 60) return false;
    return await this.performSave(selectedType, elapsed, true);
  }

  private async performSave(selectedType: ActivityType, elapsed: number, silent = false): Promise<boolean> {
    const now = Date.now();
    try {
      await this.sessionSvc.saveSession({
        activityTypeId: selectedType.id!,
        activityTypeName: selectedType.name,
        activityColor: selectedType.color,
        durationSeconds: elapsed,
        mode: this.timerSvc.mode(),
        date: this.getLocalDateString(),
        startedAt: now - elapsed * 1000,
        completedAt: now,
      });
      if (!silent) {
        this.savedDuration.set(this.formatDuration(elapsed));
        this.savedActivity.set(selectedType.name);
        this.showSaveBanner.set(true);
        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => this.showSaveBanner.set(false), 4000);
        this.toastService.success(`Sessão de ${this.formatDuration(elapsed)} salva com sucesso!`, 3000);
      }
      return true;
    } catch (error) {
      if (!silent) this.toastService.error('Erro ao salvar a sessão. Tente novamente.');
      this.currentCycleSaved = false;
      return false;
    }
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  }

  private resetAfterCompletion(): void {
    this.currentCycleSaved = false;
    this.currentCycleActivity = null;
    this.clearCurrentCycleActivity();
    this.lastTimerState = 'idle';
    this.timerSvc.reset();
  }

  // ─── Activity restore helpers ─────────────────────────────────────────────

  private tryRestoreCurrentCycleActivity(): void {
    try {
      const saved = localStorage.getItem(this.CYCLE_ACTIVITY_KEY);
      if (saved) {
        const sa = JSON.parse(saved);
        const match = this.activityTypes().find(t => t.id === sa.id || (t.name === sa.name && t.color === sa.color));
        if (match) this.currentCycleActivity = match;
      }
    } catch { }
  }

  private ensureValidActivityForSave(availableTypes: ActivityType[]): void {
    if (this.currentCycleActivity) {
      const exists = availableTypes.find(t => t.id === this.currentCycleActivity!.id || (t.name === this.currentCycleActivity!.name && t.color === this.currentCycleActivity!.color));
      if (exists) return;
      this.currentCycleActivity = null;
    }
    this.tryRestoreCurrentCycleActivity();
    if (this.currentCycleActivity) return;
    if (this.selectedType()) { this.currentCycleActivity = this.selectedType(); return; }
    this.restoreSelectedActivity(availableTypes);
    if (this.selectedType()) { this.currentCycleActivity = this.selectedType(); return; }
    if (availableTypes.length > 0) { this.currentCycleActivity = availableTypes[0]; this.selectedType.set(availableTypes[0]); this.saveSelectedActivity(availableTypes[0]); }
  }

  private saveSelectedActivity(activity: ActivityType): void {
    try { localStorage.setItem(this.SELECTED_ACTIVITY_KEY, JSON.stringify({ id: activity.id, name: activity.name, icon: activity.icon, color: activity.color })); } catch { }
  }

  private restoreSelectedActivity(availableTypes: ActivityType[]): void {
    if (this.selectedType()) { this.ensureCurrentCycleActivity(); return; }
    try {
      const saved = localStorage.getItem(this.SELECTED_ACTIVITY_KEY);
      if (saved) {
        const sa = JSON.parse(saved);
        const match = availableTypes.find(t => t.id === sa.id || (t.name === sa.name && t.color === sa.color));
        if (match) { this.selectedType.set(match); this.ensureCurrentCycleActivity(); return; }
      }
    } catch { }
    if (availableTypes.length > 0) { this.selectedType.set(availableTypes[0]); this.saveSelectedActivity(availableTypes[0]); this.ensureCurrentCycleActivity(); }
  }

  private ensureCurrentCycleActivity(): void {
    const s = this.timerSvc.state();
    if ((s === 'running' || s === 'paused') && !this.currentCycleActivity) {
      this.tryRestoreCurrentCycleActivity();
      if (!this.currentCycleActivity && this.selectedType()) {
        this.currentCycleActivity = this.selectedType();
        this.saveCurrentCycleActivity(this.currentCycleActivity!);
      }
    }
  }

  private saveCurrentCycleActivity(activity: ActivityType): void {
    try { localStorage.setItem(this.CYCLE_ACTIVITY_KEY, JSON.stringify({ id: activity.id, name: activity.name, icon: activity.icon, color: activity.color })); } catch { }
  }

  private clearCurrentCycleActivity(): void {
    try { localStorage.removeItem(this.CYCLE_ACTIVITY_KEY); } catch { }
  }

  // ─── Background features ──────────────────────────────────────────────────

  private setupBackgroundFeatures(): void {
    this.requestNotificationPermission();
    this.setupVisibilityListener();
    this.acquireWakeLock();
    this.registerNotificationServiceWorker();
  }

  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) return;
    try {
      const ackShown = localStorage.getItem(this.NOTIFICATION_ACK_KEY) === '1';
      const perm = Notification.permission;
      if (perm === 'granted') { this.notificationPermissionGranted = true; if (!ackShown) { localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1'); this.toastService.success('Notificações habilitadas!', 4000); } return; }
      if (perm === 'default') {
        const result = await Notification.requestPermission();
        this.notificationPermissionGranted = result === 'granted';
        if (!ackShown) { localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1'); if (this.notificationPermissionGranted) this.toastService.success('Notificações habilitadas!', 4000); else this.toastService.warning('Permita notificações para ser avisado em segundo plano.', 6000); }
        return;
      }
      if (perm === 'denied' && !ackShown) { localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1'); this.toastService.warning('Permita notificações para ser avisado em segundo plano.', 6000); }
    } catch { }
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      this.isAppVisible = !document.hidden;
      if (!this.isAppVisible && this.isTimerRunning()) this.acquireWakeLock();
      else if (this.isAppVisible) this.releaseWakeLock();
    });
    window.addEventListener('blur', () => { this.isAppVisible = false; if (this.isTimerRunning()) this.acquireWakeLock(); });
    window.addEventListener('focus', () => { this.isAppVisible = true; this.releaseWakeLock(); });
  }

  private removeBackgroundListeners(): void {
    document.removeEventListener('visibilitychange', this.setupVisibilityListener);
  }

  private async acquireWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock!.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { }
  }

  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLock) { try { await this.wakeLock.release(); this.wakeLock = null; } catch { } }
  }

  private async registerNotificationServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' }); } catch { }
  }

  private showCompletionNotification(): void {
    const mode = this.timerSvc.mode();
    const elapsed = this.timerSvc.elapsedSeconds();
    const activity = this.currentCycleActivity?.name || 'Atividade';
    this.playNotificationSound();
    if (this.isAppVisible) this.toastService.success(`🎉 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} concluído! ${activity} - ${this.formatDuration(elapsed)}`, 5000);
    this.showSystemNotification(mode, activity, elapsed);
  }

  private playNotificationSound(): void {
    if (this.tryWebAudioNotification()) return;
    this.tryHTMLAudioNotification();
  }

  private tryWebAudioNotification(): boolean {
    try {
      if (!this.audioContext) this.initializeAudioContext();
      if (!this.audioContext) return false;
      if (this.audioContext.state === 'suspended') this.audioContext.resume().then(() => this.playWebAudioBeep()).catch(() => { });
      else this.playWebAudioBeep();
      return true;
    } catch { return false; }
  }

  private playWebAudioBeep(): void {
    if (!this.audioContext) return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain); gain.connect(this.audioContext.destination);
    osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
    osc.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.15);
    osc.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.3);
    gain.gain.setValueAtTime(0, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + 0.5);
  }

  private tryHTMLAudioNotification(): void {
    try {
      const audio = new Audio(this.generateBeepDataURL());
      audio.volume = 0.3;
      audio.play().catch(() => this.tryVibrationFallback());
    } catch { this.tryVibrationFallback(); }
  }

  private generateBeepDataURL(): string {
    const sampleRate = 8000, duration = 0.3, frequency = 800;
    const samples = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); ws(36, 'data');
    view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3 * 0x7FFF, true);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  private tryVibrationFallback(): void {
    if ('vibrate' in navigator) { try { navigator.vibrate([200, 100, 200, 100, 200]); } catch { } }
  }

  private initializeAudioContext(): void {
    try { this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { this.audioContext = null; }
  }

  private ensureAudioReady(): void {
    if (!this.audioInitialized) {
      if (!this.audioContext) this.initializeAudioContext();
      if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().then(() => { this.audioInitialized = true; }).catch(() => { });
      else this.audioInitialized = true;
    }
  }

  private showSystemNotification(mode: TimerMode, activity: string, elapsed: number): void {
    if (!this.notificationPermissionGranted) return;
    const title = `🍅 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} Concluído!`;
    const body = `${activity} - ${this.formatDuration(elapsed)}`;
    const icon = '/assets/icons/icon-192x192.png';
    try {
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon, badge: icon, tag: 'timer-complete', requireInteraction: true, silent: false })).catch(() => this.showDirectNotification(title, body, icon));
      } else this.showDirectNotification(title, body, icon);
    } catch { this.showDirectNotification(title, body, icon); }
  }

  private showDirectNotification(title: string, body: string, icon: string): void {
    try {
      const n = new Notification(title, { body, icon, badge: icon, tag: 'timer-complete', requireInteraction: true, silent: false });
      n.onclick = () => { if (window.focus) window.focus(); };
    } catch { }
  }
}