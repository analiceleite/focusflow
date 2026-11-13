import { Injectable, inject } from '@angular/core';
import { drawPixelIcon, resolveActivityIcon } from '../game/pixel-icons';
import { AvatarConfig, DEFAULT_AVATAR, MONSTER_VARIANTS, MonsterVariant, Weapon } from '../game/game-data';
import { HeroPose, Sprite, buildHeroSprite, buildMonsterSprite } from '../game/sprites';
import { SCENARIOS, Scenario, buildScenarioDecor } from '../game/scenarios';
import { TimerService } from './timer.service';
import { ThemeService } from './theme.service';
import { DeviceService } from './device.service';

/** Dados do jogo que a janela PiP mostra (enviados pela tela do Timer). */
export interface PipScene {
  avatar: AvatarConfig | null;
  weapon: Weapon | null;
  monster: MonsterVariant;
  /** HP restante do chefe, 0..100. */
  bossPercent: number;
  combo: number;
  scenario: Scenario;
  /** Ícone salvo da atividade ("px:book", emoji antigo, ...). */
  activityIcon: string;
}

interface Float {
  text: string;
  color: string;
  born: number;
}

/** Tamanho base (px CSS). O canvas é renderizado em 2× ou mais. */
const W = 280;
const H = 148;
/** Unidade dos sprites no palco (1 pixel do sprite = 3 px CSS). */
const U = 3;
const FPS = 30;
const STEP_MS = 380;
const HIT_MS = 420;
const FLOAT_MS = 1200;

const STATE_STYLE: Record<string, { label: string; color: string }> = {
  idle: { label: 'Pronto', color: '#8a8780' },
  running: { label: 'Em foco', color: '#f26b3a' },
  paused: { label: 'Pausado', color: '#f5b841' },
  finished: { label: 'Concluído', color: '#5fa889' },
};

/**
 * Janela Picture-in-Picture em linguagem pixel:
 * quadro na cor do estado · relógio em Press Start 2P · barra de 24 segmentos ·
 * faixa de palco com o herói andando e golpeando o chefe a cada minuto.
 */
@Injectable({ providedIn: 'root' })
export class PipService {
  private timerSvc = inject(TimerService);
  private themeService = inject(ThemeService);
  private deviceService = inject(DeviceService);

