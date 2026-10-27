import { Component, input, model } from '@angular/core';

/** Labelled input with bilingual label + hint. Two-way: [(value)]. */
@Component({
  selector: 't-field',
  standalone: true,
  template: `
    <label class="block">
      <span class="block text-lg font-semibold mb-1">{{ label() }}</span>
      @if (hint()) { <span class="block text-ink-soft mb-2">{{ hint() }}</span> }
      <input class="w-full min-h-touch rounded-card border-2 border-gray-300 px-4 text-lg focus:border-brand-500"
             [type]="type()" [attr.dir]="ltr() || type() !== 'text' ? 'ltr' : null" [placeholder]="placeholder()" [value]="value() ?? ''"
             (input)="onInput($any($event.target).value)" />
    </label>`,
})
export class FieldComponent {
  label = input.required<string>();
  hint = input('');
  /** Numbers, CNIC, phone and email stay left-to-right even in Urdu. */
  ltr = input(false);
  type = input<'text' | 'number' | 'date'>('text');
  placeholder = input('');
  value = model<string | number | null>(null);

  onInput(v: string) { this.value.set(this.type() === 'number' ? (v === '' ? null : +v) : v); }
}
