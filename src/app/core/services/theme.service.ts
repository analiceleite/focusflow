import { Injectable, signal, effect, computed } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'focusflow-theme';
  private readonly THEME_BAR_COLORS = {
    dark: '#1c1c1e',
    light: '#f5f5f7'
  } as const;

  // Signal para o modo do tema ('light' | 'dark' | 'system')
  themeMode = signal<ThemeMode>(this.getInitialThemeMode());

  private systemPrefersDark = signal<boolean>(false);
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Signal computado se o modo escuro está ativo
  isDarkMode = computed<boolean>(() => {
    const mode = this.themeMode();
    if (mode === 'system') {
      return this.systemPrefersDark();
    }
    return mode === 'dark';
  });

  constructor() {
    // Inicializa a preferência do sistema
    this.systemPrefersDark.set(this.mediaQuery.matches);

    // Escuta mudanças de tema do sistema em tempo real
    this.mediaQuery.addEventListener('change', this.handleSystemThemeChange);

    // Effect para aplicar o tema quando o isDarkMode mudar
    effect(() => {
      this.applyTheme(this.isDarkMode());
    });
  }

  private handleSystemThemeChange = (e: MediaQueryListEvent) => {
    this.systemPrefersDark.set(e.matches);
  }

  private getInitialThemeMode(): ThemeMode {
    const savedTheme = localStorage.getItem(this.THEME_KEY) as ThemeMode | null;
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      return savedTheme;
    }
    return 'system';
  }

  private applyTheme(isDark: boolean): void {
    const theme = isDark ? 'dark' : 'light';

    // Remove temas anteriores
    document.documentElement.classList.remove('dark-theme', 'light-theme');

    // Aplica novo tema
    document.documentElement.classList.add(`${theme}-theme`);

    // Sincroniza a cor da barra do navegador/PWA com o tema atual
    this.applyThemeBarColor(theme);

    // Salva no localStorage
    localStorage.setItem(this.THEME_KEY, this.themeMode());
  }

  private applyThemeBarColor(theme: 'dark' | 'light'): void {
    const color = this.THEME_BAR_COLORS[theme];
    let meta = document.querySelector('meta[name="theme-color"]');

    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }

    meta.setAttribute('content', color);
  }

  toggleTheme(): void {
    const currentMode = this.themeMode();
    if (currentMode === 'system') {
      this.setThemeMode('light');
    } else if (currentMode === 'light') {
      this.setThemeMode('dark');
    } else {
      this.setThemeMode('system');
    }
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
  }

  setDarkMode(isDark: boolean): void {
    this.setThemeMode(isDark ? 'dark' : 'light');
  }
}