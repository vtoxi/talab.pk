import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18n, TPipe } from '../core/i18n.service';
import { NotificationsService } from '../core/notifications.service';
import { RealtimeService } from '../core/realtime.service';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe],
  template: `
    <header class="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      <div class="mx-auto max-w-3xl px-3 sm:px-4 min-h-[3.25rem] sm:min-h-touch flex items-center justify-between gap-2">
        <a routerLink="/" class="text-xl font-bold text-brand-700 flex items-center gap-1.5">
          <span>Talab</span>
          <span class="font-normal text-brand-800">طلب</span>
        </a>

        <div class="flex items-center gap-1.5">
          <button type="button" (click)="i18n.toggle()"
                  class="min-h-[2.5rem] rounded-xl border border-gray-300 px-2.5 py-1 text-sm sm:text-base font-semibold text-brand-700 hover:bg-gray-50 active:bg-gray-100 transition"
                  [attr.lang]="i18n.lang() === 'ur' ? 'en' : 'ur'">
            {{ i18n.lang() === 'ur' ? 'English' : 'اردو' }}
          </button>

          @if (auth.user(); as u) {
            @if (u.role !== 'Admin') {
              <a routerLink="/notifications" class="relative hidden sm:grid h-10 w-10 place-items-center text-xl rounded-full hover:bg-gray-100" [attr.aria-label]="'Notifications' | t">
                🔔
                @if (notices.unread() > 0) {
                  <span class="absolute end-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger-600 px-1 text-[11px] font-bold text-white">{{ notices.unread() > 9 ? '9+' : notices.unread() }}</span>
                }
              </a>
            }
            <div class="relative">
              <button type="button" (click)="open.set(!open())" [attr.aria-expanded]="open()"
                class="flex items-center gap-1.5 min-h-[2.5rem] px-1.5 rounded-xl hover:bg-gray-100 transition text-sm sm:text-base font-semibold">
                <span class="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-brand-100 text-brand-700 font-bold text-sm">{{ initial() }}</span>
                <span class="hidden sm:inline">{{ u.name }}</span>
              </button>
              @if (open()) {
                <div class="absolute end-0 z-50 mt-1 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                  <p class="px-3 py-2 text-ink-soft text-xs sm:text-sm border-b border-gray-100 mb-1">
                    <span dir="ltr" class="inline-block font-mono text-gray-700">{{ u.email }}</span><br />
                    <span class="font-bold text-ink mt-0.5 inline-block">{{ roleLabel() | t }}</span>
                  </p>
                  @for (m of menu(); track m.to) {
                    <a [routerLink]="m.to" (click)="open.set(false)" class="block rounded-xl px-3 py-2.5 text-sm sm:text-base font-medium hover:bg-gray-50">{{ m.label | t }}</a>
                  }
                  @if (u.role === 'Tenant' || u.role === 'Owner') {
                    <button type="button" (click)="switchRole()" class="w-full text-start rounded-xl px-3 py-2.5 text-sm sm:text-base font-medium text-brand-700 hover:bg-brand-50">
                      {{ (u.role === 'Tenant' ? '🔑 Switch to owner' : '🔍 Switch to tenant') | t }}
                    </button>
                  }
                  <button type="button" (click)="open.set(false); auth.signOut()" class="w-full text-start rounded-xl px-3 py-2.5 text-sm sm:text-base font-medium text-danger-600 hover:bg-danger-50">{{ 'Sign out' | t }}</button>
                </div>
              }
            </div>
          } @else {
            <a routerLink="/signin" class="rounded-xl border-2 border-brand-600 px-3 py-1.5 text-sm sm:text-base font-semibold text-brand-700 hover:bg-brand-50 transition">{{ 'Sign in' | t }}</a>
          }
        </div>
      </div>
    </header>

    @if (auth.user() && rt.state() === 'reconnecting') {
      <div class="bg-warn-50 px-4 py-2 text-center text-sm sm:text-base text-warn-600 font-medium" role="status">{{ 'Reconnecting…' | t }}</div>
    }

    <!-- Main Container with responsive padding: pb-24 on mobile so sticky bottom nav never covers content -->
    <main class="public-page mx-auto flex min-h-[calc(100dvh-3.6rem)] w-full max-w-3xl flex-col justify-start px-3.5 sm:px-4 py-4 sm:py-6 pb-28 sm:pb-8">
      <router-outlet />
    </main>

    <!-- MOBILE STICKY BOTTOM NAVIGATION BAR -->
    <nav class="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 safe-bottom shadow-lg">
      <div class="flex items-center justify-around h-15 max-w-md mx-auto px-2">
        @if (auth.user(); as u) {
          @if (u.role === 'Tenant') {
            <!-- Home -->
            <a routerLink="/" routerLinkActive="text-brand-600 font-bold" [routerLinkActiveOptions]="{exact: true}"
               class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">🏠</span>
              <span class="text-[11px] mt-0.5">{{ 'Home' | t }}</span>
            </a>

            <!-- My Request -->
            <a routerLink="/my-request" routerLinkActive="text-brand-600 font-bold"
               class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">📋</span>
              <span class="text-[11px] mt-0.5">{{ 'My Request' | t }}</span>
            </a>

            <!-- Post New Request -->
            <a routerLink="/post" routerLinkActive="text-brand-600 font-bold"
               class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">➕</span>
              <span class="text-[11px] mt-0.5">{{ 'Post Ad' | t }}</span>
            </a>

            <!-- Notifications -->
            <a routerLink="/notifications" routerLinkActive="text-brand-600 font-bold"
               class="relative flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">🔔</span>
              @if (notices.unread() > 0) {
                <span class="absolute top-1 right-2.5 h-4 min-w-[1rem] px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {{ notices.unread() > 9 ? '9+' : notices.unread() }}
                </span>
              }
              <span class="text-[11px] mt-0.5">{{ 'Alerts' | t }}</span>
            </a>
          } @else if (u.role === 'Owner' || u.role === 'Agent') {
            <!-- Home -->
            <a routerLink="/" routerLinkActive="text-brand-600 font-bold" [routerLinkActiveOptions]="{exact: true}"
               class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">🏠</span>
              <span class="text-[11px] mt-0.5">{{ 'Home' | t }}</span>
            </a>

            <!-- Requests Feed & Properties -->
            <a routerLink="/owner" routerLinkActive="text-brand-600 font-bold"
               class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">📋</span>
              <span class="text-[11px] mt-0.5">{{ 'Feed & Places' | t }}</span>
            </a>

            <!-- Notifications -->
            <a routerLink="/notifications" routerLinkActive="text-brand-600 font-bold"
               class="relative flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[3.5rem] touch-manipulation">
              <span class="text-xl">🔔</span>
              @if (notices.unread() > 0) {
                <span class="absolute top-1 right-2.5 h-4 min-w-[1rem] px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {{ notices.unread() > 9 ? '9+' : notices.unread() }}
                </span>
              }
              <span class="text-[11px] mt-0.5">{{ 'Alerts' | t }}</span>
            </a>
          } @else {
            <!-- Admin -->
            <a routerLink="/admin" class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-indigo-600 min-w-[3.5rem]">
              <span class="text-xl">⚙️</span>
              <span class="text-[11px] mt-0.5">{{ 'Admin' | t }}</span>
            </a>
          }
        } @else {
          <!-- Guest Navigation -->
          <a routerLink="/" routerLinkActive="text-brand-600 font-bold" [routerLinkActiveOptions]="{exact: true}"
             class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[4rem]">
            <span class="text-xl">🏠</span>
            <span class="text-[11px] mt-0.5">{{ 'Home' | t }}</span>
          </a>
          <a routerLink="/signin" routerLinkActive="text-brand-600 font-bold"
             class="flex flex-col items-center justify-center py-1 text-gray-500 hover:text-brand-600 min-w-[4rem]">
            <span class="text-xl">🔑</span>
            <span class="text-[11px] mt-0.5">{{ 'Sign in' | t }}</span>
          </a>
        }
      </div>
    </nav>

    @if (notices.toast(); as n) {
      <div class="fixed inset-x-4 bottom-20 sm:bottom-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200" role="status" aria-live="polite">
        <div class="flex items-start gap-3 rounded-2xl border-2 border-brand-600 bg-white p-3.5 sm:p-4 shadow-xl">
          <a [routerLink]="n.link" (click)="notices.dismissToast()" class="min-w-0 flex-1">
            <span class="block text-sm sm:text-base font-bold text-gray-900">{{ n.titleTemplate | t: n.args }}</span>
            <span class="block text-xs sm:text-sm text-ink-soft mt-0.5">{{ n.bodyTemplate | t: n.args }}</span>
          </a>
          <button type="button" (click)="notices.dismissToast()" class="grid h-8 w-8 shrink-0 place-items-center text-xl text-ink-soft hover:text-gray-900" [attr.aria-label]="'Close' | t">×</button>
        </div>
      </div>
    }
  `,
})
export class PublicLayout {
  auth = inject(AuthService);
  i18n = inject(I18n);
  notices = inject(NotificationsService);
  rt = inject(RealtimeService);
  open = signal(false);

  initial = computed(() => (this.auth.user()?.name ?? '?').charAt(0).toUpperCase());
  roleLabel = computed(() => ({ Tenant: 'Looking for something', Owner: 'Owner', Agent: 'Agent', Admin: 'Admin' })[this.auth.user()?.role ?? 'Tenant']);
  menu = computed(() => {
    switch (this.auth.user()?.role) {
      case 'Tenant': return [{ to: '/my-request', label: '📋 My request' }, { to: '/post', label: '➕ Post a request' }];
      case 'Owner': case 'Agent': return [{ to: '/owner', label: '📋 Requests for you' }];
      case 'Admin': return [{ to: '/admin', label: '⚙️ Admin panel' }];
      default: return [];
    }
  });

  switchRole() {
    const to = this.auth.user()?.role === 'Tenant' ? 'Owner' : 'Tenant';
    this.open.set(false);
    this.auth.choose(to);
  }

  @HostListener('document:keydown.escape') close() { this.open.set(false); }
}
