import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { NavbarComponent } from 'src/app/shared/navbar/navbar.component';
import { ToastComponent } from 'src/app/shared/toast/toast.component';
import { ToastService } from 'src/app/core/services/toast.service';

import { TimerService, TimerMode } from '../../core/services/timer.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityType, Preset, Session, DailyGoalSegment } from 'src/app/core/interfaces/timer.interface';
import { SpotifyPlaylist } from 'src/app/core/interfaces/spotify.interface';
import { AuthService } from '../../core/services/auth.service';
import { PipService } from '../../core/services/pip.service';
import { SpotifyService } from 'src/app/core/services/spotify.service';

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, ToastComponent],
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
})
export class TimerComponent implements OnInit, OnDestroy {
  timerSvc = inject(TimerService);
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);
  private toastService = inject(ToastService);
  pipSvc = inject(PipService);
  spotifySvc = inject(SpotifyService);

  activityTypes = signal<ActivityType[]>([]);
  presets = signal<Preset[]>([]);
  selectedType = signal<ActivityType | null>(null);
  allSessions = signal<Session[]>([]);
  dailyGoalMinutes = signal<number | null>(null);
  showGoalModal = signal(false);
  goalInputHours = 0;
  goalInputMinutes = 0;

  private readonly SELECTED_ACTIVITY_KEY = 'focusflow_selected_activity';
  private readonly CYCLE_ACTIVITY_KEY = 'focusflow_cycle_activity';
  private readonly NOTIFICATION_ACK_KEY = 'focusflow_notification_ack';

  private currentCycleSaved = false;
  private lastTimerState = 'idle';
  private currentCycleActivity: ActivityType | null = null;

  private autoSaveEffect = effect(() => {
    const currentState = this.timerSvc.state();
    const availableTypes = this.activityTypes();

    if (
      currentState === 'finished' &&
      this.lastTimerState !== 'finished' &&
      !this.currentCycleSaved
    ) {
      // Sem atividades: evita ficar preso em finished
      if (availableTypes.length === 0) {
        setTimeout(() => this.resetAfterCompletion(), 1200);
        this.lastTimerState = currentState;
        return;
      }

      this.ensureValidActivityForSave(availableTypes);
      this.currentCycleSaved = true;
      this.saveCurrentSessionSilently().then((saved) => {
        if (!saved) {
          this.toastService.warning('Não foi possível salvar automaticamente esta sessão.', 3500);
          this.currentCycleSaved = false;
          setTimeout(() => this.resetAfterCompletion(), 1200);
          return;
        }

        this.showCompletionNotification();
        setTimeout(() => this.resetAfterCompletion(), 1200);
      });
    }
    this.lastTimerState = currentState;
  }, { allowSignalWrites: true });

  private spotifyFlashEffect = effect(() => {
    const flash = this.spotifySvc.flashMessage();
    if (!flash) return;

    switch (flash.type) {
      case 'success': this.toastService.success(flash.message, 3500); break;
      case 'error': this.toastService.error(flash.message, 4500); break;
      case 'warning': this.toastService.warning(flash.message, 4000); break;
      default: this.toastService.info(flash.message, 3000); break;
    }

    this.spotifySvc.consumeFlashMessage();
  }, { allowSignalWrites: true });

  // ── UI state ──────────────────────────────────────────────────────────────

  showAddType = signal(false);
  showAddPreset = signal(false);
  showSaveBanner = signal(false);
  showSpotifySheet = signal(false);
  showActivitySheet = signal(false);
  activityExpanded = signal(true);   // começa expandido
  presetsExpanded = signal(false);
  spotifyExpanded = signal(true);
  actionsExpanded = signal(false);
  savedDuration = signal('');
  savedActivity = signal('');

  toggleActivityExpanded(): void { this.activityExpanded.update(v => !v); }
  togglePresetsExpanded(): void { this.presetsExpanded.update(v => !v); }
  toggleSpotifyExpanded(): void { this.spotifyExpanded.update(v => !v); }
  toggleActionsExpanded(): void { this.actionsExpanded.update(v => !v); }
  closeActionsExpanded(): void { this.actionsExpanded.set(false); }

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

  // ── Computed ──────────────────────────────────────────────────────────────

  readonly userEmail = computed(() => this.authSvc.currentUser?.email ?? '');
  readonly currentMinutes = computed(() => Math.round(this.timerSvc.totalSeconds() / 60));
  readonly spotifyPlaylists = computed<SpotifyPlaylist[]>(() => this.spotifySvc.playlists());

  readonly spotifyStatusText = computed(() => {
    if (!this.spotifySvc.isConfigured()) return 'Adicione o clientId do Spotify para habilitar.';
    if (!this.spotifySvc.isConnected()) return 'Conecte sua conta para ver suas playlists.';
    if (this.spotifySvc.isPremium()) {
      if (this.spotifySvc.playerReady()) return 'Player ativo';
      if (this.spotifySvc.playerLoading()) return 'Premium · preparando player…';
      return 'Premium · conta conectada';
    }
    return 'Conectado';
  });

  /** Ring offset para raio 110 (viewBox 240×240, r=110, circunferência ≈ 691) */
  readonly ringOffset = computed(() => {
    const circumference = 2 * Math.PI * 110;
    return circumference * (1 - this.timerSvc.progress());
  });

  // ─── Helpers de data ──────────────────────────────────────────────────────

  public getLocalDateString(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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

  // ─── Computed: estatísticas ───────────────────────────────────────────────

  readonly todayTotalSeconds = computed(() => {
    const today = this.getLocalDateString();
    return this.allSessions().filter(s => s.date === today).reduce((a, s) => a + s.durationSeconds, 0);
  });

  readonly todayTotalSecondsWithCurrent = computed(() => {
    const saved = this.todayTotalSeconds();
    const state = this.timerSvc.state();
    if (state === 'running' || state === 'paused') {
      return saved + this.timerSvc.elapsedSeconds();
    }
    return saved;
  });

  readonly last7TotalSeconds = computed(() => {
    const cutoff = this.dateNDaysAgo(7);
    return this.allSessions().filter(s => s.date >= cutoff).reduce((a, s) => a + s.durationSeconds, 0);
  });

  readonly last30TotalSeconds = computed(() => {
    const cutoff = this.dateNDaysAgo(30);
    return this.allSessions().filter(s => s.date >= cutoff).reduce((a, s) => a + s.durationSeconds, 0);
  });

  readonly avgDailyLast7Seconds = computed(() => Math.round(this.last7TotalSeconds() / 7));

  readonly avgWeeklyLast4Seconds = computed(() => {
    const cutoff = this.dateNDaysAgo(28);
    const total = this.allSessions().filter(s => s.date >= cutoff).reduce((a, s) => a + s.durationSeconds, 0);
    return Math.round(total / 4);
  });

  readonly avgMonthlyLast12Seconds = computed(() => {
    const cutoff = this.dateNMonthsAgo(12);
    const total = this.allSessions().filter(s => s.date >= cutoff).reduce((a, s) => a + s.durationSeconds, 0);
    return Math.round(total / 12);
  });

  readonly dailySparkline = computed(() => {
    const map = new Map<string, number>();
    const today = new Date();
    const labels: { date: string; label: string; seconds: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = this.getLocalDateString(d);
      labels.push({ date: ds, label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), seconds: 0 });
      map.set(ds, 0);
    }

    for (const s of this.allSessions()) {
      if (map.has(s.date)) map.set(s.date, (map.get(s.date) ?? 0) + s.durationSeconds);
    }

    const result = labels.map(l => ({ ...l, seconds: map.get(l.date) ?? 0 }));
    const maxSec = Math.max(...result.map(l => l.seconds), 1);
    return result.map(l => ({ ...l, percent: Math.round((l.seconds / maxSec) * 100) }));
  });

  readonly weeklySparkline = computed(() => {
    const today = new Date();
    const weeks: { label: string; seconds: number; percent: number; isCurrent: boolean }[] = [];

    for (let w = 3; w >= 0; w--) {
      const start = new Date(today); start.setDate(start.getDate() - w * 7 - 6);
      const end = new Date(today); end.setDate(end.getDate() - w * 7);
      const startStr = this.getLocalDateString(start);
      const endStr = this.getLocalDateString(end);
      const seconds = this.allSessions().filter(s => s.date >= startStr && s.date <= endStr).reduce((a, s) => a + s.durationSeconds, 0);
      weeks.push({ label: `S${4 - w}`, seconds, percent: 0, isCurrent: w === 0 });
    }

    const maxSec = Math.max(...weeks.map(w => w.seconds), 1);
    return weeks.map(w => ({ ...w, percent: Math.round((w.seconds / maxSec) * 100) }));
  });

  readonly monthlySparkline = computed(() => {
    const today = new Date();
    const months: { label: string; seconds: number; percent: number; isCurrent: boolean }[] = [];

    for (let m = 5; m >= 0; m--) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const seconds = this.allSessions().filter(s => s.date.startsWith(yearMonth)).reduce((a, s) => a + s.durationSeconds, 0);
      months.push({ label, seconds, percent: 0, isCurrent: m === 0 });
    }

    const maxSec = Math.max(...months.map(m => m.seconds), 1);
    return months.map(m => ({ ...m, percent: Math.round((m.seconds / maxSec) * 100) }));
  });

  readonly dailyGoalSegments = computed<DailyGoalSegment[]>(() => {
    const goalMinutes = this.dailyGoalMinutes();
    if (!goalMinutes || goalMinutes <= 0) return [];

    const today = this.getLocalDateString();
    const todaySessions = this.allSessions().filter(s => s.date === today);
    const goalSeconds = goalMinutes * 60;

    const grouped = new Map<string, { seconds: number; name: string; icon: string; color: string }>();
    for (const session of todaySessions) {
      const existing = grouped.get(session.activityTypeId);
      if (existing) {
        existing.seconds += session.durationSeconds;
      } else {
        grouped.set(session.activityTypeId, {
          seconds: session.durationSeconds,
          name: session.activityTypeName,
          icon: this.activityTypes().find(t => t.id === session.activityTypeId)?.icon || '📌',
          color: session.activityColor,
        });
      }
    }

    const state = this.timerSvc.state();
    const elapsed = this.timerSvc.elapsedSeconds();
    if ((state === 'running' || state === 'paused') && elapsed > 0) {
      const type = this.selectedType();
      if (type?.id) {
        const existing = grouped.get(type.id);
        if (existing) {
          existing.seconds += elapsed;
        } else {
          grouped.set(type.id, {
            seconds: elapsed,
            name: type.name,
            icon: type.icon || '📌',
            color: type.color,
          });
        }
      }
    }

    const totalToday = this.todayTotalSecondsWithCurrent();
    const segments: DailyGoalSegment[] = [];
    grouped.forEach((data, activityTypeId) => {
      segments.push({
        activityTypeId,
        name: data.name,
        icon: data.icon,
        color: data.color,
        totalSeconds: data.seconds,
        percentage: totalToday > 0 ? (data.seconds / totalToday) * 100 : 0,
      });
    });

    return segments.sort((a, b) => b.totalSeconds - a.totalSeconds);
  });

  readonly dailyGoalProgress = computed(() => {
    const goalMinutes = this.dailyGoalMinutes();
    if (!goalMinutes || goalMinutes <= 0) return 0;
    const goalSeconds = goalMinutes * 60;
    return (this.todayTotalSecondsWithCurrent() / goalSeconds) * 100;
  });

  readonly dailyGoalFormatted = computed(() => {
    const goalMinutes = this.dailyGoalMinutes();
    if (!goalMinutes) return 'Definir meta';
    const h = Math.floor(goalMinutes / 60);
    const m = goalMinutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  });

  readonly dailyGoalPercentRounded = computed(() => Math.round(this.dailyGoalProgress()));

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
      this.sessionSvc.getPresets$().subscribe(p => this.presets.set(p)),
      this.sessionSvc.getSessions$().subscribe(s => this.allSessions.set(s)),
      this.sessionSvc.getDailyGoal$().subscribe(minutes => this.dailyGoalMinutes.set(minutes)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close();
    this.releaseWakeLock();
    this.removeBackgroundListeners();
  }

  // ─── Formatação ───────────────────────────────────────────────────────────

  formatHours(seconds: number): string {
    if (seconds === 0) return '0min';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  }

  // ─── Timer actions ────────────────────────────────────────────────────────

  isTimerRunning(): boolean {
    const s = this.timerSvc.state();
    return s === 'running' || s === 'paused';
  }

  setMode(mode: TimerMode): void {
    if (this.isTimerRunning()) {
      this.toastService.warning('Finalize o ciclo atual antes de trocar de modo.', 5000);
      return;
    }
    this.timerSvc.setMode(mode);
  }

  selectActivityType(type: ActivityType): void {
    if (this.isTimerRunning()) {
      this.toastService.warning('Não é possível trocar de atividade com o timer rodando.', 4000);
      return;
    }
    this.ensureAudioReady();
    this.selectedType.set(type);
    this.saveSelectedActivity(type);
    if (this.pipSvc.active) this.pipSvc.updateActivity(type.color, type.name);
  }

  startTimer(): void {
    this.closeActionsExpanded();
    if (!this.selectedType()) {
      this.toastService.warning('Selecione um tipo de atividade primeiro!');
      return;
    }

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

  pauseTimer(): void {
    this.closeActionsExpanded();
    this.ensureAudioReady();
    this.timerSvc.pause();
  }

  resumeTimer(): void {
    this.closeActionsExpanded();
    this.ensureAudioReady();
    this.timerSvc.resume();
  }

  stopAndSave(): void {
    this.closeActionsExpanded();
    this.ensureAudioReady();

    this.currentCycleActivity ??= this.selectedType();
    const elapsed = this.timerSvc.elapsedSeconds();

    if (elapsed < 60) { this.toastService.info('Sessão muito curta, continuando o timer.', 3000); return; }

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
    this.closeActionsExpanded();
    this.currentCycleSaved = false;
    this.currentCycleActivity = null;
    this.clearCurrentCycleActivity();
    this.lastTimerState = 'idle';
    this.releaseWakeLock();
    this.timerSvc.stop();
    this.resetAfterCompletion();
    this.toastService.info('Timer descartado.', 2000);
  }

  applyPreset(minutes: number): void { this.timerSvc.setPomodoroDuration(minutes); this.customMinutes = minutes; }
  applyCustomTime(): void { this.timerSvc.setPomodoroDuration(Math.max(1, Math.min(480, Number(this.customMinutes)))); }

  async addActivityType(): Promise<void> {
    if (!this.newTypeName.trim()) return;
    await this.sessionSvc.addActivityType({ name: this.newTypeName.trim(), icon: this.newTypeIcon || '📌', color: this.newTypeColor });
    this.newTypeName = ''; this.newTypeIcon = '📌'; this.newTypeColor = '#6C63FF';
    this.showAddType.set(false);
  }

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

  async deletePreset(id: string): Promise<void> { await this.sessionSvc.deletePreset(id); }

  async togglePip(): Promise<void> {
    try { await this.pipSvc.toggle(this.selectedType()?.color ?? '#6C63FF', this.selectedType()?.name ?? ''); }
    catch (err) { console.error(err); }
  }

  // ─── Daily Goal ──────────────────────────────────────────────────────────────

  openGoalModal(): void {
    const currentMinutes = this.dailyGoalMinutes() ?? 0;
    this.goalInputHours = Math.floor(currentMinutes / 60);
    this.goalInputMinutes = currentMinutes % 60;
    this.showGoalModal.set(true);
  }

  async saveDailyGoal(): Promise<void> {
    const totalMinutes = this.goalInputHours * 60 + this.goalInputMinutes;
    if (totalMinutes <= 0) {
      this.toastService.warning('Defina uma meta maior que zero.', 3000);
      return;
    }
    if (totalMinutes > 1440) {
      this.toastService.warning('A meta não pode exceder 24 horas.', 3000);
      return;
    }
    try {
      await this.sessionSvc.updateDailyGoal(totalMinutes);
      this.showGoalModal.set(false);
      this.toastService.success(`Meta diária definida: ${this.formatHours(totalMinutes * 60)}`, 3000);
    } catch {
      this.toastService.error('Erro ao salvar a meta diária.', 3000);
    }
  }

  clearDailyGoal(): void {
    this.goalInputHours = 0;
    this.goalInputMinutes = 0;
  }

  // ─── Spotify ──────────────────────────────────────────────────────────────

  async connectSpotify(): Promise<void> {
    if (!this.spotifySvc.isConfigured()) {
      this.toastService.warning('Configure o clientId do Spotify em environment.ts.', 5000);
      return;
    }
    try { await this.spotifySvc.connect(); }
    catch (e) { this.toastService.error(e instanceof Error ? e.message : 'Erro ao conectar Spotify.', 5000); }
  }

  disconnectSpotify(): void {
    this.spotifySvc.disconnect();
    this.showSpotifySheet.set(false);
  }

  async refreshSpotifyLibrary(): Promise<void> {
    await this.spotifySvc.refreshLibrary();
    if (this.spotifySvc.error()) { this.toastService.error(this.spotifySvc.error()!, 4500); return; }
    this.toastService.success('Playlists atualizadas.', 2500);
  }

  async playSpotifyPlaylist(playlist: SpotifyPlaylist): Promise<void> {
    try {
      await this.spotifySvc.activatePlayerElement();
      await this.spotifySvc.playPlaylist(playlist);
    }
    catch (e) {
      if (this.spotifySvc.isHandledPlayerError(e)) return;
      this.toastService.error(e instanceof Error ? e.message : 'Erro ao tocar playlist.', 4500);
    }
  }

  async toggleSpotifyPlayback(): Promise<void> {
    try {
      await this.spotifySvc.activatePlayerElement();
      await this.spotifySvc.togglePlayback();
    }
    catch (e) {
      if (this.spotifySvc.isHandledPlayerError(e)) return;
      this.toastService.error(e instanceof Error ? e.message : 'Erro ao alternar reprodução.', 4500);
    }
  }

  async previousSpotifyTrack(): Promise<void> {
    try { await this.spotifySvc.previousTrack(); }
    catch (e) { this.toastService.error(e instanceof Error ? e.message : 'Erro ao voltar faixa.', 4500); }
  }

  async nextSpotifyTrack(): Promise<void> {
    try { await this.spotifySvc.nextTrack(); }
    catch (e) { this.toastService.error(e instanceof Error ? e.message : 'Erro ao avançar faixa.', 4500); }
  }

  // ─── Save helpers ─────────────────────────────────────────────────────────

  private async saveCurrentSession(): Promise<void> {
    const elapsed = this.timerSvc.elapsedSeconds();
    const type = this.currentCycleActivity || this.selectedType();
    if (!type) { this.toastService.error('Selecione uma atividade!'); return; }
    if (elapsed < 60) { this.toastService.error('É necessário pelo menos 1 minuto para salvar.', 3000); return; }
    await this.performSave(type, elapsed);
  }

  private async saveCurrentSessionSilently(): Promise<boolean> {
    const elapsed = this.timerSvc.elapsedSeconds();
    const type = this.currentCycleActivity;
    if (!type || elapsed < 60) return false;
    return this.performSave(type, elapsed, true);
  }

  private async performSave(type: ActivityType, elapsed: number, silent = false): Promise<boolean> {
    const now = Date.now();
    try {
      await this.sessionSvc.saveSession({
        activityTypeId: type.id!,
        activityTypeName: type.name,
        activityColor: type.color,
        durationSeconds: elapsed,
        mode: this.timerSvc.mode(),
        date: this.getLocalDateString(),
        startedAt: now - elapsed * 1000,
        completedAt: now,
      });

      if (!silent) {
        this.savedDuration.set(this.formatDuration(elapsed));
        this.savedActivity.set(type.name);
        this.showSaveBanner.set(true);
        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => this.showSaveBanner.set(false), 4000);
        this.toastService.success(`Sessão de ${this.formatDuration(elapsed)} salva!`, 3000);
      }
      return true;
    } catch {
      if (!silent) this.toastService.error('Erro ao salvar a sessão. Tente novamente.');
      this.currentCycleSaved = false;
      return false;
    }
  }

  private resetAfterCompletion(): void {
    this.currentCycleSaved = false;
    this.currentCycleActivity = null;
    this.clearCurrentCycleActivity();
    this.lastTimerState = 'idle';
    this.timerSvc.reset();
  }

  // ─── Activity restore ─────────────────────────────────────────────────────

  private tryRestoreCurrentCycleActivity(): void {
    try {
      const raw = localStorage.getItem(this.CYCLE_ACTIVITY_KEY);
      if (!raw) return;
      const sa = JSON.parse(raw);
      const match = this.activityTypes().find(t => t.id === sa.id || (t.name === sa.name && t.color === sa.color));
      if (match) this.currentCycleActivity = match;
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
      const raw = localStorage.getItem(this.SELECTED_ACTIVITY_KEY);
      if (raw) {
        const sa = JSON.parse(raw);
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
      if (perm === 'granted') {
        this.notificationPermissionGranted = true;
        if (!ackShown) { localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1'); this.toastService.success('Notificações habilitadas!', 4000); }
        return;
      }
      if (perm === 'default') {
        const result = await Notification.requestPermission();
        this.notificationPermissionGranted = result === 'granted';
        if (!ackShown) {
          localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1');
          if (this.notificationPermissionGranted) this.toastService.success('Notificações habilitadas!', 4000);
          else this.toastService.warning('Permita notificações para ser avisado em segundo plano.', 6000);
        }
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
    try { this.wakeLock = await (navigator as any).wakeLock.request('screen'); this.wakeLock!.addEventListener('release', () => { this.wakeLock = null; }); }
    catch { }
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
    if (this.isAppVisible) this.toastService.success(`🎉 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} concluído! ${activity} · ${this.formatDuration(elapsed)}`, 5000);
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
    try { this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { this.audioContext = null; }
  }

  private ensureAudioReady(): void {
    if (!this.audioInitialized) {
      if (!this.audioContext) this.initializeAudioContext();
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => { this.audioInitialized = true; }).catch(() => { });
      } else {
        this.audioInitialized = true;
      }
    }
  }

  private showSystemNotification(mode: TimerMode, activity: string, elapsed: number): void {
    if (!this.notificationPermissionGranted) return;
    const title = `🍅 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} Concluído!`;
    const body = `${activity} · ${this.formatDuration(elapsed)}`;
    const icon = '/assets/icons/icon-192x192.png';
    try {
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification(title, { body, icon, badge: icon, tag: 'timer-complete', requireInteraction: true, silent: false }))
          .catch(() => this.showDirectNotification(title, body, icon));
      } else {
        this.showDirectNotification(title, body, icon);
      }
    } catch { this.showDirectNotification(title, body, icon); }
  }

  private showDirectNotification(title: string, body: string, icon: string): void {
    try {
      const n = new Notification(title, { body, icon, badge: icon, tag: 'timer-complete', requireInteraction: true, silent: false });
      n.onclick = () => { if (window.focus) window.focus(); };
    } catch { }
  }
}