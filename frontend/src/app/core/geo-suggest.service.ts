import { Injectable } from '@angular/core';

export interface LocationSuggestion {
  primary: string;
  suggestions: string[];
}

export interface SearchResult {
  name: string;
  lat: number;
  lng: number;
}

@Injectable({ providedIn: 'root' })
export class GeoSuggestService {
  /**
   * Reverse-geocodes lat/lng into a human-readable Sector / Colony / Building name.
   */
  async suggestArea(lat: number, lng: number): Promise<LocationSuggestion> {
    const list: string[] = [];

    // 1. Try local offline detector first (instant fallback)
    const local = this.detectLocalSector(lat, lng);
    if (local) list.push(local);

    // 2. Query OpenStreetMap Nominatim for building, street, and sub-sector details
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};

        const building = a.building || a.amenity || a.commercial || a.house_name;
        const road = a.road || a.pedestrian;
        const sector = a.suburb || a.neighbourhood || a.residential;
        const cityDistrict = a.city_district || a.city || a.county;

        // Build composite suggestions
        if (building && sector) list.unshift(`${building}, ${sector}`);
        if (road && sector) list.push(`${road}, ${sector}`);
        if (building) list.push(building);
        if (sector) list.push(sector);
        if (road) list.push(road);
        if (cityDistrict && !list.includes(cityDistrict)) list.push(cityDistrict);
      }
    } catch {
      // offline or network rate limit: keep local match
    }

    // De-duplicate while preserving order
    const unique = Array.from(new Set(list.filter(Boolean)));
    const primary = unique[0] || (local || `Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`);

    return {
      primary,
      suggestions: unique.slice(0, 5),
    };
  }

  /**
   * Searches for a location by text query (e.g. "F-10 Islamabad", "Bahria Phase 4").
   */
  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=pk`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (res.ok) {
        const items = await res.json();
        return items.map((i: any) => ({
          name: i.display_name.split(',').slice(0, 3).join(', ').trim(),
          lat: parseFloat(i.lat),
          lng: parseFloat(i.lon),
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  /** Fast offline bounding-box detection for Islamabad / Rawalpindi main areas */
  private detectLocalSector(lat: number, lng: number): string | null {
    // Islamabad Grid: sectors roughly step ~0.02 lat and ~0.025 lng
    // F-Sectors (Lat: ~33.70 to 33.73)
    if (lat >= 33.71 && lat <= 33.735) {
      if (lng >= 73.055 && lng <= 73.08) return 'Sector F-6';
      if (lng >= 73.045 && lng < 73.055) return 'Sector F-7';
      if (lng >= 73.025 && lng < 73.045) return 'Sector F-8';
      if (lng >= 72.995 && lng < 73.015) return 'Sector F-10';
      if (lng >= 72.975 && lng < 72.995) return 'Sector F-11';
    }

    // G-Sectors (Lat: ~33.685 to 33.71)
    if (lat >= 33.685 && lat < 33.71) {
      if (lng >= 73.06 && lng <= 73.085) return 'Sector G-6';
      if (lng >= 73.045 && lng < 73.06) return 'Sector G-7';
      if (lng >= 73.025 && lng < 73.045) return 'Sector G-8';
      if (lng >= 73.005 && lng < 73.025) return 'Sector G-9';
      if (lng >= 72.985 && lng < 73.005) return 'Sector G-10';
      if (lng >= 72.965 && lng < 72.985) return 'Sector G-11';
      if (lng >= 72.945 && lng < 72.965) return 'Sector G-13';
      if (lng >= 72.925 && lng < 72.945) return 'Sector G-14';
      if (lng >= 72.905 && lng < 72.925) return 'Sector G-15';
    }

    // E-Sectors (Lat: ~33.725 to 33.75)
    if (lat >= 33.725 && lat <= 33.75) {
      if (lng >= 73.045 && lng <= 73.07) return 'Sector E-7';
      if (lng >= 72.96 && lng <= 72.99) return 'Sector E-11';
    }

    // I-Sectors (Lat: ~33.63 to 33.665)
    if (lat >= 33.63 && lat < 33.665) {
      if (lng >= 73.06 && lng <= 73.085) return 'Sector I-8';
      if (lng >= 73.035 && lng < 73.06) return 'Sector I-9';
      if (lng >= 73.015 && lng < 73.035) return 'Sector I-10';
      if (lng >= 72.995 && lng < 73.015) return 'Sector I-11';
    }

    // Bahria Town Rawalpindi / Islamabad (Lat ~33.50 to 33.56, Lng ~73.08 to 73.16)
    if (lat >= 33.50 && lat <= 33.56 && lng >= 73.08 && lng <= 73.16) {
      if (lng >= 73.09 && lng <= 73.12) return 'Bahria Town Phase 1-4';
      if (lng > 73.12 && lng <= 73.16) return 'Bahria Town Phase 7-8';
      return 'Bahria Town';
    }

    // DHA Islamabad
    if (lat >= 33.52 && lat <= 33.56 && lng >= 73.13 && lng <= 73.18) return 'DHA Phase 1';
    if (lat >= 33.51 && lat <= 33.55 && lng >= 73.18 && lng <= 73.23) return 'DHA Phase 2';

    // Gulberg Greens
    if (lat >= 33.58 && lat <= 33.63 && lng >= 73.14 && lng <= 73.19) return 'Gulberg Greens';

    // PWD / Media Town / Soan Gardens
    if (lat >= 33.57 && lat <= 33.60 && lng >= 73.12 && lng <= 73.16) return 'PWD / Media Town';

    // B-17 Multi Gardens
    if (lat >= 33.67 && lat <= 33.72 && lng >= 72.82 && lng <= 72.88) return 'B-17 Multi Gardens';

    return null;
  }
}
