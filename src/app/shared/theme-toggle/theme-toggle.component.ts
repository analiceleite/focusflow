import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faMoon, faSun, faDesktop } from '@fortawesome/free-solid-svg-icons';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  template: `
    <button 
      class="theme-toggle" 
      (click)="toggleTheme()" 
      [title]="getButtonTitle()"
    >
      <fa-icon [icon]="getIcon()"></fa-icon>
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
      padding: 0.45rem 0.7rem;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.2s;

      fa-icon {
        font-size: 0.95rem;
      }

      &:hover {
        background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
        border-color: color-mix(in srgb, var(--border-color) 60%, transparent);
        color: var(--text-primary);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      &:active {
        transform: none;
      }
    }

    @media (max-width: 768px) {
      .theme-toggle {
        min-height: 44px;
        padding: 0.2rem 0.35rem;
        border-radius: 10px;

        &:hover {
          transform: none;
          box-shadow: none;
        }
      }
    }

    :host-context(.light-theme) .theme-toggle {
      color: var(--text-primary);
    }
  `]
})
export class ThemeToggleComponent {
  private themeService = inject(ThemeService);

  faSun = faSun;
  faMoon = faMoon;
  faDesktop = faDesktop;

  themeMode = this.themeService.themeMode;
  isDarkMode = this.themeService.isDarkMode;

  getIcon() {
    const mode = this.themeMode();
    if (mode === 'light') return this.faSun;
    if (mode === 'dark') return this.faMoon;
    return this.faDesktop;
  }

  getButtonTitle(): string {
    const mode = this.themeMode();
    if (mode === 'light') return 'Tema Claro (clique para mudar para tema escuro)';
    if (mode === 'dark') return 'Tema Escuro (clique para mudar para tema do sistema)';
    return 'Tema do Sistema (clique para mudar para tema claro)';
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}