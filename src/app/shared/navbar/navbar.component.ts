import { Component, inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { TimerService } from 'src/app/core/services/timer.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faClock, faBullseye, faChartSimple } from '@fortawesome/free-solid-svg-icons';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, FontAwesomeModule, ThemeToggleComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  faClock = faClock;
  faBullseye = faBullseye;
  faChartSimple = faChartSimple;

  timerSvc = inject(TimerService);
  authSvc = inject(AuthService);

  logout(): void {
    this.timerSvc.stop();
    this.authSvc.logout();
  }
}
