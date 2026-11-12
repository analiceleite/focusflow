import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { HeroStageComponent } from '../../../shared/hero-stage/hero-stage.component';
import { DEFAULT_AVATAR, MONSTER_VARIANTS } from '../../../core/game/game-data';
import { SCENARIOS } from '../../../core/game/scenarios';

/** Intervalo da demonstração: cada "minuto" da vitrine dura 2,4 s. */
const DEMO_TICK_MS = 2400;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, HeroStageComponent],
  styleUrls: ['./login.component.scss'],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);

  isRegister = signal(false);
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  email = '';
  password = '';

  // ── Vitrine: o herói golpeando um slime em loop ──
  readonly demoAvatar = DEFAULT_AVATAR;
  readonly demoMonster = MONSTER_VARIANTS[0];
  readonly demoScenario = SCENARIOS[0];
  demoMinutes = signal(0);
  demoBoss = signal(100);
  private demoTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    this.demoTimer = setInterval(() => {
      this.demoMinutes.update(m => m + 1);
      this.demoBoss.update(hp => (hp <= 12 ? 100 : hp - 12));
    }, DEMO_TICK_MS);
  }

  ngOnDestroy(): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
  }

  setMode(register: boolean): void {
    this.isRegister.set(register);
    this.error.set('');
  }

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      if (this.isRegister()) {
        await this.authService.register(this.email, this.password);
      } else {
        await this.authService.login(this.email, this.password);
      }
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/email-already-in-use': 'E-mail já cadastrado.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
      };
      this.error.set(msg[err.code] || 'Ocorreu um erro. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
