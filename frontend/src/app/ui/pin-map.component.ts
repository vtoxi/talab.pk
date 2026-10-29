import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { CONFIG } from '../core/config';
import { Pin } from '../core/api.service';
import { GeoSuggestService, SearchResult } from '../core/geo-suggest.service';

const ISLAMABAD: L.LatLngTuple = [33.6844, 73.0479];
const SATELLITE_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Enhanced interactive map for picking and viewing property locations with photo pointers */
@Component({
  selector: 't-pin-map',
  standalone: true,
  template: `
    <div class="relative w-full rounded-card border-2 border-brand-500/30 overflow-hidden shadow-md bg-zinc-900 transition-all duration-300"
         [class.h-[75vh]]="expanded()" [class.h-[52vh]]="!expanded()">
      
      <!-- TOP TOOLBAR: Search & Controls -->
      <div class="absolute top-3 inset-x-3 z-[500] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        
        <!-- Search Bar -->
        <div class="relative pointer-events-auto flex-1 max-w-sm">
          <div class="flex items-center rounded-xl bg-white/95 px-3 py-1.5 shadow-lg border border-gray-200 backdrop-blur">
            <span class="text-gray-400 mr-2">🔍</span>
            <input type="text" [(value)]="searchQuery" (keydown.enter)="doSearch()"
              placeholder="Search sector, colony, city..."
              class="w-full bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none" />
            @if (searchQuery) {
              <button type="button" (click)="searchQuery = ''; searchResults.set([])" class="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
            }
            <button type="button" [disabled]="searching()" (click)="doSearch()"
              class="ml-1 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-500 disabled:opacity-50 transition">
              {{ searching() ? '...' : 'Go' }}
            </button>
          </div>

          <!-- Search Results Dropdown -->
          @if (searchResults().length > 0) {
            <div class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-200 z-[600]">
              @for (r of searchResults(); track r.name) {
                <button type="button" (click)="selectSearchResult(r)"
                  class="w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-brand-50 border-b border-gray-100 last:border-0 flex items-center gap-2">
                  <span>📍</span>
                  <span class="truncate font-medium">{{ r.name }}</span>
                </button>
              }
            </div>
          }
        </div>

        <!-- Action Buttons (Satellite, Locate Me, Fullscreen) -->
        <div class="pointer-events-auto flex items-center gap-1.5">
          <!-- Satellite Layer Toggle -->
          <button type="button" (click)="toggleSatellite()"
            [title]="isSatellite() ? 'Switch to Street map' : 'Switch to Satellite view'"
            class="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur border transition"
            [class]="isSatellite() ? 'bg-zinc-900 text-white border-zinc-700' : 'bg-white/95 text-gray-800 border-gray-200 hover:bg-gray-50'">
            <span>{{ isSatellite() ? '🗺️ Street' : '🛰️ Satellite' }}</span>
          </button>

          <!-- Current Location GPS -->
          <button type="button" (click)="locateMe()"
            title="Locate my position"
            class="rounded-xl bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-gray-800 shadow-lg border border-gray-200 hover:bg-gray-50 backdrop-blur transition">
            📍 {{ locating() ? 'Locating...' : 'Locate' }}
          </button>

          <!-- Expand / Compact Toggle -->
          <button type="button" (click)="toggleExpanded()"
            [title]="expanded() ? 'Compact map' : 'Expand map'"
            class="rounded-xl bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-gray-800 shadow-lg border border-gray-200 hover:bg-gray-50 backdrop-blur transition">
            {{ expanded() ? '↙️ Collapse' : '↗️ Expand' }}
          </button>
        </div>
      </div>

      <!-- MAP CONTAINER -->
      <div #map dir="ltr" class="h-full w-full"></div>

      <!-- INSTRUCTION PILL -->
      <div class="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-800 shadow-md backdrop-blur border border-gray-200 flex items-center gap-1.5">
        <span class="text-brand-700">📍</span>
        <span>{{ instructionText() }}</span>
      </div>
    </div>`,
})
export class PinMapComponent implements AfterViewInit, OnDestroy {
  pins = input<Pin[]>([]);
  readOnly = input(false);
  instruction = input<string>('');
  picked = output<{ lat: number; lng: number }>();
  pinClicked = output<Pin>();

  private geoSuggest = inject(GeoSuggestService);
  private el = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private map?: L.Map;
  private streetLayer?: L.TileLayer;
  private satelliteLayer?: L.TileLayer;
  private saved = L.layerGroup();
  private tempMarker?: L.CircleMarker;

  searchQuery = '';
  searching = signal(false);
  searchResults = signal<SearchResult[]>([]);
  isSatellite = signal(false);
  locating = signal(false);
  expanded = signal(false);

  instructionText = computed(() => {
    if (this.instruction()) return this.instruction();
    return this.readOnly()
      ? 'Tap any property pointer to view details & photo'
      : 'Click anywhere on the map to place property pin';
  });

