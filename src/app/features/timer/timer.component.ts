import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { TimerService, TimerMode } from '../../core/services/timer.service';
import { SessionService, ActivityType, Preset } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';
import { PipService } from '../../core/services/pip.service';

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <!-- Sidebar Nav -->
      <nav class="sidebar">
        <div class="sidebar-logo">⏱</div>
        <a routerLink="/timer" class="nav-item active" title="Timer">🎯</a>
        <a routerLink="/dashboard" class="nav-item" title="Dashboard">📊</a>
        <button class="nav-item nav-logout" (click)="logout()" title="Sair">↩</button>
      </nav>

      <!-- Main Content -->
      <main class="main">
        <!-- Header -->
        <header class="header">
          <h2>Timer</h2>
          <span class="user-email">{{ userEmail() }}</span>
        </header>

        <!-- Mode Toggle -->
        <div class="mode-toggle">
          <button
            [class.active]="timerSvc.mode() === 'pomodoro'"
            (click)="setMode('pomodoro')">
            🍅 Pomodoro
          </button>
          <button
            [class.active]="timerSvc.mode() === 'stopwatch'"
            (click)="setMode('stopwatch')">
            ⏱ Cronômetro
          </button>
        </div>

        <!-- Activity Type Selector -->
        <div class="section">
          <div class="section-label">Tipo de atividade</div>
          <div class="activity-grid">
            @for (type of activityTypes(); track type.id) {
              <button
                class="activity-chip"
                [style.--color]="type.color"
                [class.selected]="selectedType()?.id === type.id"
                (click)="selectedType.set(type)">
                <span>{{ type.icon }}</span>
                <span class="chip-name">{{ type.name }}</span>
              </button>
            }
            <button class="activity-chip add-chip" (click)="showAddType.set(true)">
              <span>＋</span>
              <span class="chip-name">Novo</span>
            </button>
          </div>
        </div>

        <!-- Timer Circle -->
        <div class="timer-section">
          <div class="timer-ring-wrapper">
            <svg class="timer-ring" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="88" class="ring-bg" />
              @if (timerSvc.mode() === 'pomodoro') {
                <circle
                  cx="100" cy="100" r="88"
                  class="ring-progress"
                  [style.stroke]="selectedType()?.color || '#6C63FF'"
                  [style.stroke-dashoffset]="ringOffset()" />
              }
            </svg>
            <div class="timer-display">
              <div class="timer-time">{{ timerSvc.formattedTime() }}</div>
              @if (timerSvc.mode() === 'pomodoro') {
                <div class="timer-sub">
                  @if (timerSvc.state() === 'idle') { Pronto para começar }
                  @else if (timerSvc.state() === 'running') { Focando... }
                  @else if (timerSvc.state() === 'paused') { Pausado }
                  @else if (timerSvc.state() === 'finished') { ✅ Sessão concluída! }
                </div>
              }
            </div>
          </div>

          <!-- Controls -->
          <div class="controls">
            @if (timerSvc.state() === 'idle' || timerSvc.state() === 'finished') {
              <button class="btn-main" [style.background]="selectedType()?.color || '#6C63FF'" (click)="startTimer()">
                {{ timerSvc.state() === 'finished' ? '🔄 Nova sessão' : '▶ Iniciar' }}
              </button>
            } @else if (timerSvc.state() === 'running') {
              <button class="btn-main btn-pause" (click)="timerSvc.pause()">⏸ Pausar</button>
              <button class="btn-secondary" (click)="stopAndSave()">✅ Salvar</button>
            } @else if (timerSvc.state() === 'paused') {
              <button class="btn-main" [style.background]="selectedType()?.color || '#6C63FF'" (click)="timerSvc.resume()">▶ Continuar</button>
              <button class="btn-secondary" (click)="stopAndSave()">✅ Salvar</button>
            }
          </div>

          <button
            class="btn-pip"
            [class.pip-active]="pipSvc.active"
            (click)="togglePip()"
            title="Picture-in-Picture">
            {{ pipSvc.active ? '✕ Fechar PiP' : '⧉ Picture-in-Picture' }}
          </button>
        </div>

        <!-- Presets (Pomodoro only) -->
        @if (timerSvc.mode() === 'pomodoro') {
          <div class="section">
            <div class="section-label">Presets de tempo</div>
            <div class="presets-row">
              @for (preset of presets(); track preset.id) {
                <button
                  class="preset-chip"
                  [class.active]="currentMinutes() === preset.minutes"
                  (click)="applyPreset(preset.minutes)">
                  {{ preset.label }}
                  <span class="preset-delete" (click)="$event.stopPropagation(); deletePreset(preset.id!)">×</span>
                </button>
              }
              <button class="preset-chip preset-add" (click)="showAddPreset.set(true)">＋ Salvar preset</button>
            </div>

            <!-- Custom minutes input -->
            <div class="custom-time">
              <input
                type="number"
                [(ngModel)]="customMinutes"
                placeholder="Minutos"
                min="1"
                max="480"
                (keyup.enter)="applyCustomTime()" />
              <button (click)="applyCustomTime()">Aplicar</button>
            </div>
          </div>
        }

        <!-- Success Banner -->
        @if (showSaveBanner()) {
          <div class="save-banner">
            ✅ Sessão salva! {{ savedDuration() }} de {{ savedActivity() }}
          </div>
        }
      </main>
    </div>

    <!-- Modal: Add Activity Type -->
    @if (showAddType()) {
      <div class="modal-overlay" (click)="showAddType.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <h3>Novo tipo de atividade</h3>
          <div class="modal-field">
            <label>Nome</label>
            <input [(ngModel)]="newTypeName" placeholder="Ex.: Idiomas" />
          </div>
          <div class="modal-field">
            <label>Ícone (emoji)</label>
            <input [(ngModel)]="newTypeIcon" placeholder="Ex.: 🌍" maxlength="2" />
          </div>
          <div class="modal-field">
            <label>Cor</label>
            <input type="color" [(ngModel)]="newTypeColor" />
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" (click)="showAddType.set(false)">Cancelar</button>
            <button class="btn-confirm" (click)="addActivityType()">Salvar</button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: Add Preset -->
    @if (showAddPreset()) {
      <div class="modal-overlay" (click)="showAddPreset.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <h3>Salvar preset</h3>
          <div class="modal-field">
            <label>Minutos atuais</label>
            <input type="number" [(ngModel)]="presetMinutesInput" min="1" max="480" />
          </div>
          <div class="modal-field">
            <label>Label (ex.: "25 min")</label>
            <input [(ngModel)]="presetLabel" placeholder="25 min" />
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" (click)="showAddPreset.set(false)">Cancelar</button>
            <button class="btn-confirm" (click)="addPreset()">Salvar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #0f0f14; }

    .app-shell {
      display: flex;
      min-height: 100vh;
    }

    .sidebar {
      width: 64px;
      background: #0a0a10;
      border-right: 1px solid #1e1e2e;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 0;
      gap: 0.5rem;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      z-index: 10;
    }

    .sidebar-logo {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }

    .nav-item {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 12px;
      text-decoration: none;
      font-size: 1.25rem;
      color: #555;
      border: none;
      background: transparent;
      cursor: pointer;
      transition: all 0.2s;

      &:hover, &.active {
        background: #1e1e2e;
        color: #fff;
      }
    }

    .nav-logout {
      margin-top: auto;
      color: #666;
      &:hover { color: #ff6584; background: rgba(255,101,132,0.1); }
    }

    .main {
      margin-left: 64px;
      flex: 1;
      max-width: 600px;
      margin-inline: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      h2 {
        color: #fff;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }

      .user-email {
        color: #444;
        font-size: 0.8rem;
      }
    }

    .mode-toggle {
      display: flex;
      background: #0a0a10;
      border: 1px solid #1e1e2e;
      border-radius: 12px;
      padding: 4px;
      gap: 4px;

      button {
        flex: 1;
        padding: 0.6rem;
        border: none;
        background: transparent;
        color: #555;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;

        &.active {
          background: #1e1e2e;
          color: #fff;
          font-weight: 600;
        }
      }
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .section-label {
      color: #555;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .activity-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .activity-chip {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 0.875rem;
      border-radius: 50px;
      border: 1px solid #1e1e2e;
      background: #12121a;
      color: #888;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;

      &.selected {
        background: color-mix(in srgb, var(--color) 20%, transparent);
        border-color: var(--color);
        color: var(--color);
        font-weight: 600;
      }

      &:hover:not(.selected) {
        border-color: #333;
        color: #ccc;
      }

      .chip-name { font-size: 0.8rem; }
    }

    .add-chip {
      border-style: dashed;
      &:hover { border-color: #6C63FF; color: #6C63FF; }
    }

    .timer-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
    }

    .timer-ring-wrapper {
      position: relative;
      width: 220px;
      height: 220px;
    }

    .timer-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);

      .ring-bg {
        fill: none;
        stroke: #1a1a28;
        stroke-width: 8;
      }

      .ring-progress {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        stroke-dasharray: 553;
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 0.4s ease, stroke 0.3s;
      }
    }

    .timer-display {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;

      .timer-time {
        color: #fff;
        font-size: 2.75rem;
        font-weight: 700;
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
      }

      .timer-sub {
        color: #555;
        font-size: 0.75rem;
      }
    }

    .controls {
      display: flex;
      gap: 0.75rem;
    }

    .btn-main {
      padding: 0.875rem 2.5rem;
      background: #6C63FF;
      color: #fff;
      border: none;
      border-radius: 50px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover { filter: brightness(1.1); transform: translateY(-1px); }
      &.btn-pause { background: #333; }
    }

    .btn-secondary {
      padding: 0.875rem 1.5rem;
      background: transparent;
      color: #888;
      border: 1px solid #2a2a3a;
      border-radius: 50px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
      &:hover { border-color: #43D9AD; color: #43D9AD; }
    }

    .presets-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .preset-chip {
      position: relative;
      padding: 0.5rem 1rem;
      border-radius: 50px;
      border: 1px solid #2a2a3a;
      background: #12121a;
      color: #888;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;

      &.active {
        border-color: #6C63FF;
        color: #6C63FF;
        background: rgba(108,99,255,0.1);
      }

      &:hover:not(.active):not(.preset-add) {
        border-color: #444;
        color: #ccc;
      }

      .preset-delete {
        display: inline-flex;
        margin-left: 0.4rem;
        color: #555;
        font-size: 1rem;
        line-height: 1;
        &:hover { color: #ff6584; }
      }
    }

    .preset-add {
      border-style: dashed;
      &:hover { border-color: #6C63FF; color: #6C63FF; }
    }

    .custom-time {
      display: flex;
      gap: 0.5rem;

      input {
        flex: 1;
        padding: 0.6rem 0.875rem;
        background: #0a0a10;
        border: 1px solid #1e1e2e;
        border-radius: 8px;
        color: #fff;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s;
        &:focus { border-color: #6C63FF; }
        &::placeholder { color: #333; }
      }

      button {
        padding: 0.6rem 1.25rem;
        background: #1e1e2e;
        border: 1px solid #2a2a3a;
        border-radius: 8px;
        color: #888;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
        &:hover { border-color: #6C63FF; color: #6C63FF; }
      }
    }

    .save-banner {
      background: rgba(67,217,173,0.1);
      border: 1px solid rgba(67,217,173,0.3);
      color: #43D9AD;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      font-size: 0.9rem;
      text-align: center;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      backdrop-filter: blur(4px);
    }

    .modal {
      background: #16161f;
      border: 1px solid #2a2a3a;
      border-radius: 16px;
      padding: 1.75rem;
      width: 100%;
      max-width: 360px;

      h3 {
        color: #fff;
        margin: 0 0 1.25rem;
        font-size: 1.1rem;
      }
    }

    .modal-field {
      margin-bottom: 1rem;

      label {
        display: block;
        color: #666;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.4rem;
      }

      input {
        width: 100%;
        padding: 0.65rem 0.875rem;
        background: #0f0f14;
        border: 1px solid #2a2a3a;
        border-radius: 8px;
        color: #fff;
        font-size: 0.9rem;
        outline: none;
        box-sizing: border-box;
        &:focus { border-color: #6C63FF; }
        &[type="color"] {
          height: 42px;
          padding: 2px;
          cursor: pointer;
        }
      }
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }

    .btn-cancel {
      flex: 1;
      padding: 0.7rem;
      background: transparent;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #666;
      cursor: pointer;
      &:hover { border-color: #444; color: #999; }
    }

    .btn-confirm {
      flex: 1;
      padding: 0.7rem;
      background: #6C63FF;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      &:hover { background: #7B73FF; }
    }

    .btn-pip {
      padding: 0.45rem 1rem;
      border-radius: 50px;
      border: 1px dashed #2a2a3a;
      background: transparent;
      color: #555;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.3px;

      &:hover {
        border-color: #6C63FF;
        color: #6C63FF;
      }

      &.pip-active {
        border-color: #ff6584;
        color: #ff6584;
        border-style: solid;
      }
    }

    @media (max-width: 480px) {
      .main {
        margin-left: 64px;
        padding: 1rem;
      }
      .timer-ring-wrapper { width: 180px; height: 180px; }
      .timer-time { font-size: 2.25rem !important; }
    }
  `]
})
export class TimerComponent implements OnInit, OnDestroy {
  timerSvc = inject(TimerService);
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);
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
    this.timerSvc.setMode(mode);
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
    this.timerSvc.stop();
    this.saveCurrentSession();
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

  logout(): void {
    this.timerSvc.stop();
    this.authSvc.logout();
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
    if (elapsed < 10 || !this.selectedType()) return;

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

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

    // Show banner
    this.savedDuration.set(this.formatDuration(elapsed));
    this.savedActivity.set(this.selectedType()!.name);
    this.showSaveBanner.set(true);
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => this.showSaveBanner.set(false), 4000);
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
