import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService, Msg, Thread, typeLabel } from '../core/api.service';
import { I18n, TPipe } from '../core/i18n.service';
import { ModalService } from '../core/modal.service';
import { NotificationsService } from '../core/notifications.service';
import { RealtimeService } from '../core/realtime.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { FieldComponent } from '../ui/field.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { RevisionsListComponent } from '../ui/revisions-list.component';

/** Messages the system writes into the chat. They are translated; what people type never is. */
const SYSTEM_TEXT = new Set(['Offer accepted.', 'Offer rejected.', 'Offer withdrawn.', 'Proposed new terms']);

type Day = { label: string; items: { m: Msg; first: boolean }[] };

/** Offer details + negotiation chat, shared by tenant and owner. Laid out like a messenger: header, messages, composer. */
@Component({
  standalone: true,
  imports: [RouterLink, TPipe, AlertComponent, ButtonComponent, FieldComponent, StatusBadgeComponent, RevisionsListComponent],
  template: `
    @if (t(); as d) {
      <section class="flex h-[calc(100dvh-8.5rem)] min-h-[30rem] flex-col overflow-hidden rounded-card border border-gray-200 bg-white">

        <!-- who and what -->
        <header class="flex items-center gap-3 border-b border-gray-200 px-3 py-3">
          <a [routerLink]="d.isTenant ? '/my-request' : '/owner'" class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-2xl text-brand-700 hover:bg-gray-100"
             [attr.aria-label]="'Back' | t"><span class="rtl:rotate-180">←</span></a>
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700" aria-hidden="true">{{ d.offer.otherParty.charAt(0).toUpperCase() }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-lg font-bold">{{ d.offer.otherParty }}</p>
            <p class="truncate text-base" [class]="typing() || online() ? 'font-semibold text-brand-700' : 'text-ink-soft'">
              @if (typing()) { {{ '{name} is typing…' | t: { name: d.offer.otherParty } }} }
              @else if (online()) { 🟢 {{ 'Online' | t }} }
              @else { {{ title(d) }} }
            </p>
          </div>
          <t-status class="hidden sm:block" [status]="d.offer.status" />
          <button type="button" (click)="showDetails.set(!showDetails())" [attr.aria-expanded]="showDetails()"
                  class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl hover:bg-gray-100"
                  [attr.aria-label]="(showDetails() ? 'Hide details' : 'Show details') | t">ⓘ</button>
        </header>

        <!-- the deal at a glance -->
        <div class="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div class="min-w-0">
            <p class="hidden truncate text-lg font-semibold sm:block">{{ title(d) }}</p> <!-- the header already shows it on phones -->
            <p class="text-base text-ink-soft">{{ 'Rs {rent} / month • Advance Rs {advance}' | t: { rent: d.offer.rent, advance: d.offer.advance } }}</p>
          </div>
          <t-status class="shrink-0 sm:hidden" [status]="d.offer.status" />
        </div>

        @if (showDetails()) {
          <dl class="grid max-h-52 grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto border-b border-gray-200 px-4 py-3 text-lg">
            <div><dt class="text-base text-ink-soft">{{ 'Rent / month' | t }}</dt><dd class="font-bold">Rs {{ d.offer.rent }}</dd></div>
            <div><dt class="text-base text-ink-soft">{{ 'Advance' | t }}</dt><dd class="font-bold">Rs {{ d.offer.advance }}</dd></div>
            <div><dt class="text-base text-ink-soft">{{ 'Move in from' | t }}</dt><dd class="font-bold">{{ d.offer.availableFrom }}</dd></div>
            <div><dt class="text-base text-ink-soft">{{ 'Tenant budget' | t }}</dt><dd>Rs {{ d.budgetMin }} – {{ d.budgetMax }}</dd></div>
            <div><dt class="text-base text-ink-soft">{{ 'Property' | t }}</dt><dd>{{ typeOf(d) | t }}@if (d.placeName) { • {{ d.placeName }} }</dd></div>
            <div><dt class="text-base text-ink-soft">{{ 'Tenant wants to move in' | t }}</dt><dd>{{ d.requestMoveIn }}</dd></div>
            @if (d.offer.note) { <div class="col-span-2"><dt class="text-base text-ink-soft">{{ 'Owner note' | t }}</dt><dd>“{{ d.offer.note }}”</dd></div> }
            <div class="col-span-2"><t-revisions-list [details]="d.requestDetails" /></div>
          </dl>
        }

        <!-- what you can do with the offer -->
        @if (d.offer.status === 'Pending') {
          <div class="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
            @if (d.isTenant) {
              <button type="button" class="chip bg-brand-600 text-white" (click)="decide('accept')">{{ '✅ Accept this offer' | t }}</button>
              <button type="button" class="chip border-2 border-gray-300" (click)="decide('reject')">{{ 'Decline' | t }}</button>
            } @else {
              <button type="button" class="chip border-2 border-gray-300" (click)="decide('withdraw')">{{ '↩ Withdraw my offer' | t }}</button>
            }
            <button type="button" class="chip border-2 border-gray-300" (click)="toggleCounter(d.offer.rent, d.offer.advance)">{{ '💲 Suggest different rent or advance' | t }}</button>
          </div>
          @if (counterOpen()) {
            <div class="grid gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2">
              <t-field [label]="'New rent per month (Rs)' | t" type="number" [(value)]="rent" />
              <t-field [label]="'New advance (Rs)' | t" type="number" [(value)]="advance" />
              <div class="sm:col-span-2"><t-button [disabled]="!rent()" (click)="sendCounter()">{{ 'Send suggestion' | t }}</t-button></div>
            </div>
          }
        }
        @if (d.offer.status === 'Accepted') {
          <a [routerLink]="['/offers', d.offer.id, 'agreement']" class="flex items-center justify-between gap-3 border-b border-gray-200 bg-brand-50 px-4 py-3 text-lg font-semibold text-brand-700">
            <span>{{ '📄 Prepare rental agreement' | t }}</span><span class="rtl:rotate-180">→</span>
          </a>
        }
        @if (error()) { <div class="px-3 py-2"><t-alert kind="error">{{ error() }}</t-alert></div> }

        <!-- messages -->
        <div class="relative min-h-0 flex-1">
          <div #list (scroll)="onScroll()" class="h-full overflow-y-auto bg-gray-100 px-3 py-3">
            @for (day of days(); track day.label) {
              <p class="my-3 text-center"><span class="rounded-full bg-gray-200 px-3 py-1 text-sm text-ink-soft">{{ day.label }}</span></p>
              @for (x of day.items; track x.m.id) {
                @if (x.m.kind === 'Text' && system.has(x.m.text)) {
                  <p class="my-2 text-center"><span class="rounded-full bg-gray-200 px-3 py-1 text-base text-ink-soft">{{ x.m.text | t }}</span></p>
                } @else {
                  <div class="flex" [class]="(x.m.mine ? 'justify-end ' : 'justify-start ') + (x.first ? 'mt-3' : 'mt-1')">
                    <div class="max-w-[85%] px-3 py-2 text-lg shadow-sm"
                         [class]="x.m.mine ? 'rounded-2xl rounded-ee-md bg-brand-100' : 'rounded-2xl rounded-es-md bg-white'">
                      @if (x.m.kind === 'Counter') {
                        <p class="font-semibold">{{ (x.m.mine ? '💲 You suggest' : '💲 They suggest') | t }}</p>
                        <p class="font-bold">{{ 'Rent Rs {rent} • Advance Rs {advance}' | t: { rent: x.m.rent ?? '', advance: x.m.advance ?? '' } }}</p>
                      } @else { <p class="whitespace-pre-wrap break-words" dir="auto">{{ x.m.text }}</p> }
                      <p class="mt-0.5 flex items-center justify-end gap-1 text-sm text-ink-soft" dir="ltr">
                        {{ time(x.m.at) }}
                        @if (x.m.mine) { <span dir="ltr" [class]="x.m.seen ? 'font-bold text-brand-700' : ''">{{ x.m.seen ? '✓✓' : '✓' }}</span> }
                      </p>
                    </div>
                  </div>
                }
              }
            } @empty { <p class="py-10 text-center text-ink-soft">{{ 'No messages yet. Say hello 👋' | t }}</p> }
          </div>

          @if (newCount() > 0) {
            <button type="button" (click)="scrollToBottom(true)"
                    class="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-2 text-base font-semibold text-white shadow-lg rtl:translate-x-1/2">
              ↓ {{ '{n} new messages' | t: { n: newCount() } }}
            </button>
          } @else if (!atBottom()) {
            <button type="button" (click)="scrollToBottom(true)" [attr.aria-label]="'Go to the latest message' | t"
                    class="absolute bottom-3 end-3 grid h-11 w-11 place-items-center rounded-full bg-white text-xl shadow-lg ring-1 ring-gray-200">↓</button>
          }
        </div>

        <!-- composer -->
        @if (d.offer.status === 'Pending' || d.offer.status === 'Accepted') {
          <form class="flex items-end gap-2 border-t border-gray-200 bg-white p-3" (submit)="$event.preventDefault(); send()">
            <textarea #box rows="1" maxlength="1000" [placeholder]="'Write a message' | t" [value]="draft()"
                      class="max-h-32 min-h-touch flex-1 resize-none rounded-card border-2 border-gray-300 px-4 py-3 text-lg focus:border-brand-500"
                      (input)="onInput($event)" (keydown.enter)="onEnter($event)"></textarea>
            <button type="submit" [disabled]="!draft().trim()" [attr.aria-label]="'Send' | t"
                    class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-600 text-2xl text-white disabled:opacity-40"><span class="rtl:-scale-x-100">➤</span></button>
          </form>
        } @else {
          <p class="border-t border-gray-200 bg-gray-50 p-3 text-center text-ink-soft">{{ 'This offer is closed.' | t }}</p>
        }
      </section>
    } @else if (failed()) {
      <t-alert kind="error">{{ 'We could not open this offer.' | t }}</t-alert>
    }`,
  styles: [`.chip { min-height: 2.75rem; border-radius: 1rem; padding: 0 1rem; font-size: 1rem; font-weight: 600; }`],
})
export class ThreadPage {
  private api = inject(ApiService);
  private modal = inject(ModalService);
  private bell = inject(NotificationsService);
  private i18n = inject(I18n);
  private rt = inject(RealtimeService);
  id = input.required<string>(); // route param

