import { Injectable, Pipe, PipeTransform, computed, effect, inject, signal } from '@angular/core';
import { UR } from './i18n.ur';

export type Lang = 'en' | 'ur';
const KEY = 'talab.lang';

export const URDU_MONTHS = [
  'جنوری',   // 0: Jan
  'فروری',   // 1: Feb
  'مارچ',    // 2: Mar
  'اپریل',   // 3: Apr
  'مئی',     // 4: May
  'جون',     // 5: Jun
  'جولائی',  // 6: Jul
  'اگست',    // 7: Aug
  'ستمبر',   // 8: Sep
  'اکتوبر',   // 9: Oct
  'نومبر',   // 10: Nov
  'دسمبر',   // 11: Dec
];

export const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function formatAppDate(
  val: string | number | Date | null | undefined,
  lang: Lang = 'en',
  withTime = false
): string {
  if (!val) return '';

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const matchYMD = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (matchYMD && !trimmed.includes(':')) {
      const y = parseInt(matchYMD[1], 10);
      const mIdx = parseInt(matchYMD[2], 10) - 1;
      const day = parseInt(matchYMD[3], 10);
      const month = lang === 'ur' ? (URDU_MONTHS[mIdx] ?? matchYMD[2]) : (EN_MONTHS[mIdx] ?? matchYMD[2]);
      return `${day} ${month} ${y}`;
    }
  }

  const d = val instanceof Date
    ? val
    : (typeof val === 'number'
      ? new Date(val)
      : new Date(val.includes('T') && !val.endsWith('Z') && !val.includes('+') ? val + 'Z' : val));

  if (isNaN(d.getTime())) return String(val);

  const day = d.getDate();
  const mIdx = d.getMonth();
  const y = d.getFullYear();
  const month = lang === 'ur' ? (URDU_MONTHS[mIdx] ?? (mIdx + 1)) : (EN_MONTHS[mIdx] ?? (mIdx + 1));
  const datePart = `${day} ${month} ${y}`;

  if (!withTime) return datePart;

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${datePart}, ${hours}:${minutes} ${ampm}`;
}

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ur') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('ur') ? 'ur' : 'en';
}

/**
 * Runtime translations. English text is the key, so templates stay readable and an untranslated
 * string simply shows in English. Placeholders look like {name}. Only the tenant/owner site is
 * translated; the admin panel stays English.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  lang = signal<Lang>(initial());
  rtl = computed(() => this.lang() === 'ur');
  locale = computed(() => (this.lang() === 'ur' ? 'ur-PK' : 'en-GB'));

  constructor() {
    effect(() => {
      const l = this.lang();
      document.documentElement.lang = l;
      document.documentElement.dir = l === 'ur' ? 'rtl' : 'ltr';
      try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
    });
  }

  toggle() { this.lang.update(l => (l === 'ur' ? 'en' : 'ur')); }

  formatDate(val: string | number | Date | null | undefined, withTime = false): string {
    return formatAppDate(val, this.lang(), withTime);
  }

  t(text: string, args?: Record<string, string | number>): string {
    const ur = this.lang() === 'ur';
    let s = ur ? (UR[text] ?? text) : text;
    // inside Urdu text, keep "Rs 92000" (and "Rs 80000 – 120000") together as one left-to-right unit
    if (ur) s = s.replace(/Rs \{\w+\}(?: [–-] \{\w+\})?/g, m => `⁦${m}⁩`);
    if (!args) return s;
    // one pass, so a value (like a chat message) is never re-scanned. Only `type` values are words to translate.
    return s.replace(/\{(\w+)\}/g, (m, k: string) => {
      if (!(k in args)) return m;
      const v = String(args[k]);
      if (!ur) return v;
      if (k === 'type') return UR[v] ?? v;
      // Auto-translate dates in placeholders (like {date}, {until}, {start}, or any YYYY-MM-DD/ISO date value)
      if (k === 'date' || k === 'until' || k === 'start' || /^\d{4}-\d{2}-\d{2}/.test(v)) {
        return `⁨${formatAppDate(v, 'ur', false)}⁩`;
      }
      return `⁨${v}⁩`; // first-strong isolate: dates, amounts and names keep their own direction inside RTL text
    });
  }

  /** Error text from the API (already English), translated when we know it. */
  err(e: { error?: { error?: string } } | null | undefined, fallback: string) { return this.t(e?.error?.error ?? fallback); }
}

/** {{ 'Some text' | t }} or {{ 'Hello {name}' | t:{ name: n } }}. Impure so it follows the language signal. */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private i18n = inject(I18n);
  transform(text: string, args?: Record<string, string | number>) { return this.i18n.t(text, args); }
}

/** Formats dates with Urdu month names and English digits when lang is 'ur', e.g. 27 اکتوبر 2026 */
@Pipe({ name: 'uDate', standalone: true, pure: false })
export class UDatePipe implements PipeTransform {
  private i18n = inject(I18n);
  transform(value: string | number | Date | null | undefined, withTime = false): string {
    return this.i18n.formatDate(value, withTime);
  }
}
