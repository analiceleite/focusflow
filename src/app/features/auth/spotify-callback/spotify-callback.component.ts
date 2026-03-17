import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpotifyService } from 'src/app/core/services/spotify.service';

@Component({
    selector: 'app-spotify-callback',
    standalone: true,
    imports: [CommonModule],
    template: `
    <main class="spotify-callback-shell">
      <section class="spotify-callback-card">
        <h1>Conectando Spotify</h1>
        <p>{{ message() }}</p>
      </section>
    </main>
  `,
    styles: [
        `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--bg-primary);
      }

      .spotify-callback-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }

      .spotify-callback-card {
        width: min(100%, 420px);
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 20px;
        padding: 1.5rem;
        text-align: center;
      }

      h1 {
        margin: 0 0 0.75rem;
        color: var(--text-primary);
        font-size: 1.2rem;
      }

      p {
        margin: 0;
        color: var(--text-muted);
        line-height: 1.5;
      }
    `,
    ],
})
export class SpotifyCallbackComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly spotifyService = inject(SpotifyService);

    readonly message = signal('Validando sua conta do Spotify...');

    ngOnInit(): void {
        void this.completeAuth();
    }

    private async completeAuth(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        try {
            await this.spotifyService.handleAuthCallback(code, state, error);
            this.message.set('Spotify conectado. Redirecionando para o timer...');
        } catch (callbackError) {
            const message = callbackError instanceof Error
                ? callbackError.message
                : 'Não foi possível concluir a autenticação com Spotify.';
            this.spotifyService.error.set(message);
            this.spotifyService.flashMessage.set({
                type: 'error',
                message,
            });
            this.message.set(message);
        }

        setTimeout(() => {
            void this.router.navigate(['/timer']);
        }, 700);
    }
}