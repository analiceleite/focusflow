import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { SessionService, Session, ActivityType } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';

interface ActivityStat {
  name: string;
  icon: string;
  color: string;
  totalSeconds: number;
  sessionCount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="app-shell">
      <!-- Sidebar -->
      <nav class="sidebar">
        <div class="sidebar-logo">⏱</div>
        <a routerLink="/timer" class="nav-item" title="Timer">🎯</a>
        <a routerLink="/dashboard" class="nav-item active" title="Dashboard">📊</a>
        <button class="nav-item nav-logout" (click)="logout()" title="Sair">↩</button>
      </nav>

      <!-- Main -->
      <main class="main">
        <header class="header">
          <h2>Dashboard</h2>
          <div class="header-filters">
            <button [class.active]="period() === '7d'" (click)="period.set('7d')">7 dias</button>
            <button [class.active]="period() === '30d'" (click)="period.set('30d')">30 dias</button>
            <button [class.active]="period() === 'all'" (click)="period.set('all')">Tudo</button>
          </div>
        </header>

        <!-- Summary Cards -->
        <div class="cards-grid">
          <div class="card card-total">
            <div class="card-icon">⏳</div>
            <div class="card-value">{{ formatDuration(totalSeconds()) }}</div>
            <div class="card-label">Tempo total</div>
          </div>
          <div class="card card-streak">
            <div class="card-icon">🔥</div>
            <div class="card-value">{{ currentStreak() }}<span class="unit">dias</span></div>
            <div class="card-label">Ofensiva atual</div>
          </div>
          <div class="card card-sessions">
            <div class="card-icon">✅</div>
            <div class="card-value">{{ filteredSessions().length }}</div>
            <div class="card-label">Sessões</div>
          </div>
          <div class="card card-avg">
            <div class="card-icon">📈</div>
            <div class="card-value">{{ formatDuration(avgSessionSeconds()) }}</div>
            <div class="card-label">Média/sessão</div>
          </div>
        </div>

