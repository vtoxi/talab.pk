import { Component, OnDestroy, output, signal } from '@angular/core';

export interface PropertyMediaDraft {
  id: string;
  name: string;
  type: 'image' | 'video';
  blob: Blob;
  previewUrl: string;
  sizeLabel: string;
}

@Component({
  selector: 't-property-media-upload',
  standalone: true,
  template: `
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="block text-sm font-bold text-gray-800">
          Attached Photos & Videos <span class="text-xs text-gray-500 font-normal">({{ items().length }} attached)</span>
        </label>
        <span class="text-xs text-gray-500">Max 10 files (JPG, PNG, MP4, MOV)</span>
      </div>

      <!-- Drag & Drop / Upload Area -->
      <label class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/70 p-4 text-center transition hover:border-brand-500 hover:bg-brand-50/30">
        <div class="flex items-center gap-2 text-brand-700 font-semibold text-sm">
          <span class="text-xl">📸</span>
          <span>Click or drag photos & videos here</span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Upload property photos, room tours, or video clips</p>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          class="sr-only" (change)="onFilesPicked($event)" />
      </label>

      <!-- Thumbnails Preview Grid -->
      @if (items().length > 0) {
        <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          @for (m of items(); track m.id) {
            <div class="group relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              @if (m.type === 'image') {
                <img [src]="m.previewUrl" [alt]="m.name" class="h-24 w-full object-cover" />
              } @else {
                <div class="relative h-24 w-full bg-zinc-900 flex items-center justify-center">
                  <video [src]="m.previewUrl" class="h-full w-full object-cover" muted></video>
                  <span class="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-lg">▶️</span>
                </div>
              }
              <div class="p-1.5 bg-white text-[10px] text-gray-600 flex items-center justify-between">
                <span class="truncate max-w-[80px]" [title]="m.name">{{ m.name }}</span>
                <span class="text-gray-400">{{ m.sizeLabel }}</span>
              </div>
              <button type="button" (click)="removeItem(m.id)"
                title="Remove file"
                class="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-600 text-white text-xs font-bold shadow hover:bg-red-700 flex items-center justify-center transition">
                ✕
              </button>
            </div>
          }
        </div>
      }
    </div>`,
})
export class PropertyMediaUploadComponent implements OnDestroy {
  mediaChanged = output<PropertyMediaDraft[]>();
  items = signal<PropertyMediaDraft[]>([]);

  onFilesPicked(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !files.length) return;

    const current = [...this.items()];
    for (let i = 0; i < files.length; i++) {
      if (current.length >= 10) break;
      const f = files[i];
      const isVideo = f.type.startsWith('video');
      const isImage = f.type.startsWith('image');
      if (!isImage && !isVideo) continue;

      const draft: PropertyMediaDraft = {
        id: 'med_' + Math.random().toString(36).substring(2, 9),
        name: f.name,
        type: isVideo ? 'video' : 'image',
        blob: f,
        previewUrl: URL.createObjectURL(f),
        sizeLabel: this.formatBytes(f.size),
      };
      current.push(draft);
    }

    this.items.set(current);
    this.mediaChanged.emit(current);
  }

  removeItem(id: string) {
    const item = this.items().find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    const updated = this.items().filter(i => i.id !== id);
    this.items.set(updated);
    this.mediaChanged.emit(updated);
  }

  reset() {
    this.items().forEach(i => URL.revokeObjectURL(i.previewUrl));
    this.items.set([]);
    this.mediaChanged.emit([]);
  }

  private formatBytes(b: number): string {
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  ngOnDestroy() {
    this.items().forEach(i => URL.revokeObjectURL(i.previewUrl));
  }
}
