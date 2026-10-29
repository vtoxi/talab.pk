import { ModalService } from '../core/modal.service';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../core/realtime.service';
import { AdminApi, AdminUser } from './admin-api.service';
import { Badge, Empty, PageHeader, Panel, TD, TH, Tabs } from './ui/admin-ui';

@Component({
  standalone: true,
  imports: [PageHeader, Panel, Badge, Empty, Tabs],
  template: `
    <a-page-header title="Users & owners" subtitle="New owners are approved from Verifications">
      <a-tabs [options]="filters" [value]="role()" (changed)="load($event)" />
    </a-page-header>

    <a-panel title="Accounts" subtitle="Only verified owners can send offers">
      <table class="w-full">
        <thead><tr><th [class]="th">Name</th><th [class]="th">Email</th><th [class]="th">City</th><th [class]="th">Role</th><th [class]="th">Verification</th><th [class]="th"></th></tr></thead>
        <tbody>
          @for (u of rows(); track u.id) {
            <tr>
              <td [class]="td" class="font-medium text-zinc-900">{{ u.name }}</td>
              <td [class]="td">{{ u.email }}</td>
              <td [class]="td">{{ u.city ?? '—' }}</td>
              <td [class]="td"><a-badge>{{ u.role }}</a-badge></td>
              <td [class]="td">
                @if (u.role === 'Owner' || u.role === 'Agent') { <a-badge [tone]="u.verified ? 'green' : 'amber'">{{ u.verified ? 'Verified' : 'Not verified' }}</a-badge> }
                @else { <span class="text-zinc-400">—</span> }
              </td>
              <td [class]="td" class="text-right">
                @if (u.verified) { <button class="font-medium text-red-600 hover:underline" (click)="revoke(u)">Revoke</button> }
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!rows().length) { <a-empty>No users found.</a-empty> }
    </a-panel>`,
})
export class UsersPage {
  private api = inject(AdminApi);
  private modal = inject(ModalService);
  th = TH; td = TD;
  filters = [{ value: '', label: 'All' }, { value: 'Tenant', label: 'Tenants' }, { value: 'Owner', label: 'Owners' }, { value: 'Agent', label: 'Agents' }, { value: 'Admin', label: 'Admins' }];
  role = signal('');
  rows = signal<AdminUser[]>([]);

  constructor() {
    this.load('');
    inject(RealtimeService).changes({ kinds: ['user', 'verification'] }).pipe(takeUntilDestroyed()).subscribe(() => this.load(this.role()));
  }
  load(role: string) { this.role.set(role); this.api.users(role || undefined).subscribe(r => this.rows.set(r)); }
  async revoke(u: AdminUser) {
    const ok = await this.modal.confirm({
      title: 'Revoke Verification',
      message: `Revoke ${u.name}'s verification? They will have to submit their documents again.`,
      confirmText: 'Revoke Verification',
      danger: true,
      icon: '⚠️',
    });
    if (ok) this.api.setVerified(u.id, false).subscribe(() => this.load(this.role()));
  }
}
