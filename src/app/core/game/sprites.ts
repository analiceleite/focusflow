import { AvatarConfig, MonsterVariant, Weapon, DEFAULT_AVATAR } from './game-data';

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

// Herói (12x10). Colunas 10 e 11 ficam reservadas para a arma.
// h cabelo, s pele, e olho, c camiseta, p calça, b tênis, B lâmina, H guarda
const HERO_ROWS = [
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

const HERO_PANTS = '#2F3B52';
const HERO_SHOES = '#43D9AD';
const HERO_EYE = '#1c1c1e';

/** Monta o herói com as cores do avatar e a arma equipada (ou nenhuma). */
export function buildHeroSprite(avatar: AvatarConfig | null | undefined, weapon: Weapon | null): Sprite {
  const a = avatar ?? DEFAULT_AVATAR;
  const rows = HERO_ROWS.map(r => r.split(''));

  if (weapon) {
    // Lâmina na coluna 11, da linha 1 à 5; guarda na linha 6
    for (let y = 1; y <= 5; y++) rows[y][11] = 'B';
    rows[6][10] = 'H';
    rows[6][11] = 'H';
  }

  return buildSprite(rows.map(r => r.join('')), {
    h: a.hair,
    s: a.skin,
    e: HERO_EYE,
    c: a.shirt,
    p: HERO_PANTS,
    b: HERO_SHOES,
    B: weapon?.blade ?? '',
    H: weapon?.hilt ?? '',
  });
}

// Chefe (12x10). g corpo, G sombra, r olhos, w dentes, d chifres
const MONSTER_ROWS = [
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
];

export function buildMonsterSprite(variant: MonsterVariant): Sprite {
  return buildSprite(MONSTER_ROWS, {
    d: '#3d1c4a',
    g: variant.body,
    G: variant.shade,
    r: '#ff4d6d',
    w: '#f5f5f7',
  });
}
