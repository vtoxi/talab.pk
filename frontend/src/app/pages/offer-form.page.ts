import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, MatchedRequest, typeLabel } from '../core/api.service';
import { I18n, TPipe } from '../core/i18n.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { CardComponent } from '../ui/card.component';
import { FieldComponent } from '../ui/field.component';
import { RevisionsListComponent } from '../ui/revisions-list.component';

@Component({
  standalone: true,
  imports: [TPipe, AlertComponent, ButtonComponent, CardComponent, FieldComponent, RevisionsListComponent],
  template: `
    <h1 class="text-xl font-bold mb-4">{{ 'Send your offer' | t }}</h1>
    @if (req(); as r) {
      <t-card>
        <p class="text-lg font-semibold">{{ '{type} • Rs {min} – {max} / month' | t: { type: type(r), min: r.budgetMin, max: r.budgetMax } }}</p>
        <p class="text-ink-soft">{{ 'Move in: {date} • Your place: {place}' | t: { date: r.moveIn, place: r.matchedPlace ?? '' } }}</p>
        <!-- Revisions visible to offering owner -->
        <t-revisions-list [details]="r.details" />
      </t-card>

      <div class="mt-5 grid gap-4">
        <t-field [label]="'Rent per month (Rs)' | t" type="number" [(value)]="rent" />
        <t-field [label]="'Advance / deposit (Rs)' | t" type="number" [(value)]="advance" />
        <t-field [label]="'When can they move in?' | t" type="date" [(value)]="available" />
        <t-field [label]="'Note (optional)' | t" [hint]="'Rooms, floor, what is included…' | t" [(value)]="note" />
        @if (error()) { <t-alert kind="error">{{ error() }}</t-alert> }
        <t-button [disabled]="busy() || !rent() || !available()" (click)="send()">{{ '📨 Send offer' | t }}</t-button>
      </div>
    } @else if (loaded()) {
      <t-alert>{{ 'This request is no longer available to you.' | t }}</t-alert>
    }`,
})
export class OfferFormPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private i18n = inject(I18n);

  requestId = input.required<string>(); // route param
  req = signal<MatchedRequest | null>(null);
  loaded = signal(false);
  rent = signal<string | number | null>(null);
  advance = signal<string | number | null>(0);
  available = signal<string | number | null>(null);
  note = signal<string | number | null>('');
  busy = signal(false);
  error = signal('');

  constructor() {
    queueMicrotask(() => this.api.feed().subscribe(f => {
      this.req.set(f.find(r => r.id === this.requestId()) ?? null);
      this.loaded.set(true);
    }));
  }

  type = (r: MatchedRequest) => typeLabel(r.details);

  send() {
    this.busy.set(true);
    this.error.set('');
    this.api.createOffer(this.requestId(), {
      rent: +this.rent()!, advance: +(this.advance() ?? 0), availableFrom: String(this.available()), note: String(this.note() ?? '') || null,
    }).subscribe({
      next: r => this.router.navigate(['/offers', r.id]),
      error: e => { this.busy.set(false); this.error.set(this.i18n.err(e, 'Could not send. Please try again.')); },
    });
  }
}
