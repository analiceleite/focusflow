import { Session } from '../interfaces/timer.interface';

/** Meta semanal que define o HP do chefe: 10 h de foco = 600 HP. */
export const BOSS_HP_MINUTES = 600;

/** Dano causado por cada minuto de foco. */
export const DAMAGE_PER_MINUTE = 1;

export interface WeeklyBossState {
  weekStart: string; // YYYY-MM-DD (domingo)
  weekEnd: string; // YYYY-MM-DD (sábado)
  hpMax: number;
  damage: number;
  hpLeft: number;
  percent: number; // 0..100 de HP restante
  defeated: boolean;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calcula o estado do chefe da semana (domingo a sábado) a partir das sessões. */
export function computeWeeklyBoss(sessions: Session[], now: Date = new Date()): WeeklyBossState {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const weekStart = toLocalDateString(start);
  const weekEnd = toLocalDateString(end);

  // Datas são strings YYYY-MM-DD, então a comparação lexicográfica é segura.
  const seconds = sessions
    .filter(s => s.date >= weekStart && s.date <= weekEnd)
    .reduce((acc, s) => acc + s.durationSeconds, 0);

  const damage = Math.floor(seconds / 60) * DAMAGE_PER_MINUTE;
  const hpLeft = Math.max(0, BOSS_HP_MINUTES - damage);

  return {
    weekStart,
    weekEnd,
    hpMax: BOSS_HP_MINUTES,
    damage,
    hpLeft,
    percent: (hpLeft / BOSS_HP_MINUTES) * 100,
    defeated: hpLeft === 0,
  };
}
