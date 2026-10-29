import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon, IconName } from './ui/admin-ui';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div dir="ltr" lang="en" class="admin-root flex min-h-screen bg-zinc-50 text-[13px] text-zinc-700">
      <aside class="hidden md:flex w-60 shrink-0 flex-col border-e border-zinc-200 bg-white">
        <div class="flex h-14 items-center gap-3 px-4 border-b border-zinc-100">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><a-icon name="logo" [size]="16" /></span>
          <span class="font-semibold text-zinc-900 text-sm">Talab</span>
        </div>

        <nav class="flex-1 overflow-y-auto p-2">
          @for (g of groups; track g.title) {
            <p class="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{{ g.title }}</p>
            @for (n of g.items; track n.path) {
              <a [routerLink]="n.path" routerLinkActive="bg-indigo-50 text-indigo-600"
                 class="flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">
                <a-icon [name]="n.icon" />{{ n.label }}
              </a>
            }
          }
        </nav>

        <a routerLink="/" class="mx-2 mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-500 hover:bg-zinc-50">
          <a-icon name="back" />Back to site
        </a>
        <div class="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-zinc-900">{{ auth.user()?.email }}</p>
            <p class="text-xs text-zinc-400">Super Admin</p>
          </div>
          <button type="button" (click)="auth.signOut()" class="text-zinc-400 hover:text-zinc-700" title="Sign out"><a-icon name="power" /></button>
        </div>
      </aside>

      <div class="flex-1 min-w-0">
        <nav class="md:hidden flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white p-2">
          @for (n of all; track n.path) {
            <a [routerLink]="n.path" routerLinkActive="bg-indigo-50 text-indigo-600" class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2">
              <a-icon [name]="n.icon" />{{ n.label }}
            </a>
          }
          <!-- the sidebar is hidden on phones, so its two actions live here -->
          <a routerLink="/" class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-zinc-500"><a-icon name="back" />Site</a>
          <button type="button" (click)="auth.signOut()" class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-zinc-500"><a-icon name="power" />Sign out</button>
        </nav>
        <main class="mx-auto w-full max-w-5xl p-4 md:p-8"><router-outlet /></main>
      </div>
    </div>`,
})
export class AdminLayout {
  auth = inject(AuthService);
  groups: { title: string; items: { path: string; label: string; icon: IconName }[] }[] = [
    { title: 'Manage', items: [
      { path: 'dashboard', label: 'Dashboard', icon: 'grid' },
      { path: 'requests', label: 'Requests', icon: 'list' },
      { path: 'verifications', label: 'Verifications', icon: 'shield' },
      { path: 'users', label: 'Users & owners', icon: 'users' },
    ] },
    { title: 'Workspace', items: [{ path: 'settings', label: 'Settings', icon: 'settings' }] },
  ];
  all = this.groups.flatMap(g => g.items);
}
