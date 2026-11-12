/** Configuração visual do herói. Campos novos são opcionais (perfis antigos continuam válidos). */
export interface AvatarConfig {
  hair: string;
  skin: string;
  shirt: string;
  pants?: string;
  hairStyle?: HairStyleId;
  outfit?: OutfitId;
  headgear?: HeadgearId;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  hair: '#3B2A20',
  skin: '#F2C9A0',
  shirt: '#6C63FF',
  pants: '#2F3B52',
  hairStyle: 'short',
  outfit: 'shirt',
  headgear: 'none',
};

export const HAIR_OPTIONS = ['#3B2A20', '#1c1c1e', '#B5651D', '#E8C170', '#f4f2ee', '#e5484d', '#8E44AD', '#FF6584', '#7fdbff'];
export const SKIN_OPTIONS = ['#ffe0c4', '#F2C9A0', '#D9A277', '#B07A52', '#8D5524', '#5c3a21'];
export const SHIRT_OPTIONS = ['#6C63FF', '#f26b3a', '#FF6584', '#43D9AD', '#5fa889', '#F4A261', '#f5b841', '#2F3B52', '#e8eef7'];
export const PANTS_OPTIONS = ['#2F3B52', '#1c1c1e', '#5d5a54', '#6b4226', '#3e7a5c', '#2e4e7a'];

/** Item de visual do herói. minLevel = nível que desbloqueia. */
export interface CosmeticOption<T extends string> {
  id: T;
  name: string;
  minLevel: number;
}

export type HairStyleId = 'short' | 'long' | 'spiky' | 'bun' | 'bald';
export type OutfitId = 'shirt' | 'robe' | 'cape' | 'armor';
export type HeadgearId = 'none' | 'cap' | 'band' | 'helmet' | 'wizard' | 'crown';

export const HAIR_STYLES: CosmeticOption<HairStyleId>[] = [
  { id: 'short', name: 'Curto', minLevel: 1 },
  { id: 'long', name: 'Longo', minLevel: 1 },
  { id: 'spiky', name: 'Espetado', minLevel: 1 },
  { id: 'bun', name: 'Coque', minLevel: 1 },
  { id: 'bald', name: 'Careca', minLevel: 1 },
];

export const OUTFITS: CosmeticOption<OutfitId>[] = [
  { id: 'shirt', name: 'Camiseta', minLevel: 1 },
  { id: 'robe', name: 'Manto', minLevel: 2 },
  { id: 'cape', name: 'Capa', minLevel: 4 },
  { id: 'armor', name: 'Armadura', minLevel: 7 },
];

export const HEADGEAR: CosmeticOption<HeadgearId>[] = [
  { id: 'none', name: 'Nenhum', minLevel: 1 },
  { id: 'cap', name: 'Boné', minLevel: 1 },
  { id: 'band', name: 'Faixa', minLevel: 2 },
  { id: 'helmet', name: 'Elmo', minLevel: 3 },
  { id: 'wizard', name: 'Mago', minLevel: 5 },
  { id: 'crown', name: 'Coroa', minLevel: 10 },
];

export interface Weapon {
  id: string;
  name: string;
  blade: string;
  hilt: string;
}

/** Itens de loot. Cada chefe derrotado dá um item, na ordem do catálogo. */
export const WEAPONS: Weapon[] = [
  { id: 'wood', name: 'Espada de Madeira', blade: '#8B5A2B', hilt: '#4A2F18' },
  { id: 'iron', name: 'Espada de Ferro', blade: '#C0C7D1', hilt: '#5A4A3A' },
  { id: 'crystal', name: 'Lâmina de Cristal', blade: '#7FDBFF', hilt: '#2E5E8C' },
  { id: 'solar', name: 'Espada Solar', blade: '#FFD93D', hilt: '#B5651D' },
];

export interface MonsterVariant {
  id: string;
  name: string;
  /** Epíteto curto, mostrado no cartão do chefe. */
  title: string;
  /** Desenho 12×10, virado para a esquerda (para o herói). */
  rows: string[];
  /** d contorno · g corpo · G sombra · r olhos · w brilho/dentes · a detalhe. */
  palette: Record<string, string>;
}

/**
 * Bestiário: cada semana traz uma espécie diferente (rotação fixa pela semana).
 * Desenhos olhando para a esquerda, em direção ao herói.
 */
