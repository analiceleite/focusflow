import { Component, inject, signal, computed, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faClock, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';

import { NavbarComponent } from 'src/app/shared/navbar/navbar.component';
import { ThemeToggleComponent } from 'src/app/shared/theme-toggle/theme-toggle.component';

import { ActivityStat } from 'src/app/core/interfaces/dashboard.interface';
import { SessionService } from '../../core/services/session.service';
import { Session } from 'src/app/core/interfaces/timer.interface';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, FontAwesomeModule, NavbarComponent, ThemeToggleComponent],
  styleUrls: ['./dashboard.component.scss'],
  templateUrl: './dashboard.component.html',
})

export class DashboardComponent implements OnInit, OnDestroy {

  private sessionSvc = inject(SessionService);
  private authSvc = inject(AuthService);

  faClock = faClock;
  faCalendarAlt = faCalendarAlt;

  sessions = signal<Session[]>([]);
  period = signal<'today' | '7d' | '30d' | 'all'>('today');

  // Filtros por data personalizada
  viewMode = signal<'quick' | 'custom'>('quick');
  dateFilterType = signal<'day' | 'week' | 'month'>('day');
  selectedDate = signal<string>(this.getLocalDateString());

  // Paginação
  currentPage = signal(0);
  readonly pageSize = 15;

  // Modal de confirmação
  showDeleteModal = signal(false);
  sessionToDelete = signal<string | null>(null);

  private sub?: Subscription;

  // ─── Helpers de data (parse local, sem offset UTC) ────────────────────────

  public getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // ─── Computed: botão → desabilitado ──────────────────────────────────────

  readonly isNextPeriodDisabled = computed(() => {
    if (this.viewMode() !== 'custom') return false;
    const filterType = this.dateFilterType();
    const selected = this.parseLocalDate(this.selectedDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filterType === 'day') {
      return selected >= today;
    } else if (filterType === 'week') {
      const endOfWeek = new Date(selected);
      endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
      return endOfWeek >= today;
    } else if (filterType === 'month') {
      const endOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
      return endOfMonth >= today;
    }
    return false;
  });

  // ─── Computed: sessões filtradas ──────────────────────────────────────────

  readonly filteredSessions = computed(() => {
    const all = this.sessions();

    if (this.viewMode() === 'quick') {
      const today = this.getLocalDateString();
      if (this.period() === 'all') return all;
      if (this.period() === 'today') return all.filter(s => s.date === today);
      const days = this.period() === '7d' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = this.getLocalDateString(cutoff);
      return all.filter(s => s.date >= cutoffStr);
    } else {
      const selectedDate = this.parseLocalDate(this.selectedDate());
      const filterType = this.dateFilterType();

      return all.filter(session => {
        const sessionDate = this.parseLocalDate(session.date);

        if (filterType === 'day') {
          return session.date === this.selectedDate();
        } else if (filterType === 'week') {
          const startOfWeek = new Date(selectedDate);
          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          return sessionDate >= startOfWeek && sessionDate <= endOfWeek;
        } else if (filterType === 'month') {
          return (
            sessionDate.getMonth() === selectedDate.getMonth() &&
            sessionDate.getFullYear() === selectedDate.getFullYear()
          );
        }
        return false;
      });
    }
  });

  // ─── Computed: paginação ──────────────────────────────────────────────────

  readonly paginatedSessions = computed(() => {
    const filtered = this.filteredSessions();
    const start = this.currentPage() * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() =>
    Math.ceil(this.filteredSessions().length / this.pageSize)
  );

  readonly hasPrevPage = computed(() => this.currentPage() > 0);
  readonly hasNextPage = computed(() => this.currentPage() < this.totalPages() - 1);

  private pageResetEffect = effect(() => {
    this.period();
    this.viewMode();
    this.dateFilterType();
    this.selectedDate();
    this.currentPage.set(0);
  }, { allowSignalWrites: true });

  // ─── Computed: métricas ───────────────────────────────────────────────────

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
      const dateStr = this.getLocalDateString(current);
      if (dates.has(dateStr)) {
        streak++;
        current.setDate(current.getDate() - 1);
      } else {
        if (streak === 0 && dateStr === this.getLocalDateString(today)) {
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
    const todayStr = this.getLocalDateString(today);
    const days = [];

    for (let i = 69; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = this.getLocalDateString(d);
      days.push({
        date: dateStr,
        hasSession: dateMap.has(dateStr),
        seconds: dateMap.get(dateStr) || 0,
        isToday: dateStr === todayStr
      });
    }
    return days;
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.sub = this.sessionSvc.getSessions$().subscribe(s => this.sessions.set(s));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ─── Métodos utilitários ──────────────────────────────────────────────────

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

  trackBySessionId(index: number, session: Session): string | undefined {
    return session.id;
  }

  // ─── Paginação ────────────────────────────────────────────────────────────

  nextPage(): void {
    if (this.hasNextPage()) this.currentPage.set(this.currentPage() + 1);
  }

  prevPage(): void {
    if (this.hasPrevPage()) this.currentPage.set(this.currentPage() - 1);
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) this.currentPage.set(page);
  }

  // ─── Modal de exclusão ────────────────────────────────────────────────────

  async deleteSession(id: string): Promise<void> {
    this.sessionToDelete.set(id);
    this.showDeleteModal.set(true);
  }

  confirmDelete(): void {
    const id = this.sessionToDelete();
    if (id) this.performDeletion(id);
    this.closeDeleteModal();
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.sessionToDelete.set(null);
  }

  private async performDeletion(id: string): Promise<void> {
    try {
      await this.sessionSvc.deleteSession(id);
    } catch (error) {
      console.error('Erro ao excluir sessão:', error);
      alert('Erro ao excluir a sessão. Tente novamente.');
    }
  }

  // ─── Filtro personalizado por data ────────────────────────────────────────

  switchToQuickView(): void {
    this.viewMode.set('quick');
  }

  switchToCustomView(): void {
    this.viewMode.set('custom');
  }

  goToPreviousPeriod(): void {
    const currentDate = this.parseLocalDate(this.selectedDate());
    if (this.dateFilterType() === 'day') {
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (this.dateFilterType() === 'week') {
      currentDate.setDate(currentDate.getDate() - 7);
    } else if (this.dateFilterType() === 'month') {
      currentDate.setMonth(currentDate.getMonth() - 1);
    }
    this.selectedDate.set(this.getLocalDateString(currentDate));
  }

  goToNextPeriod(): void {
    if (this.isNextPeriodDisabled()) return;
    const currentDate = this.parseLocalDate(this.selectedDate());
    if (this.dateFilterType() === 'day') {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (this.dateFilterType() === 'week') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (this.dateFilterType() === 'month') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    this.selectedDate.set(this.getLocalDateString(currentDate));
  }

  formatPeriodTitle(): string {
    const selectedDate = this.parseLocalDate(this.selectedDate());
    const filterType = this.dateFilterType();

    if (filterType === 'day') {
      return selectedDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } else if (filterType === 'week') {
      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else {
      return selectedDate.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      });
    }
  }

  logout(): void {
    this.authSvc.logout();
  }
}