import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';
import { PixelIconComponent } from '../pixel-icon/pixel-icon.component';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, PixelIconComponent],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div 
          class="toast toast-{{ toast.type }}"
          [class.toast-enter]="true"
          (click)="toastService.remove(toast.id)">
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') { <app-pixel-icon name="check" [size]="24"></app-pixel-icon> }
              @case ('error') { <app-pixel-icon name="cross" [size]="24"></app-pixel-icon> }
              @case ('warning') { <app-pixel-icon name="warning" [size]="24"></app-pixel-icon> }
              @case ('info') { <app-pixel-icon name="info" [size]="24"></app-pixel-icon> }
            }
          </div>
          <div class="toast-message">{{ toast.message }}</div>
          <button class="toast-close" aria-label="Fechar aviso" (click)="toastService.remove(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    }

    /* Caixa de diálogo pixel: fundo neutro, faixa lateral na cor do tipo */
    .toast {
      --tone: var(--brand-primary);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      color: var(--text-primary);
      background: var(--bg-card);
      border: 2px solid var(--px-shadow-color);
      border-left: 8px solid var(--tone);
      box-shadow: 4px 4px 0 var(--px-shadow-color);
      cursor: pointer;
      animation: slideIn 0.24s steps(4);
    }

    .toast-success { --tone: var(--state-done); }
    .toast-error { --tone: var(--accent-error); }
    .toast-warning { --tone: var(--accent-warning); }
    .toast-info { --tone: #4a90b8; }

    .toast-icon {
      display: inline-flex;
      flex-shrink: 0;
    }

    .toast-message {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
    }

    .toast-close {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      font-family: var(--font-hud);
      font-size: 14px;
      color: var(--text-muted);
      background: none;
      border: 2px solid transparent;
      cursor: pointer;
    }

    .toast-close:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @media (max-width: 480px) {
      .toast-container {
        left: 10px;
        right: 10px;
        top: 10px;
        max-width: none;
      }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);
}