  constructor() {
    effect(() => {
      const pins = this.pins();
      this.saved.clearLayers();
      pins.forEach(p => {
        const icon = this.createPhotoPinIcon(p);
        const marker = L.marker([p.lat, p.lng], { icon });

        const label = this.escape(p.name);
        const imgUrl = p.imageUrl || `/api/properties/${p.id}/image`;

        marker.bindTooltip(label, {
          permanent: false,
          direction: 'top',
          offset: [0, -42],
        });

        marker.bindPopup(`
          <div class="p-1 font-sans text-xs max-w-[220px]">
            <div class="h-28 w-full rounded-lg overflow-hidden bg-gray-100 mb-2 border border-gray-200">
              <img src="${imgUrl}" onerror="this.parentElement.style.display='none'" class="h-full w-full object-cover" />
            </div>
            <p class="font-bold text-gray-900 text-sm leading-tight">${label}</p>
            <p class="text-[10px] text-gray-500 mt-1">📍 Lat: ${p.lat.toFixed(4)}, Lng: ${p.lng.toFixed(4)}</p>
          </div>
        `);

        marker.on('click', () => {
          this.pinClicked.emit(p);
        });

        marker.addTo(this.saved);
      });

      // If pins are present and map is initialized, adjust view to show pins
      if (pins.length > 0 && this.map) {
        if (pins.length === 1) {
          this.map.setView([pins[0].lat, pins[0].lng], 14);
        } else {
          const group = L.featureGroup(pins.map(p => L.marker([p.lat, p.lng])));
          this.map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 15 });
        }
      }
    });
  }

  ngAfterViewInit() {
    const map = (this.map = L.map(this.el().nativeElement, {
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 150,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelDebounceTime: 40,
    }).setView(ISLAMABAD, 12));

    this.streetLayer = L.tileLayer(CONFIG.tileUrl, {
      maxZoom: CONFIG.tileMaxZoom,
      attribution: CONFIG.tileAttribution,
    }).addTo(map);

    this.satelliteLayer = L.tileLayer(SATELLITE_TILE, {
      maxZoom: 19,
      attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    });

    this.saved.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.readOnly()) return;

      this.tempMarker?.remove();
      this.tempMarker = L.circleMarker(e.latlng, {
        radius: 11,
        color: '#b45309',
        fillColor: '#f59e0b',
        fillOpacity: 0.95,
        weight: 3,
      }).addTo(map);
      this.tempMarker.bindTooltip('✨ Selected Location', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      this.picked.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
  }

  private createPhotoPinIcon(p: Pin): L.DivIcon {
    const imgUrl = p.imageUrl || `/api/properties/${p.id}/image`;
    const iconEmoji = this.getEmojiForName(p.name);

    const html = `
      <div class="property-map-pin">
        <div class="pin-bubble">
          <img src="${imgUrl}" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               class="pin-img" />
          <div class="pin-fallback" style="display:none;">${iconEmoji}</div>
        </div>
        <div class="pin-pointer"></div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-property-pin',
      iconSize: [44, 52],
      iconAnchor: [22, 50],
      popupAnchor: [0, -48],
    });
  }

  private getEmojiForName(name: string): string {
    if (name.includes('Flat') || name.includes('Apartment')) return '🏢';
    if (name.includes('House')) return '🏠';
    if (name.includes('Portion')) return '🏡';
    if (name.includes('Room')) return '🛏️';
    if (name.includes('Shop')) return '🏪';
    if (name.includes('Commercial') || name.includes('Office')) return '🏬';
    if (name.includes('Plot')) return '🌳';
    return '📍';
  }

  toggleSatellite() {
    if (!this.map || !this.streetLayer || !this.satelliteLayer) return;
    const next = !this.isSatellite();
    this.isSatellite.set(next);
    if (next) {
      this.map.removeLayer(this.streetLayer);
      this.map.addLayer(this.satelliteLayer);
    } else {
      this.map.removeLayer(this.satelliteLayer);
      this.map.addLayer(this.streetLayer);
    }
  }

  toggleExpanded() {
    this.expanded.update(e => !e);
    setTimeout(() => this.map?.invalidateSize(), 320);
  }

  async doSearch() {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.searching.set(true);
    const results = await this.geoSuggest.search(q);
    this.searching.set(false);
    this.searchResults.set(results);
    if (results.length > 0) {
      this.selectSearchResult(results[0]);
    }
  }

  selectSearchResult(r: SearchResult) {
    this.searchResults.set([]);
    this.map?.flyTo([r.lat, r.lng], 15, { duration: 1.2 });
  }

  locateMe() {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.locating.set(false);
        const { latitude, longitude } = pos.coords;
        this.map?.flyTo([latitude, longitude], 16, { duration: 1.2 });
        if (!this.readOnly()) {
          this.tempMarker?.remove();
          this.tempMarker = L.circleMarker([latitude, longitude], {
            radius: 11,
            color: '#b45309',
            fillColor: '#f59e0b',
            fillOpacity: 0.95,
            weight: 3,
          }).addTo(this.map!);
          this.tempMarker.bindTooltip('📍 Your Location', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
          this.picked.emit({ lat: latitude, lng: longitude });
        }
      },
      () => {
        this.locating.set(false);
      },
      { timeout: 8000 }
    );
  }

  flyTo(lat: number, lng: number, zoom = 15) {
    this.map?.flyTo([lat, lng], zoom, { duration: 1.0 });
  }

  clearTemp() {
    this.tempMarker?.remove();
    this.tempMarker = undefined;
  }

  private escape(str: string): string {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[tag] || tag));
  }

  ngOnDestroy() { this.map?.remove(); }
}
