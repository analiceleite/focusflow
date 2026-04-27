import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  user,
  User
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { TimerService } from './timer.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private timerService = inject(TimerService);

  readonly user$: Observable<User | null> = user(this.auth);

  async register(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
    // Iniciar sincronização de timer após registro
    const userId = this.auth.currentUser?.uid;
    if (userId) {
      this.timerService.syncFromFirestore(userId);
    }
    this.router.navigate(['/timer']);
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
    // Iniciar sincronização de timer após login
    const userId = this.auth.currentUser?.uid;
    if (userId) {
      this.timerService.syncFromFirestore(userId);
    }
    this.router.navigate(['/timer']);
  }

  async logout(): Promise<void> {
    // Parar sincronização de timer antes de logout
    this.timerService.stopSync();
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }

  get currentUser(): User | null {
    return this.auth.currentUser;
  }
}
