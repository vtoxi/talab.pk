import { AfterViewInit, Component, ElementRef, inject, isDevMode, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CONFIG } from '../core/config';
import { Icon } from './ui/admin-ui';

declare const google: any;

@Component({
  standalone: true,
  imports: [RouterLink, Icon],
  template: `
    <div dir="ltr" lang="en" class="flex min-h-screen flex-col justify-center bg-zinc-950 px-4 py-12 text-zinc-100 sm:px-6 lg:px-8">
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <!-- Logo / Brand Header -->
        <div class="flex justify-center">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30 text-white">
            <a-icon name="shield" [size]="24" />
          </div>
        </div>
        <h2 class="mt-4 text-center text-2xl font-bold tracking-tight text-white">Talab Admin Portal</h2>
        <p class="mt-1 text-center text-xs text-zinc-400">Restricted access &bull; Authorized administrators only</p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur">

          <!-- Already signed in notice -->
          @if (auth.user(); as u) {
            @if (u.role === 'Admin') {
              <div class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-200">
                <p class="font-medium">You are already signed in as Administrator.</p>
                <p class="text-xs text-emerald-400/80 mt-1">{{ u.email }}</p>
                <button (click)="router.navigateByUrl('/admin/dashboard')"
                  class="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition">
                  Go to Admin Dashboard &rarr;
                </button>
              </div>
            } @else {
              <div class="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-200">
                <p class="font-medium text-amber-300">Insufficient Privileges</p>
                <p class="mt-1">Signed in as <strong>{{ u.email }}</strong> (Role: {{ u.role }}), which is not an administrator.</p>
                <button (click)="auth.signOut()"
                  class="mt-3 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition">
                  Sign out to switch account
                </button>
              </div>
            }
          } @else {

            <!-- Error banner -->
            @if (error()) {
              <div class="mb-5 rounded-xl border border-red-500/40 bg-red-950/50 p-3.5 text-xs text-red-200">
                <div class="flex items-start gap-2">
                  <span class="text-red-400 mt-0.5"><a-icon name="alert" [size]="14" /></span>
                  <div class="flex-1">{{ error() }}</div>
                </div>
              </div>
            }

            <!-- Google OAuth Sign In -->
            @if (googleOn) {
              <div class="flex flex-col items-center gap-3">
                <p class="text-xs text-zinc-400">Sign in with your administrator Google account</p>
                <div #gbtn class="min-h-[44px]"></div>
              </div>

              @if (dev) {
                <div class="relative my-6">
                  <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-zinc-800"></div></div>
                  <div class="relative flex justify-center text-xs uppercase"><span class="bg-zinc-900 px-3 text-zinc-500">Or development mode</span></div>
                </div>
              }
            }

            <!-- Dev mode / Local fallback -->
            @if (dev) {
              <div class="space-y-4">
                <button type="button" [disabled]="busy()" (click)="quickAdminSignIn()"
                  class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50 transition">
                  <a-icon name="lock" [size]="14" />
                  Quick Sign-In as Super Admin (admin&#64;talab.pk)
                </button>

                <div class="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-2">Custom Dev Login</p>
                  <label class="block text-xs text-zinc-400 mb-1">Email address</label>
                  <input type="email" [(value)]="customEmail" (input)="customEmail = $any($event.target).value"
                    placeholder="e.g. admin@talab.pk or your Google email"
                    class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  <button type="button" [disabled]="busy() || !customEmail" (click)="customDevSignIn()"
                    class="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition">
                    Continue with this email
                  </button>
                </div>
              </div>
            }

            @if (!googleOn && !dev) {
              <div class="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300">
                Google Client ID is not configured and development sign-in is disabled.
              </div>
            }
          }

          <!-- Back link -->
          <div class="mt-6 border-t border-zinc-800/80 pt-4 text-center">
            <a routerLink="/" class="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition">
              <a-icon name="back" [size]="14" /> Back to main site
            </a>
          </div>

        </div>
      </div>
    </div>`,
})
export class AdminLoginPage implements AfterViewInit {
  auth = inject(AuthService);
  router = inject(Router);

  googleOn = !!CONFIG.googleClientId;
  dev = isDevMode();
  busy = signal(false);
  error = signal('');
  customEmail = 'admin@talab.pk';

  private gbtn = viewChild<ElementRef<HTMLDivElement>>('gbtn');

  constructor() {
    const u = this.auth.user();
    if (u?.role === 'Admin') {
      this.router.navigateByUrl('/admin/dashboard');
    }
  }

  ngAfterViewInit() {
    if (!this.googleOn) return;
    const existing = document.getElementById('gsi-client-script');
    if (existing) {
      this.initGoogleBtn();
      return;
    }
    const s = document.createElement('script');
    s.id = 'gsi-client-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => this.initGoogleBtn();
    document.head.appendChild(s);
  }

  private initGoogleBtn() {
    if (typeof google === 'undefined' || !google.accounts?.id || !this.gbtn()?.nativeElement) return;
    google.accounts.id.initialize({
      client_id: CONFIG.googleClientId,
      callback: (r: { credential: string }) => this.handleGoogle(r.credential),
    });
    google.accounts.id.renderButton(this.gbtn()!.nativeElement, {
      theme: 'filled_black',
      size: 'large',
      width: 280,
      text: 'signin_with',
    });
  }

  quickAdminSignIn() {
    this.submitDev('admin@talab.pk', 'Super Admin');
  }

  customDevSignIn() {
    const email = this.customEmail.trim();
    if (!email || !email.includes('@')) {
      this.error.set('Please enter a valid email address.');
      return;
    }
    this.submitDev(email, email.split('@')[0]);
  }

  private submitDev(email: string, name: string) {
    this.busy.set(true);
    this.error.set('');
    this.auth.dev(email, name).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.user.role === 'Admin') {
          this.router.navigateByUrl('/admin/dashboard');
        } else {
          this.error.set(
            `Access Denied: '${r.user.email}' signed in with role '${r.user.role}', but is not configured as an Admin in backend (Admin:Emails).`
          );
          this.auth.signOut();
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.error || e?.message || 'Dev sign-in failed.');
      },
    });
  }

  private handleGoogle(credential: string) {
    this.busy.set(true);
    this.error.set('');
    this.auth.google(credential).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.user.role === 'Admin') {
          this.router.navigateByUrl('/admin/dashboard');
        } else {
          this.error.set(
            `Access Denied: Google account '${r.user.email}' is not configured in Admin:Emails in the backend.`
          );
          this.auth.signOut();
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.error || e?.message || 'Google sign-in failed. Please verify backend Google Client ID.');
      },
    });
  }
}
