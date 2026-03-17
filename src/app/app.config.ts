import { ApplicationConfig, importProvidersFrom, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { ThemeService } from './core/services/theme.service';
import { SpotifyService } from './core/services/spotify.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    importProvidersFrom(FontAwesomeModule),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    {
      provide: APP_INITIALIZER,
      useFactory: (themeService: ThemeService, spotifyService: SpotifyService) => () => {
        // Initialize theme service on app startup
        return spotifyService.initialize();
      },
      deps: [ThemeService, SpotifyService],
      multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && (location.protocol === 'https:' || location.hostname === 'localhost'),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
