/** Configuração visual do herói (cores escolhidas pelo usuário). */
export interface AvatarConfig {
  hair: string;
  skin: string;
  shirt: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  hair: '#3B2A20',
  skin: '#F2C9A0',
  shirt: '#6C63FF',
};

export const HAIR_OPTIONS = ['#3B2A20', '#1c1c1e', '#B5651D', '#E8C170', '#8E44AD', '#FF6584'];
export const SKIN_OPTIONS = ['#F2C9A0', '#D9A277', '#B07A52', '#8D5524'];
export const SHIRT_OPTIONS = ['#6C63FF', '#FF6584', '#43D9AD', '#F4A261', '#2F3B52'];

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
  name: string;
  body: string;
  shade: string;
}

/** Variantes do monstro (mesmo desenho, cores diferentes). A escolha depende da semana. */
export const MONSTER_VARIANTS: MonsterVariant[] = [
  { name: 'Slime Verde', body: '#7BD389', shade: '#4E9C5A' },
  { name: 'Slime Roxo', body: '#B57EDC', shade: '#7A4FA8' },
  { name: 'Slime Dourado', body: '#F7C948', shade: '#C9962B' },
  { name: 'Slime de Gelo', body: '#8FD3F4', shade: '#4A90B8' },
];

export function findWeapon(id: string | null | undefined): Weapon | null {
  return WEAPONS.find(w => w.id === id) ?? null;
}
