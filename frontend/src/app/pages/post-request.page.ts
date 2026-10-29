import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdLimitStatus, ApiService, LatLng, MyRequest, RequestRevision, getRequestRevisions, requestType, typeLabel } from '../core/api.service';
import { I18n, TPipe, UDatePipe } from '../core/i18n.service';
import { ModalService } from '../core/modal.service';
import { AlertComponent } from '../ui/alert.component';
import { ButtonComponent } from '../ui/button.component';
import { ChoiceTileComponent } from '../ui/choice-tile.component';
import { FieldComponent } from '../ui/field.component';
import { MapPickerComponent } from '../ui/map-picker.component';
import { RevisionsListComponent } from '../ui/revisions-list.component';
import { StepperComponent } from '../ui/stepper.component';

interface WorthTier {
  label: string;
  worth: number;
}

const PROPERTY_WORTH_CONFIG: Record<string, { defaultWorth: number; tiers: WorthTier[] }> = {
  flat: {
    defaultWorth: 12000000,
    tiers: [
      { label: '50 Lakh (Studio)', worth: 5000000 },
      { label: '85 Lakh (1 Bed)', worth: 8500000 },
      { label: '1.2 Crore (2 Bed)', worth: 12000000 },
      { label: '1.8 Crore (3 Bed)', worth: 18000000 },
      { label: '2.8 Crore (Luxury)', worth: 28000000 },
    ],
  },
  house: {
    defaultWorth: 25000000,
    tiers: [
      { label: '1.2 Crore (5 Marla Single)', worth: 12000000 },
      { label: '2.5 Crore (5 Marla Double)', worth: 25000000 },
      { label: '4.5 Crore (10 Marla)', worth: 45000000 },
      { label: '8 Crore (1 Kanal)', worth: 80000000 },
    ],
  },
  shop: {
    defaultWorth: 8000000,
    tiers: [
      { label: '40 Lakh (Small Stall/Kiosk)', worth: 4000000 },
      { label: '80 Lakh (Standard Shop)', worth: 8000000 },
      { label: '1.5 Crore (Main Market)', worth: 15000000 },
      { label: '3 Crore (Corner / Prime)', worth: 30000000 },
    ],
  },
  office: {
    defaultWorth: 18000000,
    tiers: [
      { label: '70 Lakh (Co-working/Cabin)', worth: 7000000 },
      { label: '1.8 Crore (Executive Office)', worth: 18000000 },
      { label: '3.5 Crore (Full Floor)', worth: 35000000 },
    ],
  },
  room: {
    defaultWorth: 3000000,
    tiers: [
      { label: '15 Lakh (Standard Room)', worth: 1500000 },
      { label: '30 Lakh (With Attached Bath)', worth: 3000000 },
      { label: '50 Lakh (Furnished Studio)', worth: 5000000 },
    ],
  },
  plot: {
    defaultWorth: 15000000,
    tiers: [
      { label: '80 Lakh (5 Marla)', worth: 8000000 },
      { label: '1.5 Crore (10 Marla)', worth: 15000000 },
      { label: '3 Crore (1 Kanal)', worth: 30000000 },
    ],
  },
};

const DEFAULT_WORTH_TIERS: WorthTier[] = [
  { label: '50 Lakh', worth: 5000000 },
  { label: '1 Crore', worth: 10000000 },
  { label: '2 Crore', worth: 20000000 },
  { label: '3.5 Crore', worth: 35000000 },
  { label: '5 Crore', worth: 50000000 },
];

