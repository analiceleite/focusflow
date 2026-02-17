import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { NavbarComponent } from 'src/app/shared/navbar/navbar.component';
import { ToastComponent } from 'src/app/shared/toast/toast.component';
import { ThemeToggleComponent } from 'src/app/shared/theme-toggle/theme-toggle.component';
import { ToastService } from 'src/app/core/services/toast.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { TimerService, TimerMode } from '../../core/services/timer.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityType, Preset } from 'src/app/core/interfaces/timer.interface';
import { AuthService } from '../../core/services/auth.service';
import { PipService } from '../../core/services/pip.service';

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, ToastComponent, ThemeToggleComponent],
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
})

export class TimerComponent implements OnInit, OnDestroy {
  timerSvc = inject(TimerService);
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);
  private toastService = inject(ToastService);
  pipSvc = inject(PipService)

  activityTypes = signal<ActivityType[]>([]);
  presets = signal<Preset[]>([]);
  selectedType = signal<ActivityType | null>(null);

  private autoSaveEffect = effect(() => {
    if (this.timerSvc.state() === 'finished') {
      this.saveCurrentSession();
    }
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

  readonly userEmail = computed(() => this.authSvc.currentUser?.email ?? '');
  readonly currentMinutes = computed(() => Math.round(this.timerSvc.totalSeconds() / 60));

  readonly ringOffset = computed(() => {
    const circumference = 2 * Math.PI * 88;
    return circumference * (1 - this.timerSvc.progress());
  });

  ngOnInit(): void {
    this.sessionSvc.seedDefaultData();

    this.subs.push(
      this.sessionSvc.getActivityTypes$().subscribe(types => {
        this.activityTypes.set(types);
        if (!this.selectedType() && types.length > 0) {
          this.selectedType.set(types[0]);
        }
      }),
      this.sessionSvc.getPresets$().subscribe(presets => {
        this.presets.set(presets);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
  }

  setMode(mode: TimerMode): void {
    // Verificar se há um timer rodando
    const currentState = this.timerSvc.state();
    if (currentState === 'running' || currentState === 'paused') {
      this.toastService.warning(
        'Finalize o ciclo atual antes de trocar de modo. Salve ou pare o timer primeiro.',
        5000
      );
      return;
    }
    
    this.timerSvc.setMode(mode);
    this.toastService.success(
      `Modo alterado para ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'}`,
      2000
    );
  }

  stopTimer(): void {
    const elapsed = this.timerSvc.elapsedSeconds();
    const state = this.timerSvc.state();
    
    // Se há tempo decorrido e timer está rodando/pausado
    if ((state === 'running' || state === 'paused') && elapsed > 0) {
      if (elapsed >= 60) {
        // Se tem mais de 1 minuto, perguntar se quer salvar
        this.toastService.show(
          'warning',
          `Você tem ${this.formatDuration(elapsed)} de atividade. Clique em "Salvar" antes de parar para não perder o progresso.`,
          8000
        );
      } else {
        // Menos de 1 minuto, só avisar que será perdido
        this.toastService.warning(
          `Timer parado. Sessão de ${elapsed}s muito curta para ser salva.`,
          3000
        );
      }
    }
    
    this.timerSvc.stop();
  }

  startTimer(): void {
    if (!this.selectedType()) {
      alert('Selecione um tipo de atividade primeiro!');
      return;
    }
    if (this.timerSvc.state() === 'finished') {
      this.timerSvc.reset();
    }
    this.timerSvc.start();
  }

  stopAndSave(): void {
    this.saveCurrentSession();
    this.timerSvc.stop();
  }

  applyPreset(minutes: number): void {
    this.timerSvc.setPomodoroDuration(minutes);
    this.customMinutes = minutes;
  }

  applyCustomTime(): void {
    const mins = Math.max(1, Math.min(480, Number(this.customMinutes)));
    this.timerSvc.setPomodoroDuration(mins);
  }

  async addActivityType(): Promise<void> {
    if (!this.newTypeName.trim()) return;
    await this.sessionSvc.addActivityType({
      name: this.newTypeName.trim(),
      icon: this.newTypeIcon || '📌',
      color: this.newTypeColor,
    });
    this.newTypeName = '';
    this.newTypeIcon = '📌';
    this.newTypeColor = '#6C63FF';
    this.showAddType.set(false);
  }

  async deletePreset(id: string): Promise<void> {
    await this.sessionSvc.deletePreset(id);
  }

  async addPreset(): Promise<void> {
    const mins = Math.max(1, Math.min(480, Number(this.presetMinutesInput)));
    const label = this.presetLabel.trim() || `${mins} min`;
    await this.sessionSvc.addPreset({ label, minutes: mins });
    this.presetLabel = '';
    this.presetMinutesInput = 25;
    this.showAddPreset.set(false);
  }

  async togglePip(): Promise<void> {
    const color = this.selectedType()?.color ?? '#6C63FF';
    try {
      console.log('[TimerComponent] PiP button clicked');
      await this.pipSvc.toggle(color);
      console.log('[TimerComponent] pip.toggle resolved, active=', this.pipSvc.active);
    } catch (err) {
      console.error('[TimerComponent] pip.toggle error:', err);
    }
  }

  private async saveCurrentSession(): Promise<void> {
    const elapsed = this.timerSvc.elapsedSeconds();
    
    if (!this.selectedType()) {
      this.toastService.error('Nenhum tipo de atividade selecionado!');
      return;
    }

    // Validar duração mínima de 1 minuto (60 segundos)
    if (elapsed < 60) {
      this.toastService.error(
        'Sessão muito curta! É necessário pelo menos 1 minuto para salvar nas estatísticas.',
        5000
      );
      return;
    }

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      await this.sessionSvc.saveSession({
        activityTypeId: this.selectedType()!.id!,
        activityTypeName: this.selectedType()!.name,
        activityColor: this.selectedType()!.color,
        durationSeconds: elapsed,
        mode: this.timerSvc.mode(),
        date: today,
        startedAt: now - elapsed * 1000,
        completedAt: now,
      });

      // Show success banner
      this.savedDuration.set(this.formatDuration(elapsed));
      this.savedActivity.set(this.selectedType()!.name);
      this.showSaveBanner.set(true);
      if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
      this.bannerTimeout = setTimeout(() => this.showSaveBanner.set(false), 4000);

      // Show success toast
      this.toastService.success(
        `Sessão de ${this.formatDuration(elapsed)} salva com sucesso!`,
        3000
      );
    } catch (error) {
      console.error('Error saving session:', error);
      this.toastService.error('Erro ao salvar a sessão. Tente novamente.');
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
}
