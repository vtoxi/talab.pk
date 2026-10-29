import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiService, MyRequest, OfferSummary, Pin, SuggestedPlace, typeLabel } from '../core/api.service';
import { formatPakistaniCurrency } from './post-request.page';
import { I18n, TPipe } from '../core/i18n.service';
import { ModalService } from '../core/modal.service';
import { RealtimeService } from '../core/realtime.service';
import { ButtonComponent } from '../ui/button.component';
import { CardComponent } from '../ui/card.component';
import { PinMapComponent } from '../ui/pin-map.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { RevisionsListComponent } from '../ui/revisions-list.component';

@Component({
  standalone: true,
  imports: [RouterLink, TPipe, ButtonComponent, CardComponent, StatusBadgeComponent, PinMapComponent, RevisionsListComponent],
  template: `
    <h1 class="text-xl font-bold mb-4">{{ 'My request' | t }}</h1>
    @if (loaded()) {
      @if (req(); as r) {
        <!-- REQUEST SUMMARY CARD -->
        <t-card>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="rounded-md px-2 py-0.5 text-xs font-bold" [class]="isBuy(r) ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'">
                  {{ isBuy(r) ? ('Looking to Buy' | t) : ('Looking to Rent' | t) }}
                </span>
                <span class="text-sm font-bold text-gray-900">{{ type(r) | t }}</span>
              </div>
              <p class="text-lg font-bold" [class]="isBuy(r) ? 'text-emerald-700' : 'text-brand-700'">
                @if (isBuy(r)) {
                  {{ 'Budget: Rs {min} – {max}' | t: { min: formatCurrency(r.budgetMin), max: formatCurrency(r.budgetMax) } }}
                } @else {
                  {{ 'Rs {min} – {max} / month' | t: { min: r.budgetMin, max: r.budgetMax } }}
                }
              </p>
              <p class="text-xs text-ink-soft">{{ 'Move in: {date} • Open until {until}' | t: { date: r.moveIn, until: r.expiresAt.slice(0, 10) } }}</p>
            </div>
            <a routerLink="/post"><t-button variant="secondary">{{ '✏️ Update / Edit Ad' | t }}</t-button></a>
          </div>

          <!-- All Revisions open to viewers -->
          <t-revisions-list [details]="r.details" />
        </t-card>

        <!-- CASE 1: OFFERS EXIST -> SHOW OFFERS MAP & LIST -->
        @if (offers().length > 0) {
          @if (offerPins().length > 0) {
            <div class="mt-6 mb-2">
              <h2 class="text-xl font-bold mb-1">{{ 'Offered Properties on Map' | t }}</h2>
              <p class="text-sm text-ink-soft mb-3">{{ 'Pointers show the first photo of each offered place. Tap to explore.' | t }}</p>
              <t-pin-map [pins]="offerPins()" [readOnly]="true" instruction="Tap any property pointer to view photo & details" (pinClicked)="openOfferChat($event.id)" />
            </div>
          }

          <h2 class="text-xl font-bold mt-6 mb-2">{{ 'Offers ({n})' | t: { n: offers().length } }}</h2>
          <div class="grid gap-3">
            @for (o of offers(); track o.id) {
              <a [routerLink]="['/offers', o.id]" class="block">
                <t-card>
                  <div class="flex items-start gap-3">
                    <!-- Property First Image Thumbnail -->
                    <div class="relative h-20 w-24 shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                      <img [src]="'/api/properties/offer/' + o.id + '/image'"
                           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                           class="h-full w-full object-cover" />
                      <div class="h-full w-full hidden items-center justify-center text-2xl bg-gray-50">🏡</div>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-2">
                        <p class="text-lg font-bold text-gray-900 truncate">{{ o.otherParty }}</p>
                        <t-status [status]="o.status" />
                      </div>
                      @if (o.placeName) {
                        <p class="text-xs font-semibold text-brand-700 truncate mt-0.5">{{ o.placeName }}</p>
                      }
                      <p class="text-base text-gray-800 mt-0.5">
                        {{ 'Rs {rent} / month • Advance Rs {advance}' | t: { rent: o.rent, advance: o.advance } }}
                      </p>
                      <p class="text-xs text-ink-soft">{{ 'Move in from {date}' | t: { date: o.availableFrom } }}</p>
                      <p class="mt-1 text-xs font-semibold text-brand-700">{{ 'Open chat →' | t }}</p>
                    </div>
                  </div>
                </t-card>
              </a>
            }
          </div>
        }

        <!-- CASE 2: NO OFFERS YET -> SHOW SUGGESTED PLACES ON MAP TO CONTACT OWNERS DIRECTLY -->
        @if (offers().length === 0) {
          <div class="mt-6 space-y-4">
            <!-- Informational Banner -->
            <div class="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-blue-950 flex items-start gap-3">
              <span class="text-2xl shrink-0">💡</span>
              <div>
                <h3 class="text-base font-bold">{{ 'No direct offers yet' | t }}</h3>
                <p class="text-xs sm:text-sm text-blue-800 mt-0.5">
                  {{ 'Owners with a place in your area will send offers soon. In the meantime, explore suggested verified places on the map below and contact the owners to request an offer!' | t }}
                </p>
              </div>
            </div>

            <!-- Suggested Places Map -->
            @if (suggestedPins().length > 0) {
              <div>
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h2 class="text-lg sm:text-xl font-bold flex items-center gap-1.5 text-gray-900">
                    <span>🗺️</span>
                    <span>{{ 'Suggested Places in Your Area ({n})' | t: { n: suggestedPlaces().length } }}</span>
                  </h2>
                  <span class="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                    ✓ {{ 'Verified Places' | t }}
                  </span>
                </div>
                <p class="text-xs sm:text-sm text-ink-soft mb-3">
                  {{ 'Tap any property pointer on the map to view details and contact the owner.' | t }}
                </p>

                <t-pin-map
                  [pins]="suggestedPins()"
                  [readOnly]="true"
                  instruction="Tap any suggested property pointer to view details and contact the owner"
                  (pinClicked)="onSuggestedPinClicked($event.id)" />
              </div>
            }

            <!-- Selected Suggested Place Card Popover (if clicked on map) -->
            @if (selectedSuggestedPlace(); as sel) {
              <div class="rounded-2xl border-2 border-brand-500 bg-white p-4 shadow-xl space-y-3 animate-in fade-in duration-200">
                <div class="flex items-start justify-between gap-2 border-b border-gray-100 pb-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
                    📍 {{ 'Selected Place from Map' | t }}
                  </span>
                  <button type="button" (click)="selectedSuggestedPlace.set(null)" class="text-gray-400 hover:text-gray-600 text-sm font-bold">✕</button>
                </div>
                <div class="flex items-start gap-3">
                  <div class="h-16 w-20 shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl">
                    @if (sel.imageUrl) {
                      <img [src]="sel.imageUrl" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="h-full w-full object-cover" />
                    }
                    <span class="flex items-center justify-center text-2xl">🏡</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-base font-bold text-gray-900">{{ sel.name }}</p>
                    <p class="text-xs text-ink-soft mt-0.5">👤 {{ 'Owner: {name}' | t: { name: sel.ownerName } }}</p>
                  </div>
                </div>
                <div class="pt-1">
                  @if (contactedMap()[sel.pinId]) {
                    <div class="w-full text-center py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                      ✅ {{ 'Offer Requested! The owner has been notified.' | t }}
                    </div>
                  } @else {
                    <t-button [disabled]="contacting() === sel.pinId" (click)="contactOwner(sel)">
                      {{ contacting() === sel.pinId ? ('Sending...' | t) : ('💬 Contact Owner / Request Offer' | t) }}
                    </t-button>
                  }
                </div>
              </div>
            }

            <!-- List of Suggested Places -->
            <h3 class="text-base font-bold text-gray-900 mt-4">{{ 'Places You Can Contact Now' | t }}</h3>
            <div class="grid gap-3">
              @for (p of suggestedPlaces(); track p.pinId) {
                <t-card>
                  <div class="flex items-start gap-3">
                    <div class="relative h-20 w-24 shrink-0 rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 shadow-xs flex items-center justify-center text-3xl">
                      @if (p.imageUrl) {
                        <img [src]="p.imageUrl" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="h-full w-full object-cover" />
                      }
                      <span class="flex items-center justify-center text-3xl">🏡</span>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-start justify-between gap-1.5">
                        <p class="text-base font-bold text-gray-900 leading-snug">{{ p.name }}</p>
                        <span class="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ {{ 'Verified Owner' | t }}
                        </span>
                      </div>
                      <p class="text-xs text-ink-soft mt-1">
                        👤 {{ 'Owner: {name}' | t: { name: p.ownerName } }}
                      </p>

                      <div class="mt-2.5">
                        @if (contactedMap()[p.pinId]) {
                          <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                            ✅ {{ 'Offer Requested' | t }}
                          </span>
                        } @else {
                          <button type="button" [disabled]="contacting() === p.pinId" (click)="contactOwner(p)"
                            class="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 px-3.5 py-2 rounded-xl transition shadow-xs touch-manipulation">
                            <span>💬</span>
                            <span>{{ contacting() === p.pinId ? ('Sending...' | t) : ('Contact Owner / Request Offer' | t) }}</span>
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                </t-card>
              }
            </div>
          </div>
        }

        <div class="mt-6"><t-button variant="secondary" (click)="found()">{{ '✅ I found a place' | t }}</t-button></div>
      } @else {
        <p class="text-lg text-ink-soft mb-4">{{ 'You have no open request.' | t }}</p>
        <a routerLink="/post"><t-button>{{ '➕ Post what I need' | t }}</t-button></a>
      }
    }`,
})
export class MyRequestPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private modal = inject(ModalService);
  private i18n = inject(I18n);

  req = signal<MyRequest | null>(null);
  offers = signal<OfferSummary[]>([]);
  suggestedPlaces = signal<SuggestedPlace[]>([]);
  selectedSuggestedPlace = signal<SuggestedPlace | null>(null);
  contactedMap = signal<Record<string, boolean>>({});
  contacting = signal<string | null>(null);
  loaded = signal(false);

  offerPins = computed<Pin[]>(() => {
    return this.offers()
      .filter(o => o.lat && o.lng && o.lat !== 0)
      .map(o => ({
        id: o.id,
        name: `${o.placeName || o.otherParty} • Rs ${o.rent}/mo`,
        lat: o.lat!,
        lng: o.lng!,
        imageUrl: `/api/properties/offer/${o.id}/image`,
      }));
  });

  suggestedPins = computed<Pin[]>(() => {
    return this.suggestedPlaces().map(p => ({
      id: p.pinId,
      name: `${p.name} • ${p.ownerName}`,
      lat: p.lat,
      lng: p.lng,
      imageUrl: p.imageUrl || undefined,
    }));
  });

  constructor() {
    this.load();
    // new offers and status changes arrive live
    inject(RealtimeService).changes({ types: ['NewOffer', 'OfferUpdate'], scopes: ['my-request'] })
      .pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }

  type = (r: MyRequest) => typeLabel(r.details);

  load() {
    this.api.myRequest().subscribe(r => {
      this.req.set(r);
      this.loaded.set(true);
      if (r) {
        this.api.tenantOffers().subscribe(o => this.offers.set(o));
        this.api.tenantSuggestedPlaces().subscribe(s => this.suggestedPlaces.set(s));
      } else {
        this.offers.set([]);
        this.suggestedPlaces.set([]);
      }
    });
  }

  openOfferChat(offerId: string) {
    this.router.navigate(['/offers', offerId]);
  }

  onSuggestedPinClicked(pinId: string) {
    const p = this.suggestedPlaces().find(x => x.pinId === pinId);
    if (p) {
      this.selectedSuggestedPlace.set(p);
    }
  }

  contactOwner(place: SuggestedPlace) {
    this.contacting.set(place.pinId);
    this.api.nudgeOwner(place.pinId).subscribe({
      next: () => {
        this.contacting.set(null);
        this.contactedMap.update(m => ({ ...m, [place.pinId]: true }));
      },
      error: () => {
        this.contacting.set(null);
        this.contactedMap.update(m => ({ ...m, [place.pinId]: true }));
      },
    });
  }

  async found() {
    const ok = await this.modal.confirm({
      title: this.i18n.t('Close Request?'),
      message: this.i18n.t('Close your request? You can post a new one later.'),
      confirmText: this.i18n.t('Close Request'),
      danger: true,
      icon: '🔒',
    });
    if (ok) {
      this.api.markFound().subscribe(() => this.load());
    }
  }

  isBuy(r: MyRequest): boolean {
    try {
      const d = JSON.parse(r.details || '{}');
      if (d.purpose === 'buy') return true;
    } catch {}
    return r.budgetMin >= 500000;
  }

  formatCurrency(val: number): string {
    return formatPakistaniCurrency(val);
  }
}
