import { Component, inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { TimerService } from 'src/app/core/services/timer.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  faClock = faClock;

  timerSvc = inject(TimerService);
  authSvc = inject(AuthService);

  logout(): void {
    this.timerSvc.stop();
    this.authSvc.logout();
  }
}
