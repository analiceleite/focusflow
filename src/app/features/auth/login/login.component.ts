import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggleComponent } from '../../../shared/theme-toggle/theme-toggle.component';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, FontAwesomeModule, ThemeToggleComponent],
  styleUrls: ['./login.component.scss'],
  templateUrl: './login.component.html',
})

export class LoginComponent {
  private authService = inject(AuthService);

  faClock = faClock;

  isRegister = signal(false);
  loading = signal(false);
  error = signal('');
  successMessage = signal('');

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

  async recoverPassword(): Promise<void> {
    if (!this.email) {
      this.error.set('Por favor, informe seu e-mail para recuperar a senha.');
      this.successMessage.set('');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.successMessage.set('');

    try {
      await this.authService.resetPassword(this.email);
      this.successMessage.set('E-mail de redefinição enviado com sucesso! Verifique sua caixa de entrada.');
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-not-found': 'Usuário não encontrado.',
      };
      this.error.set(msg[err.code] || 'Não foi possível enviar o e-mail de recuperação. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
