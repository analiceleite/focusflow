import { buildSprite, Sprite } from './sprites';

export interface Scenario {
  id: string;
  name: string;
  /** Nível mínimo para desbloquear. */
  minLevel: number;
  skyTop: string;
  skyBottom: string;
  /** Cores das letras usadas na decoração do chão. */
  palette: Record<string, string>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'campo',
    name: 'Campo Verde',
    minLevel: 1,
    skyTop: '#8ED1FC',
    skyBottom: '#CDEEFF',
    palette: { L: '#3E9B4F', T: '#6B4226', f: '#FFD93D', g: '#4CAF50' },
  },
  {
    id: 'floresta',
    name: 'Floresta Sombria',
    minLevel: 3,
    skyTop: '#1F3D33',
    skyBottom: '#3E7A5C',
    palette: { P: '#1E4D35', T: '#3B2A20', G: '#2E5E3E' },
  },
  {
    id: 'caverna',
    name: 'Caverna de Cristal',
    minLevel: 5,
    skyTop: '#2B1F4A',
    skyBottom: '#4B3A7A',
    palette: { S: '#6E5C8F', c: '#7FDBFF', R: '#5A4A6E' },
  },
  {
    id: 'castelo',
    name: 'Castelo em Chamas',
    minLevel: 8,
    skyTop: '#4A1C1C',
    skyBottom: '#C2543A',
    palette: { F: '#FFB366', L: '#FF6B35', B: '#3A2A2A' },
  },
];

export const DEFAULT_SCENARIO_ID = 'campo';

export function findScenario(id: string | null | undefined): Scenario | null {
  return SCENARIOS.find(s => s.id === id) ?? null;
}

/** Cenários que o nível atual já liberou. */
export function unlockedScenarios(level: number): Scenario[] {
  return SCENARIOS.filter(s => level >= s.minLevel);
}

// ─── Decoração do chão (grade 24×6) ──────────────────────────────────────────

const W = 24;
const H = 6;

type Grid = string[][];

function emptyGrid(): Grid {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
}

/** Carimba uma forma (linhas de texto; '.' é transparente) na grade. */
function stamp(grid: Grid, shape: string[], x: number, y: number): void {
  shape.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const gx = x + dx;
      const gy = y + dy;
      if (ch !== '.' && gx >= 0 && gx < W && gy >= 0 && gy < H) {
        grid[gy][gx] = ch;
      }
    });
  });
}

function fillRow(grid: Grid, y: number, ch: string): void {
  for (let x = 0; x < W; x++) grid[y][x] = ch;
}

const ROUND_TREE = ['.LLL.', 'LLLLL', 'LLLLL', '..T..'];
const PINE = ['..P..', '.PPP.', 'PPPPP', '..T..'];
const CRYSTAL = ['.c.', 'ccc'];
const STALACTITE = ['S', 'S', 'S'];
const FIRE = ['.F.', 'FLF'];
const MERLON = ['B.B'];

const DECOR: Record<string, (grid: Grid) => void> = {
  campo(grid) {
    fillRow(grid, 5, 'g');
    stamp(grid, ROUND_TREE, 1, 1);
    stamp(grid, ROUND_TREE, 9, 2);
    stamp(grid, ROUND_TREE, 17, 1);
    grid[4][5] = 'f';
    grid[4][13] = 'f';
    grid[4][21] = 'f';
  },
  floresta(grid) {
    fillRow(grid, 5, 'G');
    stamp(grid, PINE, 0, 1);
    stamp(grid, PINE, 6, 2);
    stamp(grid, PINE, 12, 1);
    stamp(grid, PINE, 19, 2);
  },
  caverna(grid) {
    fillRow(grid, 5, 'R');
    stamp(grid, STALACTITE, 2, 0);
    stamp(grid, STALACTITE, 9, 0);
    stamp(grid, STALACTITE, 16, 0);
    stamp(grid, STALACTITE, 21, 0);
    stamp(grid, CRYSTAL, 5, 3);
    stamp(grid, CRYSTAL, 14, 3);
  },
  castelo(grid) {
    fillRow(grid, 5, 'L');
    fillRow(grid, 4, '.');
    for (let x = 0; x < W; x += 4) stamp(grid, MERLON, x, 3);
    stamp(grid, FIRE, 8, 2);
    stamp(grid, FIRE, 17, 2);
  },
};

/** Monta a decoração do chão de um cenário. */
export function buildScenarioDecor(scenario: Scenario): Sprite {
  const grid = emptyGrid();
  DECOR[scenario.id]?.(grid);
  const rows = grid.map(r => r.join(''));
  return buildSprite(rows, scenario.palette);
}
