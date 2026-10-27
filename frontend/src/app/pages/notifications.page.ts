import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ApiService, Notice } from '../core/api.service';
import { I18n, TPipe } from '../core/i18n.service';
import { NotificationsService } from '../core/notifications.service';
import { RealtimeService } from '../core/realtime.service';
import { ButtonComponent } from '../ui/button.component';

const ICON: Record<Notice['type'], string> = { NewRequest: '📍', NewOffer: '📨', NewMessage: '💬', OfferUpdate: '💲', Verification: '🪪' };

@Component({
  standalone: true,
  imports: [TPipe, ButtonComponent],
  template: `
    <h1 class="text-xl font-bold mb-3">{{ 'Notifications' | t }}</h1>

    <label class="mb-4 flex min-h-touch cursor-pointer items-center justify-between gap-4 rounded-card border border-gray-200 bg-white px-4">
      <span class="text-lg">{{ '✉️ Also send me emails' | t }}</span>
      <input type="checkbox" class="h-7 w-7 accent-emerald-700" [checked]="email()" (change)="setEmail($any($event.target).checked)" />
    </label>

    @if (unread() > 0) { <div class="mb-4"><t-button variant="secondary" (click)="readAll()">{{ 'Mark all as read' | t }}</t-button></div> }

    <div class="grid gap-3">
      @for (n of items(); track n.id) {
        <button type="button" (click)="open(n)" class="flex gap-3 rounded-card border-2 bg-white p-4 text-start"
                [class]="n.read ? 'border-gray-200' : 'border-brand-600 bg-brand-50'">
          <span class="text-3xl" aria-hidden="true">{{ icon(n) }}</span>
          <span class="min-w-0">
            <span class="block text-lg" [class.font-bold]="!n.read">{{ n.titleTemplate | t: n.args }}</span>
            <span class="block text-ink-soft">{{ n.bodyTemplate | t: n.args }}</span>
            <span class="mt-1 block text-sm text-ink-soft">{{ when(n.createdAt) }}</span>
          </span>
        </button>
      } @empty {
        @if (loaded()) { <p class="text-lg text-ink-soft">{{ 'Nothing yet. We will tell you here when something happens.' | t }}</p> }
      }
    </div>`,
})
export class NotificationsPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private bell = inject(NotificationsService);
  private i18n = inject(I18n);

  items = signal<Notice[]>([]);
  unread = signal(0);
  email = signal(true);
  loaded = signal(false);

  constructor() {
    this.load();
    this.api.emailPref().subscribe(v => this.email.set(v));
    const rt = inject(RealtimeService);
    // a new (or updated) notification slides to the top; a reconnect re-fetches
    rt.notification$.pipe(takeUntilDestroyed()).subscribe(e => {
      this.items.update(list => [e.notification, ...list.filter(n => n.id !== e.notification.id)]);
      this.unread.set(e.unread);
    });
    rt.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }

  icon = (n: Notice) => ICON[n.type];
  when = (at: string) => this.i18n.formatDate(at, true);

  load() {
    this.api.inbox().subscribe(i => { this.items.set(i.items); this.unread.set(i.unread); this.loaded.set(true); this.bell.unread.set(i.unread); });
  }

  open(n: Notice) {
    const go = () => this.router.navigateByUrl(n.link);
    if (n.read) go(); else this.api.markRead(n.id).subscribe({ next: () => { this.bell.refresh(); go(); }, error: go });
  }

  readAll() { this.api.markAllRead().subscribe(() => this.load()); }

  setEmail(on: boolean) { this.email.set(on); this.api.setEmailPref(on).subscribe({ error: () => this.email.set(!on) }); }
}
