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
  private readonly NOTIFICATION_ACK_KEY = 'focusflow_notification_ack';

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
  private audioContext: AudioContext | null = null;
  private audioInitialized = false;
  
  // Background notifications e wake lock
  private wakeLock: WakeLockSentinel | null = null;
  private isAppVisible = true;
  private notificationPermissionGranted = false;

  readonly userEmail = computed(() => this.authSvc.currentUser?.email ?? '');
  readonly currentMinutes = computed(() => Math.round(this.timerSvc.totalSeconds() / 60));

  readonly ringOffset = computed(() => {
    const circumference = 2 * Math.PI * 88;
    return circumference * (1 - this.timerSvc.progress());
  });

  ngOnInit(): void {
    this.sessionSvc.seedDefaultData();

    // Tentar inicializar áudio context (pode não funcionar antes de interação do usuário no mobile)
    this.initializeAudioContext();

    // Configurar notificações e APIs de background
    this.setupBackgroundFeatures();

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
    
    // Limpar AudioContext para evitar vazamentos de memória
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    // Liberar wake lock e limpar listeners
    this.releaseWakeLock();
    this.removeBackgroundListeners();
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
    
    // Garantir que áudio esteja pronto para mobile
    this.ensureAudioReady();
    
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
    
    // Liberar wake lock quando timer para
    this.releaseWakeLock();
    
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
    
    // Garantir que áudio esteja pronto para mobile
    this.ensureAudioReady();
    
    // Configurar notificações se ainda não foram solicitadas
    if (!this.notificationPermissionGranted && Notification.permission === 'default') {
      this.requestNotificationPermission();
    }
    
    // Capturar tipo de atividade NO INÍCIO do ciclo
    this.currentCycleActivity = this.selectedType();
    this.currentCycleSaved = false;
    this.lastTimerState = 'idle';
    console.log('Timer iniciado com atividade:', this.currentCycleActivity?.name);
    
    // Salvar currentCycleActivity no localStorage
    this.saveCurrentCycleActivity(this.currentCycleActivity!);
    
    // Adquirir wake lock se app não estiver visível
    if (!this.isAppVisible) {
      this.acquireWakeLock();
    }
    
    this.timerSvc.start();
  }

  stopAndSave(): void {
    // Garantir que áudio esteja pronto para mobile
    this.ensureAudioReady();
    
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

  pauseTimer(): void {
    // Garantir que áudio esteja pronto para mobile
    this.ensureAudioReady();
    this.timerSvc.pause();
  }

  resumeTimer(): void {
    // Garantir que áudio esteja pronto para mobile
    this.ensureAudioReady();
    this.timerSvc.resume();
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
    const today = this.getLocalDateString(); 

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

  // Helper para gerar data local no formato YYYY-MM-DD (evita problemas de timezone)
  private getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private showCompletionNotification(): void {
    const mode = this.timerSvc.mode();
    const elapsed = this.timerSvc.elapsedSeconds();
    const activity = this.currentCycleActivity?.name || 'Atividade';

    // Notificação sonora (sempre tenta tocar)
    this.playNotificationSound();

    // Toast notification (só se app estiver visível)
    if (this.isAppVisible) {
      this.toastService.success(
        `🎉 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} concluído! ${activity} - ${this.formatDuration(elapsed)}`,
        5000
      );
    }

    // Notificação do sistema (funciona em background)
    this.showSystemNotification(mode, activity, elapsed);
  }

  private playNotificationSound(): void {
    // Tentar Web Audio API primeiro (melhor qualidade)
    if (this.tryWebAudioNotification()) {
      return;
    }

    // Fallback para HTMLAudioElement (melhor compatibilidade mobile)
    this.tryHTMLAudioNotification();
  }

  private tryWebAudioNotification(): boolean {
    try {
      if (!this.audioContext) {
        this.initializeAudioContext();
      }

      if (!this.audioContext) {
        return false;
      }

      // Verificar se o contexto precisa ser resumido (política de autoplay)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          this.playWebAudioBeep();
        }).catch(() => {
          console.warn('Não foi possível resumir o AudioContext');
        });
      } else {
        this.playWebAudioBeep();
      }
      
      return true;
    } catch (error) {
      console.warn('Web Audio API falhou:', error);
      return false;
    }
  }

  private playWebAudioBeep(): void {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Sequência de tons para notificação 
    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.15);
    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.5);
  }

  private tryHTMLAudioNotification(): void {
    try {
      // Criar beep sintético usando data URL
      const beepData = this.generateBeepDataURL();
      const audio = new Audio(beepData);
      
      audio.volume = 0.3;
      audio.play().catch((error) => {
        console.warn('HTMLAudioElement também falhou:', error);
        // Último recurso: vibração no mobile
        this.tryVibrationFallback();
      });
    } catch (error) {
      console.warn('Erro ao criar HTMLAudioElement:', error);
      this.tryVibrationFallback();
    }
  }

  private generateBeepDataURL(): string {
    // Gerar um beep simples como data URL
    const sampleRate = 8000;
    const duration = 0.3;
    const frequency = 800;
    const samples = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Generate beep samples
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
      view.setInt16(44 + i * 2, sample * 0x7FFF, true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private tryVibrationFallback(): void {
    // Último recurso: vibração no mobile se disponível
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 200]);
        console.log('Usando vibração como fallback para notificação sonora');
      } catch (error) {
        console.warn('Vibração também não disponível:', error);
      }
    }
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('AudioContext inicializado para notificações');
    } catch (error) {
      console.warn('Não foi possível criar AudioContext:', error);
      this.audioContext = null;
    }
  }

  // Método para ser chamado em interações do usuário (destravar audio no mobile)
  private ensureAudioReady(): void {
    if (!this.audioInitialized) {
      if (!this.audioContext) {
        this.initializeAudioContext();
      }
      
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          this.audioInitialized = true;
          console.log('AudioContext desbloqueado para mobile');
        }).catch((error) => {
          console.warn('Erro ao desbloquear AudioContext:', error);
        });
      } else {
        this.audioInitialized = true;
      }
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

  // ===== MÉTODOS PARA NOTIFICAÇÕES EM BACKGROUND =====

  private setupBackgroundFeatures(): void {
    console.log('Configurando funcionalidades de background...');
    
    // Solicitar permissão para notificações
    this.requestNotificationPermission();
    
    // Configurar Page Visibility API
    this.setupVisibilityListener();
    
    // Tentar adquirir wake lock
    this.acquireWakeLock();
    
    // Registrar service worker adicional para notification clicks
    this.registerNotificationServiceWorker();
    
    console.log('Recursos de background configurados');
  }

  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      console.warn('Este navegador não suporta notificações');
      return;
    }

    try {
      const ackShown = localStorage.getItem(this.NOTIFICATION_ACK_KEY) === '1';
      const currentPermission = Notification.permission;

      // Já concedido
      if (currentPermission === 'granted') {
        this.notificationPermissionGranted = true;
        if (!ackShown) {
          localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1');
          this.toastService.success('Notificações habilitadas! Você será avisado mesmo em segundo plano.', 4000);
        }
        return;
      }

      // Usuário ainda não decidiu — solicitar
      if (currentPermission === 'default') {
        const permission = await Notification.requestPermission();
        this.notificationPermissionGranted = permission === 'granted';

        if (this.notificationPermissionGranted && !ackShown) {
          localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1');
          this.toastService.success('Notificações habilitadas! Você será avisado mesmo em segundo plano.', 4000);
        } else if (!this.notificationPermissionGranted && !ackShown) {
          // Opcional: avisar uma vez quando negar
          localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1');
          this.toastService.warning('Permita notificações para ser avisado quando o timer terminar em segundo plano.', 6000);
        }
        return;
      }

      // Negado
      if (currentPermission === 'denied') {
        this.notificationPermissionGranted = false;
        if (!ackShown) {
          localStorage.setItem(this.NOTIFICATION_ACK_KEY, '1');
          this.toastService.warning('Permita notificações para ser avisado quando o timer terminar em segundo plano.', 6000);
        }
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão de notificação:', error);
    }
  }

  private setupVisibilityListener(): void {
    const handleVisibilityChange = () => {
      this.isAppVisible = !document.hidden;
      console.log('App visibility:', this.isAppVisible ? 'visible' : 'hidden');
      
      if (!this.isAppVisible && this.isTimerRunning()) {
        // App foi para background com timer rodando
        this.acquireWakeLock();
      } else if (this.isAppVisible) {
        // App voltou para foreground
        this.releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Também detectar foco/blur da janela
    window.addEventListener('blur', () => {
      this.isAppVisible = false;
      if (this.isTimerRunning()) {
        this.acquireWakeLock();
      }
    });

    window.addEventListener('focus', () => {
      this.isAppVisible = true;
      this.releaseWakeLock();
    });
  }

  private removeBackgroundListeners(): void {
    // Remove listeners para evitar vazamentos de memória
    document.removeEventListener('visibilitychange', this.setupVisibilityListener);
    window.removeEventListener('blur', () => {});
    window.removeEventListener('focus', () => {});
  }

  private async acquireWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator) || this.wakeLock) {
      return;
    }

    try {
      this.wakeLock = await navigator.wakeLock!.request('screen');
      console.log('🔒 Wake Lock ativado - tela não irá bloquear o timer');
      
      this.wakeLock.addEventListener('release', () => {
        console.log('🔓 Wake Lock liberado');
        this.wakeLock = null;
      });
    } catch (error) {
      console.warn('Não foi possível ativar Wake Lock:', error);
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('🔓 Wake Lock liberado voluntariamente');
      } catch (error) {
        console.warn('Erro ao liberar Wake Lock:', error);
      }
    }
  }

  private async registerNotificationServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers não suportados neste navegador');
      return;
    }

    try {
      // Registrar service worker adicional para notification clicks (não conflita com Angular SW)
      const registration = await navigator.serviceWorker.register('/notification-sw.js', {
        scope: '/'
      });
      console.log('✅ Notification Service Worker registrado:', registration.scope);
    } catch (error) {
      console.warn('Falha ao registrar Notification Service Worker:', error);
    }
  }

  private showSystemNotification(mode: TimerMode, activity: string, elapsed: number): void {
    if (!this.notificationPermissionGranted) {
      console.log('Permissão de notificação não concedida, pulando notificação do sistema');
      return;
    }

    const title = `🍅 ${mode === 'pomodoro' ? 'Pomodoro' : 'Cronômetro'} Concluído!`;
    const body = `${activity} - ${this.formatDuration(elapsed)}`;
    const icon = '/assets/icons/icon-192x192.png';

    try {
      // Vibração separada para mobile (se suportado)
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }

      // Tentar usar Service Worker para notificações em background (funciona com tela bloqueada)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          // Service Worker notification - funciona mesmo com tela bloqueada
          registration.showNotification(title, {
            body,
            icon,
            badge: icon,
            tag: 'timer-complete',
            requireInteraction: true,
            silent: false
          });
          console.log('📱 Notificação de Service Worker enviada (funciona com tela bloqueada)');
        }).catch(() => {
          // Fallback para notificação direta se Service Worker falhar
          this.showDirectNotification(title, body, icon);
        });
      } else {
        // Fallback para notificação direta se Service Worker não suportado
        this.showDirectNotification(title, body, icon);
      }
    } catch (error) {
      console.error('Erro ao mostrar notificação do sistema:', error);
      // Fallback em caso de erro
      this.showDirectNotification(title, body, icon);
    }
  }

  private showDirectNotification(title: string, body: string, icon: string): void {
    try {
      const notification = new Notification(title, {
        body,
        icon,
        badge: icon,
        tag: 'timer-complete',
        requireInteraction: true,
        silent: false
      });

      notification.onclick = () => {
        if (window.focus) {
          window.focus();
        }
      };

      console.log('📱 Notificação direta enviada (apenas com app ativo)');
    } catch (error) {
      console.error('Erro ao mostrar notificação direta:', error);
    }
  }
}
