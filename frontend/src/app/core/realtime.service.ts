import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Observable, Subject, debounceTime, filter, map, merge } from 'rxjs';
import { Notice } from './api.service';
import { AuthService } from './auth.service';
import { CONFIG } from './config';

export type LiveState = 'off' | 'connecting' | 'connected' | 'reconnecting';

/**
 * One SignalR connection for the whole app, opened while someone is signed in.
 * The server pushes: notifications, chat/agreement changes, "seen" receipts, typing, who is online in a chat,
 * list refreshes for owners, and queue changes for admins. After any reconnect, pages re-fetch what they show
 * (`reconnected$`), so a dropped connection costs a delay, never data.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private auth = inject(AuthService);
  private conn?: HubConnection;
  private joined = new Set<string>();
  private restart?: ReturnType<typeof setTimeout>;

  state = signal<LiveState>('off');

  readonly notification$ = new Subject<{ notification: Notice; unread: number }>();
  readonly thread$ = new Subject<{ offerId: string }>();
  readonly seen$ = new Subject<{ offerId: string }>();
  readonly agreement$ = new Subject<{ offerId: string }>();
  readonly typing$ = new Subject<{ offerId: string }>();
  readonly presence$ = new Subject<{ offerId: string; online: boolean }>();
  readonly refresh$ = new Subject<{ scope: string }>();
  readonly admin$ = new Subject<{ kind: string }>();
  /** Fires after a reconnect (not the first connect): refetch anything that may have changed meanwhile. */
  readonly reconnected$ = new Subject<void>();

  constructor() {
    // follows the login token, so signing in/out or switching role (new token, new groups) reconnects cleanly
    effect(() => {
      const token = this.auth.token();
      untracked(() => (token ? void this.start(token) : void this.stop()));
    });
  }

  /** Fires (debounced) when any listed notification type, refresh scope or admin kind arrives, or after a reconnect. */
  changes(want: { types?: string[]; scopes?: string[]; kinds?: string[] }): Observable<void> {
    return merge(
      this.notification$.pipe(filter(e => !!want.types?.includes(e.notification.type))),
      this.refresh$.pipe(filter(e => !!want.scopes?.includes(e.scope))),
      this.admin$.pipe(filter(e => !!want.kinds?.includes(e.kind))),
      this.reconnected$,
    ).pipe(debounceTime(250), map(() => undefined));
  }

  /** Enter an offer's chat room. Resolves true when the other person is in it right now. */
  async join(offerId: string): Promise<boolean> {
    this.joined.add(offerId);
    if (this.conn?.state !== HubConnectionState.Connected) return false; // joined automatically once connected
    return (await this.conn.invoke<boolean | null>('JoinOffer', offerId)) === true;
  }

  async leave(offerId: string) {
    this.joined.delete(offerId);
    if (this.conn?.state === HubConnectionState.Connected) await this.conn.invoke('LeaveOffer', offerId).catch(() => {});
  }

  typing(offerId: string) {
    if (this.conn?.state === HubConnectionState.Connected) this.conn.invoke('Typing', offerId).catch(() => {});
  }

  private async start(token: string) {
    await this.stop();
    const c = new HubConnectionBuilder()
      // the token travels in the query string / header, not a cookie, so no credentials are needed across sites
      .withUrl(CONFIG.apiUrl + '/hubs/app', { accessTokenFactory: () => token, withCredentials: false })
      .withAutomaticReconnect([0, 1000, 3000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();
    this.conn = c;

    // handlers must return nothing (a returned value would be sent back to the server as a result)
    c.on('notification', p => { this.notification$.next(p); });
    c.on('thread', p => { this.thread$.next(p); });
    c.on('seen', p => { this.seen$.next(p); });
    c.on('agreement', p => { this.agreement$.next(p); });
    c.on('typing', p => { this.typing$.next(p); });
    c.on('presence', p => { this.presence$.next(p); });
    c.on('refresh', p => { this.refresh$.next(p); });
    c.on('admin', p => { this.admin$.next(p); });

    c.onreconnecting(() => this.state.set('reconnecting'));
    c.onreconnected(async () => { this.state.set('connected'); await this.rejoin(c); this.reconnected$.next(); });
    c.onclose(() => {
      if (this.conn !== c) return; // we closed it ourselves
      this.state.set('reconnecting');
      this.restart = setTimeout(() => void this.start(token), 10_000); // automatic retries gave up: keep trying slowly
    });

    this.state.set('connecting');
    try {
      await c.start();
      if (this.conn !== c) return;
      this.state.set('connected');
      await this.rejoin(c);
    } catch {
      if (this.conn === c) { this.state.set('reconnecting'); this.restart = setTimeout(() => void this.start(token), 10_000); }
    }
  }

  private async rejoin(c: HubConnection) {
    for (const id of this.joined) {
      const online = (await c.invoke<boolean | null>('JoinOffer', id).catch(() => null)) === true;
      this.presence$.next({ offerId: id, online });
    }
  }

  private async stop() {
    clearTimeout(this.restart);
    const c = this.conn;
    this.conn = undefined;
    this.state.set('off');
    if (c) await c.stop().catch(() => {});
  }
}