        <!-- Activity Breakdown -->
        @if (activityStats().length > 0) {
          <div class="section">
            <div class="section-label">Por tipo de atividade</div>
            <div class="activity-bars">
              @for (stat of activityStats(); track stat.name) {
                <div class="activity-bar-item">
                  <div class="bar-header">
                    <div class="bar-info">
                      <span class="bar-icon">{{ stat.icon }}</span>
                      <span class="bar-name">{{ stat.name }}</span>
                      <span class="bar-sessions">{{ stat.sessionCount }} sessão(ões)</span>
                    </div>
                    <span class="bar-time">{{ formatDuration(stat.totalSeconds) }}</span>
                  </div>
                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      [style.width.%]="getBarPercent(stat.totalSeconds)"
                      [style.background]="stat.color">
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Streak Calendar -->
        <div class="section">
          <div class="section-label">
            🔥 Ofensiva — {{ currentStreak() }} dia(s) consecutivo(s)
            @if (bestStreak() > 0) {
              · Recorde: {{ bestStreak() }} dias
            }
          </div>
          <div class="calendar-grid">
            @for (day of calendarDays(); track day.date) {
              <div
                class="cal-day"
                [class.has-session]="day.hasSession"
                [class.today]="day.isToday"
                [title]="day.date + (day.seconds > 0 ? (' — ' + formatDuration(day.seconds)) : '')">
              </div>
            }
          </div>
          <div class="calendar-legend">
            <span class="legend-dot empty"></span> Sem sessão
            <span class="legend-dot filled"></span> Com sessão
          </div>
        </div>

        <!-- Recent Sessions -->
        @if (filteredSessions().length > 0) {
          <div class="section">
            <div class="section-label">Sessões recentes</div>
            <div class="sessions-list">
              @for (session of filteredSessions().slice(0, 20); track session.id) {
                <div class="session-item">
                  <div
                    class="session-dot"
                    [style.background]="session.activityColor">
                  </div>
                  <div class="session-info">
                    <span class="session-name">{{ session.activityTypeName }}</span>
                    <span class="session-date">{{ formatDate(session.date) }}</span>
                  </div>
                  <span class="session-duration">{{ formatDuration(session.durationSeconds) }}</span>
                  <span class="session-mode">{{ session.mode === 'pomodoro' ? '🍅' : '⏱' }}</span>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="empty-state">
            <div class="empty-icon">🎯</div>
            <p>Nenhuma sessão registrada ainda.</p>
            <a routerLink="/timer" class="btn-start">Começar agora →</a>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #0f0f14; }

    .app-shell { display: flex; min-height: 100vh; }

    .sidebar {
      width: 64px;
      background: #0a0a10;
      border-right: 1px solid #1e1e2e;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 0;
      gap: 0.5rem;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      z-index: 10;
    }

    .sidebar-logo { font-size: 1.5rem; margin-bottom: 1rem; }

    .nav-item {
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 12px;
      text-decoration: none;
      font-size: 1.25rem;
      color: #555;
      border: none;
      background: transparent;
      cursor: pointer;
      transition: all 0.2s;

      &:hover, &.active {
        background: #1e1e2e;
        color: #fff;
      }
    }

    .nav-logout {
      margin-top: auto;
      color: #666;
      &:hover { color: #ff6584; background: rgba(255,101,132,0.1); }
    }

    .main {
      margin-left: 64px;
      flex: 1;
      max-width: 700px;
      margin-inline: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;

      h2 {
        color: #fff;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }

      .header-filters {
        display: flex;
        gap: 0.25rem;

        button {
          padding: 0.4rem 0.875rem;
          border-radius: 8px;
          border: 1px solid #2a2a3a;
          background: transparent;
          color: #666;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;

          &.active {
            background: #1e1e2e;
            border-color: #3a3a5a;
            color: #fff;
          }
        }
      }
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .card {
      background: #12121a;
      border: 1px solid #1e1e2e;
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      .card-icon { font-size: 1.5rem; margin-bottom: 0.25rem; }

      .card-value {
        color: #fff;
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        line-height: 1;

        .unit {
          font-size: 1rem;
          color: #666;
          font-weight: 400;
          margin-left: 0.25rem;
        }
      }

      .card-label {
        color: #555;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .section-label {
      color: #555;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .activity-bars {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .activity-bar-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .bar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .bar-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .bar-icon { font-size: 1rem; }
      .bar-name { color: #ddd; font-size: 0.9rem; font-weight: 500; }
      .bar-sessions { color: #444; font-size: 0.75rem; }
    }

    .bar-time { color: #888; font-size: 0.875rem; font-weight: 500; }

    .bar-track {
      height: 6px;
      background: #1a1a28;
      border-radius: 3px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.6s ease;
    }

    .calendar-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }

    .cal-day {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      background: #1a1a28;
      cursor: default;
      transition: transform 0.15s;

      &.has-session {
        background: #6C63FF;
        opacity: 0.8;
      }

      &.today {
        outline: 2px solid #fff;
        outline-offset: 1px;
      }

      &.today.has-session { opacity: 1; }

      &:hover { transform: scale(1.3); }
    }

    .calendar-legend {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.75rem;
      color: #555;

      .legend-dot {
        display: inline-block;
        width: 10px; height: 10px;
        border-radius: 2px;
        margin-right: 4px;

        &.empty { background: #1a1a28; }
        &.filled { background: #6C63FF; }
      }
    }

    .sessions-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .session-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #12121a;
      border: 1px solid #1e1e2e;
      border-radius: 10px;
    }

    .session-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .session-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;

      .session-name { color: #ccc; font-size: 0.875rem; }
      .session-date { color: #444; font-size: 0.75rem; }
    }

    .session-duration { color: #888; font-size: 0.875rem; font-weight: 500; }
    .session-mode { font-size: 1rem; }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;

      .empty-icon { font-size: 3rem; }

      p { color: #555; margin: 0; }
    }

    .btn-start {
      padding: 0.7rem 1.5rem;
      background: #6C63FF;
      color: #fff;
      border-radius: 50px;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s;
      &:hover { background: #7B73FF; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);

  sessions = signal<Session[]>([]);
  period = signal<'7d' | '30d' | 'all'>('7d');

  private sub?: Subscription;

  readonly filteredSessions = computed(() => {
    const all = this.sessions();
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (this.period() === 'all') return all;

    const days = this.period() === '7d' ? 7 : 30;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return all.filter(s => s.date >= cutoffStr);
  });

  readonly totalSeconds = computed(() =>
    this.filteredSessions().reduce((acc, s) => acc + s.durationSeconds, 0)
  );

  readonly avgSessionSeconds = computed(() => {
    const sessions = this.filteredSessions();
    return sessions.length > 0 ? Math.round(this.totalSeconds() / sessions.length) : 0;
  });

  readonly activityStats = computed((): ActivityStat[] => {
    const map = new Map<string, ActivityStat>();
    for (const s of this.filteredSessions()) {
      const key = s.activityTypeId;
      if (!map.has(key)) {
        map.set(key, {
          name: s.activityTypeName,
          icon: '📌',
          color: s.activityColor,
          totalSeconds: 0,
          sessionCount: 0
        });
      }
      const stat = map.get(key)!;
      stat.totalSeconds += s.durationSeconds;
      stat.sessionCount += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  });

  readonly currentStreak = computed(() => {
    const dates = new Set(this.sessions().map(s => s.date));
    const today = new Date();
    let streak = 0;
    let current = new Date(today);

    while (true) {
      const dateStr = current.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
        current.setDate(current.getDate() - 1);
      } else {
        // Allow one day gap for today if no session yet
        if (streak === 0 && dateStr === today.toISOString().split('T')[0]) {
          current.setDate(current.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  });

  readonly bestStreak = computed(() => {
    const allDates = [...new Set(this.sessions().map(s => s.date))].sort();
    if (allDates.length === 0) return 0;

    let best = 1, current = 1;
    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(allDates[i - 1]);
      const curr = new Date(allDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 1;
      }
    }
    return best;
  });

  readonly calendarDays = computed(() => {
    const dateMap = new Map<string, number>();
    for (const s of this.sessions()) {
      dateMap.set(s.date, (dateMap.get(s.date) || 0) + s.durationSeconds);
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const days = [];

    // Show last 70 days (10 weeks)
    for (let i = 69; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        hasSession: dateMap.has(dateStr),
        seconds: dateMap.get(dateStr) || 0,
        isToday: dateStr === todayStr
      });
    }
    return days;
  });

  ngOnInit(): void {
    this.sub = this.sessionSvc.getSessions$().subscribe(s => this.sessions.set(s));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  getBarPercent(seconds: number): number {
    const max = Math.max(...this.activityStats().map(s => s.totalSeconds));
    return max > 0 ? (seconds / max) * 100 : 0;
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  logout(): void {
    this.authSvc.logout();
  }
}
