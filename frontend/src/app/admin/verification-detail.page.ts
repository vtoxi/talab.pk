import { ModalService } from '../core/modal.service';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { RealtimeService } from '../core/realtime.service';
import { AdminApi, AdminVerification } from './admin-api.service';
import { Badge, PageHeader, Panel } from './ui/admin-ui';

type Which = 'front' | 'back' | 'selfie';

/** Review one owner's documents. The images are private, so they are fetched with the admin token and shown from memory. */
@Component({
  standalone: true,
  imports: [RouterLink, PageHeader, Panel, Badge],
  template: `
    <a-page-header title="Review documents" subtitle="Compare the CNIC with the selfie">
      <a routerLink="/admin/verifications" class="text-indigo-600 hover:underline">← All verifications</a>
    </a-page-header>

    @if (v(); as v) {
      <a-panel [title]="v.name" [subtitle]="v.email">
        <div class="flex items-center gap-3 px-5 py-4">
          <a-badge [tone]="v.status === 'Approved' ? 'green' : v.status === 'Pending' ? 'amber' : 'red'">{{ v.status }}</a-badge>
          @if (v.reason) { <span class="text-zinc-500">Reason: {{ v.reason }}</span> }
        </div>
        <div class="grid gap-4 border-t border-zinc-100 p-5 sm:grid-cols-3">
          @for (i of images; track i.which) {
            <figure>
              <figcaption class="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{{ i.label }}</figcaption>
              @if (urls()[i.which]; as src) {
                <button type="button" class="block w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50" (click)="zoom.set(src)">
                  <img [src]="src" [alt]="i.label" class="h-44 w-full object-contain" />
                </button>
              } @else { <div class="grid h-44 place-items-center rounded-lg border border-zinc-200 text-zinc-400">Loading…</div> }
            </figure>
          }
        </div>
      </a-panel>

      @if (v.status === 'Pending') {
        <a-panel title="Decision" subtitle="Approving lets this owner send offers">
          <div class="grid gap-3 p-5">
            <div class="flex flex-wrap gap-3">
              <button type="button" [disabled]="busy()" (click)="approve()"
                class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Approve</button>
              <button type="button" (click)="rejecting.set(!rejecting())"
                class="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50">Reject…</button>
            </div>
            @if (rejecting()) {
              <label class="grid gap-1">
                <span class="font-medium text-zinc-900">Reason (the owner will see this)</span>
                <input class="rounded-lg border border-zinc-300 px-3 py-2" maxlength="300" placeholder="For example: the selfie is blurry"
                       [value]="reason()" (input)="reason.set($any($event.target).value)" />
              </label>
              <div><button type="button" [disabled]="busy() || !reason().trim()" (click)="reject()"
                class="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject and send reason</button></div>
            }
            @if (error()) { <p class="text-red-600">{{ error() }}</p> }
          </div>
        </a-panel>
      }
    }

    @if (zoom(); as src) {
      <button type="button" class="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" (click)="zoom.set(null)" aria-label="Close">
        <img [src]="src" alt="" class="max-h-full max-w-full rounded-lg" />
      </button>
    }`,
})
export class VerificationDetailPage {
  private api = inject(AdminApi);
  private modal = inject(ModalService);
  private router = inject(Router);
  private san = inject(DomSanitizer);
  id = input.required<string>(); // route param

  images: { which: Which; label: string }[] = [{ which: 'front', label: 'CNIC front' }, { which: 'back', label: 'CNIC back' }, { which: 'selfie', label: 'Selfie' }];
  v = signal<AdminVerification | null>(null);
  urls = signal<Partial<Record<Which, SafeUrl>>>({});
  zoom = signal<SafeUrl | null>(null);
  rejecting = signal(false);
  reason = signal('');
  busy = signal(false);
  error = signal('');
  private objectUrls: string[] = [];

  constructor() {
    queueMicrotask(() => {
      this.api.verification(this.id()).subscribe(v => this.v.set(v));
      for (const i of this.images)
        this.api.verificationImage(this.id(), i.which).subscribe(blob => {
          const u = URL.createObjectURL(blob);
          this.objectUrls.push(u);
          this.urls.update(m => ({ ...m, [i.which]: this.san.bypassSecurityTrustUrl(u) }));
        });
    });
    inject(DestroyRef).onDestroy(() => this.objectUrls.forEach(URL.revokeObjectURL));
    // another admin may decide this one while it is open
    inject(RealtimeService).changes({ kinds: ['verification'] }).pipe(takeUntilDestroyed()).subscribe(() => this.api.verification(this.id()).subscribe(v => this.v.set(v)));
  }

  async approve() {
    const ok = await this.modal.confirm({
      title: 'Approve Owner Verification',
      message: 'Approve this owner? They will be granted permission to send offers on tenant requests.',
      confirmText: 'Approve Owner',
      danger: false,
      icon: '✅',
    });
    if (ok) this.done(this.api.approveVerification(this.id()));
  }
  reject() { this.done(this.api.rejectVerification(this.id(), this.reason().trim())); }

  private done(call: ReturnType<AdminApi['approveVerification']>) {
    this.busy.set(true);
    this.error.set('');
    call.subscribe({
      next: () => this.router.navigateByUrl('/admin/verifications'),
      error: e => { this.busy.set(false); this.error.set(e.error?.error ?? 'Something went wrong.'); },
    });
  }
}
