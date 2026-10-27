import { Component, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

const ICONS: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  logo: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
};

export type IconName = keyof typeof ICONS;

/** Line icon (24px grid, 1.8 stroke). Paths are the constants above, never user input. */
@Component({
  selector: 'a-icon',
  standalone: true,
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [innerHTML]="html()"></svg>`,
})
export class Icon {
  private s = inject(DomSanitizer);
  name = input.required<IconName>();
  size = input(18);
  html() { return this.s.bypassSecurityTrustHtml(ICONS[this.name()]); }
}

/** Breadcrumb + title + subtitle; right slot for actions. */
@Component({
  selector: 'a-page-header',
  standalone: true,
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1 text-xs text-zinc-500">Admin <span class="mx-1">›</span> <span class="text-zinc-900">{{ title() }}</span></p>
        <h1 class="text-xl font-semibold text-zinc-900">{{ title() }}</h1>
        @if (subtitle()) { <p class="mt-1 text-zinc-500">{{ subtitle() }}</p> }
      </div>
      <ng-content />
    </div>`,
})
export class PageHeader {
  title = input.required<string>();
  subtitle = input('');
}

@Component({
  selector: 'a-stat',
  standalone: true,
  template: `
    <div class="rounded-xl border border-zinc-200 bg-white p-5">
      <p class="text-zinc-500">{{ label() }}</p>
      <p class="mt-2 text-2xl font-semibold text-zinc-900">{{ value() }}</p>
      @if (hint()) { <p class="mt-1 text-xs text-zinc-400">{{ hint() }}</p> }
    </div>`,
})
export class Stat {
  label = input.required<string>();
  value = input.required<string | number>();
  hint = input('');
}

/** Card with title/subtitle header and a divider, like the reference. */
@Component({
  selector: 'a-panel',
  standalone: true,
  template: `
    <section class="rounded-xl border border-zinc-200 bg-white">
      @if (title()) {
        <div class="border-b border-zinc-200 px-5 py-4">
          <h2 class="font-semibold text-zinc-900">{{ title() }}</h2>
          @if (subtitle()) { <p class="mt-0.5 text-xs text-zinc-500">{{ subtitle() }}</p> }
        </div>
      }
      <div class="overflow-x-auto"><ng-content /></div>
    </section>`,
})
export class Panel {
  title = input('');
  subtitle = input('');
}

/** Segmented control for filters. */
@Component({
  selector: 'a-tabs',
  standalone: true,
  template: `
    <div class="inline-flex rounded-lg bg-zinc-100 p-1" role="tablist">
      @for (o of options(); track o.value) {
        <button type="button" role="tab" [attr.aria-selected]="o.value === value()" (click)="changed.emit(o.value)"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition"
          [class]="o.value === value() ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'">{{ o.label }}</button>
      }
    </div>`,
})
export class Tabs {
  options = input.required<{ value: string; label: string }[]>();
  value = input.required<string>();
  changed = output<string>();
}

@Component({
  selector: 'a-badge',
  standalone: true,
  template: `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" [class]="cls()"><ng-content /></span>`,
})
export class Badge {
  tone = input<'green' | 'amber' | 'red' | 'slate'>('slate');
  cls() {
    return { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', slate: 'bg-zinc-100 text-zinc-600' }[this.tone()];
  }
}

@Component({
  selector: 'a-toggle',
  standalone: true,
  template: `
    <button type="button" role="switch" [attr.aria-checked]="checked()" (click)="changed.emit(!checked())"
      class="relative inline-flex h-6 w-11 items-center rounded-full transition"
      [class]="checked() ? 'bg-indigo-600' : 'bg-zinc-300'">
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition" [class]="checked() ? 'translate-x-5' : 'translate-x-0.5'"></span>
    </button>`,
})
export class Toggle {
  checked = input.required<boolean>();
  changed = output<boolean>();
}

@Component({
  selector: 'a-empty',
  standalone: true,
  template: `<p class="px-5 py-10 text-center text-zinc-400"><ng-content /></p>`,
})
export class Empty {}

export const TH = 'px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 bg-zinc-50';
export const TD = 'px-5 py-3 border-t border-zinc-100';
