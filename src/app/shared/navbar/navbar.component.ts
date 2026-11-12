import { Component, inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { TimerService } from 'src/app/core/services/timer.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent, ThemeToggleComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  timerSvc = inject(TimerService);
  authSvc = inject(AuthService);

  logout(): void {
    this.timerSvc.stop();
    this.authSvc.logout();
  }
}