  system = SYSTEM_TEXT;
  t = signal<Thread | null>(null);
  failed = signal(false);
  error = signal('');
  draft = signal('');
  showDetails = signal(false);
  counterOpen = signal(false);
  rent = signal<string | number | null>(null);
  advance = signal<string | number | null>(null);
  online = signal(false);
  typing = signal(false);
  /** Messages from the other person that arrived while you were scrolled up. */
  newCount = signal(0);
  atBottom = signal(true);

  private list = viewChild<ElementRef<HTMLDivElement>>('list');
  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private lastTyping = 0;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private shown = -1; // messages already accounted for, to tell new ones from old

  /** Messages grouped by day, each marked when it starts a run from the same sender. */
  days = computed<Day[]>(() => {
    const out: Day[] = [];
    let prev: Msg | undefined;
    for (const m of this.t()?.messages ?? []) {
      const label = this.dayLabel(m.at);
      if (out.at(-1)?.label !== label) { out.push({ label, items: [] }); prev = undefined; }
      out.at(-1)!.items.push({ m, first: prev?.mine !== m.mine });
      prev = m;
    }
    return out;
  });

  constructor() {
    queueMicrotask(() => { this.load(); this.rt.join(this.id()).then(online => this.online.set(online)); });

    // live: everything arrives by push; a reconnect re-fetches in case something was missed
    const mine = <T extends { offerId: string }>(e: T) => e.offerId === this.id();
    this.rt.thread$.pipe(takeUntilDestroyed()).subscribe(e => { if (mine(e)) this.load(); });
    this.rt.seen$.pipe(takeUntilDestroyed()).subscribe(e => { if (mine(e)) this.load(); });
    this.rt.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.load());
    this.rt.presence$.pipe(takeUntilDestroyed()).subscribe(e => { if (mine(e)) { this.online.set(e.online); if (!e.online) this.typing.set(false); } });
    this.rt.typing$.pipe(takeUntilDestroyed()).subscribe(e => {
      if (!mine(e)) return;
      this.typing.set(true);
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.typing.set(false), 3000);
    });
    inject(DestroyRef).onDestroy(() => { clearTimeout(this.typingTimer); void this.rt.leave(this.id()); });

    // scrolling: open at the latest message; follow along if you are at the bottom or just sent one; otherwise offer a "new messages" button
    effect(() => {
      const d = this.t();
      if (d) untracked(() => this.afterMessages(d));
    });
  }

  private afterMessages(d: Thread) {
    const n = d.messages.length;
    const first = this.shown < 0;
    const added = n - Math.max(this.shown, 0);
    this.shown = n;
    if (!first && added <= 0) return;
    const fresh = d.messages.slice(-Math.max(added, 0));
    setTimeout(() => { // after the new messages are drawn
      if (first) this.scrollToBottom(false);
      else if (this.atBottom() || fresh.some(m => m.mine)) this.scrollToBottom(true);
      else this.newCount.update(c => c + fresh.filter(m => !m.mine).length);
    });
  }

  scrollToBottom(smooth: boolean) {
    const el = this.list()?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    this.newCount.set(0);
    this.atBottom.set(true);
  }

  onScroll() {
    const el = this.list()?.nativeElement;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.atBottom.set(bottom);
    if (bottom) this.newCount.set(0);
  }

  title = (d: Thread) => [this.i18n.t(this.typeOf(d)), d.placeName].filter(Boolean).join(' • ');
  typeOf = (d: Thread) => typeLabel(d.requestDetails);

  /** API timestamps are UTC without a "Z"; show them in the viewer's local time. */
  time = (at: string) => new Date(at + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  private dayLabel(at: string) {
    const d = new Date(at + 'Z');
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const now = new Date();
    if (sameDay(d, now)) return this.i18n.t('Today');
    if (sameDay(d, new Date(now.getTime() - 86_400_000))) return this.i18n.t('Yesterday');
    return this.i18n.formatDate(d, false);
  }

  /** Tells the other person we are typing, at most once every 1.5 seconds. */
  onInput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'; // grows with the text, up to ~4 lines
    el.style.overflowY = el.scrollHeight > 128 ? 'auto' : 'hidden'; // a scrollbar only once it is at its maximum height
    const now = Date.now();
    if (now - this.lastTyping > 1500) { this.lastTyping = now; this.rt.typing(this.id()); }
  }

  /** Enter sends on a computer; Shift+Enter (and Enter on a phone) starts a new line. */
  onEnter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey || !matchMedia('(pointer: fine)').matches) return;
    k.preventDefault();
    this.send();
  }

  load() {
    this.api.thread(this.id()).subscribe({
      next: d => { if (JSON.stringify(d) !== JSON.stringify(this.t())) { this.t.set(d); this.bell.refresh(); } }, // opening the chat clears its notifications
      error: () => this.t() || this.failed.set(true),
    });
  }

  private run(call: ReturnType<ApiService['sendMessage']>, after?: () => void) {
    this.error.set('');
    call.subscribe({
      next: () => { after?.(); this.load(); },
      error: e => this.error.set(this.i18n.err(e, 'Something went wrong. Please try again.')),
    });
  }

  send() {
    const body = this.draft().trim();
    if (!body) return;
    this.run(this.api.sendMessage(this.id(), body), () => {
      this.draft.set('');
      const el = this.box()?.nativeElement;
      if (el) { el.value = ''; el.style.height = 'auto'; el.focus(); }
    });
  }

  async decide(a: 'accept' | 'reject' | 'withdraw') {
    const ask = { accept: 'Accept this offer?', reject: 'Decline this offer?', withdraw: 'Withdraw your offer?' }[a];
    const confirmText = a === 'accept' ? this.i18n.t('Accept') : a === 'reject' ? this.i18n.t('Decline') : this.i18n.t('Withdraw');
    const ok = await this.modal.confirm({
      title: this.i18n.t('Confirm Action'),
      message: this.i18n.t(ask),
      confirmText,
      danger: a !== 'accept',
      icon: a === 'accept' ? '✅' : '⚠️',
    });
    if (ok) this.run(this.api.decide(this.id(), a));
  }

  toggleCounter(rent: number, advance: number) {
    this.rent.set(rent); this.advance.set(advance); this.counterOpen.update(v => !v);
  }

  sendCounter() { this.run(this.api.counter(this.id(), +this.rent()!, +(this.advance() ?? 0)), () => this.counterOpen.set(false)); }
}
