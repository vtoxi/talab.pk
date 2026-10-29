import { Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RequestRevision, getRequestRevisions } from '../core/api.service';
import { TPipe, UDatePipe } from '../core/i18n.service';

function formatPakistaniRevCurrency(amount: number): string {
  if (!amount || isNaN(amount)) return '0';
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2)} Crore`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `${lakh % 1 === 0 ? lakh.toFixed(0) : lakh.toFixed(1)} Lakh`;
  }
  return amount.toLocaleString();
}

@Component({
  selector: 't-revisions-list',
  standalone: true,
  imports: [CommonModule, TPipe, UDatePipe],
  template: `
    @if (revisions().length > 0) {
      <div class="rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4 text-sm mt-3">
        <button type="button" (click)="expanded.set(!expanded())"
          class="flex w-full items-center justify-between gap-2 text-left font-semibold text-blue-900 hover:text-blue-950 transition">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-base shrink-0">📜</span>
            <span class="truncate">
              {{ 'Revision History ({n})' | t: { n: revisions().length } }}
            </span>
            @if (revisions().length > 1) {
              <span class="rounded-full bg-blue-200/80 px-2 py-0.5 text-[11px] font-bold text-blue-800 shrink-0">
                {{ 'Rev #{latest}' | t: { latest: revisions().length } }}
              </span>
            }
          </div>
          <span class="text-xs text-blue-700 font-bold px-2 py-1 rounded-lg bg-blue-100/80 shrink-0">
            {{ expanded() ? ('Hide Revisions ▲' | t) : ('View All Revisions ▼' | t) }}
          </span>
        </button>

        @if (expanded()) {
          <div class="mt-3.5 space-y-3 border-t border-blue-200/60 pt-3">
            <p class="text-xs text-blue-800 mb-2">
              {{ 'All revisions of this request are open for viewers to ensure complete transparency.' | t }}
            </p>

            <div class="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-300">
              @for (rev of reversedRevisions(); track rev.revision) {
                <div class="relative rounded-lg p-2.5 transition border"
                     [class]="rev.revision === revisions().length ? 'bg-white border-blue-300 shadow-sm' : 'bg-blue-50/70 border-blue-100'">
                  <!-- Timeline dot -->
                  <div class="absolute -left-[19px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                       [class]="rev.revision === revisions().length ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-400'"></div>

                  <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-xs"
                            [class]="rev.revision === revisions().length ? 'text-blue-950' : 'text-gray-700'">
                        {{ 'Revision #{n}' | t: { n: rev.revision } }}
                      </span>
                      @if (rev.revision === revisions().length) {
                        <span class="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2">
                          {{ 'Current / Active' | t }}
                        </span>
                      } @else if (rev.revision === 1) {
                        <span class="rounded bg-gray-200 text-gray-700 text-[10px] font-medium px-1.5 py-0.2">
                          {{ 'Initial Post' | t }}
                        </span>
                      }
                    </div>

                    <span class="text-[11px] text-ink-soft">
                      {{ rev.createdAt | uDate:true }}
                    </span>
                  </div>

                  @if (rev.note) {
                    <p class="text-xs font-medium text-blue-900 mb-1">
                      📝 {{ rev.note }}
                    </p>
                  }

                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700 pt-0.5">
                    <div>
                      <span class="text-ink-soft">{{ 'Budget' | t }}:</span>
                      <span class="font-bold text-gray-900 ml-1">
                        @if (isBuy(rev)) {
                          Rs {{ formatWorth(rev.budgetMin) }} – {{ formatWorth(rev.budgetMax) }} ({{ 'Buy' | t }})
                        } @else {
                          Rs {{ rev.budgetMin | number }} – {{ rev.budgetMax | number }} / mo
                        }
                      </span>
                    </div>
                    <div>
                      <span class="text-ink-soft">{{ 'Move-in' | t }}:</span>
                      <span class="font-semibold text-gray-900 ml-1">{{ rev.moveIn | uDate }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class RevisionsListComponent {
  details = input.required<string>();
  initialExpanded = input(false);
  expanded = signal(false);

  ngOnInit() {
    if (this.initialExpanded()) {
      this.expanded.set(true);
    }
  }

  revisions = computed<RequestRevision[]>(() => {
    return getRequestRevisions(this.details());
  });

  reversedRevisions = computed<RequestRevision[]>(() => {
    return [...this.revisions()].reverse();
  });

  isBuy(rev: any): boolean {
    return rev.purpose === 'buy' || rev.budgetMin >= 500000;
  }

  formatWorth(amt: number): string {
    return formatPakistaniRevCurrency(amt);
  }
}
