import { Session } from '../interfaces/timer.interface';

/** Cada semana (domingo a sábado) tem um escudo que cobre um dia passado sem sessão. */
export const SHIELDS_PER_WEEK = 1;

export interface StreakInfo {
  /** Dias seguidos ativos até hoje (escudos contam como continuidade). */
  current: number;
  /** Multiplicador de dano de cada dia com sessão, por data YYYY-MM-DD. */
  comboByDate: Map<string, number>;
  /** Escudos já consumidos por semana (chave: YYYY-MM-DD do domingo). */
  shieldUsedByWeek: Map<string, number>;
  /** Dias passados cobertos pelo escudo. */
  shieldedDates: Set<string>;
  /** Se a semana atual ainda tem escudo disponível. */
  shieldAvailableThisWeek: boolean;
}

/** Multiplicador de combo: 3 dias = 1,2×, 7 dias = 1,5×. */
export function comboMultiplier(streak: number): number {
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte YYYY-MM-DD em Date à meia-noite local (sem deslocamento UTC). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Domingo da semana que contém a data. */
export function weekStartKey(date: Date): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return toDateKey(start);
}

/**
 * Percorre os dias do primeiro treino até hoje.
 * - Dia com sessão soma +1 à ofensiva e recebe o multiplicador de combo.
 * - Dia passado sem sessão é coberto pelo escudo da semana, se houver.
 * - Sem escudo, a ofensiva zera.
 * - Hoje sem sessão ainda não quebra a ofensiva (o dia não acabou).
 */
export function computeStreakInfo(sessions: Session[], today: Date = new Date()): StreakInfo {
  const info: StreakInfo = {
    current: 0,
    comboByDate: new Map(),
    shieldUsedByWeek: new Map(),
    shieldedDates: new Set(),
    shieldAvailableThisWeek: SHIELDS_PER_WEEK > 0,
  };

  const activeDates = new Set(sessions.map(s => s.date));
  const todayKey = toDateKey(today);

  if (activeDates.size > 0) {
    const firstKey = [...activeDates].sort()[0];
    const cursor = parseDateKey(firstKey);
    const end = parseDateKey(todayKey);
    let streak = 0;

    while (cursor <= end) {
      const key = toDateKey(cursor);

      if (activeDates.has(key)) {
        streak += 1;
        info.comboByDate.set(key, comboMultiplier(streak));
      } else if (key !== todayKey && streak > 0) {
        const week = weekStartKey(cursor);
        const used = info.shieldUsedByWeek.get(week) ?? 0;
        if (used < SHIELDS_PER_WEEK) {
          info.shieldUsedByWeek.set(week, used + 1);
          info.shieldedDates.add(key);
        } else {
          streak = 0;
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    info.current = streak;
  }

  const currentWeek = weekStartKey(today);
  info.shieldAvailableThisWeek =
    (info.shieldUsedByWeek.get(currentWeek) ?? 0) < SHIELDS_PER_WEEK;

  return info;
}
