import { Session } from '../interfaces/timer.interface';
import { StreakInfo, parseDateKey, toDateKey, weekStartKey } from './streak';
import { BOSS_HP_MINUTES, damageInRange, monsterForWeek } from './weekly-boss';
import { MonsterVariant, WEAPONS, Weapon } from './game-data';

// ─── XP e nível ───────────────────────────────────────────────────────────────

/** XP acumulado = dano total causado a chefes (todas as semanas), incluindo combo. */
export function computeTotalXp(sessions: Session[], streak: StreakInfo): number {
  if (sessions.length === 0) return 0;
  const first = sessions.reduce((min, s) => (s.date < min ? s.date : min), sessions[0].date);
  const last = sessions.reduce((max, s) => (s.date > max ? s.date : max), sessions[0].date);
  return damageInRange(sessions, streak, first, last);
}

/** Nível L exige 200 × (L−1)² XP acumulado. */
const XP_BASE = 200;

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP onde o nível atual começa. */
  levelStartXp: number;
  /** XP onde o próximo nível começa. */
  nextLevelXp: number;
  /** Progresso dentro do nível atual, 0..100. */
  progressPercent: number;
}

export function levelFromXp(xp: number): LevelInfo {
  const level = Math.floor(Math.sqrt(xp / XP_BASE)) + 1;
  const levelStartXp = XP_BASE * (level - 1) ** 2;
  const nextLevelXp = XP_BASE * level ** 2;
  const span = nextLevelXp - levelStartXp;
  return {
    level,
    xp,
    levelStartXp,
    nextLevelXp,
    progressPercent: Math.min(100, ((xp - levelStartXp) / span) * 100),
  };
}

// ─── Bestiário (vitórias passadas) ────────────────────────────────────────────

export interface Victory {
  weekStart: string;
  weekEnd: string;
  monster: MonsterVariant;
  /** Item de loot recebido por esta vitória. */
  loot: Weapon;
  damage: number;
}

/**
 * Semanas passadas em que o chefe foi derrotado, da mais antiga para a mais recente.
 * A semana atual nunca entra aqui, mesmo que já esteja derrotada.
 */
export function computeVictories(sessions: Session[], streak: StreakInfo, now: Date = new Date()): Victory[] {
  const currentWeek = weekStartKey(now);

  const weeks = new Set<string>();
  for (const s of sessions) {
    weeks.add(weekStartKey(parseDateKey(s.date)));
  }

  const victories: Victory[] = [];
  for (const weekStart of [...weeks].sort()) {
    if (weekStart >= currentWeek) continue;

    const end = parseDateKey(weekStart);
    end.setDate(end.getDate() + 6);
    const weekEnd = toDateKey(end);

    const damage = damageInRange(sessions, streak, weekStart, weekEnd);
    if (damage < BOSS_HP_MINUTES) continue;

    victories.push({
      weekStart,
      weekEnd,
      monster: monsterForWeek(weekStart),
      loot: WEAPONS[victories.length % WEAPONS.length],
      damage,
    });
  }
  return victories;
}

/** Armas conquistadas (sem repetição), na ordem do catálogo. */
export function ownedWeapons(victories: Victory[]): Weapon[] {
  const ids = new Set(victories.map(v => v.loot.id));
  return WEAPONS.filter(w => ids.has(w.id));
}
