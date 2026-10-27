import { Component, input } from '@angular/core';

@Component({
  selector: 't-button',
  standalone: true,
  host: { '[class.block]': 'full()', '[class.inline-block]': '!full()' },
  template: `
    <button [type]="type()" [disabled]="disabled()" [class]="classes()">
      <ng-content />
    </button>`,
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  type = input<'button' | 'submit'>('button');
  disabled = input(false);
  full = input(true);

  classes() {
    const base = 'inline-flex items-center justify-center gap-2 text-center leading-snug py-2 min-h-touch px-6 rounded-card text-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ' + (this.full() ? 'w-full ' : '');
    return base + {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
      secondary: 'bg-white text-brand-700 border-2 border-brand-600 hover:bg-brand-50',
      ghost: 'text-ink-soft hover:bg-gray-100',
      danger: 'bg-rose-50 text-rose-700 border-2 border-rose-300 hover:bg-rose-100 active:bg-rose-200',
    }[this.variant()];
  }
}
