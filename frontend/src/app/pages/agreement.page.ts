import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AgreementDraft, ApiService, Party, Terms } from '../core/api.service';
import { I18n, TPipe } from '../core/i18n.service';
import { RealtimeService } from '../core/realtime.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { CardComponent } from '../ui/card.component';
import { FieldComponent } from '../ui/field.component';

type F = string | number | null;

/** Each side fills in their own details; the owner also fills in the property and terms. */
@Component({
  standalone: true,
  imports: [RouterLink, TPipe, AlertComponent, ButtonComponent, CardComponent, FieldComponent],
  template: `
    <a [routerLink]="['/offers', id()]" class="text-lg text-brand-700 font-semibold">{{ '← Back to chat' | t }}</a>
    <h1 class="text-xl font-bold mt-2 mb-3">{{ 'Rental agreement' | t }}</h1>

    @if (d(); as a) {
      <t-card>
        <p class="text-lg">{{ '{type} • Rent Rs {rent} / month • Advance Rs {advance}' | t: { type: a.type, rent: a.rent, advance: a.advance } }}</p>
        <ul class="mt-3 grid gap-1 text-lg">
          <li>{{ a.missing.includes("Owner's details") ? '⬜' : '✅' }} {{ "Owner's details" | t }}</li>
          <li>{{ a.missing.includes("Tenant's details") ? '⬜' : '✅' }} {{ "Tenant's details" | t }}</li>
          <li>{{ a.missing.includes('Property and terms') ? '⬜' : '✅' }} {{ 'Property and terms (owner fills)' | t }}</li>
        </ul>
      </t-card>

      <div class="mt-4 grid gap-3">
        @if (a.ready) { <t-button (click)="download()">{{ '📄 Download agreement (PDF)' | t }}</t-button> }
        <t-alert>{{ 'This is a draft made by Talab, not legal advice. Print it on stamp paper and have a lawyer check it. Rentals longer than one year may need registration.' | t }}</t-alert>
      </div>

      <h2 class="text-xl font-bold mt-8 mb-2">{{ 'Your details' | t }}</h2>
      <t-card><div class="grid gap-4">
        <t-field [label]="'Full name (as on CNIC)' | t" [(value)]="name" />
        <t-field [label]="fatherLabel | t" [(value)]="father" />
        <t-field [label]="'CNIC number' | t" [hint]="'13 digits, like 61101-1234567-1' | t" [ltr]="true" [(value)]="cnic" />
        <t-field [label]="'Your address' | t" [(value)]="address" />
        <t-field [label]="'Phone' | t" [hint]="'Like 0300-1234567' | t" [ltr]="true" [(value)]="phone" />
        @if (partyMsg()) { <t-alert [kind]="partyOk() ? 'info' : 'error'">{{ partyMsg() }}</t-alert> }
        <t-button [disabled]="busy()" (click)="saveParty()">{{ 'Save my details' | t }}</t-button>
      </div></t-card>

      @if (a.other) {
        <p class="mt-3 text-lg text-ink-soft">{{ '{name} has added their details (CNIC {cnic}).' | t: { name: a.otherName, cnic: a.other.cnic } }}</p>
      } @else {
        <p class="mt-3 text-lg text-ink-soft">{{ 'Waiting for {name} to add their details.' | t: { name: a.otherName } }}</p>
      }

      <h2 class="text-xl font-bold mt-8 mb-2">{{ 'Property and terms' | t }}</h2>
      @if (a.isOwner) {
        <t-card><div class="grid gap-4">
          <label class="block">
            <span class="block text-lg font-semibold mb-1">{{ 'City' | t }}</span>
            <select class="w-full min-h-touch rounded-card border-2 border-gray-300 bg-white px-4 text-lg"
                    [value]="city()" (change)="city.set($any($event.target).value)">
              @for (c of cities; track c) { <option [value]="c" [selected]="c === city()">{{ c | t }}</option> }
            </select>
          </label>
          <t-field [label]="'Full address of the property' | t" [(value)]="propertyAddress" />
          <t-field [label]="'Details (optional)' | t" [hint]="'Floor, rooms, area…' | t" [(value)]="propertyDetails" />
          <t-field [label]="'Start date' | t" type="date" [(value)]="startDate" />
          <t-field [label]="'Rental period (months)' | t" type="number" [(value)]="termMonths" />
          <t-field [label]="'Yearly rent increase (%)' | t" type="number" [(value)]="increase" />
          <t-field [label]="'Notice period (days)' | t" type="number" [(value)]="notice" />
          <t-field [label]="'Who pays utilities? (optional)' | t" [hint]="'Leave empty for the standard wording' | t" [(value)]="utilities" />
          @if (termsMsg()) { <t-alert [kind]="termsOk() ? 'info' : 'error'">{{ termsMsg() }}</t-alert> }
          <t-button [disabled]="busy()" (click)="saveTerms()">{{ 'Save property and terms' | t }}</t-button>
        </div></t-card>
      } @else if (a.terms) {
        <t-card>
          <p class="text-lg font-semibold">{{ a.terms.propertyAddress }}</p>
          <p class="text-ink-soft">{{ a.terms.propertyDetails }}</p>
          <p class="mt-2 text-lg">{{ "From {start} for {months} months • Rent increase {pct}% a year • {days} days' notice" | t: { start: a.terms.startDate ?? '', months: a.terms.termMonths, pct: a.terms.annualIncreasePercent, days: a.terms.noticeDays } }}</p>
        </t-card>
      } @else {
        <p class="text-lg text-ink-soft">{{ 'The owner will add the property and terms.' | t }}</p>
      }
    } @else if (error()) {
      <t-alert kind="error">{{ error() }}</t-alert>
    }`,
})
export class AgreementPage {
  private api = inject(ApiService);
  private i18n = inject(I18n);
  private rt = inject(RealtimeService);
  id = input.required<string>(); // route param

