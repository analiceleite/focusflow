import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <button
      class="theme-toggle"
      (click)="toggleTheme()"
      [title]="isDarkMode() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
    >
      <app-icon [name]="isDarkMode() ? 'sun' : 'moon'" [size]="18"></app-icon>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
    }

    .theme-toggle {
      min-height: 40px;
      min-width: 44px;
      padding: 0.4rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      cursor: pointer;
      color: var(--text-muted);
      background: transparent;
      border: 2px solid transparent;
      transition: color 0.15s, background 0.15s;

      &:hover {
        color: var(--xp);
        background: var(--bg-tertiary);
      }
    }

    :host-context(.light-theme) .theme-toggle {
      color: var(--text-primary);
    }
  `]
})
export class ThemeToggleComponent {
  private themeService = inject(ThemeService);

  isDarkMode = this.themeService.isDarkMode;

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}