import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

import { NavbarComponent } from 'src/app/shared/navbar/navbar.component';
import { ThemeToggleComponent } from 'src/app/shared/theme-toggle/theme-toggle.component';

import { ActivityStat } from 'src/app/core/interfaces/dashboard.interface';
import { SessionService } from '../../core/services/session.service';
import { Session } from 'src/app/core/interfaces/timer.interface';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FontAwesomeModule, NavbarComponent, ThemeToggleComponent],
  styleUrls: ['./dashboard.component.scss'],
  templateUrl: './dashboard.component.html',
})

export class DashboardComponent implements OnInit, OnDestroy {
  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);

  faClock = faClock;

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

  async deleteSession(id: string): Promise<void> {
    await this.sessionSvc.deleteSession(id);
  }

  logout(): void {
    this.authSvc.logout();
  }
}
