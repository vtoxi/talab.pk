import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../core/realtime.service';
import { AdminApi, AdminStats } from './admin-api.service';
import { PageHeader, Stat } from './ui/admin-ui';

@Component({
  standalone: true,
  imports: [PageHeader, Stat],
  template: `
    <a-page-header title="Dashboard" subtitle="Platform overview" />
    @if (stats(); as s) {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a-stat label="Total users" [value]="s.users" />
        <a-stat label="Owners" [value]="s.owners" [hint]="s.verifiedOwners + ' verified'" />
        <a-stat label="Open requests" [value]="s.openRequests" />
        <a-stat label="Offers sent" [value]="s.offers" />
      </div>
    } @else {
      <p class="text-zinc-400">Loading…</p>
    }`,
})
export class DashboardPage {
  private api = inject(AdminApi);
  stats = signal<AdminStats | null>(null);

  constructor() {
    this.load();
    // any new user, request or verification changes the numbers
    inject(RealtimeService).changes({ kinds: ['user', 'request', 'verification'] }).pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }

  load() { this.api.stats().subscribe(s => this.stats.set(s)); }
}
