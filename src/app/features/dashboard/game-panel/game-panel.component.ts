import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PixelSpriteComponent } from '../../../shared/pixel-sprite/pixel-sprite.component';
import { PixelIconComponent } from '../../../shared/pixel-icon/pixel-icon.component';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  CosmeticOption,
  HAIR_OPTIONS,
  HAIR_STYLES,
  HEADGEAR,
  OUTFITS,
  PANTS_OPTIONS,
  SHIRT_OPTIONS,
  SKIN_OPTIONS,
  Weapon,
} from '../../../core/game/game-data';
import { LevelInfo, Victory, ownedWeapons } from '../../../core/game/progress';
import { Sprite, buildHeroSprite, buildMonsterSprite } from '../../../core/game/sprites';
import { SCENARIOS, Scenario } from '../../../core/game/scenarios';

type ColorField = 'hair' | 'skin' | 'shirt' | 'pants';
type StyleField = 'hairStyle' | 'outfit' | 'headgear';
type WardrobeTab = 'hair' | 'outfit' | 'headgear' | 'skin';

interface OptionPreview {
  id: string;
  name: string;
  minLevel: number;
  locked: boolean;
  sprite: Sprite;
}

@Component({
  selector: 'app-game-panel',
  standalone: true,
  imports: [CommonModule, PixelSpriteComponent, PixelIconComponent],
  template: `
    <section class="panel">
      <header class="panel-header">
        <h3>Seu herói</h3>
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
          <div class="preview-frame" [style.--sky-top]="scenario?.skyTop" [style.--sky-bottom]="scenario?.skyBottom">
            <app-pixel-sprite class="preview" [sprite]="hero" label="Pré-visualização do herói"></app-pixel-sprite>
          </div>
        }

        <div class="wardrobe">
          <div class="tabs" role="tablist" aria-label="Personalizar herói">
            @for (t of tabs; track t.id) {
              <button role="tab" [attr.aria-selected]="tab === t.id" [class.active]="tab === t.id"
                      (click)="tab = t.id">{{ t.label }}</button>
            }
          </div>

          @switch (tab) {
            @case ('hair') {
              <div class="options">
                @for (o of hairPreviews; track o.id) {
                  <button class="option" [class.selected]="(avatar.hairStyle ?? 'short') === o.id"
                          (click)="setStyle('hairStyle', o.id)" [attr.aria-label]="o.name">
                    <app-pixel-sprite [sprite]="o.sprite"></app-pixel-sprite>
                    <span>{{ o.name }}</span>
                  </button>
                }
              </div>
              <div class="color-row">
                <span class="color-label">Cor</span>
                @for (c of hairOptions; track c) {
                  <button class="swatch" [style.background]="c" [class.selected]="avatar.hair === c"
                          (click)="setColor('hair', c)" [attr.aria-label]="'Cabelo ' + c"></button>
                }
              </div>
            }
            @case ('outfit') {
              <div class="options">
                @for (o of outfitPreviews; track o.id) {
                  <button class="option" [class.selected]="(avatar.outfit ?? 'shirt') === o.id" [disabled]="o.locked"
                          (click)="setStyle('outfit', o.id)" [attr.aria-label]="o.name + (o.locked ? ', nível ' + o.minLevel : '')">
                    <app-pixel-sprite [sprite]="o.sprite"></app-pixel-sprite>
                    <span>@if (o.locked) { <app-pixel-icon name="lock" [size]="10"></app-pixel-icon>Nv {{ o.minLevel }} } @else { {{ o.name }} }</span>
                  </button>
                }
              </div>
              <div class="color-row">
                <span class="color-label">Roupa</span>
                @for (c of shirtOptions; track c) {
                  <button class="swatch" [style.background]="c" [class.selected]="avatar.shirt === c"
                          (click)="setColor('shirt', c)" [attr.aria-label]="'Roupa ' + c"></button>
                }
              </div>
              <div class="color-row">
                <span class="color-label">Calça</span>
                @for (c of pantsOptions; track c) {
                  <button class="swatch" [style.background]="c" [class.selected]="(avatar.pants ?? pantsOptions[0]) === c"
                          (click)="setColor('pants', c)" [attr.aria-label]="'Calça ' + c"></button>
                }
              </div>
            }
            @case ('headgear') {
              <div class="options">
                @for (o of headgearPreviews; track o.id) {
                  <button class="option" [class.selected]="(avatar.headgear ?? 'none') === o.id" [disabled]="o.locked"
                          (click)="setStyle('headgear', o.id)" [attr.aria-label]="o.name + (o.locked ? ', nível ' + o.minLevel : '')">
                    <app-pixel-sprite [sprite]="o.sprite"></app-pixel-sprite>
                    <span>@if (o.locked) { <app-pixel-icon name="lock" [size]="10"></app-pixel-icon>Nv {{ o.minLevel }} } @else { {{ o.name }} }</span>
                  </button>
                }
              </div>
            }
            @case ('skin') {
              <div class="color-row">
                <span class="color-label">Pele</span>
                @for (c of skinOptions; track c) {
                  <button class="swatch" [style.background]="c" [class.selected]="avatar.skin === c"
                          (click)="setColor('skin', c)" [attr.aria-label]="'Pele ' + c"></button>
                }
              </div>
            }
          }
        </div>
      </div>

      <div class="block">
        <h4>Cenário</h4>
        <div class="weapons">
          @for (s of scenarios; track s.id) {
            <button class="chip" [class.selected]="scenario?.id === s.id" [disabled]="(level?.level ?? 1) < s.minLevel"
                    (click)="scenarioChange.emit(s.id)">
              @if ((level?.level ?? 1) < s.minLevel) {
                <app-pixel-icon name="lock" [size]="12"></app-pixel-icon> Nível {{ s.minLevel }} · {{ s.name }}
              } @else { {{ s.name }} }
            </button>
          }
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
                <app-pixel-sprite class="beast" [sprite]="monsterSprite(v)" [label]="v.monster.name"></app-pixel-sprite>
                <div class="beast-info">
                  <span class="monster-name">{{ v.monster.name }}</span>
                  <span class="meta">{{ formatWeek(v.weekStart, v.weekEnd) }} · {{ v.loot.name }}</span>
                </div>
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
      height: 100%;
      background: var(--bg-card);
      border: 2px solid var(--border-strong);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 4px 4px 0 var(--px-shadow-color);
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      h3 { margin: 0; font-family: var(--font-pixel); font-size: 1.2rem; font-weight: 600; color: var(--text-primary); }
      .level {
        font-family: var(--font-hud); font-size: 0.7rem; text-transform: uppercase;
        padding: 0.3rem 0.5rem; color: #15171c; background: var(--xp);
        border: 2px solid #0a0b0e; box-shadow: 2px 2px 0 #0a0b0e;
      }
    }

    .xp-bar {
      height: 14px;
      background: var(--bg-inset);
      border: 2px solid var(--px-shadow-color);
      overflow: hidden;
    }

    .xp-fill {
      height: 100%;
      background: var(--xp);
      box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.25), inset 0 2px 0 rgba(255, 255, 255, 0.3);
      transition: width 0.6s steps(12);
    }

    .xp-text, .meta, .empty, .color-label {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .xp-text { display: block; margin-top: 0.3rem; }

    .hero-row {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    /* Vitrine do herói: sobre o cenário escolhido, como no palco */
    .preview-frame {
      width: 128px;
      flex-shrink: 0;
      padding: 0.75rem 0.75rem 0;
      background: linear-gradient(var(--sky-top, #8ED1FC), var(--sky-bottom, #CDEEFF));
      border: 2px solid var(--px-shadow-color);
      border-bottom: 8px solid #3a2a1a;
    }

    .preview { width: 100%; }

    .wardrobe {
      flex: 1;
      min-width: 220px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3px;
      padding: 3px;
      background: var(--bg-inset);
      border: 2px solid var(--border-color);

      button {
        min-height: 30px;
        font-family: var(--font-hud);
        font-size: 0.55rem;
        text-transform: uppercase;
        color: var(--text-muted);
        background: none;
        border: none;
        cursor: pointer;

        &:hover:not(.active) { color: var(--text-primary); }

        &.active {
          color: #15171c;
          background: var(--brand-primary);
          box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25);
        }
      }
    }

    .options {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 4px;
    }

    .option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      padding: 0.4rem 0.3rem 0.35rem;
      background: var(--bg-inset);
      border: 2px solid transparent;
      cursor: pointer;

      app-pixel-sprite { width: 48px; }

      span {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-family: var(--font-hud);
        font-size: 0.5rem;
        text-transform: uppercase;
        color: var(--text-muted);
        white-space: nowrap;
      }

      &:hover:not(:disabled) { border-color: var(--border-strong); }

      &.selected {
        border-color: var(--brand-primary);
        background: color-mix(in srgb, var(--brand-primary) 14%, var(--bg-inset));
        box-shadow: 2px 2px 0 var(--px-shadow-color);

        span { color: var(--text-primary); }
      }

      &:disabled {
        cursor: not-allowed;

        app-pixel-sprite { filter: brightness(0.3) saturate(0); }
      }
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
      border: 2px solid var(--px-shadow-color);
      cursor: pointer;
      padding: 0;
    }

    .swatch.selected {
      border-color: var(--text-primary);
      box-shadow: 2px 2px 0 var(--brand-primary);
    }

    .block h4 {
      margin: 0 0 0.5rem;
      font-family: var(--font-hud);
      font-weight: 400;
      text-transform: uppercase;
      font-size: 0.6rem;
      color: var(--text-secondary);
    }

    .weapons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .chip {
      padding: 0.3rem 0.7rem;
      border: 2px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
    }

    .chip { display: inline-flex; align-items: center; gap: 0.35rem; }

    .chip:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
        align-items: center;
        gap: 0.6rem;
        padding: 0.4rem 0.6rem;
        border-left: 4px solid var(--xp);
        background: var(--bg-inset);
      }
    }

    .beast { width: 32px; flex-shrink: 0; }

    .beast-info { display: flex; flex-direction: column; min-width: 0; }

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

  @Input() scenario: Scenario | null = null;

  @Output() avatarChange = new EventEmitter<AvatarConfig>();
  @Output() weaponChange = new EventEmitter<string | null>();
  @Output() scenarioChange = new EventEmitter<string>();

  readonly scenarios = SCENARIOS;
  readonly hairOptions = HAIR_OPTIONS;
  readonly skinOptions = SKIN_OPTIONS;
  readonly shirtOptions = SHIRT_OPTIONS;
  readonly pantsOptions = PANTS_OPTIONS;

  readonly tabs: { id: WardrobeTab; label: string }[] = [
    { id: 'hair', label: 'Cabelo' },
    { id: 'outfit', label: 'Roupa' },
    { id: 'headgear', label: 'Chapéu' },
    { id: 'skin', label: 'Pele' },
  ];
  tab: WardrobeTab = 'hair';

  hero: Sprite | null = null;
  owned: Weapon[] = [];
  hairPreviews: OptionPreview[] = [];
  outfitPreviews: OptionPreview[] = [];
  headgearPreviews: OptionPreview[] = [];

  ngOnChanges(): void {
    this.hero = buildHeroSprite(this.avatar, this.weapon);
    this.owned = ownedWeapons(this.victories);
    this.hairPreviews = this.previews(HAIR_STYLES, 'hairStyle');
    this.outfitPreviews = this.previews(OUTFITS, 'outfit');
    this.headgearPreviews = this.previews(HEADGEAR, 'headgear');
  }

  /** Mini herói vestindo cada opção, com o restante do visual atual. */
  private previews<T extends string>(options: CosmeticOption<T>[], field: StyleField): OptionPreview[] {
    const lvl = this.level?.level ?? 1;
    return options.map(o => ({
      id: o.id,
      name: o.name,
      minLevel: o.minLevel,
      locked: lvl < o.minLevel,
      sprite: buildHeroSprite({ ...this.avatar, [field]: o.id }, null),
    }));
  }

  setStyle(field: StyleField, id: string): void {
    this.avatarChange.emit({ ...this.avatar, [field]: id });
  }

  private spriteCache = new Map<string, Sprite>();

  monsterSprite(v: Victory): Sprite {
    let sp = this.spriteCache.get(v.monster.id);
    if (!sp) {
      sp = buildMonsterSprite(v.monster);
      this.spriteCache.set(v.monster.id, sp);
    }
    return sp;
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
