import { AfterViewInit, Component, ElementRef, OnDestroy, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { CONFIG } from '../core/config';
import { LatLng } from '../core/api.service';

const ISLAMABAD: L.LatLngTuple = [33.6844, 73.0479];

/** Leaflet map where the user draws ONE polygon or circle. Emits the area as a lat/lng ring. */
@Component({
  selector: 't-map-picker',
  standalone: true,
  template: `
    <div class="relative w-full rounded-card border-2 border-gray-300 overflow-hidden shadow-sm">
      <div #map dir="ltr" class="h-[60vh] min-h-[24rem] w-full"></div>
    </div>`,
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  initialArea = input<LatLng[] | null>(null);
  areaChange = output<LatLng[] | null>();
  private el = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private map?: L.Map;

  async ngAfterViewInit() {
    (window as any).L = L; // leaflet-draw expects the global
    await import('leaflet-draw');

    const map = (this.map = L.map(this.el().nativeElement, {
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 150, // smooth scrolling instead of jumpy integer steps
      zoomSnap: 0.25,           // fractional zoom prevents harsh jumps
      zoomDelta: 0.5,           // half-step zoom buttons
      wheelDebounceTime: 40,
    }).setView(ISLAMABAD, 12));

    L.tileLayer(CONFIG.tileUrl, { maxZoom: CONFIG.tileMaxZoom, attribution: CONFIG.tileAttribution }).addTo(map);

    const drawn = new L.FeatureGroup().addTo(map);
    map.addControl(new (L.Control as any).Draw({
      edit: { featureGroup: drawn },
      draw: { polygon: { showArea: false, allowIntersection: false }, circle: {}, rectangle: false, polyline: false, marker: false, circlemarker: false },
    }));

    if (this.initialArea() && this.initialArea()!.length >= 3) {
      const latlngs = this.initialArea()!.map(p => [p.lat, p.lng] as L.LatLngTuple);
      const poly = L.polygon(latlngs, { color: '#0d9488', weight: 3 });
      drawn.addLayer(poly);
      try {
        map.fitBounds(poly.getBounds(), { padding: [30, 30] });
      } catch {}
    }

    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawn.clearLayers(); // one area only
      drawn.addLayer(e.layer);
      this.areaChange.emit(this.toRing(e.layer));
    });
    map.on((L as any).Draw.Event.DELETED, () => drawn.getLayers().length || this.areaChange.emit(null));
    map.on((L as any).Draw.Event.EDITED, () => {
      const l = drawn.getLayers()[0];
      if (l) this.areaChange.emit(this.toRing(l));
    });
  }

  private toRing(layer: any): LatLng[] {
    if (layer instanceof L.Circle) {
      const c = layer.getLatLng(), r = layer.getRadius();
      return Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * 2 * Math.PI;
        return {
          lat: c.lat + (r / 111320) * Math.sin(a),
          lng: c.lng + (r / (111320 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(a),
        };
      });
    }
    return (layer.getLatLngs()[0] as L.LatLng[]).map(p => ({ lat: p.lat, lng: p.lng }));
  }

  ngOnDestroy() { this.map?.remove(); }
}
