import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeeklyBossState, monsterForWeek } from '../../../core/game/weekly-boss';
import { parseDateKey, toDateKey } from '../../../core/game/streak';
import { AvatarConfig, MonsterVariant, Weapon, DEFAULT_AVATAR } from '../../../core/game/game-data';
import { Sprite, buildMonsterSprite } from '../../../core/game/sprites';
import { Scenario, DEFAULT_SCENARIO_ID, findScenario, SCENARIOS } from '../../../core/game/scenarios';
import { PixelSpriteComponent } from '../../../shared/pixel-sprite/pixel-sprite.component';
import { PixelIconComponent } from '../../../shared/pixel-icon/pixel-icon.component';
import { HeroStageComponent } from '../../../shared/hero-stage/hero-stage.component';

const CELEBRATE_MS = 1800;

@Component({
  selector: 'app-boss-battle',
  standalone: true,
  imports: [CommonModule, PixelSpriteComponent, PixelIconComponent, HeroStageComponent],
  template: `
    <section class="boss-card" [class.defeated]="state?.defeated">
      <header class="boss-header">
        <h3>Chefe da semana</h3>
        @if (state) {
          <span class="week">{{ formatWeek(state.weekStart, state.weekEnd) }}</span>
        }
      </header>

      @if (state) {
        <!-- Mesmo palco da aba Foco: cenário, herói e chefe -->
        <app-hero-stage class="arena" [scenario]="stageScenario" [avatar]="avatar" [weapon]="weapon"
                        [monsterVariant]="state.monster" [bossPercent]="state.percent"
                        [state]="celebrating ? 'finished' : 'idle'" [hitEvent]="hitEvent"
                        [bossName]="state.monster.name" [bossTitle]="state.monster.title"></app-hero-stage>

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
          <p class="victory"><app-pixel-icon name="trophy" [size]="16"></app-pixel-icon> Chefe derrotado! Nova batalha começa no próximo domingo.</p>
        } @else {
          <div class="status">
            <span class="combo" [class.active]="state.combo > 1"><app-pixel-icon name="bolt" [size]="14"></app-pixel-icon> Combo ×{{ state.combo }}</span>
            <span class="shield" [class.used]="!state.shieldAvailable">
              <app-pixel-icon name="shield" [size]="14"></app-pixel-icon> {{ state.shieldAvailable ? 'Escudo disponível' : 'Escudo usado' }}
            </span>
            <span class="hint">1 min de foco = 1 de dano</span>
          </div>
        }

        @if (nextMonster && nextSprite) {
          <div class="next-boss">
            <app-pixel-sprite class="next-sprite" [sprite]="nextSprite" [label]="nextMonster.name"></app-pixel-sprite>
            <div class="next-info">
              <span class="next-label">Próximo chefe · domingo</span>
              <strong>{{ nextMonster.name }}</strong>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .boss-card {
      height: 100%;
      background: var(--bg-card);
      border: 2px solid var(--border-strong);
      box-shadow: 4px 4px 0 var(--px-shadow-color);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .boss-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;

      h3 { margin: 0; font-family: var(--font-pixel); font-size: 1.2rem; font-weight: 600; color: var(--text-primary); }
      .week { font-size: 0.8rem; color: var(--text-muted); }
    }

    .arena {
      display: block;
      height: 220px;
      border: 3px solid var(--px-shadow-color);
    }

    .next-boss {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--bg-inset);
      border: 2px dashed var(--border-strong);
    }

    .next-sprite {
      width: 36px;
      filter: brightness(0.25) saturate(0);
    }

    .next-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;

      strong { font-family: var(--font-pixel); font-size: 0.95rem; color: var(--text-primary); }
    }

    .next-label {
      font-family: var(--font-hud);
      font-size: 0.55rem;
      text-transform: uppercase;
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
      background: var(--bg-inset);
      border: 2px solid var(--px-shadow-color);
      overflow: hidden;
    }

    .hp-fill {
      height: 100%;
      background: var(--hp);
      box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.25);
      transition: width 0.6s steps(12);
    }

    .combo, .shield, .victory, .vs { display: inline-flex; align-items: center; gap: 0.35rem; }

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

  `],
})
export class BossBattleComponent implements OnChanges, OnDestroy {
  @Input() state: WeeklyBossState | null = null;
  @Input() avatar: AvatarConfig = DEFAULT_AVATAR;
  @Input() weapon: Weapon | null = null;
  @Input() scenario: Scenario | null = null;

  nextMonster: MonsterVariant | null = null;
  nextSprite: Sprite | null = null;
  stageScenario: Scenario = SCENARIOS[0];

  /** Golpe enviado ao palco quando o dano da semana aumenta. */
  hitEvent: { id: number; value: number } | null = null;
  celebrating = false;

  private nextHitId = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (this.state) {
      const next = parseDateKey(this.state.weekEnd);
      next.setDate(next.getDate() + 1);
      this.nextMonster = monsterForWeek(toDateKey(next));
      this.nextSprite = buildMonsterSprite(this.nextMonster);
    }

    this.stageScenario = this.scenario ?? findScenario(DEFAULT_SCENARIO_ID) ?? SCENARIOS[0];

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
      this.hitEvent = { id: this.nextHitId++, value: dealt };
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