  d = signal<AgreementDraft | null>(null);
  error = signal('');
  busy = signal(false);
  fatherLabel = "Father's or husband's name";
  cities = ['Islamabad', 'Rawalpindi', 'Other Punjab', 'Other'];

  name = signal<F>(''); father = signal<F>(''); cnic = signal<F>(''); address = signal<F>(''); phone = signal<F>('');
  city = signal('Islamabad'); propertyAddress = signal<F>(''); propertyDetails = signal<F>(''); startDate = signal<F>(null);
  termMonths = signal<F>(11); increase = signal<F>(10); notice = signal<F>(30); utilities = signal<F>('');
  partyMsg = signal(''); partyOk = signal(false); termsMsg = signal(''); termsOk = signal(false);

  constructor() {
    queueMicrotask(() => { this.load(true); void this.rt.join(this.id()); });
    // the other person saving their part updates the checklist at once (your own form is left alone)
    this.rt.agreement$.pipe(takeUntilDestroyed()).subscribe(e => { if (e.offerId === this.id()) this.load(); });
    this.rt.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => this.load());
    inject(DestroyRef).onDestroy(() => void this.rt.leave(this.id()));
  }

  /** First load fills the forms from saved data; later reloads only refresh the checklist. */
  load(fill = false) {
    this.api.agreement(this.id()).subscribe({
      next: a => {
        this.d.set(a);
        if (!fill) return;
        if (a.me) { this.name.set(a.me.fullName); this.father.set(a.me.fatherName); this.cnic.set(a.me.cnic); this.address.set(a.me.address); this.phone.set(a.me.phone); }
        if (a.terms) {
          this.city.set(a.terms.city); this.propertyAddress.set(a.terms.propertyAddress); this.propertyDetails.set(a.terms.propertyDetails);
          this.startDate.set(a.terms.startDate); this.termMonths.set(a.terms.termMonths); this.increase.set(a.terms.annualIncreasePercent);
          this.notice.set(a.terms.noticeDays); this.utilities.set(a.terms.utilitiesNote);
        }
      },
      error: e => this.error.set(this.i18n.err(e, 'We could not open the agreement.')),
    });
  }

  saveParty() {
    const p: Party = { fullName: String(this.name()), fatherName: String(this.father()), cnic: String(this.cnic()), address: String(this.address()), phone: String(this.phone()) };
    this.run(this.api.saveParty(this.id(), p), (ok, msg) => { this.partyOk.set(ok); this.partyMsg.set(ok ? this.i18n.t('Saved ✅') : msg); });
  }

  saveTerms() {
    const t: Terms = {
      city: this.city(), propertyAddress: String(this.propertyAddress()), propertyDetails: String(this.propertyDetails() ?? ''),
      startDate: this.startDate() ? String(this.startDate()) : null, termMonths: +(this.termMonths() ?? 0),
      annualIncreasePercent: +(this.increase() ?? 0), noticeDays: +(this.notice() ?? 0), utilitiesNote: String(this.utilities() ?? ''),
    };
    this.run(this.api.saveTerms(this.id(), t), (ok, msg) => { this.termsOk.set(ok); this.termsMsg.set(ok ? this.i18n.t('Saved ✅') : msg); });
  }

  private run(call: ReturnType<ApiService['saveParty']>, done: (ok: boolean, msg: string) => void) {
    this.busy.set(true);
    call.subscribe({
      next: () => { this.busy.set(false); done(true, ''); this.load(); },
      error: e => { this.busy.set(false); done(false, this.i18n.err(e, 'Could not save. Please try again.')); },
    });
  }

  /** The PDF endpoint needs the login token, so fetch it as a blob and save it. */
  download() {
    this.api.agreementPdf(this.id()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'rent-agreement.pdf'; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set(this.i18n.t('Could not create the PDF. Please try again.')),
    });
  }
}
