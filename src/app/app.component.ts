import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent implements OnInit {
  private readonly swUpdate = inject(SwUpdate);

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        void this.activateAndReload();
      }
    });

    this.swUpdate.unrecoverable.subscribe(() => {
      globalThis.location.reload();
    });
  }

  ngOnInit(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    void this.swUpdate.checkForUpdate();
  }

  private async activateAndReload(): Promise<void> {
    await this.swUpdate.activateUpdate();
    globalThis.location.reload();
  }
}
