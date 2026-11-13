import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Conjunto de ícones próprio do FocusFlow.
 * Grade 24×24, traço arredondado (1.8) e o mesmo vocabulário da marca:
 * anel, arco de 3/4 e ponto central. Cor vem de `currentColor`.
 *
 * Os formatos são declarados como dados e renderizados pelo template.
 * Não usamos innerHTML: o sanitizador do Angular remove elementos SVG.
 */
interface Shape {
  el: 'path' | 'circle' | 'rect';
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rx?: number;
  /** Formas preenchidas (play, ponto, etc.) usam a cor atual como preenchimento. */
  solid?: boolean;
}

const path = (d: string, solid = false): Shape => ({ el: 'path', d, solid });
const circle = (cx: number, cy: number, r: number, solid = false): Shape => ({ el: 'circle', cx, cy, r, solid });
const rect = (x: number, y: number, w: number, h: number, rx: number, solid = false): Shape =>
  ({ el: 'rect', x, y, w, h, rx, solid });

const ICONS: Record<string, Shape[]> = {
  // Modos
  focus: [path('M12 4a8 8 0 1 1-8 8'), circle(12, 12, 1.6, true)],
  stopwatch: [circle(12, 13, 7.5), path('M12 9.5V13l2.2 2.2M9.5 2.5h5')],

  // Controles
  play: [path('M8 5.5v13l10-6.5z', true)],
  pause: [path('M8.5 5.5v13M15.5 5.5v13')],
  restart: [path('M4.5 12a7.5 7.5 0 1 0 2.2-5.3'), path('M4.5 4.5v4h4')],
  stop: [rect(6.5, 6.5, 11, 11, 2)],
  more: [circle(6, 12, 1.4, true), circle(12, 12, 1.4, true), circle(18, 12, 1.4, true)],
  check: [path('M5 12.5l4.5 4.5L19 7.5')],
  close: [path('M6.5 6.5l11 11M17.5 6.5l-11 11')],
  plus: [path('M12 5v14M5 12h14')],
  chevron: [path('M6 9.5l6 6 6-6')],
  skipPrev: [path('M6 6v12'), path('M18 6l-8 6 8 6z', true)],
  skipNext: [path('M18 6v12'), path('M6 6l8 6-8 6z', true)],

  // Recursos
  pip: [rect(3, 5, 18, 14, 2.5), rect(12, 11, 7, 5, 1.2, true)],
  goal: [circle(12, 12, 8.5), circle(12, 12, 4.5), circle(12, 12, 1, true)],
  settings: [path('M4 7h10M18 7h2M4 17h2M10 17h10'), circle(16, 7, 2), circle(8, 17, 2)],
  chart: [path('M5 20V12M12 20V5M19 20v-8')],
  sword: [path('M19.5 4.5v4L10 18l-4-4 9.5-9.5z'), path('M5 13l6 6M4 20l3-3')],
  calendar: [rect(4, 5.5, 16, 14.5, 2.5), path('M4 10h16M8.5 3.5v4M15.5 3.5v4')],
  sun: [
    circle(12, 12, 4),
    path('M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'),
  ],
  moon: [path('M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z')],
  monitor: [rect(3, 4.5, 18, 12, 2.5), path('M9 20h6M12 16.5V20')],
  music: [path('M9 17.5V6l10-2v11.5'), circle(6.5, 17.5, 2.5), circle(16.5, 15.5, 2.5)],
  logout: [path('M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14'), path('M10 8l-4 4 4 4M6 12h9')],
};

export type IconName = keyof typeof ICONS;

/**
 * Glifos pixel monocromáticos (grade 12×12, '#' = pixel aceso) desenhados em currentColor,
 * para ícones de interface que precisam seguir a cor do tema / hover.
 * Use tamanhos múltiplos de 12 (12, 24, 36) para pixels nítidos.
 */
