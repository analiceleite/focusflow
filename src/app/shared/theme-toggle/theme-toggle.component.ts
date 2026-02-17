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
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
      background: var(--bg-secondary, #1a1a2e);
      border: 1px solid var(--border-color, #2a2a3a);
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.2rem;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      }

      &:active {
        transform: scale(0.95);
      }
    }

    /* Light theme styles */
    :host-context(.light-theme) .theme-toggle {
      background: var(--bg-secondary, #f5f5f5);
      border-color: var(--border-color, #e0e0e0);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

      &:hover {
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
      }
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