import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeeklyBossState } from '../../../core/game/weekly-boss';

interface Pixel {
  x: number;
  y: number;
  fill: string;
}

interface Sprite {
  width: number;
  height: number;
  pixels: Pixel[];
}

/** Converte um desenho em texto (uma string por linha) em retângulos SVG. */
function buildSprite(rows: string[], palette: Record<string, string>): Sprite {
  const width = rows[0].length;
  rows.forEach((row, i) => {
    if (row.length !== width) {
      throw new Error(`Sprite inconsistente na linha ${i}: ${row.length} != ${width}`);
    }
  });
  const pixels: Pixel[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (fill) pixels.push({ x, y, fill });
    });
  });
  return { width, height: rows.length, pixels };
}

// Herói: '.' transparente, h cabelo, s pele, e olho, c camiseta, p calça, b tênis
const HERO = buildSprite(
  [
    '...hhhh...',
    '..hhhhhh..',
    '..ssssss..',
    '..sesses..',
    '...ssss...',
    '..cccccc..',
    'sccccccs..',
    '..pp..pp..',
    '..pp..pp..',
    '.bbb..bbb.',
  ],
  { h: '#3B2A20', s: '#F2C9A0', e: '#1c1c1e', c: '#6C63FF', p: '#2F3B52', b: '#43D9AD' }
);

// Chefe: g corpo, G sombra, r olhos, w dentes, d chifres
const MONSTER = buildSprite(
  [
    'd..........d',
    'dd........dd',
    'dggggggggggd',
    'ggrrggggrrgg',
    'ggrrggggrrgg',
    'gggggggggggg',
    'gwgwgwgwgwgg',
    'gggggggggggg',
    'GGggggggggGG',
    'GG.GG..GG.GG',
  ],
  { d: '#3d1c4a', g: '#7BD389', G: '#4E9C5A', r: '#ff4d6d', w: '#f5f5f7' }
);

@Component({
  selector: 'app-boss-battle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="boss-card" [class.defeated]="state?.defeated">
      <header class="boss-header">
        <h3>⚔️ Chefe da semana</h3>
        @if (state) {
          <span class="week">{{ formatWeek(state.weekStart, state.weekEnd) }}</span>
        }
      </header>

      @if (state) {
        <div class="arena">
          <svg class="sprite hero" [attr.viewBox]="'0 0 ' + hero.width + ' ' + hero.height"
               shape-rendering="crispEdges" aria-label="Seu personagem">
            @for (p of hero.pixels; track $index) {
              <rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill"/>
            }
          </svg>

          <span class="vs" aria-hidden="true">⚔</span>

          <div class="monster-wrap">
            <svg class="sprite monster" [attr.viewBox]="'0 0 ' + monster.width + ' ' + monster.height"
                 shape-rendering="crispEdges" aria-label="Chefe da semana">
              @for (p of monster.pixels; track $index) {
                <rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill"/>
              }
            </svg>
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

    .sprite {
      width: 96px;
      height: auto;
      image-rendering: pixelated;
      display: block;
    }

    .hero {
      animation: idle 1.2s steps(2) infinite;
    }

    .monster {
      width: 144px;
      animation: idle 1.6s steps(2) infinite;
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

    .hint, .victory {
      margin: 0;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .victory {
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
export class BossBattleComponent {
  @Input() state: WeeklyBossState | null = null;

  readonly hero = HERO;
  readonly monster = MONSTER;

  formatWeek(start: string, end: string): string {
    const fmt = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
