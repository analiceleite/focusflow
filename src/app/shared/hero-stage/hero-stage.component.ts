import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { PixelSpriteComponent } from '../pixel-sprite/pixel-sprite.component';
import { AvatarConfig, DEFAULT_AVATAR, MonsterVariant, Weapon } from '../../core/game/game-data';
import { HeroPose, Sprite, buildHeroSprite, buildMonsterSprite } from '../../core/game/sprites';
import { Scenario, buildScenarioDecor } from '../../core/game/scenarios';

export type StageState = 'idle' | 'running' | 'paused' | 'finished';

interface Float {
  id: number;
  text: string;
  kind: 'dmg' | 'xp';
}

const STEP_MS = 380;
const HIT_MS = 420;
const FLOAT_MS = 1200;

/**
 * Palco do herói: cenário desbloqueado, herói à esquerda e chefe da semana à direita.
 * - running: o herói anda (cenário rola) e cada minuto completo vira um golpe no chefe.
 * - paused: cena escurece e o herói "cochila".
 * - finished: comemoração com estouro de XP.
 */
@Component({
  selector: 'app-hero-stage',
  standalone: true,
  imports: [PixelSpriteComponent],
  template: `
    <div class="stage" [class]="'stage is-' + state" [style.--sky-top]="scenario?.skyTop"
         [style.--sky-bottom]="scenario?.skyBottom">
      <div class="sky" aria-hidden="true">
        <span class="cloud c1"></span>
        <span class="cloud c2"></span>
        <span class="cloud c3"></span>
      </div>

      @if (decor) {
        <div class="decor-track" aria-hidden="true">
          <app-pixel-sprite class="decor" [sprite]="decor" [stretch]="true"></app-pixel-sprite>
          <app-pixel-sprite class="decor" [sprite]="decor" [stretch]="true"></app-pixel-sprite>
        </div>
      }
      <div class="ground" aria-hidden="true"></div>

      <div class="actor hero-wrap" [class.lunge]="hitting">
        @if (state === 'paused') { <span class="bubble" aria-hidden="true">Zz</span> }
        @if (hero) {
          <app-pixel-sprite class="hero" [sprite]="hero" label="Seu herói"></app-pixel-sprite>
        }
        <span class="shadow" aria-hidden="true"></span>
      </div>

      @if (monster && monsterVariant) {
        <div class="actor boss-wrap" [class.defeated]="bossPercent <= 0">
          <div class="boss-hp" [attr.aria-label]="'Vida do chefe: ' + bossPercent.toFixed(0) + '%'">
            <div class="boss-hp-fill" [style.width.%]="bossPercent"></div>
          </div>
          <app-pixel-sprite class="boss" [class.hit]="hitting" [sprite]="monster"
                            [label]="monsterVariant.name"></app-pixel-sprite>
          <span class="shadow" aria-hidden="true"></span>
        </div>
      }

      <div class="floats" aria-hidden="true">
        @for (f of floats; track f.id) {
          <span class="float" [class.xp]="f.kind === 'xp'">{{ f.text }}</span>
        }
      </div>

      @if (state === 'finished') {
        <div class="burst" aria-hidden="true">
          @for (i of sparks; track i) { <span class="spark" [style.--i]="i"></span> }
        </div>
      }

      <span class="scene-name">{{ scenario?.name }}</span>
      @if (bossName) {
        <span class="boss-label">
          <strong>{{ bossName }}</strong>
          @if (bossTitle) { <small>{{ bossTitle }}</small> }
        </span>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .stage {
      --sky-top: #8ED1FC;
      --sky-bottom: #CDEEFF;
      --hero-size: clamp(64px, 9vw, 104px);
      position: relative;
      height: 100%;
      min-height: 150px;
      overflow: hidden;
      background: linear-gradient(to bottom, var(--sky-top), var(--sky-bottom));
      image-rendering: pixelated;
      isolation: isolate;
      transition: filter 0.4s ease;
    }

    /* ── Céu ── */
    .sky { position: absolute; inset: 0; z-index: 0; }
    .cloud {
      position: absolute;
      width: 8px; height: 8px;
      background: transparent;
      color: rgba(255, 255, 255, 0.55);
      box-shadow:
        8px 0 0 currentColor, 16px 0 0 currentColor, 24px 0 0 currentColor,
        0 8px 0 currentColor, 8px 8px 0 currentColor, 16px 8px 0 currentColor, 24px 8px 0 currentColor, 32px 8px 0 currentColor,
        16px -8px 0 currentColor;
      animation: drift 60s linear infinite;
    }
    .c1 { top: 14%; left: 10%; }
    .c2 { top: 26%; left: 55%; transform: scale(0.75); animation-duration: 80s; opacity: 0.7; }
    .c3 { top: 8%; left: 80%; animation-duration: 95s; opacity: 0.5; }

    /* ── Cenário (duas cópias para rolar sem emenda) ── */
    .decor-track {
      position: absolute;
      left: 0; bottom: 14px;
      width: 200%;
      height: 46%;
      display: flex;
      z-index: 1;
    }
    .decor { width: 50%; height: 100%; }
    .decor ::ng-deep svg { height: 100%; }

    .ground {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 14px;
      z-index: 1;
      background: color-mix(in srgb, var(--sky-top) 30%, #1a1208);
      box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.12);
    }

    /* ── Atores ── */
    .actor {
      position: absolute;
      bottom: 10px;
      z-index: 3;
      width: var(--hero-size);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .hero-wrap { left: 14%; }
    .boss-wrap { right: 12%; }
    .hero, .boss { width: 100%; filter: drop-shadow(3px 0 0 rgba(0,0,0,0.25)); }

    .shadow {
      width: 70%;
      height: 5px;
      margin-top: -3px;
      background: rgba(0, 0, 0, 0.28);
    }

    .hero-wrap { animation: bob 1.6s steps(2) infinite; }
    .boss-wrap { animation: bob 1.2s steps(2) infinite; }

    .boss-hp {
      width: 90%;
      height: 7px;
      margin-bottom: 6px;
      background: #2a0f12;
      border: 2px solid #0a0b0e;
    }
    .boss-hp-fill { height: 100%; background: var(--hp); transition: width 0.5s steps(8); }
    .boss-wrap.defeated { opacity: 0.35; filter: grayscale(1); animation: none; }

    .bubble {
      position: absolute;
      top: -22px;
      right: -14px;
      font-family: var(--font-hud);
      font-size: 0.7rem;
      color: #15171c;
      background: #f4f2ee;
      padding: 2px 5px;
      border: 2px solid #0a0b0e;
      animation: bob 1.4s steps(2) infinite;
    }

    /* ── Floats (dano e XP) ── */
    .floats {
      position: absolute;
      right: 12%;
      bottom: calc(var(--hero-size) + 24px);
      width: var(--hero-size);
      z-index: 4;
      pointer-events: none;
    }
    .float {
      position: absolute;
      left: 50%;
      bottom: 0;
      font-family: var(--font-pixel);
      font-weight: 700;
      font-size: 1.15rem;
      color: #fff;
      text-shadow: 2px 2px 0 #0a0b0e, -2px 0 0 #0a0b0e, 0 -2px 0 #0a0b0e, 2px 0 0 #0a0b0e;
      transform: translateX(-50%);
      animation: rise ${FLOAT_MS}ms steps(10) forwards;
      white-space: nowrap;
    }
    .float.xp { color: var(--xp); left: auto; right: 0; }

    .boss-label {
      position: absolute;
      right: 8px;
      top: 8px;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      max-width: 55%;
      text-align: right;

      strong, small {
        padding: 2px 6px;
        color: #fff;
        background: rgba(10, 11, 14, 0.6);
      }

      strong {
        font-family: var(--font-pixel);
        font-size: 0.85rem;
        font-weight: 600;
      }

      small {
        font-family: var(--font-hud);
        font-size: 0.5rem;
      }
    }

    .scene-name {
      position: absolute;
      left: 8px; top: 8px;
      z-index: 5;
      font-family: var(--font-hud);
      font-size: 0.55rem;
      letter-spacing: 0.06em;
      color: #fff;
      background: rgba(10, 11, 14, 0.55);
      padding: 2px 6px;
    }

    /* ── Estados ── */
    .is-running .decor-track { animation: scroll 24s linear infinite; }
    .is-running .hero-wrap { animation: none; }
    .lunge { animation: lunge ${HIT_MS}ms steps(3) !important; }
    .hit { animation: shake ${HIT_MS}ms steps(4); }

    .is-paused { filter: saturate(0.35) brightness(0.72); }
    .is-paused .hero-wrap, .is-paused .boss-wrap, .is-paused .cloud { animation-play-state: paused; }

    .is-finished .hero-wrap { animation: jump 0.6s steps(3) infinite; }

    .burst { position: absolute; left: calc(14% + var(--hero-size) / 2); bottom: calc(var(--hero-size) / 1.2); z-index: 4; }
    .spark {
      position: absolute;
      width: 8px; height: 8px;
      background: var(--xp);
      box-shadow: 0 0 0 2px #0a0b0e;
      --a: calc(var(--i) * 45deg);
      animation: spark 0.9s steps(6) infinite;
      animation-delay: calc(var(--i) * 40ms);
    }
    .spark:nth-child(even) { background: #fff; }

    @keyframes bob { 50% { transform: translateY(-3px); } }
    @keyframes drift { from { translate: -40px 0; } to { translate: 40vw 0; } }
    @keyframes scroll { to { transform: translateX(-50%); } }
    @keyframes lunge { 50% { transform: translateX(22px); } }
    @keyframes shake { 25% { transform: translateX(5px); filter: brightness(2.2); } 75% { transform: translateX(-5px); } }
    @keyframes rise { 0% { opacity: 0; translate: 0 6px; } 15% { opacity: 1; } 100% { opacity: 0; translate: 0 -46px; } }
    @keyframes jump { 50% { transform: translateY(-14px); } }
    @keyframes spark {
      0% { transform: rotate(var(--a)) translateY(0); opacity: 1; }
      100% { transform: rotate(var(--a)) translateY(-56px); opacity: 0; }
    }

    @media (max-width: 768px) {
      .stage { --hero-size: 76px; }
      .hero-wrap { left: 10%; }
      .boss-wrap { right: 8%; }
      .floats { right: 8%; }
    }
  `],
})
export class HeroStageComponent implements OnChanges, OnDestroy {
  @Input() scenario: Scenario | null = null;
  @Input() avatar: AvatarConfig | null = DEFAULT_AVATAR;
  @Input() weapon: Weapon | null = null;
  @Input() monsterVariant: MonsterVariant | null = null;
  /** HP restante do chefe, 0..100. */
  @Input() bossPercent = 100;
  @Input() state: StageState = 'idle';
  /** Minutos completos da sessão atual: cada incremento vira um golpe. */
  @Input() elapsedMinutes = 0;
  /** Dano por minuto (combo). */
  @Input() combo = 1;
  /** Golpe disparado de fora (ex.: sessão salva com a Jornada aberta). Mude o id para golpear de novo. */
  @Input() hitEvent: { id: number; value: number } | null = null;
  /** Rótulo opcional do chefe (nome e epíteto) sobre o palco. */
  @Input() bossName = '';
  @Input() bossTitle = '';

