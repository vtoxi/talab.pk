import { Component, OnDestroy, input, output, signal } from '@angular/core';
import { TPipe } from '../core/i18n.service';

/** Big tap target to pick or take one photo, with a preview. On phones it opens the camera when `camera` is set. */
@Component({
  selector: 't-file-field',
  standalone: true,
  imports: [TPipe],
  template: `
    <label class="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed p-4 text-center transition hover:border-brand-500"
           [class]="preview() ? 'border-brand-600 bg-brand-50' : 'border-gray-300 bg-white'">
      @if (preview(); as src) {
        <img [src]="src" alt="" class="max-h-40 rounded-lg object-contain" />
        <span class="text-lg font-semibold text-brand-700">✅ {{ '{label}. Tap to change' | t: { label: label() } }}</span>
      } @else {
        <span class="text-5xl" aria-hidden="true">{{ icon() }}</span>
        <span class="text-lg font-semibold">{{ label() }}</span>
        @if (hint()) { <span class="text-ink-soft">{{ hint() }}</span> }
      }
      <input type="file" accept="image/jpeg,image/png" class="sr-only" [attr.capture]="camera() ? 'user' : null" (change)="onPick($event)" />
    </label>`,
})
export class FileFieldComponent implements OnDestroy {
  label = input.required<string>();
  hint = input('');
  icon = input('📷');
  camera = input(false);
  picked = output<File>();
  preview = signal<string | null>(null);

  onPick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.clear();
    this.preview.set(URL.createObjectURL(f));
    this.picked.emit(f);
  }

  private clear() { const p = this.preview(); if (p) URL.revokeObjectURL(p); }
  ngOnDestroy() { this.clear(); }
}