export function formatPakistaniCurrency(amount: number): string {
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

const TYPES = [
  { id: 'flat', icon: '🏢', label: 'Flat', ur: 'فلیٹ' },
  { id: 'house', icon: '🏠', label: 'House', ur: 'گھر' },
  { id: 'shop', icon: '🏪', label: 'Shop', ur: 'دکان' },
  { id: 'office', icon: '🏬', label: 'Office', ur: 'دفتر' },
  { id: 'room', icon: '🛏️', label: 'Room', ur: 'کمرہ' },
  { id: 'plot', icon: '🌳', label: 'Plot', ur: 'پلاٹ' },
];

@Component({
  standalone: true,
  imports: [TPipe, UDatePipe, AlertComponent, ButtonComponent, ChoiceTileComponent, FieldComponent, MapPickerComponent, StepperComponent, RevisionsListComponent],
  template: `
    <!-- User is blocked by open request AND not granted extra limit AND not editing -->
    @if (isBlockedByLimit()) {
      <div class="rounded-2xl border-2 border-amber-300 bg-amber-50/95 p-5 sm:p-6 shadow-sm space-y-5 mb-6">
        <div class="flex items-start gap-3">
          <span class="text-3xl shrink-0">⚠️</span>
          <div class="space-y-1">
            <h1 class="text-xl font-bold text-amber-950">
              {{ 'You already have an open request. Close it before posting a new one.' | t }}
            </h1>
            <p class="text-sm text-amber-800">
              {{ 'Talab allows one active request at a time by default. You can view, update, close your current request, or ask for more limit below.' | t }}
            </p>
          </div>
        </div>

        <!-- Open Request Details Card -->
        <div class="rounded-xl border border-amber-200 bg-white p-5 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <span class="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
                {{ 'Active Open Request' | t }}
              </span>
              <span class="rounded-md px-2 py-0.5 text-xs font-bold" [class]="isExistingReqBuy() ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'">
                {{ isExistingReqBuy() ? ('Looking to Buy' | t) : ('Looking to Rent' | t) }}
              </span>
              <span class="text-xs font-mono font-medium text-gray-500">#{{ existingReq()!.id.slice(0, 8) }}</span>
            </div>
            <span class="text-xs font-medium text-ink-soft">
              {{ 'Valid until {until}' | t: { until: existingReq()!.expiresAt.slice(0, 10) } }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span class="text-xs font-medium text-ink-soft block uppercase tracking-wider">{{ 'Property Type' | t }}</span>
              <span class="text-base font-bold text-gray-900 mt-1 block">{{ existingReqType() | t }}</span>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span class="text-xs font-medium text-ink-soft block uppercase tracking-wider">
                {{ isExistingReqBuy() ? ('Target Purchase Budget' | t) : ('Monthly Budget' | t) }}
              </span>
              <span class="text-base font-bold mt-1 block" [class]="isExistingReqBuy() ? 'text-emerald-700' : 'text-brand-700'">
                @if (isExistingReqBuy()) {
                  Rs {{ formatPakistaniCurrency(existingReq()!.budgetMin) }} – {{ formatPakistaniCurrency(existingReq()!.budgetMax) }}
                } @else {
                  {{ 'Rs {min} – {max}' | t: { min: existingReq()!.budgetMin, max: existingReq()!.budgetMax } }}
                }
              </span>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span class="text-xs font-medium text-ink-soft block uppercase tracking-wider">{{ 'Desired Move-in' | t }}</span>
              <span class="text-base font-bold text-gray-900 mt-1 block">{{ existingReq()!.moveIn | uDate }}</span>
            </div>
          </div>

          <!-- Revisions Timeline for Viewers -->
          <t-revisions-list [details]="existingReq()!.details" />
        </div>

        <!-- Primary Actions: View, Update, Close -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <t-button variant="primary" (click)="viewRequest()">
            {{ '👁️ View Request & Offers' | t }}
          </t-button>
          <t-button variant="secondary" (click)="startEditExisting()">
            {{ '✏️ Update / Edit Request' | t }}
          </t-button>
          <t-button variant="ghost" (click)="closeExisting()">
            {{ '✕ Close Request' | t }}
          </t-button>
        </div>

        <!-- REQUEST FOR MORE AD LIMIT SECTION -->
        <div class="mt-4 border-t border-amber-200/80 pt-4">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                <span>➕</span> {{ 'Need to post another property ad?' | t }}
              </h2>
              <p class="text-xs text-amber-800 mt-0.5">
                {{ 'Ask admin or request an additional ad slot for your account without closing your current ad.' | t }}
              </p>
            </div>

            @if (!isReviewing() && !pendingAdmin()) {
              <t-button variant="secondary" [disabled]="requestingLimit()" (click)="requestMoreLimit()">
                {{ requestingLimit() ? ('Submitting...' | t) : ('Request Additional Ad Slot' | t) }}
              </t-button>
            }
          </div>
        </div>

        <!-- ACTIVE REVIEW COUNTDOWN PROGRESS CARD -->
        @if (isReviewing()) {
          <div class="mt-4 rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm space-y-3.5 animate-in fade-in duration-200">
            <div class="flex items-center justify-between border-b border-gray-100 pb-3">
              <div class="flex items-center gap-2">
                <span class="text-2xl animate-spin">⚙️</span>
                <div>
                  <h3 class="text-sm font-bold text-gray-900">{{ 'Account Quota Review in Progress' | t }}</h3>
                  <p class="text-xs text-ink-soft">{{ 'Your request for +1 additional ad slot is currently being evaluated.' | t }}</p>
                </div>
              </div>
              <div class="text-right">
                <span class="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                  ⏱️ {{ formattedTimeRemaining() }}
                </span>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs text-gray-600 font-medium">
                <span>{{ currentMilestoneLabel() }}</span>
                <span>{{ progressPercent() }}%</span>
              </div>
              <div class="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                <div class="h-full bg-gradient-to-r from-indigo-500 via-brand-600 to-emerald-500 transition-all duration-1000 ease-linear rounded-full"
                     [style.width.%]="progressPercent()"></div>
              </div>
            </div>

            <!-- Review Steps Flow -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div class="p-2 rounded-xl border text-center transition" [class]="progressPercent() >= 25 ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'">
                <span>{{ progressPercent() >= 25 ? '✓' : '1.' }}</span>
                <span class="ml-1">{{ 'Account Standing' | t }}</span>
              </div>
              <div class="p-2 rounded-xl border text-center transition" [class]="progressPercent() >= 50 ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'">
                <span>{{ progressPercent() >= 50 ? '✓' : '2.' }}</span>
                <span class="ml-1">{{ 'Quota Capacity' | t }}</span>
              </div>
              <div class="p-2 rounded-xl border text-center transition" [class]="progressPercent() >= 75 ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'">
                <span>{{ progressPercent() >= 75 ? '✓' : '3.' }}</span>
                <span class="ml-1">{{ 'Trust Check' | t }}</span>
              </div>
              <div class="p-2 rounded-xl border text-center transition" [class]="progressPercent() >= 100 ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-gray-50 border-gray-200 text-gray-400'">
                <span>{{ progressPercent() >= 100 ? '✓' : '4.' }}</span>
                <span class="ml-1">{{ 'Slot Allocation' | t }}</span>
              </div>
            </div>

            <!-- Dev Expedite Button -->
            <div class="text-right">
              <button type="button" (click)="expediteReview()" class="text-[11px] text-indigo-400 hover:text-indigo-700 underline">
                ⚡ {{ 'Expedite Review (Dev)' | t }}
              </button>
            </div>
          </div>
        }

        <!-- PENDING MANUAL ADMIN APPROVAL (After 3 auto-approvals used) -->
        @if (pendingAdmin()) {
          <div class="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5 shadow-sm space-y-2 animate-in fade-in duration-200">
            <div class="flex items-center gap-2 text-amber-900 font-bold">
              <span class="text-xl">🛡️</span>
              <span class="text-sm sm:text-base">{{ 'Manual Admin Approval Required' | t }}</span>
            </div>
            <p class="text-xs sm:text-sm text-amber-800">
              {{ 'You have reached the maximum automated quota (3/3 automatic allocations used). Your request for an additional ad slot has been submitted to the Admin team for review and approval.' | t }}
            </p>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-950 text-xs font-bold mt-1">
              <span>⏳</span>
              <span>Status: Pending Admin Review</span>
            </div>
          </div>
        }
      </div>
    }

    <!-- If editing an existing request banner -->
    @if (isEditing()) {
      <div class="mb-4 flex items-center justify-between bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-lg">✏️</span>
          <span class="text-sm font-bold text-brand-900">{{ 'Editing your active request' | t }}</span>
        </div>
        <button type="button" class="text-xs font-semibold text-brand-700 hover:text-brand-900 underline" (click)="cancelEdit()">
          {{ 'Cancel Editing' | t }}
        </button>
      </div>
    }

    <!-- If user granted additional limit banner -->
    @if (canPostMore() && existingReq() && !isEditing()) {
      <div class="mb-4 flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-lg">🎉</span>
          <span class="text-xs sm:text-sm font-bold text-emerald-950">
            {{ 'Additional Ad Slot Available ({open}/{allowed})' | t: { open: limitStatus()?.currentOpenCount ?? 1, allowed: limitStatus()?.allowedLimit ?? 2 } }}
          </span>
        </div>
        <span class="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md">
          {{ 'Quota Active' | t }}
        </span>
      </div>
    }

    @if (successMessage()) {
      <div class="mb-4"><t-alert kind="info">{{ successMessage() }}</t-alert></div>
    }

    <!-- Wizard Steps (show when not blocked by limit, or when editing) -->
    @if (!isBlockedByLimit() || isEditing()) {
      <t-stepper [current]="step()" [total]="4" />
      <div class="mt-6 grid gap-6">
        @switch (step()) {
          @case (1) {
            <div>
              <h1 class="text-xl font-bold mb-3">{{ 'What do you need?' | t }}</h1>

              <!-- Purpose Selection: Rent vs Buy -->
              <div class="mb-5 flex rounded-2xl bg-gray-100 p-1 border border-gray-200">
                <button type="button" (click)="setPurpose('rent')"
                  class="flex-1 py-2.5 px-3 rounded-xl text-sm sm:text-base font-bold transition flex items-center justify-center gap-2"
                  [class]="purpose() === 'rent' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'">
                  <span>🔑</span> {{ 'Looking to Rent' | t }}
                </button>
                <button type="button" (click)="setPurpose('buy')"
                  class="flex-1 py-2.5 px-3 rounded-xl text-sm sm:text-base font-bold transition flex items-center justify-center gap-2"
                  [class]="purpose() === 'buy' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'">
                  <span>🏡</span> {{ 'Looking to Buy' | t }}
                </button>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                @for (t of types; track t.id) {
                  <t-choice-tile [icon]="t.icon" [label]="t.label | t" [sub]="i18n.lang() === 'en' ? t.ur : ''" [selected]="type() === t.id" (picked)="selectType(t.id)" />
                }
              </div>
            </div>
          }
          @case (2) {
            <h1 class="text-xl font-bold">{{ 'Where? Draw the area' | t }}</h1>
            <p class="text-lg text-ink-soft">{{ 'Use the shape buttons on the map (⬠ or ●), then draw around the area you want.' | t }}</p>
            <t-map-picker [initialArea]="area()" (areaChange)="area.set($event)" />
          }
          @case (3) {
            <div class="space-y-5">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <h1 class="text-xl font-bold">{{ 'Budget and date' | t }}</h1>
                  <!-- Purpose Switcher Pill -->
                  <div class="inline-flex rounded-xl bg-gray-100 p-0.5 border border-gray-200 text-xs">
                    <button type="button" (click)="setPurpose('rent')"
                      class="px-2.5 py-1 rounded-lg font-bold transition"
                      [class]="purpose() === 'rent' ? 'bg-brand-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'">
                      {{ 'Rent' | t }}
                    </button>
                    <button type="button" (click)="setPurpose('buy')"
                      class="px-2.5 py-1 rounded-lg font-bold transition"
                      [class]="purpose() === 'buy' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'">
                      {{ 'Buy' | t }}
                    </button>
                  </div>
                </div>
                <p class="text-sm text-ink-soft mt-0.5">
                  @if (purpose() === 'buy') {
                    {{ 'Set your target buying budget based on property market worth.' | t }}
                  } @else {
                    {{ 'Set your monthly budget as per the property worth or market value.' | t }}
                  }
                </p>
              </div>

              <!-- OPTION 1: FOR RENT (Property Worth used for Yield Calculation) -->
              @if (purpose() === 'rent') {
                <div class="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/60 via-white to-blue-50/40 p-4 sm:p-5 shadow-sm space-y-3.5">
                  <div class="flex items-center justify-between border-b border-brand-100 pb-2.5">
                    <div class="flex items-center gap-2">
                      <span class="text-2xl">🏷️</span>
                      <div>
                        <h2 class="text-sm font-bold text-brand-950">{{ 'Estimated Property Worth' | t }}</h2>
                        <p class="text-xs text-brand-800">{{ 'Market value for typical {type}' | t: { type: typeLabel() } }}</p>
                      </div>
                    </div>
                    <span class="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-900 border border-brand-300">
                      Rs {{ formattedPropertyWorth() }}
                    </span>
                  </div>

                  <!-- Quick Property Worth Selection Tiers -->
                  <div>
                    <span class="block text-xs font-semibold text-gray-700 mb-1.5">{{ 'Select Property Worth Tier:' | t }}</span>
                    <div class="flex flex-wrap gap-1.5">
                      @for (tier of currentWorthTiers(); track tier.worth) {
                        <button type="button" (click)="setPropertyWorth(tier.worth)"
                          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition text-left"
                          [class]="propertyWorth() === tier.worth ? 'border-brand-600 bg-brand-600 text-white shadow-sm ring-1 ring-brand-500' : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50/50'">
                          {{ tier.label }}
                        </button>
                      }
                    </div>
                  </div>

                  <!-- Custom Worth Input -->
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-xs font-medium text-gray-600">{{ 'Or enter exact property worth (Rs):' | t }}</label>
                      <span class="text-xs font-semibold text-brand-700">Rs {{ formattedPropertyWorth() }}</span>
                    </div>
                    <input type="number" min="500000" step="500000"
                      [value]="propertyWorth()"
                      (input)="onWorthInput($any($event.target).value)"
                      placeholder="e.g. 15000000"
                      class="w-full rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm text-gray-900 font-semibold focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
                  </div>

                  <div class="flex items-start gap-2 text-xs text-brand-900 bg-brand-100/70 rounded-xl p-2.5">
                    <span class="text-base shrink-0">💡</span>
                    <span>{{ 'Lowest & Highest rent below are auto-filled using standard 3.5%–5.5% annual rental yield in Pakistan.' | t }}</span>
                  </div>
                </div>

                <!-- Rent Fields -->
                <div class="grid sm:grid-cols-2 gap-4">
                  <div>
                    <t-field [label]="'Lowest rent per month (Rs)' | t" type="number" [value]="budgetMin()" (valueChange)="onMinRentChange($event)" />
                    <span class="text-xs text-ink-soft mt-0.5 block">{{ 'Min expected (~3.5% yearly yield)' | t }}</span>
                  </div>
                  <div>
                    <t-field [label]="'Highest rent per month (Rs)' | t" type="number" [value]="budgetMax()" (valueChange)="onMaxRentChange($event)" />
                    <span class="text-xs text-ink-soft mt-0.5 block">{{ 'Max expected (~5.5% yearly yield)' | t }}</span>
                  </div>
                </div>

                <t-field [label]="'When do you want to move in?' | t" type="date" [(value)]="moveIn" />
              }

              <!-- OPTION 2: FOR BUY / SALE (Property Worth IS Target Purchase Price) -->
              @if (purpose() === 'buy') {
                <div class="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 p-4 sm:p-5 shadow-sm space-y-3.5">
                  <div class="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                    <div class="flex items-center gap-2">
                      <span class="text-2xl">🏡</span>
                      <div>
                        <h2 class="text-sm font-bold text-emerald-950">{{ 'Target Property Worth / Purchase Budget' | t }}</h2>
                        <p class="text-xs text-emerald-800">{{ 'Target market price range for buying {type}' | t: { type: typeLabel() } }}</p>
                      </div>
                    </div>
                    <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900 border border-emerald-300">
                      Rs {{ formattedPropertyWorth() }}
                    </span>
                  </div>

                  <!-- Quick Buying Worth Tiers -->
                  <div>
                    <span class="block text-xs font-semibold text-gray-700 mb-1.5">{{ 'Select Target Worth / Price Tier:' | t }}</span>
                    <div class="flex flex-wrap gap-1.5">
                      @for (tier of currentWorthTiers(); track tier.worth) {
                        <button type="button" (click)="setBuyPropertyWorth(tier.worth)"
                          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition text-left"
                          [class]="propertyWorth() === tier.worth ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50'">
                          {{ tier.label }}
                        </button>
                      }
                    </div>
                  </div>

                  <!-- Custom Buying Price Inputs -->
                  <div class="grid sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <t-field [label]="'Lowest purchase price (Rs)' | t" type="number" [value]="budgetMin()" (valueChange)="onMinBuyPriceChange($event)" />
                      <span class="text-xs font-semibold text-emerald-700 mt-0.5 block">
                        {{ 'Min target price' | t }}: Rs {{ formatPakistaniCurrency(+budgetMin()!) }}
                      </span>
                    </div>
                    <div>
                      <t-field [label]="'Highest purchase price (Rs)' | t" type="number" [value]="budgetMax()" (valueChange)="onMaxBuyPriceChange($event)" />
                      <span class="text-xs font-semibold text-emerald-700 mt-0.5 block">
                        {{ 'Max target price' | t }}: Rs {{ formatPakistaniCurrency(+budgetMax()!) }}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-start gap-2 text-xs text-emerald-900 bg-emerald-100/70 rounded-xl p-2.5">
                    <span class="text-base shrink-0">💡</span>
                    <span>{{ 'Enter your comfortable price range for buying. Verified property sellers will match with your budget.' | t }}</span>
                  </div>
                </div>

                <t-field [label]="'Target purchase or move-in date' | t" type="date" [(value)]="moveIn" />
              }
            </div>
          }
          @case (4) {
            <h1 class="text-xl font-bold">{{ isEditing() ? ('Review and Save Changes' | t) : ('Check and send' | t) }}</h1>
            <div class="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-xs">
              <div class="flex items-center gap-2">
                <span class="rounded-md px-2.5 py-0.5 text-xs font-bold" [class]="purpose() === 'buy' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'">
                  {{ purpose() === 'buy' ? ('Looking to Buy' | t) : ('Looking to Rent' | t) }}
                </span>
                <span class="font-bold text-gray-900 text-base">{{ typeLabel() | t }}</span>
              </div>
              <p class="text-xl font-bold" [class]="purpose() === 'buy' ? 'text-emerald-700' : 'text-brand-700'">
                @if (purpose() === 'buy') {
                  Rs {{ formatPakistaniCurrency(+budgetMin()!) }} – {{ formatPakistaniCurrency(+budgetMax()!) }}
                } @else {
                  Rs {{ budgetMin() }} – {{ budgetMax() }} / mo
                }
              </p>
              <p class="text-sm text-ink-soft">
                {{ 'Desired Move-in' | t }}: <span class="font-semibold text-gray-800">{{ moveIn() | uDate }}</span>
              </p>
              <p class="text-xs text-emerald-800 font-medium pt-1 border-t border-gray-100">🏷️ {{ 'Property Worth: Rs {worth}' | t: { worth: formattedPropertyWorth() } }}</p>
            </div>
            <p class="text-ink-soft">{{ 'Your ad will be matched with verified property owners in the area.' | t }}</p>
          }
        }

        @if (error()) { <t-alert kind="error">{{ error() }}</t-alert> }

        <div class="grid gap-3">
          @if (step() < 4) {
            <t-button [disabled]="!canNext()" (click)="step.set(step() + 1)">{{ 'Next' | t }}</t-button>
          } @else {
            <t-button [disabled]="busy()" (click)="submit()">
              {{ isEditing() ? ('💾 Save Changes' | t) : ('✅ Send my request' | t) }}
            </t-button>
          }
          @if (step() > 1) { <t-button variant="ghost" (click)="step.set(step() - 1)">{{ 'Back' | t }}</t-button> }
        </div>
      </div>
    }
  `,
})
export class PostRequestPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private modal = inject(ModalService);
  i18n = inject(I18n);

  types = TYPES;
  step = signal(1);
  purpose = signal<'rent' | 'buy'>('rent');
  type = signal<string | null>('flat');
  area = signal<LatLng[] | null>(null);
  budgetMin = signal<string | number | null>(null);
  budgetMax = signal<string | number | null>(null);
  moveIn = signal<string | null>(null);
  error = signal('');
  successMessage = signal('');
  busy = signal(false);

  // Property Worth Signals
  propertyWorth = signal<number>(12000000);

  existingReq = signal<MyRequest | null>(null);
  isEditing = signal(false);

  // Ad Limit & Review Signals
  limitStatus = signal<AdLimitStatus | null>(null);
  requestingLimit = signal(false);
  isReviewing = signal(false);
  pendingAdmin = signal(false);
  timerSecondsRemaining = signal(150);
  totalReviewDuration = signal(150);
  private timerInterval: any = null;

  typeLabel = computed(() => TYPES.find(t => t.id === this.type())?.label ?? 'Property');
  existingReqType = computed(() => {
    const r = this.existingReq();
    return r ? typeLabel(r.details) : '';
  });

  isExistingReqBuy = computed(() => {
    const r = this.existingReq();
    if (!r) return false;
    try {
      const d = JSON.parse(r.details || '{}');
      if (d.purpose === 'buy') return true;
    } catch {}
    return r.budgetMin >= 500000;
  });

  canPostMore = computed(() => this.limitStatus()?.canPost ?? false);
  isBlockedByLimit = computed(() => !!this.existingReq() && !this.canPostMore() && !this.isEditing());

  formattedPropertyWorth = computed(() => {
    return formatPakistaniCurrency(this.propertyWorth());
  });

  currentWorthTiers = computed<WorthTier[]>(() => {
    const t = this.type();
    if (t && PROPERTY_WORTH_CONFIG[t]) {
      return PROPERTY_WORTH_CONFIG[t].tiers;
    }
    return DEFAULT_WORTH_TIERS;
  });

  progressPercent = computed(() => {
    const elapsed = this.totalReviewDuration() - this.timerSecondsRemaining();
    return Math.min(100, Math.max(0, Math.round((elapsed / this.totalReviewDuration()) * 100)));
  });

  formattedTimeRemaining = computed(() => {
    const s = this.timerSecondsRemaining();
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  });

  currentMilestoneLabel = computed(() => {
    const p = this.progressPercent();
    if (p < 25) return 'Step 1/4: Account Standing & Trust Verification...';
    if (p < 50) return 'Step 2/4: Checking Regional Capacity & Ad Density...';
    if (p < 75) return 'Step 3/4: Quota Safety & Fraud Prevention Check...';
    return 'Step 4/4: Finalizing +1 Ad Slot Quota Allocation...';
  });

  canNext = computed(() => {
    switch (this.step()) {
      case 1: return !!this.type();
      case 2: return !!this.area() || this.isEditing();
      default: return !!this.budgetMin() && !!this.budgetMax() && !!this.moveIn();
    }
  });

  ngOnInit() {
    this.checkExistingRequest();
    this.checkAdLimitStatus();
    this.initDefaultValues();
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  private initDefaultValues() {
    if (!this.moveIn()) {
      const d = new Date(Date.now() + 14 * 86400000);
      this.moveIn.set(d.toISOString().slice(0, 10));
    }
    if (!this.budgetMin() || !this.budgetMax()) {
      if (this.purpose() === 'buy') {
        this.fillBuyBudgetFromWorth(this.propertyWorth());
      } else {
        this.fillRentFromWorth(this.propertyWorth());
      }
    }
  }

  setPurpose(p: 'rent' | 'buy') {
    this.purpose.set(p);
    if (p === 'buy') {
      if (!this.budgetMin() || Number(this.budgetMin()) < 500000) {
        this.fillBuyBudgetFromWorth(this.propertyWorth());
      }
    } else {
      if (!this.budgetMin() || Number(this.budgetMin()) >= 500000) {
        this.fillRentFromWorth(this.propertyWorth());
      }
    }
  }

  selectType(id: string) {
    this.type.set(id);
    const cfg = PROPERTY_WORTH_CONFIG[id];
    if (cfg) {
      this.propertyWorth.set(cfg.defaultWorth);
      if (this.purpose() === 'buy') {
        this.fillBuyBudgetFromWorth(cfg.defaultWorth);
      } else {
        this.fillRentFromWorth(cfg.defaultWorth);
      }
    }
  }

  setPropertyWorth(worth: number) {
    this.propertyWorth.set(worth);
    this.fillRentFromWorth(worth);
  }

  setBuyPropertyWorth(worth: number) {
    this.propertyWorth.set(worth);
    this.fillBuyBudgetFromWorth(worth);
  }

  onWorthInput(raw: string | number) {
    const num = +raw;
    if (num && num > 0) {
      this.propertyWorth.set(num);
      if (this.purpose() === 'buy') {
        this.fillBuyBudgetFromWorth(num);
      } else {
        this.fillRentFromWorth(num);
      }
    }
  }

  fillRentFromWorth(worth: number) {
    if (!worth || worth <= 0) return;
    const min = Math.round((worth * 0.003) / 500) * 500;
    const max = Math.round((worth * 0.0048) / 500) * 500;
    this.budgetMin.set(min);
    this.budgetMax.set(max);
  }

  fillBuyBudgetFromWorth(worth: number) {
    if (!worth || worth <= 0) return;
    const min = Math.round((worth * 0.85) / 100000) * 100000;
    const max = Math.round((worth * 1.15) / 100000) * 100000;
    this.budgetMin.set(min);
    this.budgetMax.set(max);
  }

  onMinRentChange(v: string | number | null) {
    this.budgetMin.set(v);
    if (v && +v > 0) {
      const implied = Math.round((+v / 0.003) / 100000) * 100000;
      this.propertyWorth.set(implied);
    }
  }

  onMaxRentChange(v: string | number | null) {
    this.budgetMax.set(v);
    if (v && +v > 0) {
      const implied = Math.round((+v / 0.0048) / 100000) * 100000;
      this.propertyWorth.set(implied);
    }
  }

  onMinBuyPriceChange(v: string | number | null) {
    this.budgetMin.set(v);
    if (v && +v > 0) {
      this.propertyWorth.set(+v);
    }
  }

  onMaxBuyPriceChange(v: string | number | null) {
    this.budgetMax.set(v);
  }

  formatPakistaniCurrency(val: number): string {
    return formatPakistaniCurrency(val);
  }

  checkExistingRequest() {
    this.api.myRequest().subscribe({
      next: r => {
        if (r) {
          this.existingReq.set(r);
        }
      },
      error: () => {},
    });
  }

  checkAdLimitStatus() {
    this.api.limitStatus().subscribe({
      next: status => {
        this.limitStatus.set(status);
        if (status.pendingRequest) {
          if (status.pendingRequest.status === 'Reviewing') {
            const remaining = Math.max(1, status.pendingRequest.reviewDurationSeconds - status.pendingRequest.secondsElapsed);
            this.totalReviewDuration.set(status.pendingRequest.reviewDurationSeconds);
            this.startReviewTimer(remaining);
          } else if (status.pendingRequest.status === 'PendingAdmin') {
            this.pendingAdmin.set(true);
          }
        }
      },
      error: () => {},
    });
  }

  requestMoreLimit() {
    this.requestingLimit.set(true);
    this.error.set('');
    this.api.requestLimit().subscribe({
      next: status => {
        this.requestingLimit.set(false);
        this.limitStatus.set(status);
        if (status.pendingRequest) {
          if (status.pendingRequest.status === 'Reviewing') {
            const remaining = Math.max(1, status.pendingRequest.reviewDurationSeconds - status.pendingRequest.secondsElapsed);
            this.totalReviewDuration.set(status.pendingRequest.reviewDurationSeconds);
            this.startReviewTimer(remaining);
          } else if (status.pendingRequest.status === 'PendingAdmin') {
            this.pendingAdmin.set(true);
          }
        } else if (status.canPost) {
          this.successMessage.set(this.i18n.t('Ad Limit Approved! +1 Ad Slot Allocated.'));
        }
      },
      error: e => {
        this.requestingLimit.set(false);
        this.error.set(this.i18n.err(e, 'Could not request ad limit.'));
      },
    });
  }

  startReviewTimer(seconds: number) {
    this.timerSecondsRemaining.set(seconds);
    this.isReviewing.set(true);
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const cur = this.timerSecondsRemaining();
      if (cur <= 1) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.timerSecondsRemaining.set(0);
        this.finishReview(false);
      } else {
        this.timerSecondsRemaining.set(cur - 1);
      }
    }, 1000);
  }

  expediteReview() {
    this.finishReview(true);
  }

  finishReview(expedite = false) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.api.claimApprovedLimit(expedite).subscribe({
      next: status => {
        this.limitStatus.set(status);
        this.isReviewing.set(false);
        this.successMessage.set(this.i18n.t('Ad Limit Approved! +1 Ad Slot Allocated.'));
      },
      error: () => {
        this.isReviewing.set(false);
      },
    });
  }

  viewRequest() {
    this.router.navigate(['/my-request']);
  }

  startEditExisting() {
    const r = this.existingReq();
    if (!r) return;
    const t = requestType(r.details);
    this.type.set(t);
    try {
      const d = JSON.parse(r.details || '{}');
      if (d.purpose === 'buy' || d.purpose === 'rent') {
        this.purpose.set(d.purpose);
      } else if (r.budgetMin >= 500000) {
        this.purpose.set('buy');
      }
      if (d.propertyWorth) this.propertyWorth.set(Number(d.propertyWorth));
    } catch {}

    this.budgetMin.set(r.budgetMin);
    this.budgetMax.set(r.budgetMax);
    this.moveIn.set(r.moveIn);
    if (r.area && r.area.length >= 3) {
      this.area.set(r.area);
    }
    this.isEditing.set(true);
    this.step.set(3);
    this.error.set('');
  }

  cancelEdit() {
    this.isEditing.set(false);
    this.step.set(1);
  }

  async closeExisting() {
    const ok = await this.modal.confirm({
      title: this.i18n.t('Close Active Request?'),
      message: this.i18n.t('Close your active request? You will be able to post a new one immediately.'),
      confirmText: this.i18n.t('Close Request'),
      danger: true,
      icon: '🔒',
    });
    if (!ok) return;

    this.busy.set(true);
    this.error.set('');
    this.api.markFound().subscribe({
      next: () => {
        this.busy.set(false);
        this.existingReq.set(null);
        this.isEditing.set(false);
        this.successMessage.set(this.i18n.t('Your previous request was closed. You can now post a new one below!'));
      },
      error: e => {
        this.busy.set(false);
        this.error.set(this.i18n.err(e, 'Could not close request.'));
      },
    });
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.successMessage.set('');

    const detailsObj: any = {
      type: this.type(),
      purpose: this.purpose(),
      propertyWorth: this.propertyWorth(),
    };

    if (this.isEditing() && this.existingReq()) {
      const existing = this.existingReq()!;
      const existingRevisions = getRequestRevisions(existing.details);
      const newRevNum = existingRevisions.length + 1;
      const revisionRecord: RequestRevision = {
        revision: newRevNum,
        createdAt: new Date().toISOString(),
        note: `Updated ${this.purpose() === 'buy' ? 'buying budget' : 'rent budget'} to Rs ${Number(this.budgetMin()).toLocaleString()} – ${Number(this.budgetMax()).toLocaleString()}`,
        budgetMin: Number(this.budgetMin()),
        budgetMax: Number(this.budgetMax()),
        moveIn: String(this.moveIn()),
      };
      detailsObj.revisions = [...existingRevisions, revisionRecord];

      this.api.updateRequest({
        category: 'property',
        details: JSON.stringify(detailsObj),
        budgetMin: +this.budgetMin()!,
        budgetMax: +this.budgetMax()!,
        moveIn: String(this.moveIn()),
        area: this.area() ?? undefined,
      }).subscribe({
        next: () => {
          this.busy.set(false);
          this.router.navigate(['/my-request']);
        },
        error: e => {
          this.busy.set(false);
          this.error.set(this.i18n.err(e, 'Could not update request.'));
        },
      });
      return;
    }

    const initialRev: RequestRevision = {
      revision: 1,
      createdAt: new Date().toISOString(),
      note: 'Initial Post',
      budgetMin: Number(this.budgetMin()),
      budgetMax: Number(this.budgetMax()),
      moveIn: String(this.moveIn()),
    };
    detailsObj.revisions = [initialRev];

    this.api.createRequest({
      category: 'property',
      details: JSON.stringify(detailsObj),
      budgetMin: +this.budgetMin()!,
      budgetMax: +this.budgetMax()!,
      moveIn: String(this.moveIn()),
      area: this.area()!,
    }).subscribe({
      next: () => this.router.navigate(['/my-request']),
      error: e => {
        this.busy.set(false);
        const msg = this.i18n.err(e, 'Could not send. Please try again.');
        this.error.set(msg);
        if (msg.includes('limit') || msg.includes('open request') || e?.status === 409 || e?.status === 400) {
          this.checkExistingRequest();
          this.checkAdLimitStatus();
        }
      },
    });
  }
}
