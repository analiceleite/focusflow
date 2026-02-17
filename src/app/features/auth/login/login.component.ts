import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="logo">
          <span class="logo-icon">⏱</span>
          <h1>FocusFlow</h1>
          <p>Seu tempo, seu foco.</p>
        </div>

        <div class="tabs">
          <button
            [class.active]="!isRegister()"
            (click)="isRegister.set(false)">
            Entrar
          </button>
          <button
            [class.active]="isRegister()"
            (click)="isRegister.set(true)">
            Criar conta
          </button>
        </div>

        <form (ngSubmit)="submit()">
          <div class="field">
            <label>E-mail</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="seu@email.com"
              required />
          </div>

          <div class="field">
            <label>Senha</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              placeholder="••••••••"
              required />
          </div>

          @if (error()) {
            <div class="error-msg">{{ error() }}</div>
          }

          <button type="submit" class="btn-submit" [disabled]="loading()">
            {{ loading() ? 'Aguarde...' : (isRegister() ? 'Criar conta' : 'Entrar') }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #0f0f14;
    }

    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0f0f14 70%);
    }

    .auth-card {
      background: #16161f;
      border: 1px solid #2a2a3a;
      border-radius: 20px;
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }

    .logo {
      text-align: center;
      margin-bottom: 2rem;

      .logo-icon {
        font-size: 2.5rem;
        display: block;
        margin-bottom: 0.5rem;
      }

      h1 {
        color: #fff;
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0 0 0.25rem;
        letter-spacing: -0.5px;
      }

      p {
        color: #666;
        font-size: 0.875rem;
        margin: 0;
      }
    }

    .tabs {
      display: flex;
      background: #0f0f14;
      border-radius: 10px;
      padding: 4px;
      margin-bottom: 1.75rem;

      button {
        flex: 1;
        padding: 0.6rem;
        border: none;
        background: transparent;
        color: #666;
        border-radius: 7px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;

        &.active {
          background: #6C63FF;
          color: #fff;
          font-weight: 600;
        }
      }
    }

    .field {
      margin-bottom: 1rem;

      label {
        display: block;
        color: #888;
        font-size: 0.8rem;
        font-weight: 500;
        margin-bottom: 0.4rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      input {
        width: 100%;
        padding: 0.75rem 1rem;
        background: #0f0f14;
        border: 1px solid #2a2a3a;
        border-radius: 10px;
        color: #fff;
        font-size: 0.95rem;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s;

        &:focus {
          border-color: #6C63FF;
        }

        &::placeholder {
          color: #444;
        }
      }
    }

    .error-msg {
      background: rgba(255,100,100,0.1);
      border: 1px solid rgba(255,100,100,0.3);
      color: #ff8080;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .btn-submit {
      width: 100%;
      padding: 0.875rem;
      background: #6C63FF;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 0.5rem;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        background: #7B73FF;
        transform: translateY(-1px);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  `]
})
export class LoginComponent {
  private authService = inject(AuthService);

  isRegister = signal(false);
  loading = signal(false);
  error = signal('');

  email = '';
  password = '';

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
