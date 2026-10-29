import { Component, input, output } from '@angular/core';

/** Big icon tile for picking one option — works without reading much. */
@Component({
  selector: 't-choice-tile',
  standalone: true,
  template: `
    <button type="button" (click)="picked.emit()" [attr.aria-pressed]="selected()"
      class="flex flex-col items-center justify-center gap-2 min-h-[8rem] w-full rounded-card border-2 p-3 transition"
      [class]="selected() ? 'border-brand-600 bg-brand-50' : 'border-gray-300 bg-white hover:border-brand-500'">
      <span class="text-5xl" aria-hidden="true">{{ icon() }}</span>
      <span class="text-lg font-semibold">{{ label() }}</span>
      @if (sub()) { <span class="text-ink-soft">{{ sub() }}</span> }
    </button>`,
})
export class ChoiceTileComponent {
  icon = input.required<string>();
  label = input.required<string>();
  sub = input('');
  selected = input(false);
  picked = output<void>();
}
