import { Session } from '../interfaces/timer.interface';
import { StreakInfo, comboMultiplier, computeStreakInfo, toDateKey } from './streak';

/** Meta semanal que define o HP do chefe: 10 h de foco = 600 HP. */
export const BOSS_HP_MINUTES = 600;

/** Dano base causado por cada minuto de foco (antes do combo). */
export const DAMAGE_PER_MINUTE = 1;

export interface WeeklyBossState {
  weekStart: string; // YYYY-MM-DD (domingo)
  weekEnd: string; // YYYY-MM-DD (sábado)
  hpMax: number;
  damage: number;
  hpLeft: number;
  percent: number; // 0..100 de HP restante
  defeated: boolean;
  /** Combo atual da ofensiva (1, 1.2 ou 1.5). */
  combo: number;
  /** Dias seguidos ativos. */
  streak: number;
  /** Se ainda há escudo nesta semana. */
  shieldAvailable: boolean;
}

/**
 * Calcula o estado do chefe da semana (domingo a sábado).
 * O dano é somado por dia: minutos do dia × multiplicador de combo daquele dia.
 */
export function computeWeeklyBoss(
  sessions: Session[],
  now: Date = new Date(),
  streak: StreakInfo = computeStreakInfo(sessions, now)
): WeeklyBossState {
  const weekStartDate = new Date(now);
  weekStartDate.setHours(0, 0, 0, 0);
  weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay());

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);

  const weekStart = toDateKey(weekStartDate);
  const weekEnd = toDateKey(weekEndDate);

  // Segundos por dia dentro da semana. Datas são YYYY-MM-DD, então a comparação é segura.
  const secondsByDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.date >= weekStart && s.date <= weekEnd) {
      secondsByDay.set(s.date, (secondsByDay.get(s.date) ?? 0) + s.durationSeconds);
    }
  }

  let damage = 0;
  for (const [date, seconds] of secondsByDay) {
    const minutes = Math.floor(seconds / 60);
    const combo = streak.comboByDate.get(date) ?? 1;
    damage += Math.floor(minutes * DAMAGE_PER_MINUTE * combo);
  }

  const hpLeft = Math.max(0, BOSS_HP_MINUTES - damage);

  return {
    weekStart,
    weekEnd,
    hpMax: BOSS_HP_MINUTES,
    damage,
    hpLeft,
    percent: (hpLeft / BOSS_HP_MINUTES) * 100,
    defeated: hpLeft === 0,
    combo: comboMultiplier(streak.current),
    streak: streak.current,
    shieldAvailable: streak.shieldAvailableThisWeek,
  };
}
