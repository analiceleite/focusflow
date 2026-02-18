import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Service Worker notification click handler
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
      // Focar na janela quando notificação for clicada
      if (window.focus) {
        window.focus(); 
      }
    }
  });
}

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