const PIXEL_GLYPHS: Partial<Record<string, string[]>> = {
  focus: [
    '....####....',
    '..##....##..',
    '.#........#.',
    '.#..####..#.',
    '#..#....#..#',
    '#..#.##.#..#',
    '#..#.##.#..#',
    '#..#....#..#',
    '.#..####..#.',
    '.#........#.',
    '..##....##..',
    '....####....',
  ],
  sword: [
    '..........##',
    '.........###',
    '........###.',
    '.......###..',
    '......###...',
    '.#...###....',
    '.##.###.....',
    '..####......',
    '...##.......',
    '..#.##......',
    '.##..#......',
    '##..........',
  ],
  sun: [
    '.....##.....',
    '.#...##...#.',
    '..#......#..',
    '....####....',
    '...######...',
    '##.######.##',
    '##.######.##',
    '...######...',
    '....####....',
    '..#......#..',
    '.#...##...#.',
    '.....##.....',
  ],
  moon: [
    '...####.....',
    '..###.......',
    '.###........',
    '.##.........',
    '##.......#..',
    '##..........',
    '##..........',
    '##.........#',
    '.##.......##',
    '.###....###.',
    '..########..',
    '...######...',
  ],
  monitor: [
    '............',
    '############',
    '#..........#',
    '#.##.......#',
    '#.#........#',
    '#..........#',
    '#..........#',
    '############',
    '.....##.....',
    '.....##.....',
    '...######...',
    '............',
  ],
  logout: [
    '#######.....',
    '#.....#.....',
    '#.....#.....',
    '#.......#...',
    '#.......##..',
    '#..#########',
    '#..#########',
    '#.......##..',
    '#.......#...',
    '#.....#.....',
    '#.....#.....',
    '#######.....',
  ],
};

interface GlyphRun { x: number; y: number; w: number; }

/** Converte as linhas do glifo em retângulos (uma corrida horizontal por <rect>). */
function glyphRuns(rows: string[]): GlyphRun[] {
  const runs: GlyphRun[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') { x++; continue; }
      const start = x;
      while (x < row.length && row[x] === '#') x++;
      runs.push({ x: start, y, w: x - start });
    }
  });
  return runs;
}
const glyphCache = new Map<string, GlyphRun[]>();


@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (glyph; as runs) {
    <svg class="icon" viewBox="0 0 12 12" [attr.width]="size" [attr.height]="size" aria-hidden="true"
         focusable="false" fill="currentColor" shape-rendering="crispEdges">
      @for (r of runs; track $index) {
        <rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" height="1" />
      }
    </svg>
    } @else {
    <svg class="icon" viewBox="0 0 24 24" [attr.width]="size" [attr.height]="size" aria-hidden="true"
         focusable="false" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      @for (s of shapes; track $index) {
        @switch (s.el) {
          @case ('path') {
            <path [attr.d]="s.d" [attr.fill]="s.solid ? 'currentColor' : null" [attr.stroke]="s.solid ? 'none' : null" />
          }
          @case ('circle') {
            <circle [attr.cx]="s.cx" [attr.cy]="s.cy" [attr.r]="s.r"
                    [attr.fill]="s.solid ? 'currentColor' : null" [attr.stroke]="s.solid ? 'none' : null" />
          }
          @case ('rect') {
            <rect [attr.x]="s.x" [attr.y]="s.y" [attr.width]="s.w" [attr.height]="s.h" [attr.rx]="s.rx"
                  [attr.fill]="s.solid ? 'currentColor' : null" [attr.stroke]="s.solid ? 'none' : null" />
          }
        }
      }
    </svg>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; justify-content: center; line-height: 0; flex-shrink: 0; }
    .icon { display: block; overflow: visible; }
  `],
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 18;

  /** Glifo pixel, quando o ícone tem versão pixel. */
  get glyph(): GlyphRun[] | null {
    const rows = PIXEL_GLYPHS[this.name];
    if (!rows) return null;
    let runs = glyphCache.get(this.name);
    if (!runs) {
      runs = glyphRuns(rows);
      glyphCache.set(this.name, runs);
    }
    return runs;
  }

  get shapes(): Shape[] {
    return ICONS[this.name] ?? [];
  }
}
