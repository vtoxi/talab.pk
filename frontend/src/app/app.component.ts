import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18n } from './core/i18n.service';
import { RealtimeService } from './core/realtime.service';
import { ModalHostComponent } from './ui/modal-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ModalHostComponent],
  template: `
    <router-outlet />
    <t-modal-host />
  `,
})
export class AppComponent {
  constructor() {
    inject(I18n); // applies <html lang/dir> on load
    inject(RealtimeService); // opens the live connection while signed in
  }
}