  hero: Sprite | null = null;
  monster: Sprite | null = null;
  decor: Sprite | null = null;
  floats: Float[] = [];
  hitting = false;
  readonly sparks = [0, 1, 2, 3, 4, 5, 6, 7];

  private pose: HeroPose = 'stand';
  private stepTimer?: ReturnType<typeof setInterval>;
  private hitTimer?: ReturnType<typeof setTimeout>;
  private floatId = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scenario'] && this.scenario) {
      this.decor = buildScenarioDecor(this.scenario);
    }
    if (changes['monsterVariant'] && this.monsterVariant) {
      this.monster = buildMonsterSprite(this.monsterVariant);
    }
    if (changes['state']) {
      this.onStateChange(changes['state'].previousValue as StageState | undefined);
    }
    if (changes['elapsedMinutes'] && !changes['elapsedMinutes'].firstChange) {
      const prev = changes['elapsedMinutes'].previousValue as number;
      if (this.state === 'running' && this.elapsedMinutes > prev) this.strike();
    }
    if (changes['hitEvent'] && !changes['hitEvent'].firstChange && this.hitEvent) {
      this.strike(`-${this.hitEvent.value}`);
    }
    this.rebuildHero();
  }

  ngOnDestroy(): void {
    this.stopStepping();
    if (this.hitTimer) clearTimeout(this.hitTimer);
  }

  private onStateChange(prev: StageState | undefined): void {
    this.stopStepping();
    if (this.state === 'running') {
      this.stepTimer = setInterval(() => {
        this.pose = this.pose === 'step' ? 'stand' : 'step';
        this.rebuildHero();
      }, STEP_MS);
    } else if (this.state === 'finished') {
      this.pose = 'cheer';
      if (prev === 'running' || prev === 'paused') {
        const xp = Math.floor(this.elapsedMinutes * this.combo);
        if (xp > 0) this.pushFloat(`+${xp} XP`, 'xp');
      }
    } else {
      this.pose = 'stand';
    }
  }

  private strike(text?: string): void {
    this.hitting = true;
    this.pushFloat(text ?? `-${Math.floor(this.combo) === this.combo ? this.combo : this.combo.toFixed(1)}`, 'dmg');
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => (this.hitting = false), HIT_MS);
  }

  private pushFloat(text: string, kind: Float['kind']): void {
    const id = ++this.floatId;
    this.floats = [...this.floats, { id, text, kind }];
    setTimeout(() => (this.floats = this.floats.filter(f => f.id !== id)), FLOAT_MS);
  }

  private stopStepping(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = undefined;
  }

  private rebuildHero(): void {
    this.hero = buildHeroSprite(this.avatar, this.weapon, this.pose);
  }
}
