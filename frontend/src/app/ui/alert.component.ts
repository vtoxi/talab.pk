import { Component, input } from '@angular/core';

@Component({
  selector: 't-alert',
  standalone: true,
  template: `
    <div role="alert" class="flex items-center gap-3 rounded-card p-4 text-lg"
         [class]="kind() === 'error' ? 'bg-danger-50 text-danger-600' : 'bg-warn-50 text-warn-600'">
      <span aria-hidden="true">{{ kind() === 'error' ? '⚠️' : 'ℹ️' }}</span>
      <div><ng-content /></div>
    </div>`,
})
export class AlertComponent {
  kind = input<'error' | 'info'>('info');
}
