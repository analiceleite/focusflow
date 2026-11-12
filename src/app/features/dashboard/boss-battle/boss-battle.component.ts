import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeeklyBossState } from '../../../core/game/weekly-boss';
import { AvatarConfig, Weapon, DEFAULT_AVATAR } from '../../../core/game/game-data';
import { Sprite, buildHeroSprite, buildMonsterSprite } from '../../../core/game/sprites';
import { Scenario, buildScenarioDecor, DEFAULT_SCENARIO_ID, findScenario, SCENARIOS } from '../../../core/game/scenarios';
import { PixelSpriteComponent } from '../../../shared/pixel-sprite/pixel-sprite.component';

interface DamageFloat {
  id: number;
  value: number;
}

const HIT_MS = 450;
const FLOAT_MS = 1100;
const CELEBRATE_MS = 1800;

@Component({
  selector: 'app-boss-battle',
  standalone: true,
  imports: [CommonModule, PixelSpriteComponent],
  template: `
    <section class="boss-card" [class.defeated]="state?.defeated">
      <header class="boss-header">
        <h3>⚔️ Chefe da semana</h3>
        @if (state) {
          <span class="week">{{ formatWeek(state.weekStart, state.weekEnd) }}</span>
        }
      </header>

      @if (state && hero && monster) {
        <div class="arena" [class.celebrate]="celebrating" [style.background]="skyGradient">
          @if (decor) {
            <app-pixel-sprite class="decor" [sprite]="decor" [stretch]="true"
                              [label]="scenario?.name ?? ''"></app-pixel-sprite>
          }

          <div class="stage">
            <app-pixel-sprite class="hero" [sprite]="hero" label="Seu personagem"></app-pixel-sprite>

            <span class="vs" aria-hidden="true">⚔</span>

            <div class="monster-wrap">
              <div class="float-layer" aria-hidden="true">
                @for (f of floats; track f.id) {
                  <span class="float">-{{ f.value }}</span>
                }
              </div>
              <app-pixel-sprite class="monster" [class.hit]="hitting" [sprite]="monster"
                                [label]="state.monster.name"></app-pixel-sprite>
              <span class="monster-name">{{ state.monster.name }}</span>
            </div>
          </div>
        </div>

        <div class="hp">
          <div class="hp-bar" role="progressbar" [attr.aria-valuenow]="state.hpLeft"
               [attr.aria-valuemax]="state.hpMax">
            <div class="hp-fill" [style.width.%]="state.percent"></div>
          </div>
          <div class="hp-text">
            <strong>{{ state.hpLeft }}</strong> / {{ state.hpMax }} HP
            <span class="dmg">· {{ state.damage }} de dano causado</span>
          </div>
        </div>

        @if (state.defeated) {
          <p class="victory">🏆 Chefe derrotado! Nova batalha começa no próximo domingo.</p>
        } @else {
          <div class="status">
            <span class="combo" [class.active]="state.combo > 1">⚡ Combo ×{{ state.combo }}</span>
            <span class="shield" [class.used]="!state.shieldAvailable">
              🛡️ {{ state.shieldAvailable ? 'Escudo disponível' : 'Escudo usado' }}
            </span>
            <span class="hint">1 min de foco = 1 de dano</span>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .boss-card {
      background: color-mix(in srgb, var(--bg-tertiary) 82%, transparent);
      border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
      border-radius: 20px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
    }

    .boss-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;

      h3 { margin: 0; font-size: 1rem; color: var(--text-primary); }
      .week { font-size: 0.8rem; color: var(--text-muted); }
    }

    .arena {
      position: relative;
      overflow: hidden;
      border-radius: 12px;
      min-height: 170px;
      padding: 1rem 0.5rem 0;
    }

    .arena.celebrate {
      animation: flash 0.6s steps(3) 3;
    }

    .decor {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 56px;
      z-index: 0;
    }

    .stage {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      gap: 0.75rem;
      padding-bottom: 56px;
    }

    .hero {
      width: 110px;
      animation: idle 1.2s steps(2) infinite;
    }

    .monster-wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
    }

    .monster {
      width: 144px;
      animation: idle 1.6s steps(2) infinite;
    }

    .monster.hit {
      animation: shake 0.45s steps(4) 1;
    }

    .float-layer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 0;
      pointer-events: none;
    }

    .float {
      position: absolute;
      left: 50%;
      top: 10px;
      transform: translateX(-50%);
      font-weight: 800;
      font-size: 1.1rem;
      color: #ff4d6d;
      text-shadow: 2px 2px 0 #1c1c1e;
      animation: rise 1.1s ease-out forwards;
      white-space: nowrap;
    }

    .monster-name {
      font-size: 0.75rem;
      color: #f5f5f7;
      text-shadow: 1px 1px 0 #1c1c1e;
    }

    .vs {
      font-size: 1.4rem;
      color: var(--text-muted);
      align-self: center;
    }

    .defeated .monster {
      animation: none;
      opacity: 0.35;
      filter: grayscale(1);
    }

    .hp-bar {
      height: 14px;
      border-radius: 7px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      overflow: hidden;
    }

    .hp-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff4d6d, #ffb366);
      transition: width 0.6s ease;
    }

    .hp-text {
      margin-top: 0.4rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
      strong { color: var(--text-primary); }
      .dmg { color: var(--text-muted); }
    }

    .status {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.8rem;
    }

    .status span {
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
    }

    .combo.active {
      border-color: var(--accent-warning);
      color: var(--accent-warning);
      font-weight: 600;
    }

    .shield.used {
      opacity: 0.55;
    }

    .status .hint {
      border: none;
      padding: 0;
      margin-left: auto;
      color: var(--text-muted);
    }

    .victory {
      margin: 0;
      font-size: 0.8rem;
      color: var(--accent-success);
      font-weight: 600;
    }

    @keyframes idle {
      0% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }

    @keyframes rise {
      0% { opacity: 0; transform: translate(-50%, 0); }
      15% { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -48px); }
    }

    @keyframes flash {
      0%, 100% { filter: none; }
      50% { filter: brightness(1.6); }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero, .monster, .monster.hit, .arena.celebrate, .float {
        animation: none;
      }
      .float { opacity: 1; }
    }
  `],
})
export class BossBattleComponent implements OnChanges, OnDestroy {
  @Input() state: WeeklyBossState | null = null;
  @Input() avatar: AvatarConfig = DEFAULT_AVATAR;
  @Input() weapon: Weapon | null = null;
  @Input() scenario: Scenario | null = null;

