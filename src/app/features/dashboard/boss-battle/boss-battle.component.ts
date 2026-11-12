import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeeklyBossState } from '../../../core/game/weekly-boss';
import { AvatarConfig, Weapon, DEFAULT_AVATAR } from '../../../core/game/game-data';
import { Sprite, buildHeroSprite, buildMonsterSprite } from '../../../core/game/sprites';
import { PixelSpriteComponent } from '../../../shared/pixel-sprite/pixel-sprite.component';

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
        <div class="arena">
          <app-pixel-sprite class="hero" [sprite]="hero" label="Seu personagem"></app-pixel-sprite>

          <span class="vs" aria-hidden="true">⚔</span>

          <div class="monster-wrap">
            <app-pixel-sprite class="monster" [sprite]="monster" [label]="state.monster.name"></app-pixel-sprite>
            <span class="monster-name">{{ state.monster.name }}</span>
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
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      gap: 0.75rem;
      padding: 1rem 0.5rem 0.25rem;
      background:
        linear-gradient(to top, color-mix(in srgb, var(--border-color) 60%, transparent) 0 6px, transparent 6px);
      border-radius: 12px;
      min-height: 150px;
    }

    .hero {
      width: 110px;
      animation: idle 1.2s steps(2) infinite;
    }

    .monster-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
    }

    .monster {
      width: 144px;
      animation: idle 1.6s steps(2) infinite;
    }

    .monster-name {
      font-size: 0.75rem;
      color: var(--text-muted);
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

    @media (prefers-reduced-motion: reduce) {
      .hero, .monster { animation: none; }
    }
  `],
})
export class BossBattleComponent implements OnChanges {
  @Input() state: WeeklyBossState | null = null;
  @Input() avatar: AvatarConfig = DEFAULT_AVATAR;
  @Input() weapon: Weapon | null = null;

  hero: Sprite | null = null;
  monster: Sprite | null = null;

  ngOnChanges(): void {
    this.hero = buildHeroSprite(this.avatar, this.weapon);
    this.monster = this.state ? buildMonsterSprite(this.state.monster) : null;
  }

  formatWeek(start: string, end: string): string {
    const fmt = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
