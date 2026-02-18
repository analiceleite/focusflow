import { Component, OnInit, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  // Key para localStorage da atividade selecionada
  private readonly SELECTED_ACTIVITY_KEY = 'focusflow_selected_activity';
  private readonly CYCLE_ACTIVITY_KEY = 'focusflow_cycle_activity';

  // Flag simples para evitar salvamento duplo POR CICLO
  private currentCycleSaved = false;
  private lastTimerState = 'idle'; // Track transições
  private currentCycleActivity: ActivityType | null = null; // Tipo capturado no início do ciclo

  // Auto-save simples: só quando timer termina (transição)
  private autoSaveEffect = effect(() => {
    const currentState = this.timerSvc.state();
    const availableTypes = this.activityTypes();
    
    // Salvar automaticamente APENAS em TRANSIÇÃO para 'finished'
    // E só se tivermos atividades carregadas
    if (currentState === 'finished' && 
        this.lastTimerState !== 'finished' && 
        !this.currentCycleSaved &&
        availableTypes.length > 0) {
      
      console.log('Timer finalizado, salvando sessão...');
      console.log('activityTypes carregados:', availableTypes.length);
      console.log('currentCycleActivity disponível:', this.currentCycleActivity?.name);
      console.log('selectedType atual:', this.selectedType()?.name);
      
      // Garantir que temos uma atividade válida para salvar
      this.ensureValidActivityForSave(availableTypes);
      
      this.currentCycleSaved = true;
      
      // Salvar sessão silenciosamente
      this.saveCurrentSessionSilently().then((saved) => {
        if (saved) {
          this.showCompletionNotification();
          // Reset automático após salvamento bem-sucedido
          setTimeout(() => {
            this.resetAfterCompletion();
          }, 2000); 
        } else {
          console.warn('Não foi possível salvar a sessão automaticamente');
          this.showCompletionNotification();
          setTimeout(() => {
            this.resetAfterCompletion();
          }, 2000);
        }
      });
    } else if (currentState === 'finished' && 
               this.lastTimerState !== 'finished' && 
               !this.currentCycleSaved &&
               availableTypes.length === 0) {
      
      console.log('Timer finalizado, mas activityTypes ainda não carregados. Aguardando...');
      // Não marcar como salvo ainda, vai tentar novamente quando os types carregarem
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
        
        // Restaurar atividade selecionada do localStorage se disponível
        // (já inclui lógica para restaurar currentCycleActivity se necessário)
        this.restoreSelectedActivity(types);
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

  isTimerRunning(): boolean {
    const state = this.timerSvc.state();
    return state === 'running' || state === 'paused';
  }

  selectActivityType(type: ActivityType): void {
    // Bloquear troca se timer está rodando
    if (this.isTimerRunning()) {
      this.toastService.warning(
        'Não é possível trocar de atividade enquanto o timer está rodando. Finalize o ciclo atual primeiro.',
        4000
      );
      return;
    }
    
    this.selectedType.set(type);
    // Persistir atividade selecionada no localStorage
    this.saveSelectedActivity(type);
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
    
    // Limpar flag para permitir novo ciclo
    this.currentCycleSaved = false;
    this.currentCycleActivity = null; // Limpar atividade capturada
    this.clearCurrentCycleActivity(); // Limpar do localStorage
    this.lastTimerState = 'idle';
    this.timerSvc.stop();
  }

  startTimer(): void {
    if (!this.selectedType()) {
      this.toastService.warning('Selecione um tipo de atividade primeiro!');
      return;
    }
    if (this.timerSvc.state() === 'finished') {
      this.timerSvc.reset();
    }
    
    // Capturar tipo de atividade NO INÍCIO do ciclo
    this.currentCycleActivity = this.selectedType();
    this.currentCycleSaved = false;
    this.lastTimerState = 'idle';
    console.log('Timer iniciado com atividade:', this.currentCycleActivity?.name);
    
    // Salvar currentCycleActivity no localStorage
    this.saveCurrentCycleActivity(this.currentCycleActivity!);
    
    this.timerSvc.start();
  }

  stopAndSave(): void {
    // Salvamento manual - captura atividade atual se não tiver sido capturada
    if (!this.currentCycleActivity) {
      this.currentCycleActivity = this.selectedType();
    }
    
    if (!this.currentCycleSaved) {
      this.currentCycleSaved = true;
      this.saveCurrentSession().then(() => {
        // Limpar após salvamento
        this.currentCycleActivity = null;
        this.clearCurrentCycleActivity();
      });
    }
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

  async deleteActivityType(id: string): Promise<void> {
    // Se estiver selecionado, desselecionar
    if (this.selectedType()?.id === id) {
      this.selectedType.set(null);
    }
    await this.sessionSvc.deleteActivityType(id);
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
    
    // Usar atividade capturada no início do ciclo, com fallback para selectedType atual
    let selectedType = this.currentCycleActivity || this.selectedType();
    
    if (!selectedType) {
      console.warn('Nenhuma atividade disponível para salvar sessão');
      this.toastService.error('Selecione uma atividade antes de iniciar o timer!');
      return;
    }

    // Validar duração mínima de 1 minuto
    if (elapsed < 60) {
      this.toastService.error(
        'Sessão muito curta! É necessário pelo menos 1 minuto para salvar.',
        3000
      );
      return;
    }

    await this.performSave(selectedType, elapsed);
  }

  // Versão silenciosa que não mostra toast de erro (para salvamento automático)
  private async saveCurrentSessionSilently(): Promise<boolean> {
    const elapsed = this.timerSvc.elapsedSeconds();
    
    // A atividade já foi garantida pelo ensureValidActivityForSave
    const selectedType = this.currentCycleActivity;
    
    if (!selectedType) {
      console.error('Erro crítico: nenhuma atividade disponível após ensureValidActivityForSave');
      return false;
    }

    // Validar duração mínima de 1 minuto
    if (elapsed < 60) {
      console.warn('Sessão muito curta para salvar:', elapsed, 'segundos');
      return false;
    }

    console.log('Salvando sessão silenciosamente com atividade:', selectedType.name, 'duração:', this.formatDuration(elapsed));
    return await this.performSave(selectedType, elapsed, true);
  }

  private async performSave(selectedType: ActivityType, elapsed: number, silent: boolean = false): Promise<boolean> {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      await this.sessionSvc.saveSession({
        activityTypeId: selectedType.id!,
        activityTypeName: selectedType.name,
        activityColor: selectedType.color,
        durationSeconds: elapsed,
        mode: this.timerSvc.mode(),
        date: today,
        startedAt: now - elapsed * 1000,
        completedAt: now,
      });

      if (!silent) {
        // Show success banner
        this.savedDuration.set(this.formatDuration(elapsed));
        this.savedActivity.set(selectedType.name);
        this.showSaveBanner.set(true);
        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => this.showSaveBanner.set(false), 4000);

        // Show success toast
        this.toastService.success(
          `Sessão de ${this.formatDuration(elapsed)} salva com sucesso!`,
          3000
        );
      }
      
      console.log('Sessão salva:', selectedType.name, this.formatDuration(elapsed));
      return true;
    } catch (error) {
      console.error('Erro ao salvar sessão:', error);
      if (!silent) {
        this.toastService.error('Erro ao salvar a sessão. Tente novamente.');
      }
      // Reset flag para permitir nova tentativa
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

  private showCompletionNotification(): void {
    const mode = this.timerSvc.mode();
    const elapsed = this.timerSvc.elapsedSeconds();
    const activity = this.currentCycleActivity?.name || 'Atividade';

    // Notificação sonora
    this.playNotificationSound();

    // Toast notification
    this.toastService.success(
      `🎉 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} concluído! ${activity} - ${this.formatDuration(elapsed)}`,
      5000
    );

    // Browser notification (se permitido)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🍅 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} Concluído!`, {
        body: `${activity} - ${this.formatDuration(elapsed)}`,
        icon: '/assets/icons/icon-192x192.png'
      });
    }
  }

  private playNotificationSound(): void {
    try {
      // Som simples usando Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Não foi possível reproduzir som de notificação:', error);
    }
  }

  private resetAfterCompletion(): void {
    console.log('Resetando timer após conclusão...');
    
    // Limpar dados do ciclo
    this.currentCycleSaved = false;
    this.currentCycleActivity = null;
    this.clearCurrentCycleActivity();
    this.lastTimerState = 'idle';
    
    // Resetar o timer para estado inicial
    this.timerSvc.reset();
    
    console.log('Timer resetado, pronto para nova sessão');
  }

  private tryRestoreCurrentCycleActivity(): void {
    try {
      const saved = localStorage.getItem(this.CYCLE_ACTIVITY_KEY);
      if (saved) {
        const savedActivity = JSON.parse(saved);
        const availableTypes = this.activityTypes();
        
        const matchingType = availableTypes.find(type => 
          type.id === savedActivity.id || 
          (type.name === savedActivity.name && type.color === savedActivity.color)
        );
        
        if (matchingType) {
          this.currentCycleActivity = matchingType;
          console.log('currentCycleActivity restaurado de emergência:', matchingType.name);
        }
      }
    } catch (error) {
      console.warn('Erro ao tentar restaurar currentCycleActivity:', error);
    }
  }

  private ensureValidActivityForSave(availableTypes: ActivityType[]): void {
    console.log('Garantindo atividade válida para salvamento...');
    
    // 1. Se já temos currentCycleActivity válida, mantenha
    if (this.currentCycleActivity) {
      // Verificar se ainda existe na lista atual
      const stillExists = availableTypes.find(type => 
        type.id === this.currentCycleActivity!.id || 
        (type.name === this.currentCycleActivity!.name && type.color === this.currentCycleActivity!.color)
      );
      
      if (stillExists) {
        console.log('currentCycleActivity válida encontrada:', this.currentCycleActivity.name);
        return;
      } else {
        console.warn('currentCycleActivity não existe mais na lista, limpando...');
        this.currentCycleActivity = null;
      }
    }
    
    // 2. Tentar restaurar do localStorage
    console.log('Tentando restaurar currentCycleActivity do localStorage...');
    this.tryRestoreCurrentCycleActivity();
    if (this.currentCycleActivity) return;
    
    // 3. Usar selectedType se válido
    if (this.selectedType()) {
      console.log('Usando selectedType como fallback:', this.selectedType()!.name);
      this.currentCycleActivity = this.selectedType();
      return;
    }
    
    // 4. Tentar restaurar selectedType do localStorage
    console.log('Tentando restaurar selectedType do localStorage...');
    this.restoreSelectedActivity(availableTypes);
    if (this.selectedType()) {
      this.currentCycleActivity = this.selectedType();
      console.log('Usando selectedType restaurado:', this.currentCycleActivity!.name);
      return;
    }
    
    // 5. Último recurso: usar primeira atividade disponível
    if (availableTypes.length > 0) {
      console.log('Último recurso: usando primeira atividade disponível:', availableTypes[0].name);
      this.currentCycleActivity = availableTypes[0];
      this.selectedType.set(availableTypes[0]);
      this.saveSelectedActivity(availableTypes[0]);
    } else {
      console.error('Nenhuma atividade disponível para salvamento!');
    }
  }

  private saveSelectedActivity(activity: ActivityType): void {
    try {
      localStorage.setItem(this.SELECTED_ACTIVITY_KEY, JSON.stringify({
        id: activity.id,
        name: activity.name,
        icon: activity.icon,
        color: activity.color
      }));
    } catch (error) {
      console.warn('Erro ao salvar atividade no localStorage:', error);
    }
  }

  private restoreSelectedActivity(availableTypes: ActivityType[]): void {
    // Se já tem uma atividade selecionada, verificar se precisa restaurar currentCycleActivity
    if (this.selectedType()) {
      this.ensureCurrentCycleActivity();
      return; 
    }
    
    try {
      const saved = localStorage.getItem(this.SELECTED_ACTIVITY_KEY);
      if (saved) {
        const savedActivity = JSON.parse(saved);
        
        // Verificar se a atividade ainda existe na lista atual
        const matchingType = availableTypes.find(type => 
          type.id === savedActivity.id || 
          (type.name === savedActivity.name && type.color === savedActivity.color)
        );
        
        if (matchingType) {
          this.selectedType.set(matchingType);
          this.ensureCurrentCycleActivity();
          console.log('Atividade restaurada:', matchingType.name);
          return;
        }
      }
    } catch (error) {
      console.warn('Erro ao restaurar atividade do localStorage:', error);
    }
    
    // Fallback: usar primeira atividade se não conseguiu restaurar
    if (availableTypes.length > 0) {
      this.selectedType.set(availableTypes[0]);
      this.saveSelectedActivity(availableTypes[0]); // Salvar a nova seleção
      this.ensureCurrentCycleActivity();
    }
  }

  private ensureCurrentCycleActivity(): void {
    const timerState = this.timerSvc.state();
    
    // Se timer está ativo e não temos currentCycleActivity, definir
    if ((timerState === 'running' || timerState === 'paused') && !this.currentCycleActivity) {
      // Primeiro tentar do localStorage
      this.tryRestoreCurrentCycleActivity();
      
      // Se ainda não tem, usar selectedType
      if (!this.currentCycleActivity && this.selectedType()) {
        this.currentCycleActivity = this.selectedType();
        this.saveCurrentCycleActivity(this.currentCycleActivity!);
        console.log('currentCycleActivity definida para timer ativo:', this.currentCycleActivity!.name);
      }
    }
  }

  private saveCurrentCycleActivity(activity: ActivityType): void {
    try {
      localStorage.setItem(this.CYCLE_ACTIVITY_KEY, JSON.stringify({
        id: activity.id,
        name: activity.name,
        icon: activity.icon,
        color: activity.color
      }));
    } catch (error) {
      console.warn('Erro ao salvar atividade do ciclo no localStorage:', error);
    }
  }

  private clearCurrentCycleActivity(): void {
    try {
      localStorage.removeItem(this.CYCLE_ACTIVITY_KEY);
    } catch (error) {
      console.warn('Erro ao limpar atividade do ciclo do localStorage:', error);
    }
  }

  private restoreCurrentCycleActivity(availableTypes: ActivityType[]): void {
    // Só restaurar se timer está rodando e não temos currentCycleActivity
    if (this.timerSvc.state() !== 'running' || this.currentCycleActivity) return;
    
    try {
      const saved = localStorage.getItem(this.CYCLE_ACTIVITY_KEY);
      if (saved) {
        const savedActivity = JSON.parse(saved);
        
        const matchingType = availableTypes.find(type => 
          type.id === savedActivity.id || 
          (type.name === savedActivity.name && type.color === savedActivity.color)
        );
        
        if (matchingType) {
          this.currentCycleActivity = matchingType;
          console.log('currentCycleActivity restaurado:', matchingType.name);
        }
      }
    } catch (error) {
      console.warn('Erro ao restaurar atividade do ciclo:', error);
    }
  }
}