  hero: Sprite | null = null;
  monster: Sprite | null = null;
  decor: Sprite | null = null;
  skyGradient = '';

  floats: DamageFloat[] = [];
  hitting = false;
  celebrating = false;

  private nextFloatId = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    this.hero = buildHeroSprite(this.avatar, this.weapon);
    this.monster = this.state ? buildMonsterSprite(this.state.monster) : null;

    const scn = this.scenario ?? findScenario(DEFAULT_SCENARIO_ID) ?? SCENARIOS[0];
    this.decor = buildScenarioDecor(scn);
    this.skyGradient = `linear-gradient(to bottom, ${scn.skyTop}, ${scn.skyBottom})`;

    if (changes['state']) {
      this.reactToStateChange(changes['state'].previousValue, changes['state'].currentValue);
    }
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  /** Animações só disparam em transições dentro da mesma semana, nunca no carregamento inicial. */
  private reactToStateChange(prev: WeeklyBossState | null, cur: WeeklyBossState | null): void {
    if (!prev || !cur || prev.weekStart !== cur.weekStart) return;

    const dealt = cur.damage - prev.damage;
    if (dealt > 0) {
      this.hitting = true;
      this.track(() => (this.hitting = false), HIT_MS);

      const id = this.nextFloatId++;
      this.floats = [...this.floats, { id, value: dealt }];
      this.track(() => (this.floats = this.floats.filter(f => f.id !== id)), FLOAT_MS);
    }

    if (!prev.defeated && cur.defeated) {
      this.celebrating = true;
      this.track(() => (this.celebrating = false), CELEBRATE_MS);
    }
  }

  private track(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  formatWeek(start: string, end: string): string {
    const fmt = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
