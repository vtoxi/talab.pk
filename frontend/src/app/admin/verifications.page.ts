import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { RealtimeService } from '../core/realtime.service';
import { AdminApi, AdminVerification } from './admin-api.service';
import { Badge, Empty, PageHeader, Panel, TD, TH, Tabs } from './ui/admin-ui';

@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, PageHeader, Panel, Badge, Empty, Tabs],
  template: `
    <a-page-header title="Verifications" subtitle="Check each owner's CNIC and selfie before they can send offers">
      <a-tabs [options]="filters" [value]="status()" (changed)="load($event)" />
    </a-page-header>

    <a-panel title="Owner documents" subtitle="Oldest first">
      <table class="w-full">
        <thead><tr><th [class]="th">Owner</th><th [class]="th">Email</th><th [class]="th">Submitted</th><th [class]="th">Status</th><th [class]="th"></th></tr></thead>
        <tbody>
          @for (v of rows(); track v.id) {
            <tr>
              <td [class]="td" class="font-medium text-zinc-900">{{ v.name }}</td>
              <td [class]="td">{{ v.email }}</td>
              <td [class]="td">{{ v.submittedAt + 'Z' | date: 'dd MMM yyyy, HH:mm' }}</td>
              <td [class]="td"><a-badge [tone]="v.status === 'Approved' ? 'green' : v.status === 'Pending' ? 'amber' : 'red'">{{ v.status }}</a-badge></td>
              <td [class]="td" class="text-right"><a [routerLink]="[v.id]" class="font-medium text-indigo-600 hover:underline">{{ v.status === 'Pending' ? 'Review' : 'View' }}</a></td>
            </tr>
          }
        </tbody>
      </table>
      @if (!rows().length) { <a-empty>Nothing here.</a-empty> }
    </a-panel>`,
})
export class VerificationsPage {
  private api = inject(AdminApi);
  th = TH; td = TD;
  filters = [{ value: 'Pending', label: 'Pending' }, { value: 'Approved', label: 'Approved' }, { value: 'Rejected', label: 'Rejected' }, { value: '', label: 'All' }];
  status = signal('Pending');
  rows = signal<AdminVerification[]>([]);

  constructor() {
    this.load('Pending');
    // a new submission appears in the queue the moment the owner sends it
    inject(RealtimeService).changes({ kinds: ['verification'] }).pipe(takeUntilDestroyed()).subscribe(() => this.load(this.status()));
  }
  load(status: string) { this.status.set(status); this.api.verifications(status || undefined).subscribe(r => this.rows.set(r)); }
}
