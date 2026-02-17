import { Injectable, inject } from '@angular/core';
import { TimerService } from './timer.service';
import { effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PipService {
  private timerSvc = inject(TimerService);

  private videoEl: HTMLVideoElement | null = null;
  private onEnterPiP: ((ev: Event) => void) | null = null;
  private onLeavePiP: ((ev: Event) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private isActive = false;

  // Canvas base size — larger for Windows 11 clock-like resizable PiP with high quality
  private readonly W = 320;
  private readonly H = 180;

  async toggle(activityColor: string = '#6C63FF'): Promise<void> {
    console.log('[PipService] toggle called — active=', this.isActive);
    if (this.isActive) {
      console.log('[PipService] stopping PiP');
      await this.stop();
    } else {
      console.log('[PipService] starting PiP');
      await this.start(activityColor);
    }
  }

  get active(): boolean {
    return this.isActive;
  }

  async start(activityColor: string): Promise<void> {
    console.log('[PipService] start() invoked');
    if (!document.pictureInPictureEnabled) {
      alert('Picture-in-Picture não é suportado neste navegador.');
      return;
    }

    this.canvas = document.createElement('canvas');
    const DPR = Math.max(2, window.devicePixelRatio || 2); // Force high-DPI
    const internalW = Math.round(this.W * DPR);
    const internalH = Math.round(this.H * DPR);
    // set internal pixel size for high-DPI rendering
    this.canvas.width = internalW;
    this.canvas.height = internalH;
    // set CSS size to base W/H so PiP remains compact
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx = this.canvas.getContext('2d')!;
    // scale the drawing context so drawing commands use logical CSS pixels
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // improve smoothing
    (this.ctx as any).imageSmoothingEnabled = true;
    try { (this.ctx as any).imageSmoothingQuality = 'high'; } catch {}
    console.log('[PipService] canvas created', { w: this.W, h: this.H });

    // Draw one frame so the captured stream has data immediately
    try {
      this.draw(activityColor);
      console.log('[PipService] initial canvas frame drawn');
    } catch (err) {
      console.warn('[PipService] initial draw failed:', err);
    }

    // Create video element from canvas stream (60fps for smooth resizable PiP)
    this.stream = this.canvas.captureStream(60);
    console.log('[PipService] captureStream created', this.stream);
    this.videoEl = document.createElement('video');
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    // Improve compatibility: ensure playsinline and attach to DOM (offscreen)
    this.videoEl.playsInline = true;
    this.videoEl.setAttribute('playsinline', '');
    // hint intrinsic size (use base CSS pixels so PiP stays small)
    this.videoEl.width = this.W;
    this.videoEl.height = this.H;
    this.videoEl.style.position = 'fixed';
    this.videoEl.style.left = '-9999px';
    this.videoEl.style.width = '1px';
    this.videoEl.style.height = '1px';
    document.body.appendChild(this.videoEl);

    try {
      await this.videoEl.play();
      console.log('[PipService] video.play() succeeded');
    } catch (err) {
      console.warn('[PipService] video.play() failed or was blocked:', err);
    }

    // Setup PiP event listeners — keep references so we can remove them later
    this.onEnterPiP = () => {
      this.isActive = true;
      this.renderLoop(activityColor);
    };
    this.onLeavePiP = () => {
      this.cleanup();
    };

    // Some browsers fire enter/leave on the document
    document.addEventListener('enterpictureinpicture', this.onEnterPiP);
    document.addEventListener('leavepictureinpicture', this.onLeavePiP);

    try {
      console.log('[PipService] requesting Picture-in-Picture');

      if (typeof this.videoEl.requestPictureInPicture !== 'function') {
        console.error('[PipService] video.requestPictureInPicture is not available on this platform');
        throw new Error('requestPictureInPicture not supported on video element');
      }

      await this.videoEl.requestPictureInPicture();
      // requestPictureInPicture may have already triggered enterpictureinpicture,
      // but ensure state and render loop start if not.
      if (!this.isActive) {
        this.isActive = true;
        this.renderLoop(activityColor);
      }
      console.log('[PipService] requestPictureInPicture resolved; document.pictureInPictureElement=', document.pictureInPictureElement);
    } catch (err) {
      console.error('[PipService] PiP error:', err);
      this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
    this.cleanup();
  }

  private renderLoop(activityColor: string): void {
    if (!this.isActive) return;

    this.draw(activityColor);
    this.animFrameId = requestAnimationFrame(() => this.renderLoop(activityColor));
  }

  private draw(color: string): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const mode = this.timerSvc.mode();
    const time = this.timerSvc.formattedTime();
    const progress = this.timerSvc.progress();
    const state = this.timerSvc.state();

    // Background
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, this.W, this.H);

    // Subtle border
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, this.W - 1, this.H - 1);

    if (mode === 'pomodoro') {
      this.drawPomodoro(ctx, color, time, progress, state);
    } else {
      this.drawStopwatch(ctx, time, state);
    }
  }

  private drawPomodoro(
    ctx: CanvasRenderingContext2D,
    color: string,
    time: string,
    progress: number,
    state: string
  ): void {
    const W = this.W;
    const H = this.H;
    const scale = this.W / 320; // Adjust scale for new base size
    const PAD = Math.max(12, Math.round(24 * scale));
    const barY = H - Math.round(32 * scale);
    const barH = Math.max(4, Math.round(8 * scale));
    const barW = W - PAD * 2;

    // Mode label
    ctx.fillStyle = '#555';
    ctx.font = `500 ${Math.max(14, Math.round(18 * scale))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('🍅 POMODORO', PAD, Math.round(32 * scale));

    // State indicator
    const stateLabel: Record<string, string> = {
      running: '● FOCANDO',
      paused: '⏸ PAUSADO',
      idle: '○ PRONTO',
      finished: '✓ CONCLUÍDO'
    };
    ctx.fillStyle = state === 'running' ? color : '#555';
    ctx.font = `600 ${Math.max(13, Math.round(16 * scale))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(stateLabel[state] ?? '', W - PAD, Math.round(32 * scale));

    // Time display
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(36, Math.round(64 * scale))}px system-ui, monospace, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(time, W / 2, Math.round(110 * scale));

    // Progress bar track
    ctx.fillStyle = '#1e1e2e';
    ctx.beginPath();
    this.roundRect(ctx, PAD, barY, barW, barH, Math.max(2, Math.round(3 * scale)));
    ctx.fill();

    // Progress bar fill
    if (progress > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      this.roundRect(ctx, PAD, barY, barW * Math.min(progress, 1), barH, Math.max(2, Math.round(3 * scale)));
      ctx.fill();
    }
  }

  // Fallback rounded-rect helper for CanvasRenderingContext2D.roundRect
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(x, y, width, height, radius);
      return;
    }

    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  private drawStopwatch(
    ctx: CanvasRenderingContext2D,
    time: string,
    state: string
  ): void {
    const W = this.W;
    const scale = this.W / 320; // Match new base size
    const PAD = Math.max(12, Math.round(24 * scale));

    // Mode label
    ctx.fillStyle = '#555';
    ctx.font = `500 ${Math.max(14, Math.round(18 * scale))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('⏱ CRONÔMETRO', PAD, Math.round(32 * scale));

    // State
    const stateLabel: Record<string, string> = {
      running: '● RODANDO',
      paused: '⏸ PAUSADO',
      idle: '○ PRONTO',
      finished: '✓ CONCLUÍDO'
    };
    ctx.fillStyle = state === 'running' ? '#43D9AD' : '#555';
    ctx.font = `600 ${Math.max(13, Math.round(16 * scale))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(stateLabel[state] ?? '', W - PAD, Math.round(32 * scale));

    // Time — centered, large
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(36, Math.round(72 * scale))}px system-ui, monospace, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(time, W / 2, Math.round(120 * scale));
  }

  private cleanup(): void {
    this.isActive = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {}
      try {
        this.videoEl.srcObject = null;
      } catch {}
      if (this.videoEl.parentElement) {
        this.videoEl.parentElement.removeChild(this.videoEl);
      }
      this.videoEl = null;
    }

    if (this.onEnterPiP) {
      document.removeEventListener('enterpictureinpicture', this.onEnterPiP);
      this.onEnterPiP = null;
    }
    if (this.onLeavePiP) {
      document.removeEventListener('leavepictureinpicture', this.onLeavePiP);
      this.onLeavePiP = null;
    }

    this.canvas = null;
    this.ctx = null;
  }
}
