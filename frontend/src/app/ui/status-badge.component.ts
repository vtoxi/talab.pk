import { Component, input } from '@angular/core';
import { TPipe } from '../core/i18n.service';

const STYLE: Record<string, string> = {
  Pending: 'bg-warn-50 text-warn-600',
  Accepted: 'bg-brand-100 text-brand-700',
  Rejected: 'bg-danger-50 text-danger-600',
  Withdrawn: 'bg-gray-100 text-ink-soft',
};
const LABEL: Record<string, string> = { Pending: '⏳ Waiting', Accepted: '✅ Accepted', Rejected: '✖ Declined', Withdrawn: '↩ Withdrawn' };

@Component({
  selector: 't-status',
  standalone: true,
  imports: [TPipe],
  template: `<span class="inline-block rounded-full px-3 py-1 text-base font-semibold" [class]="style()">{{ label() | t }}</span>`,
})
export class StatusBadgeComponent {
  status = input.required<string>();
  style = () => STYLE[this.status()] ?? STYLE['Withdrawn'];
  label = () => LABEL[this.status()] ?? this.status();
}
