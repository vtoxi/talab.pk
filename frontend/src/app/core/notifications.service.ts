import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, Notice } from './api.service';
import { AuthService } from './auth.service';
import { RealtimeService } from './realtime.service';

/** The bell's unread count and the pop-up for a new notification, both driven live by SignalR. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private rt = inject(RealtimeService);
  private router = inject(Router);

  unread = signal(0);
  /** The newest notification, shown as a small pop-up for a few seconds. */
  toast = signal<Notice | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      if (this.auth.user()) untracked(() => this.refresh());
      else this.unread.set(0);
    });

    this.rt.notification$.subscribe(e => {
      this.unread.set(e.unread);
      // no pop-up for something you are already looking at (the chat you have open, or the inbox itself)
      const here = this.router.url.split('?')[0];
      if (here === e.notification.link || here === '/notifications') return;
      this.toast.set(e.notification);
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toast.set(null), 6000);
    });
    this.rt.reconnected$.subscribe(() => this.refresh()); // catch up on anything missed while offline
  }

  refresh() { this.api.unreadCount().subscribe({ next: n => this.unread.set(n), error: () => {} }); }
  dismissToast() { this.toast.set(null); }
}
