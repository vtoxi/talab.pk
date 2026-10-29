import { ModalService } from '../core/modal.service';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../core/realtime.service';
import { typeLabel } from '../core/api.service';
import { AdminApi, AdminLimitRequest, AdminRequest } from './admin-api.service';
import { Badge, Empty, PageHeader, Panel, TD, TH, Tabs } from './ui/admin-ui';

@Component({
  standalone: true,
  imports: [DatePipe, PageHeader, Panel, Badge, Empty, Tabs],
  template: `
    <a-page-header title="Requests" subtitle="Tenant requirements & ad limits across the platform">
      <a-tabs [options]="filters" [value]="status()" (changed)="load($event)" />
    </a-page-header>

    <!-- PENDING AD LIMIT APPROVAL REQUESTS (when auto-quota exceeded) -->
    @if (limitRequests().length > 0) {
      <div class="mb-6">
        <a-panel title="Ad Limit Approval Requests" subtitle="Tenants requesting extra ad quota beyond automated allowance">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr>
                  <th [class]="th">Tenant</th>
                  <th [class]="th">Email</th>
                  <th [class]="th">Requested</th>
                  <th [class]="th">Status</th>
                  <th [class]="th" class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (l of limitRequests(); track l.requestId) {
                  <tr class="hover:bg-zinc-50 border-b border-zinc-100">
                    <td [class]="td" class="font-bold text-zinc-900">{{ l.userName }}</td>
                    <td [class]="td" class="font-mono text-xs text-zinc-600">{{ l.userEmail }}</td>
                    <td [class]="td" class="text-xs text-zinc-500">{{ l.createdAt | date:'d MMM, h:mm a' }}</td>
                    <td [class]="td"><a-badge tone="amber">Pending Admin Approval</a-badge></td>
                    <td [class]="td" class="text-right space-x-2">
                      <button (click)="approveLimit(l.requestId)" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition">
                        ✓ Approve (+1 Slot)
                      </button>
                      <button (click)="rejectLimit(l.requestId)" class="rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 transition">
                        ✕ Reject
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </a-panel>
      </div>
    }

    <a-panel title="All requests" subtitle="Close a request to let the tenant post a new one">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr><th [class]="th">Category</th><th [class]="th">Budget (Rs)</th><th [class]="th">Move in</th><th [class]="th">Expires</th><th [class]="th">Status</th><th [class]="th"></th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td [class]="td">{{ typeOf(r) }}</td>
                <td [class]="td">{{ r.budgetMin }} – {{ r.budgetMax }}</td>
                <td [class]="td">{{ r.moveIn }}</td>
                <td [class]="td">{{ r.expiresAt.slice(0, 10) }}</td>
                <td [class]="td"><a-badge [tone]="r.status === 'Open' ? 'green' : 'slate'">{{ r.status }}</a-badge></td>
                <td [class]="td" class="text-right">
                  @if (r.status === 'Open') {
                    <button class="font-medium text-red-600 hover:underline" (click)="close(r)">Close</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (!rows().length) { <a-empty>No requests found.</a-empty> }
    </a-panel>`,
})
export class AdminRequestsPage {
  private api = inject(AdminApi);
  private modal = inject(ModalService);
  th = TH; td = TD;
  filters = [{ value: '', label: 'All' }, { value: 'Open', label: 'Open' }, { value: 'Found', label: 'Found' }, { value: 'Expired', label: 'Expired' }];
  status = signal('');
  rows = signal<AdminRequest[]>([]);
  limitRequests = signal<AdminLimitRequest[]>([]);

  typeOf = (r: AdminRequest) => typeLabel(r.details);

  constructor() {
    this.load('');
    this.loadLimitRequests();
    inject(RealtimeService).changes({ kinds: ['request', 'limit_request'] })
      .pipe(takeUntilDestroyed()).subscribe(() => {
        this.load(this.status());
        this.loadLimitRequests();
      });
  }

  load(status: string) {
    this.status.set(status);
    this.api.requests(status || undefined).subscribe(r => this.rows.set(r));
  }

  loadLimitRequests() {
    this.api.limitRequests().subscribe(l => this.limitRequests.set(l));
  }

  approveLimit(requestId: string) {
    this.api.approveLimit(requestId).subscribe(() => this.loadLimitRequests());
  }

  rejectLimit(requestId: string) {
    this.api.rejectLimit(requestId).subscribe(() => this.loadLimitRequests());
  }

  async close(r: AdminRequest) {
    const ok = await this.modal.confirm({
      title: 'Close Request',
      message: 'Close this request? The tenant will be able to post a new one.',
      confirmText: 'Close Request',
      danger: true,
      icon: '🔒',
    });
    if (ok) this.api.closeRequest(r.id).subscribe(() => this.load(this.status()));
  }
}
