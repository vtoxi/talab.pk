import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { formatPakistaniCurrency } from './post-request.page';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService, MatchedRequest, OfferSummary, Pin, VerificationStatus, typeLabel } from '../core/api.service';
import { GeoSuggestService } from '../core/geo-suggest.service';
import { I18n, TPipe } from '../core/i18n.service';
import { DisplayMediaItem, PropertyMediaService } from '../core/property-media.service';
import { RealtimeService } from '../core/realtime.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { CardComponent } from '../ui/card.component';
import { PinMapComponent } from '../ui/pin-map.component';
import { PropertyMediaDraft, PropertyMediaUploadComponent } from '../ui/property-media-upload.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { RevisionsListComponent } from '../ui/revisions-list.component';

export interface PropertyTypeOption {
  id: string;
  icon: string;
  label: string;
}

const PROPERTY_TYPES: PropertyTypeOption[] = [
  { id: 'Flat', icon: '🏢', label: 'Flat / Apartment' },
  { id: 'House', icon: '🏠', label: 'House' },
  { id: 'Upper Portion', icon: '🏡', label: 'Upper Portion' },
  { id: 'Lower Portion', icon: '🚪', label: 'Lower Portion' },
  { id: 'Room', icon: '🛏️', label: 'Room / Hostel' },
  { id: 'Commercial', icon: '🏬', label: 'Commercial / Office' },
  { id: 'Shop', icon: '🏪', label: 'Shop' },
  { id: 'Plot', icon: '🌳', label: 'Plot' },
  { id: 'Other', icon: '✨', label: 'Other Property' },
];

const BEDROOM_OPTIONS = ['Studio', '1 Bed', '2 Beds', '3 Beds', '4 Beds', '5+ Beds'];
const BATHROOM_OPTIONS = ['1 Bath', '2 Baths', '3 Baths', '4+ Baths'];
const FURNISHING_OPTIONS = ['Unfurnished', 'Semi-Furnished', 'Furnished'];

