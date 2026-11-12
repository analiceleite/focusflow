import { AvatarConfig, HairStyleId, HeadgearId, MonsterVariant, OutfitId, Weapon, DEFAULT_AVATAR } from './game-data';

export interface Pixel {
  x: number;
  y: number;
  fill: string;
}

export interface Sprite {
  width: number;
  height: number;
  pixels: Pixel[];
}

/** Converte um desenho em texto (uma string por linha) em pixels. */
export function buildSprite(rows: string[], palette: Record<string, string>): Sprite {
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

// Herói (12x11). A linha 0 fica livre para chapéus altos; colunas 10 e 11 são da arma.
// h cabelo, s pele, e olho, c roupa, p calça, b tênis, B lâmina, H guarda,
// x/X chapéu, m/M armadura, K capa
const HERO_ROWS = [
  '............',
  '...hhhh.....',
  '..hhhhhh....',
  '..ssssss....',
  '..sesses....',
  '...ssss.....',
  '..cccccc....',
  'sccccccs....',
  '..pp..pp....',
  '..pp..pp....',
  '.bbb..bbb...',
];

const HERO_SHOES = '#43D9AD';
const HERO_EYE = '#1c1c1e';

/** Poses do herói: parado, passo (andar alterna com 'stand') e comemoração (braços para cima). */
export type HeroPose = 'stand' | 'step' | 'cheer';

const POSE_ROWS: Record<HeroPose, Record<number, string>> = {
  stand: {},
  step: {
    9: '.pp....pp...',
    10: 'bbb....bbb..',
  },
  cheer: {
    5: 's..ssss..s..',
    6: 's.cccccc.s..',
    7: '..cccccc....',
  },
};

/** Penteados: linhas inteiras que substituem a cabeça. */
const HAIR_ROWS: Record<HairStyleId, Record<number, string>> = {
  short: {},
  long: {
    3: '.hssssssh...',
    4: '.hsessesh...',
    5: '.hhsssshh...',
  },
  spiky: {
    0: '...h.h.h....',
    1: '..hhhhhh....',
  },
  bun: {
    0: '....hh......',
  },
  bald: {
    1: '............',
    2: '...ssss.....',
  },
};

/** Chapéus: só pintam onde há desenho (x cor principal, X detalhe). */
const HEADGEAR_ROWS: Record<HeadgearId, Record<number, string>> = {
  none: {},
  cap: { 1: '...xxxx.....', 2: '..xxxxxxX...' },
  band: { 2: '..xxxxxxX...' },
  helmet: { 1: '...xxxx.....', 2: '..xXxxxx....', 3: '..x....x....' },
  wizard: { 0: '.....xX.....', 1: '....xxxx....', 2: '.xxXxxxxxx..' },
  crown: { 0: '..x.xx.x....', 1: '..xXxxXx....' },
};

const HEADGEAR_COLORS: Record<HeadgearId, { x: string; X: string }> = {
  none: { x: '', X: '' },
  cap: { x: '#e5484d', X: '#9b2c2f' },
  band: { x: '#f4f2ee', X: '#e5484d' },
  helmet: { x: '#a9b1bc', X: '#6a7380' },
  wizard: { x: '#6b5a8e', X: '#f5b841' },
  crown: { x: '#f5b841', X: '#e5484d' },
};

/** Aplica linhas sobre a grade. Opaco: a linha inteira substitui; senão só os pixels desenhados. */
function overlay(grid: string[][], rows: Record<number, string>, opaque: boolean): void {
  for (const [i, row] of Object.entries(rows)) {
    const y = Number(i);
    [...row].forEach((ch, x) => {
      if (opaque || ch !== '.') grid[y][x] = ch;
    });
  }
}

/** Roupa: transforma a grade depois da pose, para valer também na comemoração. */
function applyOutfit(grid: string[][], outfit: OutfitId, longHair: boolean): void {
  switch (outfit) {
    case 'armor':
      for (const row of grid) {
        const last = row.lastIndexOf('c');
        row.forEach((ch, x) => { if (ch === 'c') row[x] = x === last ? 'M' : 'm'; });
      }
      break;
    case 'robe':
      // Manto cobre as pernas até a canela
      for (const y of [8, 9]) for (let x = 2; x <= 7; x++) grid[y][x] = 'c';
      break;
    case 'cape':
      // Capa atrás das costas (o herói olha para a direita)
      for (const y of [6, 8, 9]) if (grid[y][1] === '.') grid[y][1] = 'K';
      for (const y of [8, 9]) if (grid[y][0] === '.') grid[y][0] = 'K';
      break;
  }
  // Cabelo longo cai sobre os ombros
  if (longHair) {
    if (grid[6][1] !== 's') grid[6][1] = 'h';
    if (grid[6][8] !== 's') grid[6][8] = 'h';
  }
}

/** Monta o herói com o visual do avatar, a arma equipada (ou nenhuma) e a pose. */
export function buildHeroSprite(
  avatar: AvatarConfig | null | undefined,
  weapon: Weapon | null,
  pose: HeroPose = 'stand'
): Sprite {
  const a: AvatarConfig = { ...DEFAULT_AVATAR, ...(avatar ?? {}) };
  const grid = HERO_ROWS.map(r => r.split(''));
  const gear: HeadgearId = a.headgear ?? 'none';

  overlay(grid, HAIR_ROWS[a.hairStyle ?? 'short'] ?? {}, true);
  overlay(grid, POSE_ROWS[pose], true);
  applyOutfit(grid, a.outfit ?? 'shirt', a.hairStyle === 'long');
  // Boné e elmo escondem o topo do cabelo (pontas e coque)
  if (gear === 'cap' || gear === 'helmet') grid[0] = [...'............'];
  overlay(grid, HEADGEAR_ROWS[gear] ?? {}, false);

  if (weapon) {
    // Lâmina na coluna 11, da linha 2 à 6; guarda na linha 7
    for (let y = 2; y <= 6; y++) grid[y][11] = 'B';
    grid[7][10] = 'H';
    grid[7][11] = 'H';
  }

  const gc = HEADGEAR_COLORS[gear] ?? HEADGEAR_COLORS.none;
  return buildSprite(grid.map(r => r.join('')), {
    h: a.hair,
    s: a.skin,
    e: HERO_EYE,
    c: a.shirt,
    p: a.pants ?? '#2F3B52',
    b: HERO_SHOES,
    B: weapon?.blade ?? '',
    H: weapon?.hilt ?? '',
    x: gc.x,
    X: gc.X,
    m: '#c0c7d1',
    M: '#7d8794',
    K: '#b5431c',
  });
}

/** Monta o chefe da semana a partir do desenho e da paleta da espécie. */
export function buildMonsterSprite(variant: MonsterVariant): Sprite {
  return buildSprite(variant.rows, variant.palette);
}
