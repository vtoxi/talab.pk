import { Component, inject, signal } from '@angular/core';
import { AdminApi, Flag } from './admin-api.service';
import { Empty, PageHeader, Panel, TD, Toggle } from './ui/admin-ui';

const LABELS: Record<string, { name: string; help: string }> = {
  agents_enabled: { name: 'Agent / dealer accounts', help: 'Lets dealers register and use paid agent plans. Off at launch.' },
};

@Component({
  standalone: true,
  imports: [PageHeader, Panel, Toggle, Empty],
  template: `
    <a-page-header title="Settings" subtitle="Feature switches. Changes apply immediately." />
    <a-panel title="Features" subtitle="Switch parts of the product on or off">
      @for (f of flags(); track f.key) {
        <div [class]="td" class="flex items-center justify-between gap-6">
          <div>
            <p class="font-medium text-zinc-900">{{ label(f).name }}</p>
            <p class="text-zinc-500">{{ label(f).help }}</p>
          </div>
          <a-toggle [checked]="f.enabled" (changed)="set(f, $event)" />
        </div>
      }
      @if (!flags().length) { <a-empty>No feature flags.</a-empty> }
    </a-panel>`,
})
export class SettingsPage {
  private api = inject(AdminApi);
  td = TD;
  flags = signal<Flag[]>([]);

  constructor() { this.api.flags().subscribe(f => this.flags.set(f)); }
  label = (f: Flag) => LABELS[f.key] ?? { name: f.key, help: '' };
  set(f: Flag, enabled: boolean) {
    this.api.setFlag(f.key, enabled).subscribe(() => this.flags.update(l => l.map(x => (x.key === f.key ? { ...x, enabled } : x))));
  }
}