@Component({
  standalone: true,
  imports: [
    RouterLink,
    TPipe,
    StatusBadgeComponent,
    AlertComponent,
    ButtonComponent,
    CardComponent,
    PinMapComponent,
    PropertyMediaUploadComponent,
    RevisionsListComponent,
  ],
  template: `
    @if (ver(); as v) {
      <div class="mb-4 grid gap-3">
        @switch (v.status) {
          @case ('None') {
            <t-alert>{{ 'Verify your account to send offers. It takes 3 photos.' | t }}</t-alert>
            <a routerLink="/owner/verify"><t-button>{{ '🪪 Verify my account' | t }}</t-button></a>
          }
          @case ('Pending') { <t-alert>{{ '⏳ Your documents are being reviewed. You can send offers once they are approved.' | t }}</t-alert> }
          @case ('Rejected') {
            <t-alert kind="error">{{ 'Your verification was not approved: {reason}' | t: { reason: v.reason ?? '' } }}</t-alert>
            <a routerLink="/owner/verify"><t-button>{{ '🪪 Send documents again' | t }}</t-button></a>
          }
          @case ('Approved') { <p class="text-lg font-semibold text-brand-700">{{ '✅ Verified owner' | t }}</p> }
        }
      </div>
    }

    <h1 class="text-xl font-bold mb-1">{{ 'Requests for you' | t }}</h1>
    <p class="text-lg text-ink-soft mb-4">{{ 'People looking in the areas where you have a place.' | t }}</p>

    <div class="grid gap-4">
      @for (r of feed(); track r.id) {
        <t-card>
          <div class="flex items-center gap-2 mb-1">
            <span class="rounded-md px-2 py-0.5 text-xs font-bold" [class]="isBuy(r) ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'">
              {{ isBuy(r) ? ('Looking to Buy' | t) : ('Looking to Rent' | t) }}
            </span>
            <span class="text-sm font-bold text-gray-900">{{ type(r) | t }}</span>
          </div>
          <p class="text-lg font-semibold" [class]="isBuy(r) ? 'text-emerald-700' : 'text-brand-700'">
            @if (isBuy(r)) {
              {{ 'Budget: Rs {min} – {max}' | t: { min: formatCurrency(r.budgetMin), max: formatCurrency(r.budgetMax) } }}
            } @else {
              {{ '{type} • Rs {min} – {max} / month' | t: { type: type(r), min: r.budgetMin, max: r.budgetMax } }}
            }
          </p>
          <p class="text-ink-soft">{{ 'Move in: {date}' | t: { date: r.moveIn } }}</p>
          @if (r.matchedPlace) { <p class="mt-1 text-brand-700 font-semibold">{{ '📍 Matches your place: {place}' | t: { place: r.matchedPlace } }}</p> }
          <!-- All revisions open for viewer -->
          <t-revisions-list [details]="r.details" />
          <div class="mt-3">
            @if (r.offerId) {
              <a [routerLink]="['/offers', r.offerId]"><t-button variant="secondary">{{ '💬 View my offer' | t }}</t-button></a>
            } @else {
              <a [routerLink]="['/owner/offer', r.id]"><t-button>{{ '📨 Send offer' | t }}</t-button></a>
            }
          </div>
        </t-card>
      } @empty {
        <t-alert>{{ 'No requests match your places yet. Add your places on the map below so we can find tenants near them.' | t }}</t-alert>
      }
    </div>

    @if (offers().length) {
      <h2 class="text-xl font-bold mt-10 mb-2">{{ 'My offers' | t }}</h2>
      <div class="grid gap-3">
        @for (o of offers(); track o.id) {
          <a [routerLink]="['/offers', o.id]" class="block">
            <t-card>
              <div class="flex items-start justify-between gap-3">
                <p class="text-lg font-bold">{{ 'To {name}' | t: { name: o.otherParty } }}</p>
                <t-status [status]="o.status" />
              </div>
              <p class="text-lg">{{ 'Rs {rent} / month • Advance Rs {advance}' | t: { rent: o.rent, advance: o.advance } }}</p>
              <p class="mt-1 font-semibold text-brand-700">{{ 'Open chat →' | t }}</p>
            </t-card>
          </a>
        }
      </div>
    }

    <!-- MAP & PROPERTY SECTION -->
    <h2 class="text-xl font-bold mt-10 mb-1">{{ 'My places' | t }}</h2>
    <p class="text-lg text-ink-soft mb-3">{{ 'Tap anywhere on the map to pin your property and fill in its details.' | t }}</p>
    
    <t-pin-map [pins]="pins()" (picked)="onPointPicked($event)" />

    <!-- DETAILED PROPERTY FORM ON PIN CLICK -->
    @if (point(); as pt) {
      <div class="mt-6 rounded-card border-2 border-brand-600 bg-white p-5 sm:p-6 shadow-xl grid gap-5 animate-in fade-in duration-200">
        <div class="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span>🏡</span> {{ 'Add Property Details' | t }}
            </h3>
            <p class="text-xs text-ink-soft mt-1">
              {{ 'Location: Lat {lat}, Lng {lng}' | t: { lat: pt.lat.toFixed(4), lng: pt.lng.toFixed(4) } }}
            </p>
          </div>
          <button type="button" (click)="cancelAdd()" class="text-gray-400 hover:text-gray-700 p-1 text-lg font-bold" title="Cancel">✕</button>
        </div>

        <!-- 1. Property Type (with Other option) -->
        <div>
          <label class="block text-sm font-bold text-gray-800 mb-2">{{ 'Property Type' | t }} *</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            @for (t of propertyTypes; track t.id) {
              <button type="button" (click)="selectPropType(t.id)"
                class="flex items-center gap-2 rounded-xl border p-2.5 text-xs sm:text-sm font-semibold transition text-left"
                [class]="propType() === t.id ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-sm ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'">
                <span class="text-lg">{{ t.icon }}</span>
                <span class="truncate">{{ t.label | t }}</span>
              </button>
            }
          </div>

          <!-- Custom type input if "Other" is picked -->
          @if (propType() === 'Other') {
            <div class="mt-2.5">
              <input type="text" [value]="customPropType()" (input)="customPropType.set($any($event.target).value)"
                placeholder="Specify property type (e.g. Penthouse, Warehouse, Farmhouse, Hall)"
                class="w-full rounded-xl border border-brand-400 bg-brand-50/30 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none" />
            </div>
          }
        </div>

        <!-- 2. Rooms & Bathrooms (Residential) -->
        @if (isResidential()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-gray-800 mb-2">{{ 'Bedrooms / Rooms' | t }}</label>
              <div class="flex flex-wrap gap-1.5">
                @for (b of bedroomOptions; track b) {
                  <button type="button" (click)="bedrooms.set(b)"
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold border transition"
                    [class]="bedrooms() === b ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'">
                    {{ b | t }}
                  </button>
                }
              </div>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-800 mb-2">{{ 'Bathrooms' | t }}</label>
              <div class="flex flex-wrap gap-1.5">
                @for (ba of bathroomOptions; track ba) {
                  <button type="button" (click)="bathrooms.set(ba)"
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold border transition"
                    [class]="bathrooms() === ba ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'">
                    {{ ba | t }}
                  </button>
                }
              </div>
            </div>
          </div>
        }

        <!-- 3. Size / Area & Floor -->
        <div class="grid grid-cols-1" [class.sm:grid-cols-2]="hasFloor()">
          <div>
            <label class="block text-sm font-bold text-gray-800 mb-1.5">{{ 'Property Size / Area' | t }}</label>
            <div class="flex gap-2">
              <input type="number" min="1" [value]="sizeVal()" (input)="sizeVal.set($any($event.target).value)"
                placeholder="e.g. 5, 10, 1200"
                class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
              <select [value]="sizeUnit()" (change)="sizeUnit.set($any($event.target).value)"
                class="rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white font-medium text-gray-700 focus:border-brand-600 focus:outline-none">
                <option value="Marla">Marla</option>
                <option value="Kanal">Kanal</option>
                <option value="Sq Ft">Sq Ft</option>
                <option value="Sq Yd">Sq Yd</option>
              </select>
            </div>
          </div>

          <!-- Floor Level: Free-form text input (no rigid select, since building floors vary) -->
          @if (hasFloor()) {
            <div>
              <label class="block text-sm font-bold text-gray-800 mb-1.5">
                {{ 'Floor' | t }} <span class="text-xs font-normal text-gray-400">({{ 'Optional' | t }})</span>
              </label>
              <input type="text" [value]="floorLevel()" (input)="floorLevel.set($any($event.target).value)"
                placeholder="e.g. 5th Floor, 14, Ground, Mezzanine, Basement"
                class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
              <div class="mt-1.5 flex flex-wrap gap-1">
                @for (quick of ['Ground', '1st', '2nd', '3rd', 'Mezzanine', 'Basement', 'Penthouse']; track quick) {
                  <button type="button" (click)="floorLevel.set(quick)"
                    class="rounded-md px-2 py-0.5 text-[11px] bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                    {{ quick }}
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- 4. Furnishing status (Residential) -->
        @if (isResidential()) {
          <div>
            <label class="block text-sm font-bold text-gray-800 mb-1.5">{{ 'Furnishing' | t }}</label>
            <div class="flex flex-wrap gap-2">
              @for (f of furnishingOptions; track f) {
                <button type="button" (click)="furnishing.set(f)"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold border transition"
                  [class]="furnishing() === f ? 'border-brand-600 bg-brand-50 text-brand-800 font-bold' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'">
                  {{ f | t }}
                </button>
              }
            </div>
          </div>
        }

        <!-- 5. Colony / Sector / Identifier with Geo-Suggestions -->
        <div>
          <label class="block text-sm font-bold text-gray-800 mb-1.5">
            {{ 'Sector / Colony / Building Identifier' | t }}
          </label>
          <input type="text" [value]="areaName()" (input)="areaName.set($any($event.target).value)"
            placeholder="e.g. F-10/2, Bahria Phase 7, Silver Oaks Apt 402, Street 15"
            class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
          
          <!-- Reverse-geocoded Suggestions from Map Pointer -->
          @if (detectedSuggestions().length > 0) {
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-semibold text-gray-500">📍 Suggested from map:</span>
              @for (s of detectedSuggestions(); track s) {
                <button type="button" (click)="areaName.set(s)"
                  class="inline-flex items-center rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 hover:border-brand-400 transition"
                  [title]="'Click to use ' + s">
                  {{ s }}
                </button>
              }
            </div>
          }
        </div>

        <!-- 6. Extended Property Description / Notes -->
        <div>
          <label class="block text-sm font-bold text-gray-800 mb-1.5">
            {{ 'Property Description & Extra Details (Optional)' | t }}
          </label>
          <textarea rows="3" [value]="description()" (input)="description.set($any($event.target).value)"
            placeholder="e.g. Corner property, separate electricity and gas meters, 24/7 security, park-facing, brand new fixtures, inverter AC installed..."
            class="w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"></textarea>
        </div>

        <!-- 7. Photos & Videos Upload Component -->
        <t-property-media-upload (mediaChanged)="onMediaChanged($event)" />

        <!-- Live Preview of Generated Name -->
        <div class="rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-xs text-brand-900">
          <span class="font-bold text-brand-700 block mb-0.5">🏷️ {{ 'Property Label Preview' | t }}:</span>
          <p class="font-semibold text-sm">{{ generatedPlaceName() }}</p>
        </div>

        @if (error()) { <t-alert kind="error">{{ error() }}</t-alert> }

        <!-- Action Buttons -->
        <div class="flex items-center gap-3 pt-2">
          <t-button [disabled]="busy() || !canSave()" (click)="save()">{{ 'Save this place' | t }}</t-button>
          <button type="button" (click)="cancelAdd()" class="rounded-button border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
            {{ 'Cancel' | t }}
          </button>
        </div>
      </div>
    }

    <!-- SAVED PROPERTIES CARDS LIST -->
    <div class="mt-8">
      <h3 class="text-base font-bold text-gray-800 mb-3">{{ 'Saved Properties ({count})' | t: { count: pins().length } }}</h3>
      <div class="grid gap-4">
        @for (p of pins(); track p.id) {
          <div class="rounded-card bg-white border border-gray-200 p-4 shadow-sm hover:border-brand-500/50 transition">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-2xl">{{ getPinIcon(p.name) }}</span>
                  <span class="text-base font-bold text-gray-900 truncate">{{ getPinTitle(p.name) }}</span>
                </div>
                
                <!-- Tags / Badges -->
                <div class="mt-2 flex flex-wrap gap-1.5">
                  @for (tag of getPinTags(p.name); track tag) {
                    <span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-200">
                      {{ tag }}
                    </span>
                  }
                </div>

                <!-- Description (if stored) -->
                @if (savedDescMap()[p.id]; as desc) {
                  <p class="mt-2.5 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                    <span class="font-semibold text-gray-700">📝 Notes:</span> {{ desc }}
                  </p>
                }

                <!-- Attached Photos & Videos preview strip -->
                @if (savedMediaMap()[p.id]; as mediaList) {
                  @if (mediaList.length > 0) {
                    <div class="mt-3">
                      <p class="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                        <span>📸</span> {{ mediaList.length }} Attached Media:
                      </p>
                      <div class="flex items-center gap-2 overflow-x-auto pb-1">
                        @for (m of mediaList; track m.id) {
                          <div (click)="openMediaModal(m)"
                            class="relative h-16 w-20 shrink-0 cursor-pointer rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:opacity-90 transition">
                            @if (m.type === 'image') {
                              <img [src]="m.url" [alt]="m.name" class="h-full w-full object-cover" />
                            } @else {
                              <div class="h-full w-full bg-zinc-900 flex items-center justify-center text-white text-xs">
                                <span>▶️ Video</span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  }
                }

              </div>

              <!-- Action buttons -->
              <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                <button type="button" (click)="focusOnMap(p)"
                  class="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition"
                  title="Zoom on map">
                  🗺️ {{ 'View' | t }}
                </button>
                <button type="button" (click)="remove(p)"
                  class="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                  title="Remove place">
                  ✕ {{ 'Remove' | t }}
                </button>
              </div>
            </div>
          </div>
        } @empty {
          <p class="text-sm text-gray-500 py-3">{{ 'No places added yet. Click on the map to add your first property.' | t }}</p>
        }
      </div>
    </div>

    <!-- MEDIA LIGHTBOX MODAL -->
    @if (activeMedia(); as med) {
      <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
        <div class="relative max-h-[90vh] max-w-2xl w-full rounded-2xl bg-zinc-900 p-3 shadow-2xl overflow-hidden flex flex-col items-center">
          <button type="button" (click)="activeMedia.set(null)"
            class="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white font-bold flex items-center justify-center hover:bg-black transition">
            ✕
          </button>
          @if (med.type === 'image') {
            <img [src]="med.url" [alt]="med.name" class="max-h-[75vh] w-auto rounded-lg object-contain" />
          } @else {
            <video [src]="med.url" controls autoplay class="max-h-[75vh] w-full rounded-lg"></video>
          }
          <p class="text-xs text-zinc-400 mt-2 truncate w-full text-center">{{ med.name }}</p>
        </div>
      </div>
    }`,
})
export class OwnerPage {
  private api = inject(ApiService);
  private i18n = inject(I18n);
  private geoSuggest = inject(GeoSuggestService);
  private mediaService = inject(PropertyMediaService);
  private map = viewChild(PinMapComponent);
  private mediaUpload = viewChild(PropertyMediaUploadComponent);

