import { AfterViewInit, Component, ElementRef, inject, isDevMode, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CONFIG } from '../core/config';
import { I18n, TPipe } from '../core/i18n.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { CardComponent } from '../ui/card.component';
import { FieldComponent } from '../ui/field.component';

declare const google: any; // Google Identity Services, loaded below

@Component({
  standalone: true,
  imports: [RouterLink, TPipe, AlertComponent, ButtonComponent, CardComponent, FieldComponent],
  template: `
    <div class="mx-auto max-w-md grid gap-5">
      <h1 class="text-xl font-bold text-center">{{ 'Sign in' | t }}</h1>
      <p class="text-lg text-center text-ink-soft">
        {{ (auth.intent() === 'Owner' ? '🔑 You have something to rent out' : '🔍 You are looking for something') | t }}
        <a routerLink="/" class="block text-brand-700 font-semibold mt-1">{{ 'Change' | t }}</a>
      </p>

      <t-card>
        <div class="grid gap-4 justify-items-center">
          @if (googleOn) { <div #gbtn></div> }

          @if (!googleOn && dev) {
            <t-alert>{{ 'Development sign-in (no Google client ID set). Not available in production.' | t }}</t-alert>
            <div class="grid gap-4 w-full">
              <t-field [label]="'Email' | t" [ltr]="true" [(value)]="email" />
              <t-field [label]="'Name' | t" [(value)]="name" />
              <t-button [disabled]="busy()" (click)="devSignIn()">{{ 'Continue' | t }}</t-button>
            </div>
          }
          @if (!googleOn && !dev) { <t-alert kind="error">{{ 'Sign-in is not set up yet.' | t }}</t-alert> }
          @if (error()) { <t-alert kind="error">{{ error() }}</t-alert> }
        </div>
      </t-card>

      <p class="text-center text-xs text-ink-soft">
        <a routerLink="/admin/login" class="text-zinc-500 hover:text-zinc-800 underline">Admin Portal &rarr;</a>
      </p>
    </div>`,
})
export class SigninPage implements AfterViewInit {
  auth = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18n);

  googleOn = !!CONFIG.googleClientId;
  dev = isDevMode() && !CONFIG.googleClientId;
  email = signal<string | number | null>('');
  name = signal<string | number | null>('');
  busy = signal(false);
  error = signal('');
  private gbtn = viewChild<ElementRef<HTMLDivElement>>('gbtn');

  constructor() {
    const u = this.auth.user();
    if (u) this.router.navigateByUrl(this.auth.homeFor(u.role));
  }

  ngAfterViewInit() {
    if (!this.googleOn) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: CONFIG.googleClientId,
        callback: (r: { credential: string }) => this.done(this.auth.google(r.credential)),
      });
      google.accounts.id.renderButton(this.gbtn()!.nativeElement, { theme: 'outline', size: 'large', width: 300, text: 'continue_with', locale: this.i18n.lang() });
    };
    document.head.appendChild(s);
  }

  devSignIn() { this.done(this.auth.dev(String(this.email()), String(this.name()))); }

  private done(req: ReturnType<AuthService['dev']>) {
    this.busy.set(true);
    this.error.set('');
    req.subscribe({
      next: r => this.router.navigateByUrl(this.auth.homeFor(r.user.role)),
      error: e => { this.busy.set(false); this.error.set(this.i18n.err(e, 'Sign-in failed. Please try again.')); },
    });
  }
}
