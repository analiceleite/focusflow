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
  selectedDate = signal<string>(DashboardComponent.toLocalDateString());

  // Paginação
  currentPage = signal(0);
  readonly pageSize = 15;

  // Modal de confirmação
  showDeleteModal = signal(false);
  sessionToDelete = signal<string | null>(null);

  private sub?: Subscription;

  // ─── Helpers de data (parse local, sem offset UTC) ────────────────────────

  public getLocalDateString(date: Date = new Date()): string {
    return DashboardComponent.toLocalDateString(date);
  }

  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  static toLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

    // ── Filtro por seleção múltipla no calendário ──
    const selectedDates = this.selectedCalendarDates();
    if (selectedDates.size > 1) {
      return all.filter(s => selectedDates.has(s.date));
    }

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
    const newDate = this.getLocalDateString(currentDate);
    this.selectedDate.set(newDate);
    this.syncCalendarSelection(newDate);
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
    const newDate = this.getLocalDateString(currentDate);
    this.selectedDate.set(newDate);
    this.syncCalendarSelection(newDate);
  }

  // Botão "Hoje"  — no HTML você chama esse método em vez do set inline
  goToToday(): void {
    const today = this.getLocalDateString();
    this.selectedCalendarDates.set(new Set());  // limpa seleção anterior
    this.selectedDate.set(today);
    this.viewMode.set('quick');                  // volta pro modo rápido
    this.period.set('today');                    // marca "Hoje" como ativo
  }

  // Input de data manual
  onDatePickerInput(value: string): void {
    const first = this.firstSessionDate() ?? '';
    if (first !== '' && value < first) return;
    this.selectedDate.set(value);
    this.syncCalendarSelection(value);
  }

  private syncCalendarSelection(anchorDate: string): void {
    const filterType = this.dateFilterType();
    const allDays = this.calendarDays().map(d => d.date);

    if (filterType === 'day') {
      // Só o dia exato
      this.selectedCalendarDates.set(new Set([anchorDate]));

    } else if (filterType === 'week') {
      const anchor = this.parseLocalDate(anchorDate);
      const startOfWeek = new Date(anchor);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      const startStr = this.getLocalDateString(startOfWeek);
      const endStr = this.getLocalDateString(endOfWeek);
      const range = allDays.filter(d => d >= startStr && d <= endStr);
      this.selectedCalendarDates.set(new Set(range));

    } else if (filterType === 'month') {
      const anchor = this.parseLocalDate(anchorDate);
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const range = allDays.filter(d => {
        const date = this.parseLocalDate(d);
        return date.getFullYear() === year && date.getMonth() === month;
      });
      this.selectedCalendarDates.set(new Set(range));
    }
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

  // ─── Seleção de dias no calendário ───────────────────────────────────────
  public selectedCalendarDates = signal<Set<string>>(new Set());

  private isDragging = false;
  private dragStartDate: string | null = null;

  private getDateFromPointerEvent(event: PointerEvent): string | null {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    return el?.getAttribute('data-date') ?? null;
  }

  public onGridPointerDown(event: PointerEvent): void {
    const date = this.getDateFromPointerEvent(event);
    if (!date || this.isCalendarDayDisabled(date)) return;
    event.preventDefault();
    // Captura o pointer no container para receber eventos mesmo saindo dos filhos
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.isDragging = true;
    this.dragStartDate = date;
    this.selectedCalendarDates.set(new Set([date]));
  }

  public onGridPointerMove(event: PointerEvent): void {
    if (!this.isDragging || !this.dragStartDate) return;
    event.preventDefault(); // impede scroll durante drag
    const date = this.getDateFromPointerEvent(event);
    if (!date) return;

    const allDays = this.calendarDays().map(d => d.date);
    const startIdx = allDays.indexOf(this.dragStartDate);
    const endIdx = allDays.indexOf(date);
    if (startIdx === -1 || endIdx === -1) return;

    const [from, to] = startIdx <= endIdx
      ? [startIdx, endIdx]
      : [endIdx, startIdx];

    const range = allDays
      .slice(from, to + 1)
      .filter(d => !this.isCalendarDayDisabled(d));

    this.selectedCalendarDates.set(new Set(range));
  }

  public onCalendarMouseUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragStartDate = null;

    const selected = this.selectedCalendarDates();
    const sorted = [...selected].sort();

    this.viewMode.set('custom');
    this.selectedDate.set(sorted[0]);
    this.dateFilterType.set('day');
  }

  public onCalendarDayClick(date: string, event?: MouseEvent): void {
    if (this.isCalendarDayDisabled(date)) return;
    // só executa se não foi um drag (drag já resolveu no pointerup)
    if (this.selectedCalendarDates().size <= 1) {
      this.selectedCalendarDates.set(new Set([date]));
      this.viewMode.set('custom');
      this.dateFilterType.set('day');
      this.selectedDate.set(date);
    }
  }

  public onCalendarDayMouseDown(date: string, event: MouseEvent): void {
    if (this.isCalendarDayDisabled(date)) return;
    event.preventDefault();
    this.isDragging = true;
    this.dragStartDate = date;
    // Seleciona o dia inicial imediatamente
    this.selectedCalendarDates.set(new Set([date]));
  }

  public onCalendarDayMouseEnter(date: string): void {
    if (!this.isDragging || !this.dragStartDate) return;
    if (this.isCalendarDayDisabled(date)) return;

    // Pega todos os dias entre dragStart e date
    const allDays = this.calendarDays().map(d => d.date);
    const startIdx = allDays.indexOf(this.dragStartDate);
    const endIdx = allDays.indexOf(date);
    if (startIdx === -1 || endIdx === -1) return;

    const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const range = allDays.slice(from, to + 1).filter(d => !this.isCalendarDayDisabled(d));
    this.selectedCalendarDates.set(new Set(range));

    // No drag, muda para modo custom com filtro de período livre
    // (as métricas vão filtrar pelos dias selecionados)
    this.viewMode.set('custom');
  }

  public isCalendarDaySelected(date: string): boolean {
    return this.selectedCalendarDates().has(date);
  }

  // Primeiro dia com sessão registrada
  readonly firstSessionDate = computed(() => {
    const all = this.sessions();
    if (!all.length) return null;
    return all.map(s => s.date).sort()[0];
  });

  // Se o dia do calendário é desabilitado (antes da primeira sessão)
  public isCalendarDayDisabled(date: string): boolean {
    const first = this.firstSessionDate();
    return !!first && date < first;
  }

  public setPeriodAndClearCalendarSelection(period: 'today' | '7d' | '30d' | 'all') {
    this.selectedCalendarDates.set(new Set());
    this.isDragging = false;
    this.dragStartDate = null;
    this.period.set(period);
    this.viewMode.set('quick');
  }

  logout(): void {
    this.authSvc.logout();
  }
}