export const MONSTER_VARIANTS: MonsterVariant[] = [
  {
    id: 'slime', name: 'Slime Verde', title: 'Gosma da Procrastinação',
    rows: [
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
    palette: { d: '#3d1c4a', g: '#7BD389', G: '#4E9C5A', r: '#ff4d6d', w: '#f5f5f7' },
  },
  {
    id: 'bat', name: 'Morcego Notívago', title: 'Ladrão de Sono',
    rows: [
      '............',
      'G...d..d...G',
      'GG.dggggd.GG',
      'GGgrggrgggGG',
      'GGGggggggGGG',
      '.GGwgwggggG.',
      '..G.gggg.G..',
      '.....gg.....',
      '............',
      '............',
    ],
    palette: { d: '#1c1424', g: '#6b5a8e', G: '#3b2f55', r: '#ffd93d', w: '#f5f5f7' },
  },
  {
    id: 'golem', name: 'Golem de Pedra', title: 'Muralha da Inércia',
    rows: [
      '...dddddd...',
      '..dggggggd..',
      '..drrgggGd..',
      '..dggggggd..',
      '.ddGGGGGGdd.',
      'dggdggggdggd',
      'dgGdggggdgGd',
      'dddgggGggddd',
      '...ggd.dgg..',
      '..dddd.dddd.',
    ],
    palette: { d: '#2a2a2e', g: '#9a958a', G: '#6a665d', r: '#7fdbff', w: '#f5f5f7' },
  },
  {
    id: 'ghost', name: 'Fantasma da Distração', title: 'Assombra suas abas',
    rows: [
      '....dddd....',
      '..ddggggdd..',
      '.dggggggggd.',
      'dgrrgrrggggd',
      'dgrrgrrggggd',
      'dggggggggggd',
      'dgwwwwgggggd',
      'dggggggggggd',
      'dgGgGggGgGgd',
      'dd.dd..dd.dd',
    ],
    palette: { d: '#3a4a6b', g: '#e8eef7', G: '#b8c4d8', r: '#2a2a3e', w: '#9fb0c8' },
  },
  {
    id: 'mushroom', name: 'Cogumelo Sonolento', title: 'Espalha esporos de preguiça',
    rows: [
      '...dddddd...',
      '.ddgwgggwgd.',
      'dgggggwggggd',
      'dgwggggggwgd',
      'dddddddddddd',
      '..daaaaaad..',
      '..drradaad..',
      '..daawwaad..',
      '..daaaaaad..',
      '..dd....dd..',
    ],
    palette: { d: '#3a1414', g: '#e5484d', G: '#9b2c2f', r: '#1c1c1e', w: '#f5f5f7', a: '#f2dcc0' },
  },
  {
    id: 'dragon', name: 'Dragão do Prazo', title: 'Cospe fogo na última hora',
    rows: [
      '.....dd.....',
      '....dGGd.d..',
      '.ddddGGGdGd.',
      'dggrdGGGGGd.',
      'dgggggdGGd..',
      '.dwwgggggd..',
      '..ddggggggd.',
      '...dgaaggggd',
      '...dgddgd.dd',
      '...dd..dd...',
    ],
    palette: { d: '#1e2a14', g: '#6fbf4a', G: '#3e7a2c', r: '#ffd93d', w: '#f5f5f7', a: '#f7c948' },
  },
  {
    id: 'robot', name: 'Robô Notificador', title: 'Bip! Bip! Bip!',
    rows: [
      '.....d......',
      '.....a......',
      '..dddddddd..',
      '..dgggggGd..',
      '..drgrggGd..',
      '..dwwwggGd..',
      '.ddddddddd..',
      'dadgggggGdad',
      '...dgggGd...',
      '..ddd..ddd..',
    ],
    palette: { d: '#1c2430', g: '#9fb4c8', G: '#5d738a', r: '#ff4d6d', w: '#7fdbff', a: '#ff4d6d' },
  },
  {
    id: 'eye', name: 'Olho Rolante', title: 'Vigia do feed infinito',
    rows: [
      '.d..d..d..d.',
      '..d.d..d.d..',
      '...dddddd...',
      '..dggggggd..',
      '.dwwwwgggGd.',
      '.dwrrwgggGd.',
      '.dwrrwgggGd.',
      '.dwwwwgggGd.',
      '..dgggggGd..',
      '...dddddd...',
    ],
    palette: { d: '#2a0f2e', g: '#c86fd6', G: '#7a3f8a', r: '#1c1c1e', w: '#f5f5f7' },
  },
];

export function findWeapon(id: string | null | undefined): Weapon | null {
  return WEAPONS.find(w => w.id === id) ?? null;
}
