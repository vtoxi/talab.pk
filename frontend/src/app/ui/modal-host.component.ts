import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../core/modal.service';

@Component({
  selector: 't-modal-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (modal.active(); as m) {
      <div class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
           (click)="onBackdropClick()">
        <div class="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-150 text-start"
             (click)="$event.stopPropagation()"
             role="dialog"
             aria-modal="true">
          <div class="flex items-start gap-3.5">
            <span class="text-3xl shrink-0 p-2 rounded-2xl flex items-center justify-center h-12 w-12"
                  [class]="m.danger ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
              {{ m.icon }}
            </span>
            <div class="space-y-1 pt-0.5 min-w-0 flex-1">
              <h2 class="text-lg font-bold text-gray-900 leading-snug">{{ m.title }}</h2>
              <p class="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{{ m.message }}</p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            @if (m.type === 'confirm') {
              <button type="button"
                      (click)="modal.respond(false)"
                      class="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition focus:outline-none focus:ring-2 focus:ring-gray-300">
                {{ m.cancelText }}
              </button>
              <button type="button"
                      (click)="modal.respond(true)"
                      class="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 shadow-sm"
                      [class]="m.danger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-500'">
                {{ m.confirmText }}
              </button>
            } @else {
              <button type="button"
                      (click)="modal.respond(true)"
                      class="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm">
                {{ m.confirmText }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ModalHostComponent {
  modal = inject(ModalService);

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.modal.active()) {
      this.modal.respond(false);
    }
  }

  onBackdropClick() {
    this.modal.respond(false);
  }
}
