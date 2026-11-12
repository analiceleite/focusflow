import { Component, Input } from '@angular/core';
import { Sprite } from '../../core/game/sprites';

/** Renderiza um sprite pixel a pixel (um retângulo por pixel), sem suavização. */
@Component({
  selector: 'app-pixel-sprite',
  standalone: true,
  template: `
    <svg [attr.viewBox]="'0 0 ' + sprite.width + ' ' + sprite.height"
         [attr.preserveAspectRatio]="stretch ? 'none' : null"
         shape-rendering="crispEdges" role="img" [attr.aria-label]="label">
      @for (p of sprite.pixels; track $index) {
        <rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.fill]="p.fill"/>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; }
    svg {
      display: block;
      width: 100%;
      height: auto;
      image-rendering: pixelated;
    }
  `],
})
export class PixelSpriteComponent {
  @Input({ required: true }) sprite!: Sprite;
  @Input() label = '';
  /** Estica o sprite para preencher a caixa (usado em cenários de fundo). */
  @Input() stretch = false;
}
