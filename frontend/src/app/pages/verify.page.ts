import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { I18n, TPipe } from '../core/i18n.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { FileFieldComponent } from '../ui/file-field.component';

/** Owner uploads CNIC front/back and a selfie. An admin reviews them before the owner can send offers. */
@Component({
  standalone: true,
  imports: [RouterLink, TPipe, AlertComponent, ButtonComponent, FileFieldComponent],
  template: `
    <a routerLink="/owner" class="text-lg text-brand-700 font-semibold">{{ '← Back' | t }}</a>
    <h1 class="text-xl font-bold mt-2 mb-1">{{ 'Verify your account' | t }}</h1>
    <p class="text-lg text-ink-soft mb-4">{{ 'Send 3 clear photos. Our team checks them, usually within a day. Only then can you send offers.' | t }}</p>

    <div class="grid gap-4">
      <t-file-field icon="🪪" [label]="'Front of your CNIC' | t" [hint]="'Tap to take or choose a photo' | t" (picked)="front = $event" />
      <t-file-field icon="🪪" [label]="'Back of your CNIC' | t" [hint]="'Tap to take or choose a photo' | t" (picked)="back = $event" />
      <t-file-field icon="🤳" [label]="'A selfie of your face' | t" [hint]="'Look at the camera' | t" [camera]="true" (picked)="selfie = $event" />

      <t-alert>{{ 'Your photos are kept private and encrypted. Only our review team can see them. JPG or PNG, up to 5 MB each.' | t }}</t-alert>
      @if (error()) { <t-alert kind="error">{{ error() }}</t-alert> }
      <t-button [disabled]="busy() || !ready()" (click)="send()">{{ '📨 Send for review' | t }}</t-button>
    </div>`,
})
export class VerifyPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private i18n = inject(I18n);

  front?: File; back?: File; selfie?: File;
  busy = signal(false);
  error = signal('');
  // files are plain fields, so poke a signal-free check each render
  ready = () => !!(this.front && this.back && this.selfie);

  send() {
    const fd = new FormData();
    fd.append('front', this.front!); fd.append('back', this.back!); fd.append('selfie', this.selfie!);
    this.busy.set(true);
    this.error.set('');
    this.api.submitVerification(fd).subscribe({
      next: () => this.router.navigateByUrl('/owner'),
      error: e => { this.busy.set(false); this.error.set(this.i18n.err(e, 'Could not send. Please try again.')); },
    });
  }
}