  private videoEl: HTMLVideoElement | null = null;
  private onEnterPiP: ((ev: Event) => void) | null = null;
  private onLeavePiP: ((ev: Event) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private isActive = false;
  private lastDraw = 0;

  private activityLabel = '';
  private activityColor = '#F26B3A';
  /** Meta diária: progresso (0..100+) e minutos da meta (0 = sem meta, barra escondida). */
  private goalProgress = 0;
  private dailyGoalMinutes = 0;

  // ── Cena ──
  private scene: PipScene = {
    avatar: DEFAULT_AVATAR,
    weapon: null,
    monster: MONSTER_VARIANTS[0],
    bossPercent: 100,
    combo: 1,
    scenario: SCENARIOS[0],
    activityIcon: '',
  };
  private heroSprites: Record<HeroPose, Sprite> | null = null;
  private monsterSprite: Sprite | null = null;
  private decorSprite: Sprite | null = null;

  // ── Animação ──
  private lastMinute = -1;
  private hitUntil = 0;
  private floats: Float[] = [];
  private lastState = 'idle';
  private walkOffset = 0;

  get active(): boolean { return this.isActive; }

  get isSupported(): boolean { return this.deviceService.isPictureInPictureSupported(); }

  async toggle(activityColor: string = '#F26B3A', activityLabel: string = ''): Promise<void> {
    if (!this.isSupported) return;
    if (this.isActive) await this.stop();
    else await this.start(activityColor, activityLabel);
  }

  /** Atualiza herói, chefe, cenário e ícone da atividade. Barato: só refaz sprites que mudaram. */
  setScene(next: PipScene): void {
    const prev = this.scene;
    this.scene = next;
    if (!this.heroSprites || prev.avatar !== next.avatar || prev.weapon !== next.weapon) this.buildHeroSprites();
    if (!this.monsterSprite || prev.monster !== next.monster) this.monsterSprite = buildMonsterSprite(next.monster);
    if (!this.decorSprite || prev.scenario !== next.scenario) this.decorSprite = buildScenarioDecor(next.scenario);
  }

  updateGoalProgress(progress: number, goalMinutes: number): void {
    this.goalProgress = progress;
    this.dailyGoalMinutes = goalMinutes;
    try { this.draw(performance.now()); } catch { }
  }

  updateActivity(activityColor?: string, activityLabel?: string): void {
    if (typeof activityColor === 'string') this.activityColor = activityColor;
    if (typeof activityLabel === 'string') this.activityLabel = activityLabel;
    try { this.draw(performance.now()); } catch { }
  }

  async start(activityColor: string, activityLabel: string = ''): Promise<void> {
    if (!this.isSupported || !document.pictureInPictureEnabled) return;

    this.canvas = document.createElement('canvas');
    const DPR = Math.max(2, Math.round(window.devicePixelRatio || 2));
    this.canvas.width = W * DPR;
    this.canvas.height = H * DPR;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.activityLabel = activityLabel || '';
    this.activityColor = activityColor || this.activityColor;
    this.lastMinute = Math.floor(this.timerSvc.elapsedSeconds() / 60);
    this.lastState = this.timerSvc.state();
    this.floats = [];
    if (!this.heroSprites) this.setScene(this.scene);

    // As fontes pixel precisam estar carregadas antes do 1º quadro do vídeo
    await this.loadFonts();
    try { this.draw(performance.now()); } catch { }

    this.stream = this.canvas.captureStream(FPS);
    this.videoEl = document.createElement('video');
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.setAttribute('playsinline', '');
    this.videoEl.width = W;
    this.videoEl.height = H;
    this.videoEl.style.position = 'fixed';
    this.videoEl.style.left = '-9999px';
    this.videoEl.style.width = '1px';
    this.videoEl.style.height = '1px';
    document.body.appendChild(this.videoEl);

    try { await this.videoEl.play(); } catch { }

    this.onEnterPiP = () => { this.isActive = true; this.renderLoop(); };
    this.onLeavePiP = () => { this.cleanup(); };
    document.addEventListener('enterpictureinpicture', this.onEnterPiP);
    document.addEventListener('leavepictureinpicture', this.onLeavePiP);

    try {
      if (typeof this.videoEl.requestPictureInPicture !== 'function') throw new Error('not supported');
      await this.videoEl.requestPictureInPicture();
      if (!this.isActive) { this.isActive = true; this.renderLoop(); }
    } catch (err) {
      console.error('[PipService] PiP error:', err);
      this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    this.cleanup();
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────

  private renderLoop(): void {
    if (!this.isActive) return;
    const now = performance.now();
    if (now - this.lastDraw >= 1000 / FPS - 2) {
      this.lastDraw = now;
      this.draw(now);
    }
    this.animFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  private draw(now: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const state = this.timerSvc.state();
    const st = STATE_STYLE[state] ?? STATE_STYLE['idle'];
    const t = this.themeColors();

    this.trackEvents(state, now);

    // Fundo + quadro na cor do estado
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = st.color;
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillRect(0, 0, 3, H);
    ctx.fillRect(W - 3, 0, 3, H);

    this.drawHeader(ctx, st, state, now, t);
    this.drawClock(ctx, st, t);
    this.drawSegments(ctx, st, t);
    this.drawStage(ctx, state, now);
    this.drawGoal(ctx, t);
  }

  // ─── Partes ───────────────────────────────────────────────────────────────

  private drawHeader(ctx: CanvasRenderingContext2D, st: { label: string; color: string }, state: string, now: number, t: ThemeColors): void {
    // Chip de estado: quadrado (pisca em foco) + rótulo
    const blinkOff = state === 'running' && Math.floor(now / 500) % 2 === 1;
    ctx.fillStyle = st.color;
    if (!blinkOff) ctx.fillRect(10, 11, 6, 6);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(st.label, 20, 14);

    // Modo (pomodoro / cronômetro) logo após o estado
    const modeX = 20 + Math.ceil(ctx.measureText(st.label).width) + 8;
    drawPixelIcon(ctx, this.timerSvc.mode() === 'pomodoro' ? 'tomato' : 'clock', modeX + 6, 14, 12);

    // Atividade à direita: ícone pixel (ou inicial) + nome
    const label = this.activityLabel.trim();
    if (!label) return;
    ctx.font = '8px "Press Start 2P", monospace';
    const maxW = this.rightEdge() - (modeX + 14) - 30;
    const text = this.ellipsize(ctx, label, maxW);
    const tw = Math.ceil(ctx.measureText(text).width);
    const right = this.rightEdge();
    ctx.fillStyle = t.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(text, right, 14);

    const iconCx = right - tw - 9;
    const icon = resolveActivityIcon(this.scene.activityIcon);
    if (icon.kind === 'pixel') {
      drawPixelIcon(ctx, icon.name, iconCx, 14, 12);
    } else {
      ctx.fillStyle = this.activityColor;
      ctx.fillRect(iconCx - 6, 8, 12, 12);
      ctx.fillStyle = '#15171c';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label[0].toUpperCase(), iconCx, 14);
    }
    // Faixa na cor da atividade sob o nome
    ctx.fillStyle = this.activityColor;
    ctx.fillRect(right - tw, 21, tw, 2);
  }

  private drawClock(ctx: CanvasRenderingContext2D, st: { color: string }, t: ThemeColors): void {
    const time = this.timerSvc.formattedTime();
    // Press Start 2P: monoespaçada, ~1em por caractere
    const size = time.length > 5 ? 20 : 28;
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Sombra dura deslocada na cor do estado
    ctx.fillStyle = this.withAlpha(st.color, 0.45);
    const cx = Math.round((10 + this.rightEdge()) / 2);
    ctx.fillText(time, cx + 3, 62 + 3);
    ctx.fillStyle = t.textPrimary;
    ctx.fillText(time, cx, 62);
  }

  private drawSegments(ctx: CanvasRenderingContext2D, st: { color: string }, t: ThemeColors): void {
    const total = 24;
    const ratio = this.timerSvc.mode() === 'pomodoro'
      ? this.timerSvc.progress()
      : (this.timerSvc.elapsedSeconds() % 3600) / 3600;
    const filled = Math.floor(Math.min(1, ratio) * total);
    const gap = 2;
    const x0 = 10;
    const segW = (this.rightEdge() - x0 - gap * (total - 1)) / total;
    const y = 72;
    for (let i = 0; i < total; i++) {
      const x = Math.round(x0 + i * (segW + gap));
      const w = Math.round(x0 + (i + 1) * (segW + gap) - gap) - x;
      ctx.fillStyle = i < filled ? st.color : t.inset;
      ctx.fillRect(x, y, w, 7);
      if (i < filled) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, y + 5, w, 2);
      }
    }
  }

  private drawStage(ctx: CanvasRenderingContext2D, state: string, now: number): void {
    const top = 86;
    const bottom = H - 3;
    const sh = bottom - top;
    const scn = this.scene.scenario;

    ctx.save();
    ctx.beginPath();
    ctx.rect(3, top, W - 6, sh);
    ctx.clip();

    // Céu
    const sky = ctx.createLinearGradient(0, top, 0, bottom);
    sky.addColorStop(0, scn.skyTop);
    sky.addColorStop(1, scn.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(3, top, W - 6, sh);

    // Cenário rolando (2 px do sprite por unidade para caber na faixa)
    if (this.decorSprite) {
      if (state === 'running') this.walkOffset = (this.walkOffset + 0.6) % (this.decorSprite.width * 2);
      const du = 2;
      const tileW = this.decorSprite.width * du;
      const dy = bottom - 6 - this.decorSprite.height * du;
      const off = Math.floor(this.walkOffset);
      for (let x = -off; x < W; x += tileW) this.drawSprite(ctx, this.decorSprite, x, dy, du, false);
    }

    // Chão
    ctx.fillStyle = 'rgba(26, 18, 8, 0.85)';
    ctx.fillRect(3, bottom - 6, W - 6, 6);

    // Herói
    const hero = this.heroSprites;
    const finished = state === 'finished';
    const bob = state === 'idle' ? (Math.floor(now / 800) % 2) : finished ? (Math.floor(now / 200) % 2) * 3 : 0;
    const lunge = now < this.hitUntil ? 6 : 0;
    if (hero) {
      const pose: HeroPose = finished ? 'cheer'
        : state === 'running' ? (Math.floor(now / STEP_MS) % 2 ? 'step' : 'stand')
        : 'stand';
      const sp = hero[pose];
      this.drawSprite(ctx, sp, 34 + lunge, bottom - 6 - sp.height * U - bob, U, false);
    }

    // Chefe + barra de HP
    if (this.monsterSprite) {
      const sp = this.monsterSprite;
      const bw = sp.width * U;
      const bx = W - 34 - bw;
      const shake = now < this.hitUntil ? (Math.floor(now / 60) % 2 ? 2 : -2) : 0;
      const by = bottom - 6 - sp.height * U;
      const defeated = this.scene.bossPercent <= 0;
      ctx.globalAlpha = defeated ? 0.35 : 1;
      this.drawSprite(ctx, sp, bx + shake, by, U, false);
      if (now < this.hitUntil && Math.floor(now / 70) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(bx + shake, by, bw, sp.height * U);
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#0a0b0e';
      ctx.fillRect(bx, by - 8, bw, 5);
      ctx.fillStyle = '#2a0f12';
      ctx.fillRect(bx + 1, by - 7, bw - 2, 3);
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(bx + 1, by - 7, Math.round((bw - 2) * Math.max(0, this.scene.bossPercent) / 100), 3);
    }

    // Pausado: cena escurece e o herói cochila
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(10, 11, 14, 0.45)';
      ctx.fillRect(3, top, W - 6, sh);
      this.drawBubble(ctx, 'Zz', 34 + 30, top + 4);
    }

    // Floats (dano / XP)
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this.floats = this.floats.filter(f => now - f.born < FLOAT_MS);
    for (const f of this.floats) {
      const p = (now - f.born) / FLOAT_MS;
      // XP sobe sobre o herói; dano sobe à esquerda do chefe (sem cobrir a barra de HP)
      const isXp = f.color === '#f5b841';
      const fx = isXp ? 34 + 18 : W - 34 - 36 - 16;
      const fy = Math.round(bottom - (isXp ? 40 : 22) - p * 16);
      ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2;
      ctx.fillStyle = '#0a0b0e';
      ctx.fillText(f.text, fx + 1, fy + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Linha que separa palco do painel
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(3, top - 2, W - 6, 2);
  }

  /** Borda direita do painel superior: abre espaço para a barra de meta quando existe meta. */
  private rightEdge(): number {
    return this.dailyGoalMinutes > 0 ? W - 22 : W - 10;
  }

  /** Meta diária: barra vertical segmentada à direita, enche de baixo para cima. */
  private drawGoal(ctx: CanvasRenderingContext2D, t: ThemeColors): void {
    if (this.dailyGoalMinutes <= 0) return;
    const x = W - 16;
    const w = 8;
    const top = 22;
    const bottom = 80;
    const total = 8;
    const gap = 2;
    const segH = (bottom - top - gap * (total - 1)) / total;
    const filled = Math.floor(Math.min(1, this.goalProgress / 100) * total);
    const done = this.goalProgress >= 100;

    drawPixelIcon(ctx, done ? 'star' : 'target', x + w / 2, 13, 12);
    for (let i = 0; i < total; i++) {
      // i = 0 é o segmento de baixo
      const y2 = Math.round(bottom - i * (segH + gap));
      const y1 = Math.round(bottom - i * (segH + gap) - segH);
      ctx.fillStyle = i < filled ? (done ? '#f5b841' : '#5fa889') : t.inset;
      ctx.fillRect(x, y1, w, y2 - y1);
    }
  }

  // ─── Eventos de animação ─────────────────────────────────────────────────

  /** Detecta minuto completo (golpe) e conclusão (XP) a partir do timer. */
  private trackEvents(state: string, now: number): void {
    const minute = Math.floor(this.timerSvc.elapsedSeconds() / 60);
    if (state === 'running' && minute > this.lastMinute && this.lastMinute >= 0) {
      this.hitUntil = now + HIT_MS;
      const c = this.scene.combo;
      this.floats.push({ text: `-${Number.isInteger(c) ? c : c.toFixed(1)}`, color: '#ffffff', born: now });
    }
    if (state === 'finished' && this.lastState !== 'finished') {
      const xp = Math.floor(minute * this.scene.combo);
      if (xp > 0) this.floats.push({ text: `+${xp} XP`, color: '#f5b841', born: now });
    }
    this.lastMinute = minute;
    this.lastState = state;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildHeroSprites(): void {
    const a = this.scene.avatar ?? DEFAULT_AVATAR;
    const w = this.scene.weapon;
    this.heroSprites = {
      stand: buildHeroSprite(a, w, 'stand'),
      step: buildHeroSprite(a, w, 'step'),
      cheer: buildHeroSprite(a, w, 'cheer'),
    };
  }

  private drawSprite(ctx: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, u: number, mirror: boolean): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (const p of sp.pixels) {
      const px = mirror ? sp.width - 1 - p.x : p.x;
      ctx.fillStyle = p.fill;
      ctx.fillRect(x0 + px * u, y0 + p.y * u, u, u);
    }
  }

  private drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.font = '8px "Press Start 2P", monospace';
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(x - 1, y - 1, w + 2, 14);
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = '#15171c';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 4, y + 6);
  }

  private ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
    return out + '…';
  }

  private async loadFonts(): Promise<void> {
    if (!document.fonts?.load) return;
    const wait = Promise.all([
      document.fonts.load('28px "Press Start 2P"'),
      document.fonts.load('8px "Press Start 2P"'),
    ]).catch(() => undefined);
    // Não segura a abertura do PiP por mais de 800 ms
    await Promise.race([wait, new Promise(r => setTimeout(r, 800))]);
  }

  private cssVar(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private themeColors(): ThemeColors {
    const dark = this.themeService.isDarkMode();
    return {
      bg: this.cssVar('--bg-card', dark ? '#1a1d24' : '#fffdf8'),
      inset: this.cssVar('--bg-inset', dark ? '#101216' : '#e6dfd0'),
      textPrimary: this.cssVar('--text-primary', dark ? '#f4f2ee' : '#17181c'),
    };
  }

  private withAlpha(hex: string, alpha: number): string {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private cleanup(): void {
    this.isActive = false;
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.videoEl) {
      try { this.videoEl.pause(); } catch { }
      try { this.videoEl.srcObject = null; } catch { }
      if (this.videoEl.parentElement) this.videoEl.parentElement.removeChild(this.videoEl);
      this.videoEl = null;
    }
    if (this.onEnterPiP) { document.removeEventListener('enterpictureinpicture', this.onEnterPiP); this.onEnterPiP = null; }
    if (this.onLeavePiP) { document.removeEventListener('leavepictureinpicture', this.onLeavePiP); this.onLeavePiP = null; }
    this.canvas = null;
    this.ctx = null;
  }
}

interface ThemeColors {
  bg: string;
  inset: string;
  textPrimary: string;
}
