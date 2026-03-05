import { Injectable, inject } from '@angular/core';
import { TimerService } from './timer.service';
import { ThemeService } from './theme.service';
import { DeviceService } from './device.service';

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
  private activityLabel: string = '';
  private activityColor: string = '#6C63FF';

  // Tick animation state
  private tickAlpha = 0;
  private tickDir = 1;
  private lastTickTime = 0;

  // Pulse ring animation
  private pulseRadius = 0;
  private pulseAlpha = 0;
  private lastPulseTime = 0;
  private pulseTriggered = false;

  // Canvas base size — widescreen compact PiP
  private readonly W = 280;
  private readonly H = 148;

  private getCssVar(name: string, fallback: string): string {
    if (globalThis.window === undefined || globalThis.document === undefined) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private getThemeColors() {
    const isDark = this.themeService.isDarkMode();
    return {
      // Pull colors from global theme vars so PiP always mirrors app theme.
      background: this.getCssVar('--bg-primary', isDark ? '#1c1c1e' : '#f5f5f7'),
      surface: this.getCssVar('--bg-card', isDark ? '#1f1f21' : '#ffffff'),
      border: this.getCssVar('--border-color', isDark ? '#3a3a3c' : '#d2d2d7'),
      textPrimary: this.getCssVar('--text-primary', isDark ? '#f5f5f7' : '#1d1d1f'),
      textSecondary: this.getCssVar('--text-secondary', isDark ? '#d1d1d6' : '#3a3a3c'),
      textMuted: this.getCssVar('--text-muted', isDark ? '#8e8e93' : '#6e6e73'),
      progressTrack: this.getCssVar('--bg-secondary', isDark ? '#232325' : '#ffffff'),
      glow: isDark,
    };
  }

  async toggle(activityColor: string = '#6C63FF', activityLabel: string = ''): Promise<void> {
    if (!this.isSupported) return;
    if (this.isActive) await this.stop();
    else await this.start(activityColor, activityLabel);
  }

  get active(): boolean { return this.isActive; }

  get isSupported(): boolean { return this.deviceService.isPictureInPictureSupported(); }

  async start(activityColor: string, activityLabel: string = ''): Promise<void> {
    if (!this.isSupported || !document.pictureInPictureEnabled) return;

    this.canvas = document.createElement('canvas');
    const DPR = Math.max(2, window.devicePixelRatio || 2);
    this.canvas.width = Math.round(this.W * DPR);
    this.canvas.height = Math.round(this.H * DPR);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    (this.ctx as any).imageSmoothingEnabled = true;
    try { (this.ctx as any).imageSmoothingQuality = 'high'; } catch { }

    this.activityLabel = activityLabel || '';
    this.activityColor = activityColor || this.activityColor;
    this.tickAlpha = 0;
    this.tickDir = 1;
    this.pulseRadius = 0;
    this.pulseAlpha = 0;

    try { this.draw(this.activityColor, performance.now()); } catch { }

    this.stream = this.canvas.captureStream(60);
    this.videoEl = document.createElement('video');
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.setAttribute('playsinline', '');
    this.videoEl.width = this.W;
    this.videoEl.height = this.H;
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

  private renderLoop(): void {
    if (!this.isActive) return;
    this.draw(this.activityColor, performance.now());
    this.animFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  private draw(color: string, now: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const mode = this.timerSvc.mode();
    const time = this.timerSvc.formattedTime();
    const progress = this.timerSvc.progress();
    const state = this.timerSvc.state();
    const theme = this.getThemeColors();

    // ── Background ────────────────────────────────────────────────
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.W, this.H);

    // Subtle radial glow behind the main area (dark mode only)
    if (theme.glow) {
      const grd = ctx.createRadialGradient(this.W * 0.35, this.H * 0.5, 0, this.W * 0.35, this.H * 0.5, 110);
      grd.addColorStop(0, this.hexToRgba(color, 0.07));
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    // ── Layout: left panel (arc) + right panel (info) ─────────────
    const arcCX = 60;
    const arcCY = this.H / 2;
    const arcR = 38;

    if (mode === 'pomodoro') {
      this.drawArc(ctx, arcCX, arcCY, arcR, progress, state, color, theme, now);
    } else {
      this.drawStopwatchIcon(ctx, arcCX, arcCY, arcR, state, color, theme, now);
    }

    // ── Right panel ───────────────────────────────────────────────
    const rx = arcCX + arcR + 18;
    const rw = this.W - rx - 14;

    // Mode badge
    const modeText = mode === 'pomodoro' ? '🍅 POMODORO' : '⏱ CRONÔMETRO';
    ctx.fillStyle = theme.textMuted;
    ctx.font = `600 9.5px "SF Mono", "Fira Code", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(modeText, rx, 24);

    // Activity pill
    const activity = (this.activityLabel || '').trim();
    if (activity) {
      ctx.save();
      ctx.font = `700 10px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(activity).width;
      const ph = 16, px = 5;
      const pw = Math.min(rw, tw + px * 2 + 16);
      const py = 30;

      // Pill background — stronger alpha so it reads on both light/dark
      ctx.beginPath();
      this.roundRect(ctx, rx, py, pw, ph, ph / 2);
      ctx.fillStyle = this.hexToRgba(color, theme.glow ? 0.18 : 0.12);
      ctx.fill();

      // Pill left dot
      ctx.beginPath();
      ctx.arc(rx + 9, py + ph / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Pill text — use the activity color directly, readable on both themes
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.font = `700 10px system-ui, sans-serif`;
      ctx.fillText(activity, rx + 16, py + ph / 2);
      ctx.restore();
    }

    // Time display — the hero element
    ctx.fillStyle = theme.textPrimary;
    ctx.font = `300 36px "SF Pro Display", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Letter spacing simulation (draw char by char for mono spacing)
    this.drawMonoTime(ctx, time, rx, activity ? 80 : 72, theme.textPrimary);

    // State label under the time
    const stateConfig: Record<string, { label: string; dotColor: string }> = {
      running: { label: 'focando', dotColor: color },
      paused: { label: 'pausado', dotColor: '#F59E0B' },
      idle: { label: 'pronto', dotColor: theme.textMuted },
      finished: { label: 'concluído', dotColor: '#10B981' },
    };
    const sc = stateConfig[state] ?? stateConfig['idle'];

    const dotY = activity ? 96 : 88;

    // Blinking dot for running state
    if (state === 'running') {
      const elapsed = now - this.lastTickTime;
      if (elapsed > 16) {
        this.tickAlpha += this.tickDir * (elapsed / 800);
        if (this.tickAlpha >= 1) { this.tickAlpha = 1; this.tickDir = -1; }
        if (this.tickAlpha <= 0.2) { this.tickAlpha = 0.2; this.tickDir = 1; }
        this.lastTickTime = now;
      }
      ctx.globalAlpha = this.tickAlpha;
    }
    ctx.beginPath();
    ctx.arc(rx + 5, dotY - 3.5, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = sc.dotColor;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = theme.textSecondary;
    ctx.font = `400 10px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(sc.label, rx + 13, dotY);

    // ── Bottom progress bar (pomodoro only) ──────────────────────
    if (mode === 'pomodoro') {
      const bx = rx, by = this.H - 18, bw = rw, bh = 3;
      ctx.fillStyle = theme.progressTrack;
      ctx.beginPath();
      this.roundRect(ctx, bx, by, bw, bh, 2);
      ctx.fill();

      if (progress > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        this.roundRect(ctx, bx, by, bw * Math.min(progress, 1), bh, 2);
        ctx.fill();

        // Glowing tip
        if (theme.glow && progress < 0.99) {
          const tipX = bx + bw * Math.min(progress, 1);
          const tipGrd = ctx.createRadialGradient(tipX, by + bh / 2, 0, tipX, by + bh / 2, 8);
          tipGrd.addColorStop(0, this.hexToRgba(color, 0.6));
          tipGrd.addColorStop(1, 'transparent');
          ctx.fillStyle = tipGrd;
          ctx.fillRect(tipX - 8, by - 5, 16, bh + 10);
        }
      }

      // Progress percentage tiny label
      const pctStr = `${Math.round(progress * 100)}%`;
      ctx.fillStyle = theme.textMuted;
      ctx.font = `500 8px "SF Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(pctStr, bx + bw, by - 4);
    }

    // ── Divider line ──────────────────────────────────────────────
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(arcCX + arcR + 9, 16);
    ctx.lineTo(arcCX + arcR + 9, this.H - 16);
    ctx.stroke();
  }

  // ── Arc ring (Pomodoro) ───────────────────────────────────────────────────

  private drawArc(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    progress: number, state: string,
    color: string, theme: any, now: number
  ): void {
    const TAU = Math.PI * 2;
    const startAngle = -Math.PI / 2; // 12 o'clock

    // Track circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = theme.progressTrack;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Filled arc (progress)
    if (progress > 0.001) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + TAU * Math.min(progress, 1));
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Glow on the arc tip (dark mode)
      if (theme.glow) {
        const tipAngle = startAngle + TAU * Math.min(progress, 1);
        const tipX = cx + Math.cos(tipAngle) * r;
        const tipY = cy + Math.sin(tipAngle) * r;
        const grd = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 10);
        grd.addColorStop(0, this.hexToRgba(color, 0.5));
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 10, 0, TAU);
        ctx.fill();
      }
    }

    // Center emoji + state
    const emoji = state === 'finished' ? '✅' : state === 'paused' ? '⏸' : '🍅';
    ctx.font = `${state === 'running' ? 22 : 20}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy - 5);

    // Percentage under emoji
    const pct = Math.round(progress * 100);
    ctx.fillStyle = theme.textSecondary;
    ctx.font = `600 10px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, cx, cy + 14);
  }

  // ── Stopwatch icon (Cronômetro) ────────────────────────────────────────────

  private drawStopwatchIcon(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    state: string, color: string, theme: any, now: number
  ): void {
    const TAU = Math.PI * 2;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = theme.progressTrack;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner circle fill
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, TAU);
    ctx.fillStyle = this.hexToRgba(color, theme.glow ? 0.28 : 0.22);
    ctx.fill();

    // Animated second hand when running
    if (state === 'running') {
      const sec = now / 1000;
      const angle = -Math.PI / 2 + (sec % 60) / 60 * TAU;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * (r - 10), cy + Math.sin(angle) * (r - 10));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center icon
    const icon = state === 'finished' ? '✅' : state === 'paused' ? '⏸' : '⏱';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, cy);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Draw time with consistent character widths (monospace feel, even on proportional fonts).
   */
  private drawMonoTime(ctx: CanvasRenderingContext2D, time: string, x: number, y: number, color: string): void {
    ctx.font = `200 32px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;

    let cx = x;
    const charW = 19;
    const colonW = 9;

    for (const ch of time) {
      const w = ch === ':' ? colonW : charW;
      ctx.textAlign = 'center';
      ctx.fillText(ch, cx + w / 2, y);
      cx += w;
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if ((ctx as any).roundRect) { (ctx as any).roundRect(x, y, w, h, r); return; }
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  updateActivity(activityColor?: string, activityLabel?: string): void {
    if (typeof activityColor === 'string') this.activityColor = activityColor;
    if (typeof activityLabel === 'string') this.activityLabel = activityLabel;
    try { this.draw(this.activityColor, performance.now()); } catch { }
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