  feed = signal<MatchedRequest[]>([]);
  pins = signal<Pin[]>([]);
  offers = signal<OfferSummary[]>([]);
  ver = signal<VerificationStatus | null>(null);

  // Map click & property details
  point = signal<{ lat: number; lng: number } | null>(null);
  propertyTypes = PROPERTY_TYPES;
  bedroomOptions = BEDROOM_OPTIONS;
  bathroomOptions = BATHROOM_OPTIONS;
  furnishingOptions = FURNISHING_OPTIONS;

  propType = signal<string>('Flat');
  customPropType = signal<string>('');
  bedrooms = signal<string>('2 Beds');
  bathrooms = signal<string>('2 Baths');
  sizeVal = signal<string>('5');
  sizeUnit = signal<string>('Marla');
  floorLevel = signal<string>('');
  furnishing = signal<string>('Unfurnished');
  areaName = signal<string>('');
  description = signal<string>('');
  detectedSuggestions = signal<string[]>([]);
  currentDraftMedia: PropertyMediaDraft[] = [];

  // Saved media & descriptions
  savedMediaMap = signal<Record<string, DisplayMediaItem[]>>({});
  savedDescMap = signal<Record<string, string>>({});
  activeMedia = signal<DisplayMediaItem | null>(null);

  busy = signal(false);
  error = signal('');

