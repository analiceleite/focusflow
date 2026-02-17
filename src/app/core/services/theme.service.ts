import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'focusflow-theme';
  
  // Signal para o estado do tema
  isDarkMode = signal<boolean>(this.getInitialTheme());

  constructor() {
    // Effect para aplicar o tema quando o signal mudar
    effect(() => {
      this.applyTheme(this.isDarkMode());
    });
  }

  private getInitialTheme(): boolean {
    // Verifica se há tema salvo no localStorage
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    
    // Se não há tema salvo, usa preferência do sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private applyTheme(isDark: boolean): void {
    const theme = isDark ? 'dark' : 'light';
    
    // Remove temas anteriores
    document.documentElement.classList.remove('dark-theme', 'light-theme');
    
    // Aplica novo tema
    document.documentElement.classList.add(`${theme}-theme`);
    
    // Salva no localStorage
    localStorage.setItem(this.THEME_KEY, theme);
  }

  toggleTheme(): void {
    this.isDarkMode.set(!this.isDarkMode());
  }

  setDarkMode(isDark: boolean): void {
    this.isDarkMode.set(isDark);
  }
}