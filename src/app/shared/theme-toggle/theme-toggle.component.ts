import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button 
      class="theme-toggle" 
      (click)="toggleTheme()" 
      [title]="isDarkMode() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
    >
      {{ isDarkMode() ? '☀️' : '🌙' }}
    </button>
  `,
  styles: [`
    .theme-toggle {
      background: var(--bg-secondary, transparent);
      border: none;
      border-radius: 8px;
      padding: 0.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.1rem;
      transition: transform 0.15s ease, box-shadow 0.15s ease;

      &:hover {
        transform: scale(1.05);
      }

      &:active {
        transform: scale(0.98);
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