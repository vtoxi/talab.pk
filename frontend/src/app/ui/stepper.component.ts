import { Component, input } from '@angular/core';
import { TPipe } from '../core/i18n.service';

@Component({
  selector: 't-stepper',
  standalone: true,
  imports: [TPipe],
  template: `
    <p class="text-ink-soft mb-2">{{ 'Step {n} of {total}' | t: { n: current(), total: total() } }}</p>
    <div class="h-3 rounded-full bg-gray-200" role="progressbar" [attr.aria-valuenow]="current()" [attr.aria-valuemax]="total()">
      <div class="h-3 rounded-full bg-brand-600 transition-all" [style.width.%]="current() / total() * 100"></div>
    </div>`,
})
export class StepperComponent {
  current = input.required<number>();
  total = input.required<number>();
}