  isResidential = computed(() => ['Flat', 'House', 'Upper Portion', 'Lower Portion', 'Room'].includes(this.propType()));
  // Floor only applies to Flats, Commercial buildings, and Shops. Upper and Lower Portions inherently denote the floor.
  hasFloor = computed(() => ['Flat', 'Commercial', 'Shop'].includes(this.propType()));

  effectivePropType = computed(() => {
    if (this.propType() === 'Other') {
      return this.customPropType().trim() || 'Property';
    }
    return this.propType();
  });

  generatedPlaceName = computed(() => {
    const parts: string[] = [];
    parts.push(this.effectivePropType());

    if (this.isResidential()) {
      if (this.bedrooms()) parts.push(this.bedrooms());
      if (this.bathrooms()) parts.push(this.bathrooms());
      if (this.furnishing() !== 'Unfurnished') parts.push(this.furnishing());
    }

    const s = this.sizeVal();
    if (s && +s > 0) {
      parts.push(`${s} ${this.sizeUnit()}`);
    }

    const fl = this.floorLevel().trim();
    if (this.hasFloor() && fl) {
      parts.push(fl.toLowerCase().includes('floor') || fl.toLowerCase().includes('ground') || fl.toLowerCase().includes('basement') || fl.toLowerCase().includes('mezzanine') || fl.toLowerCase().includes('penthouse') ? fl : `${fl} Floor`);
    }

    const addr = this.areaName().trim();
    if (addr) {
      parts.push(addr);
    } else {
      const pt = this.point();
      if (pt) {
        const firstSug = this.detectedSuggestions()[0];
        parts.push(firstSug || `Location (${pt.lat.toFixed(3)}, ${pt.lng.toFixed(3)})`);
      }
    }

    const full = parts.join(' • ');
    return full.length > 95 ? full.substring(0, 95) + '…' : full;
  });

