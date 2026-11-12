import { Component, Input, OnChanges } from '@angular/core';
import { PixelIconName, ResolvedIcon, pixelIconSprite, resolveActivityIcon } from '../../core/game/pixel-icons';
import { Sprite } from '../../core/game/sprites';

/** Ícone pixel fixo da interface: <app-pixel-icon name="fire" [size]="16" />. */
@Component({
  selector: 'app-pixel-icon',
  standalone: true,
  template: `
    @if (sprite) {
      <svg [attr.viewBox]="'0 0 ' + sprite.width + ' ' + sprite.height" [attr.width]="size" [attr.height]="size"
           shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        @for (p of sprite.pixels; track $index) {
          <rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill" />
        }
      </svg>
    }
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; flex-shrink: 0; vertical-align: middle; }
    svg { display: block; image-rendering: pixelated; }
  `],
})
export class PixelIconComponent implements OnChanges {
  @Input({ required: true }) name!: PixelIconName;
  /** Tamanho em px. Múltiplos de 12 ficam mais nítidos. */
  @Input() size = 24;

  sprite: Sprite | null = null;

  ngOnChanges(): void {
    this.sprite = pixelIconSprite(this.name);
  }
}

/**
 * Ícone de uma atividade (dado do usuário).
 * "px:<id>" → ícone pixel; emoji antigo conhecido → ícone equivalente;
 * qualquer outro → bloco com a inicial da atividade na cor dela.
 */
@Component({
  selector: 'app-activity-icon',
  standalone: true,
  imports: [PixelIconComponent],
  template: `
    @if (resolved.kind === 'pixel') {
      <app-pixel-icon [name]="resolved.name" [size]="size"></app-pixel-icon>
    } @else {
      <span class="letter" [style.width.px]="size" [style.height.px]="size" [style.background]="color"
            [style.font-size.px]="size * 0.55">{{ initial }}</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; flex-shrink: 0; vertical-align: middle; }
    .letter {
      display: grid;
      place-items: center;
      line-height: 1;
      font-family: var(--font-hud);
      color: #15171c;
      border: 2px solid #20160f;
      box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25);
    }
  `],
})
export class ActivityIconComponent implements OnChanges {
  @Input() icon: string | null | undefined = '';
  @Input() name = '';
  @Input() color = '#f26b3a';
  @Input() size = 24;

  resolved: ResolvedIcon = { kind: 'letter' };
  initial = '?';

  ngOnChanges(): void {
    this.resolved = resolveActivityIcon(this.icon);
    this.initial = (this.name.trim()[0] ?? '?').toUpperCase();
  }
}
