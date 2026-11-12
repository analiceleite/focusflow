import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PixelSpriteComponent } from '../../../shared/pixel-sprite/pixel-sprite.component';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  HAIR_OPTIONS,
  SHIRT_OPTIONS,
  SKIN_OPTIONS,
  Weapon,
} from '../../../core/game/game-data';
import { LevelInfo, Victory, ownedWeapons } from '../../../core/game/progress';
import { Sprite, buildHeroSprite } from '../../../core/game/sprites';

type ColorField = keyof AvatarConfig;

@Component({
  selector: 'app-game-panel',
  standalone: true,
  imports: [CommonModule, PixelSpriteComponent],
  template: `
    <section class="panel">
      <header class="panel-header">
        <h3>🧙 Seu herói</h3>
        <span class="level">Nível {{ level?.level }}</span>
      </header>

      @if (level) {
        <div class="xp">
          <div class="xp-bar"><div class="xp-fill" [style.width.%]="level.progressPercent"></div></div>
          <span class="xp-text">{{ level.xp }} XP · próximo nível em {{ level.nextLevelXp - level.xp }} XP</span>
        </div>
      }

      <div class="hero-row">
        @if (hero) {
          <app-pixel-sprite class="preview" [sprite]="hero" label="Pré-visualização do herói"></app-pixel-sprite>
        }

        <div class="colors">
          <div class="color-row">
            <span class="color-label">Cabelo</span>
            @for (c of hairOptions; track c) {
              <button class="swatch" [style.background]="c" [class.selected]="avatar.hair === c"
                      (click)="setColor('hair', c)" [attr.aria-label]="'Cabelo ' + c"></button>
            }
          </div>
          <div class="color-row">
            <span class="color-label">Pele</span>
            @for (c of skinOptions; track c) {
              <button class="swatch" [style.background]="c" [class.selected]="avatar.skin === c"
                      (click)="setColor('skin', c)" [attr.aria-label]="'Pele ' + c"></button>
            }
          </div>
          <div class="color-row">
            <span class="color-label">Roupa</span>
            @for (c of shirtOptions; track c) {
              <button class="swatch" [style.background]="c" [class.selected]="avatar.shirt === c"
                      (click)="setColor('shirt', c)" [attr.aria-label]="'Roupa ' + c"></button>
            }
          </div>
        </div>
      </div>

      <div class="block">
        <h4>Arma equipada</h4>
        <div class="weapons">
          <button class="chip" [class.selected]="!weapon" (click)="equip(null)">Nenhuma</button>
          @for (w of owned; track w.id) {
            <button class="chip" [class.selected]="weapon?.id === w.id" (click)="equip(w.id)">{{ w.name }}</button>
          }
        </div>
        @if (owned.length === 0) {
          <p class="empty">Derrote um chefe para ganhar sua primeira arma.</p>
        }
      </div>

      <div class="block">
        <h4>Bestiário</h4>
        @if (victories.length > 0) {
          <ul class="bestiary">
            @for (v of recentFirst(); track v.weekStart) {
              <li>
                <span class="monster-name">{{ v.monster.name }}</span>
                <span class="meta">{{ formatWeek(v.weekStart, v.weekEnd) }} · {{ v.loot.name }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="empty">Nenhum chefe derrotado ainda. Cada semana com 600 de dano vence o monstro.</p>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .panel {
      background: color-mix(in srgb, var(--bg-tertiary) 82%, transparent);
      border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
      border-radius: 20px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      h3 { margin: 0; font-size: 1rem; color: var(--text-primary); }
      .level { font-weight: 700; color: var(--accent-primary); }
    }

    .xp-bar {
      height: 10px;
      border-radius: 5px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      overflow: hidden;
    }

    .xp-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-success));
      transition: width 0.6s ease;
    }

    .xp-text, .meta, .empty, .color-label {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .xp-text { display: block; margin-top: 0.3rem; }

    .hero-row {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .preview {
      width: 120px;
      background: var(--bg-primary);
      border-radius: 12px;
      padding: 0.5rem;
    }

    .colors {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
      min-width: 200px;
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .color-label { width: 52px; }

    .swatch {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 2px solid var(--border-color);
      cursor: pointer;
      padding: 0;
    }

    .swatch.selected {
      border-color: var(--text-primary);
      box-shadow: 0 0 0 2px var(--bg-tertiary);
    }

    .block h4 {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .weapons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .chip {
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
    }

    .chip.selected {
      border-color: var(--accent-primary);
      color: var(--accent-primary);
      font-weight: 600;
    }

    .bestiary {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-height: 200px;
      overflow-y: auto;

      li {
        display: flex;
        flex-direction: column;
        padding: 0.4rem 0.6rem;
        border-radius: 10px;
        background: var(--bg-primary);
      }
    }

    .monster-name {
      font-size: 0.85rem;
      color: var(--text-primary);
      font-weight: 600;
    }

    .empty { margin: 0; }
  `],
})
export class GamePanelComponent implements OnChanges {
  @Input() level: LevelInfo | null = null;
  @Input() avatar: AvatarConfig = DEFAULT_AVATAR;
  @Input() weapon: Weapon | null = null;
  @Input() victories: Victory[] = [];

  @Output() avatarChange = new EventEmitter<AvatarConfig>();
  @Output() weaponChange = new EventEmitter<string | null>();

  readonly hairOptions = HAIR_OPTIONS;
  readonly skinOptions = SKIN_OPTIONS;
  readonly shirtOptions = SHIRT_OPTIONS;

  hero: Sprite | null = null;
  owned: Weapon[] = [];

  ngOnChanges(): void {
    this.hero = buildHeroSprite(this.avatar, this.weapon);
    this.owned = ownedWeapons(this.victories);
  }

  recentFirst(): Victory[] {
    return [...this.victories].reverse();
  }

  setColor(field: ColorField, value: string): void {
    this.avatarChange.emit({ ...this.avatar, [field]: value });
  }

  equip(id: string | null): void {
    this.weaponChange.emit(id);
  }

  formatWeek(start: string, end: string): string {
    const fmt = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
