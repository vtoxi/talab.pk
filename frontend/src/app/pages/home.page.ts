import { Component, inject } from '@angular/core';
import { AuthService, Intent } from '../core/auth.service';
import { I18n, TPipe } from '../core/i18n.service';

@Component({
  standalone: true,
  imports: [TPipe],
  template: `
    <h1 class="text-xl font-bold text-center mt-4">{{ 'Who are you?' | t }}</h1>
    <p class="text-lg text-ink-soft text-center mb-6">{{ 'Tap one to start. It is free for tenants.' | t }}</p>

    <div class="grid gap-4 sm:grid-cols-2">
      @for (c of choices; track c.intent) {
        <button type="button" (click)="auth.choose(c.intent)"
           class="flex flex-col items-center gap-3 rounded-card border-2 bg-white p-8 text-center transition hover:border-brand-500 hover:shadow-md"
           [class]="c.border">
          <span class="text-6xl" aria-hidden="true">{{ c.icon }}</span>
          <span class="text-xl font-bold">{{ c.title | t }}</span>
          <!-- English readers also see the Urdu line, as a hint for people who read Urdu better -->
          @if (i18n.lang() === 'en') { <span class="text-lg text-ink-soft" lang="ur" dir="rtl">{{ c.ur }}</span> }
          <span class="text-base text-ink-soft">{{ c.sub | t }}</span>
        </button>
      }
    </div>

    <ol class="mt-10 grid gap-3 text-lg text-ink-soft">
      @for (s of steps; track s) { <li class="flex gap-3"><span class="font-bold text-brand-700">{{ $index + 1 }}.</span>{{ s | t }}</li> }
    </ol>`,
})
export class HomePage {
  auth = inject(AuthService);
  i18n = inject(I18n);
  choices: { intent: Intent; icon: string; title: string; ur: string; sub: string; border: string }[] = [
    { intent: 'Tenant', icon: '🔍', title: "I'm looking for something", ur: 'مجھے کچھ چاہیے', sub: 'Tell us what you need. Owners come to you.', border: 'border-brand-600' },
    { intent: 'Owner', icon: '🔑', title: 'I have something', ur: 'میرے پاس کچھ ہے', sub: 'See who is looking and send your offer.', border: 'border-gray-300' },
  ];
  steps = [
    'Tenant draws the area on the map and posts one request.',
    'Owners with a matching place send offers.',
    'Talk and agree inside the app.',
  ];
}
