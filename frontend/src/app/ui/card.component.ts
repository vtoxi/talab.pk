import { Component } from '@angular/core';

@Component({
  selector: 't-card',
  standalone: true,
  host: { class: 'block bg-white rounded-card shadow-sm border border-gray-200 p-5' },
  template: `<ng-content />`,
})
export class CardComponent {}