  // Ready to save whenever a location on the map is selected and not in a busy state
  canSave = computed(() => !!this.point() && !this.busy());

  constructor() {
    this.reload();
    inject(RealtimeService).changes({ types: ['NewRequest', 'NewOffer', 'OfferUpdate', 'Verification'], scopes: ['feed', 'verification'] })
      .pipe(takeUntilDestroyed()).subscribe(() => this.reload());
  }

  type = (r: MatchedRequest) => typeLabel(r.details);

  isBuy(r: MatchedRequest): boolean {
    try {
      const d = JSON.parse(r.details || '{}');
      if (d.purpose === 'buy') return true;
    } catch {}
    return r.budgetMin >= 500000;
  }

  formatCurrency(val: number): string {
    return formatPakistaniCurrency(val);
  }

  reload() {
    this.api.feed().subscribe(f => this.feed.set(f));
    this.api.pins().subscribe(p => {
      this.pins.set(p);
      this.loadMediaAndNotes(p);
    });
    this.api.ownerOffers().subscribe(o => this.offers.set(o));
    this.api.verificationStatus().subscribe(v => this.ver.set(v));
  }

  selectPropType(id: string) {
    this.propType.set(id);
    if (!['Flat', 'Commercial', 'Shop'].includes(id)) {
      this.floorLevel.set('');
    }
  }

  async loadMediaAndNotes(pins: Pin[]) {
    const mediaMap: Record<string, DisplayMediaItem[]> = {};
    const descMap: Record<string, string> = {};

    for (const p of pins) {
      const d = localStorage.getItem(`talab.prop.desc.${p.id}`);
      if (d) descMap[p.id] = d;

      const m = await this.mediaService.getMediaForPin(p.id);
      if (m.length > 0) mediaMap[p.id] = m;
    }

    this.savedDescMap.set(descMap);
    this.savedMediaMap.set(mediaMap);
  }

  async onPointPicked(coords: { lat: number; lng: number }) {
    this.point.set(coords);
    this.error.set('');

    const res = await this.geoSuggest.suggestArea(coords.lat, coords.lng);
    this.detectedSuggestions.set(res.suggestions);
    if (!this.areaName().trim()) {
      this.areaName.set(res.primary);
    }
  }

  onMediaChanged(items: PropertyMediaDraft[]) {
    this.currentDraftMedia = items;
  }

  cancelAdd() {
    this.point.set(null);
    this.map()?.clearTemp();
    this.mediaUpload()?.reset();
    this.currentDraftMedia = [];
    this.areaName.set('');
    this.description.set('');
    this.floorLevel.set('');
    this.customPropType.set('');
  }

  save() {
    const p = this.point();
    if (!p) return;
    const finalName = this.generatedPlaceName();
    this.busy.set(true);
    this.error.set('');

    this.api.addPin(finalName, p.lat, p.lng).subscribe({
      next: async (res: any) => {
        const pinId = res?.id;
        if (pinId) {
          const desc = this.description().trim();
          if (desc) {
            localStorage.setItem(`talab.prop.desc.${pinId}`, desc);
          }

          if (this.currentDraftMedia.length > 0) {
            await this.mediaService.saveMedia(
              pinId,
              this.currentDraftMedia.map(m => ({
                id: m.id,
                name: m.name,
                type: m.type,
                blob: m.blob,
              }))
            );

            // Upload the first photo to server for map pointer & tenant view
            const firstImg = this.currentDraftMedia.find(m => m.type === 'image');
            if (firstImg) {
              try {
                await firstValueFrom(this.api.uploadPinImage(pinId, firstImg.blob));
              } catch {
                // local media is preserved
              }
            }
          }
        }

        this.busy.set(false);
        this.point.set(null);
        this.areaName.set('');
        this.description.set('');
        this.customPropType.set('');
        this.floorLevel.set('');
        this.mediaUpload()?.reset();
        this.currentDraftMedia = [];
        this.map()?.clearTemp();
        this.reload();
      },
      error: e => {
        this.busy.set(false);
        this.error.set(this.i18n.err(e, 'Could not save. Please try again.'));
      },
    });
  }

  remove(p: Pin) {
    this.api.deletePin(p.id).subscribe(async () => {
      localStorage.removeItem(`talab.prop.desc.${p.id}`);
      await this.mediaService.deleteMediaForPin(p.id);
      this.reload();
    });
  }

  focusOnMap(p: Pin) {
    this.map()?.flyTo(p.lat, p.lng, 16);
  }

  openMediaModal(item: DisplayMediaItem) {
    this.activeMedia.set(item);
  }

  getPinIcon(name: string): string {
    if (name.includes('Flat') || name.includes('Apartment')) return '🏢';
    if (name.includes('House')) return '🏠';
    if (name.includes('Portion')) return '🏡';
    if (name.includes('Room')) return '🛏️';
    if (name.includes('Shop')) return '🏪';
    if (name.includes('Commercial') || name.includes('Office')) return '🏬';
    if (name.includes('Plot')) return '🌳';
    return '✨';
  }

  getPinTitle(name: string): string {
    if (name.includes(' • ')) {
      const parts = name.split(' • ');
      return parts[parts.length - 1];
    }
    return name;
  }

  getPinTags(name: string): string[] {
    if (name.includes(' • ')) {
      const parts = name.split(' • ');
      return parts.slice(0, parts.length - 1);
    }
    return [];
  }
}
