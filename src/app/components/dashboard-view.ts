import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {
  computeMeterDailyDeltas,
  FLOOR_FINISH_LABELS,
  isValidOptionalMeterText,
  parseOptionalMeterInput,
  SCREED_LABELS,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';
import {HeatingCurveChart} from './heating-curve-chart';
import {SecondaryTelemetryChart} from './secondary-telemetry-chart';

function optionalMeterValidator(control: AbstractControl): ValidationErrors | null {
  return isValidOptionalMeterText(control.value as string) ? null : {invalidMeter: true};
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard-view',
  imports: [ReactiveFormsModule, MatIconModule, HeatingCurveChart, SecondaryTelemetryChart],
  template: `
    <div class="space-y-6" data-testid="dashboard-view">
      <!-- Workspace Context & Protocol Selector Toolbar -->
      <div class="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <label for="active-protocol-select" class="text-xs font-medium text-slate-500">
            Aktywny obiekt:
          </label>
          <select
            id="active-protocol-select"
            [value]="state.activeProtocol().id"
            (change)="onProtocolSelect($event)"
            class="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            @for (prot of state.protocols(); track prot.id) {
              <option [value]="prot.id" [selected]="prot.id === state.activeProtocol().id">{{ prot.name }}</option>
            }
          </select>
          <span class="hidden sm:inline text-xs text-slate-400" aria-hidden="true">·</span>
          <span class="text-xs text-slate-500">
            {{ screedLabel() }} · {{ finishLabel() }}
            @if (state.activeProtocol().hasMixingValve3D) {
              · Piec {{ state.activeProtocol().boilerTempC }}°C → Zawór 3D maks. {{ state.activeProtocol().mixingValveMaxTempC }}°C
            }
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              (click)="state.setActiveDay(state.activeProtocol().activeDay - 1)"
              [disabled]="state.activeProtocol().activeDay <= 1"
              aria-label="Poprzedni dzień cyklu"
              class="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <mat-icon class="!text-[16px] !w-4 !h-4">chevron_left</mat-icon>
            </button>
            <span class="px-3 py-1.5 text-xs font-mono font-semibold text-slate-900 border-x border-slate-200 tabular-nums whitespace-nowrap">
              Dzień {{ state.activeProtocol().activeDay }} / {{ state.activeSchedule().length }}
            </span>
            <button
              type="button"
              (click)="state.setActiveDay(state.activeProtocol().activeDay + 1)"
              [disabled]="state.activeProtocol().activeDay >= state.activeSchedule().length"
              aria-label="Następny dzień cyklu"
              class="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <mat-icon class="!text-[16px] !w-4 !h-4">chevron_right</mat-icon>
            </button>
          </div>

          <button
            type="button"
            (click)="state.triggerTestNotification()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">notifications_active</mat-icon>
            Testuj alert
          </button>

          <button
            type="button"
            (click)="state.showPrintModal.set(true)"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">print</mat-icon>
            Protokół PDF
          </button>
        </div>
      </div>

      <!-- 4-Column KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-strip">
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-medium text-slate-500">Bieżący etap procedury</div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-mono font-bold text-slate-900 tabular-nums">
              Dzień {{ state.activeDayStep().day }}
            </span>
            <span class="text-xs font-mono text-slate-400 tabular-nums">
              z {{ state.activeSchedule().length }}
            </span>
          </div>
          <div class="mt-1.5 text-xs text-slate-600 truncate">
            {{ state.activeDayStep().phaseLabel }} · {{ state.activeDayStep().date }}
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-medium text-slate-500">Temperatura zadana zasilania</div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-mono font-bold text-orange-600 tabular-nums">
              {{ state.activeDayStep().targetSupplyTempC.toFixed(1) }} °C
            </span>
            @if (state.activeDayStep().deltaFromPrevC !== 0) {
              <span class="text-xs font-mono text-slate-500 tabular-nums">
                ({{ state.activeDayStep().deltaFromPrevC > 0 ? '+' : '' }}{{ state.activeDayStep().deltaFromPrevC }}°C)
              </span>
            }
          </div>
          <div class="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            @if (state.latestMeasurement(); as latest) {
              Ostatni pomiar: {{ latest.supplyTempC.toFixed(1) }} °C (D{{ latest.day }})
            } @else {
              Brak zarejestrowanych pomiarów
            }
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-medium text-slate-500">Parametry hydrauliczne</div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-mono font-bold text-slate-900 tabular-nums">
              @if (latestDeltaT() !== null) {
                ΔT {{ latestDeltaT()!.toFixed(1) }} °C
              } @else {
                ΔT —
              }
            </span>
            @if (latestDeltaT2() !== null) {
              <span class="text-xs font-mono text-slate-500 tabular-nums">
                (S2: {{ latestDeltaT2()!.toFixed(1) }} °C)
              </span>
            }
          </div>
          <div class="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            @if (state.latestMeasurement(); as latest) {
              Ciśnienie: {{ latest.systemPressureBar.toFixed(2) }} bar
              @if (latest.boilerActualTempC !== null && latest.boilerActualTempC !== undefined) {
                · Piec: {{ latest.boilerActualTempC.toFixed(1) }}°C
              } @else {
                · Przepływ: {{ latest.flowRateLpm.toFixed(1) }} l/min
              }
            } @else {
              Ciśnienie robocze: oczekuje na wpis
            }
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-medium text-slate-500">Zgodność z PN-EN 1264-4</div>
          <div class="mt-2 flex items-baseline gap-2">
            @if (state.isNormCompliant()) {
              <span class="text-lg font-bold text-emerald-700">● Zgodny z normą</span>
            } @else {
              <span class="text-lg font-bold text-rose-700">✖ Wymaga korekty</span>
            }
          </div>
          <div class="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            Karencja: {{ state.curingDaysElapsed() }}/{{ state.minCuringDaysRequired() }} dni · Próg CM ≤ {{ state.activeCmLimit().toFixed(1) }}%
          </div>
        </div>
      </div>

      <!-- Main Split Workspace -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left 8 Cols: Dual Interactive Charts -->
        <div class="lg:col-span-8 space-y-6">
          <app-heating-curve-chart
            [schedule]="state.activeSchedule()"
            [measurements]="state.activeMeasurements()"
            [activeDay]="state.activeProtocol().activeDay"
            [mixingValveLimit]="state.activeProtocol().hasMixingValve3D ? state.activeProtocol().mixingValveMaxTempC : null"
            [boilerTemp]="state.activeProtocol().hasMixingValve3D ? state.activeProtocol().boilerTempC : null"
            (daySelected)="state.setActiveDay($event)"
          />

          <app-secondary-telemetry-chart
            [schedule]="state.activeSchedule()"
            [measurements]="state.activeMeasurements()"
            [cmLimit]="state.activeCmLimit()"
          />
        </div>

        <!-- Right 4 Cols: Action Instruction + Quick Measurement + Alerts -->
        <aside class="lg:col-span-4 space-y-6">
          <!-- Today's Normative Instruction -->
          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 class="text-sm font-semibold text-slate-900">
                Instrukcja na Dzień {{ state.activeDayStep().day }}
              </h2>
              <span class="text-xs font-mono font-semibold text-orange-700 tabular-nums">
                {{ state.activeDayStep().targetSupplyTempC }} °C
              </span>
            </div>
            <p class="mt-3 text-xs text-slate-700 leading-relaxed">
              {{ state.activeDayStep().instruction }}
            </p>
            @if (state.activeValidationIssues().length > 0) {
              <div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
                @for (issue of state.activeValidationIssues(); track issue.id) {
                  <div
                    class="text-xs p-2.5 rounded-lg border"
                    [class.bg-rose-50]="issue.severity === 'error'"
                    [class.border-rose-200]="issue.severity === 'error'"
                    [class.text-rose-900]="issue.severity === 'error'"
                    [class.bg-amber-50]="issue.severity === 'warning'"
                    [class.border-amber-200]="issue.severity === 'warning'"
                    [class.text-amber-900]="issue.severity === 'warning'"
                    [class.bg-slate-50]="issue.severity === 'info'"
                    [class.border-slate-200]="issue.severity === 'info'"
                    [class.text-slate-800]="issue.severity === 'info'"
                  >
                    <span class="font-semibold">{{ issue.title }}</span>
                  </div>
                }
              </div>
            }
          </section>

          <!-- Quick Measurement Logger -->
          <section class="bg-white border border-slate-200 rounded-xl p-5" data-testid="quick-log-panel">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 class="text-sm font-semibold text-slate-900">
                Zapisz pomiar dobowy (Dzień {{ state.activeProtocol().activeDay }})
              </h2>
            </div>

            <form [formGroup]="logForm" (ngSubmit)="submitLog()" class="mt-4 space-y-3 text-xs">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="ql-boiler" class="block font-medium text-slate-700 mb-1">
                    Temp. pieca [°C]
                  </label>
                  <input
                    id="ql-boiler"
                    type="number"
                    step="0.5"
                    formControlName="boilerActualTempC"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label for="ql-pressure" class="block font-medium text-slate-700 mb-1">
                    Ciśnienie [bar]
                  </label>
                  <input
                    id="ql-pressure"
                    type="number"
                    step="0.01"
                    formControlName="systemPressureBar"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label for="ql-supply" class="block font-medium text-slate-700 mb-1">
                    Zasilanie Sekcja 1 [°C]
                  </label>
                  <input
                    id="ql-supply"
                    type="number"
                    step="0.1"
                    formControlName="supplyTempC"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label for="ql-return" class="block font-medium text-slate-700 mb-1">
                    Powrót Sekcja 1 [°C]
                  </label>
                  <input
                    id="ql-return"
                    type="number"
                    step="0.1"
                    formControlName="returnTempC"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label for="ql-supply-2" class="block font-medium text-slate-700 mb-1">
                    Zasilanie Sekcja 2 [°C]
                  </label>
                  <input
                    id="ql-supply-2"
                    type="number"
                    step="0.1"
                    formControlName="supplyTemp2C"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label for="ql-return-2" class="block font-medium text-slate-700 mb-1">
                    Powrót Sekcja 2 [°C]
                  </label>
                  <input
                    id="ql-return-2"
                    type="number"
                    step="0.1"
                    formControlName="returnTemp2C"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label for="ql-room" class="block font-medium text-slate-700 mb-1">
                    Temp. w pokoju [°C]
                  </label>
                  <input
                    id="ql-room"
                    type="number"
                    step="0.1"
                    formControlName="roomTempC"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label for="ql-flow" class="block font-medium text-slate-700 mb-1">
                    Przepływ [l/min]
                  </label>
                  <input
                    id="ql-flow"
                    type="number"
                    step="0.1"
                    formControlName="flowRateLpm"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label for="ql-boiler-power" class="block font-medium text-slate-700 mb-1">
                    Licznik mocy pieca [W] <span class="text-slate-400 font-normal">(opcja)</span>
                  </label>
                  <input
                    id="ql-boiler-power"
                    type="text"
                    formControlName="boilerPowerCounterText"
                    placeholder="np. 1203W lub 1400 W"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    [class.border-rose-400]="logForm.controls.boilerPowerCounterText.invalid"
                  />
                </div>
                <div>
                  <label for="ql-gas-meter" class="block font-medium text-slate-700 mb-1">
                    Licznik gazu [m³] <span class="text-slate-400 font-normal">(opcja)</span>
                  </label>
                  <input
                    id="ql-gas-meter"
                    type="text"
                    formControlName="gasMeterText"
                    placeholder="np. 1245.5 m3"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    [class.border-rose-400]="logForm.controls.gasMeterText.invalid"
                  />
                </div>
              </div>

              @if (powerDeltaPreview() || gasDeltaPreview()) {
                <div
                  class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700 space-y-0.5 tabular-nums"
                  data-testid="meter-delta-preview"
                >
                  @if (powerDeltaPreview(); as pp) {
                    <div>{{ pp }}</div>
                  }
                  @if (gasDeltaPreview(); as gp) {
                    <div>{{ gp }}</div>
                  }
                </div>
              }

              <div>
                <label for="ql-cm" class="block font-medium text-slate-700 mb-1">
                  Wilgotność CM [%]
                </label>
                <input
                  id="ql-cm"
                  type="number"
                  step="0.05"
                  formControlName="cmMoisturePct"
                  placeholder="Opcjonalnie (np. przy odbiorze)"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div>
                <label for="ql-note" class="block font-medium text-slate-700 mb-1">
                  Uwagi z rozdzielacza / dylatacji
                </label>
                <input
                  id="ql-note"
                  type="text"
                  formControlName="note"
                  placeholder="np. Odpowietrzono pętle, brak rys..."
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <button
                type="submit"
                [disabled]="logForm.invalid"
                class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <mat-icon class="!text-[16px] !w-4 !h-4">add_task</mat-icon>
                Zapisz pomiar dla Dnia {{ state.activeProtocol().activeDay }}
              </button>
            </form>
          </section>

          <!-- Active Notifications Summary -->
          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 class="text-sm font-semibold text-slate-900">
                Aktywne powiadomienia ({{ state.unreadNotificationCount() }})
              </h2>
              <button
                type="button"
                (click)="state.setView('notifications')"
                class="text-xs font-medium text-orange-700 hover:underline"
              >
                Wszystkie →
              </button>
            </div>

            <div class="divide-y divide-slate-200 mt-1">
              @for (notif of topUnreadNotifications(); track notif.id) {
                <div class="py-3 space-y-1.5">
                  <div class="flex items-center justify-between gap-2 text-[11px]">
                    <span
                      class="font-semibold"
                      [class.text-rose-700]="notif.severity === 'critical'"
                      [class.text-amber-700]="notif.severity === 'warning'"
                      [class.text-sky-700]="notif.severity === 'info'"
                    >
                      {{ notif.scheduledTime }}
                    </span>
                    <button
                      type="button"
                      (click)="state.acknowledgeNotification(notif.id)"
                      class="text-slate-500 hover:text-emerald-700 font-medium"
                    >
                      Potwierdź
                    </button>
                  </div>
                  <p class="text-xs font-semibold text-slate-900">{{ notif.title }}</p>
                  <p class="text-xs text-slate-600 leading-relaxed">{{ notif.message }}</p>
                </div>
              } @empty {
                <p class="py-4 text-xs text-slate-500">
                  Brak niepotwierdzonych powiadomień dla bieżącego dnia.
                </p>
              }
            </div>
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class DashboardView {
  readonly state = inject(HeatingState);
  private readonly fb = inject(FormBuilder);

  readonly screedLabel = computed(() => SCREED_LABELS[this.state.activeProtocol().screedType]);
  readonly finishLabel = computed(() => FLOOR_FINISH_LABELS[this.state.activeProtocol().floorFinish]);

  readonly latestDeltaT = computed<number | null>(() => {
    const m = this.state.latestMeasurement();
    if (!m) return null;
    return Number((m.supplyTempC - m.returnTempC).toFixed(1));
  });

  readonly latestDeltaT2 = computed<number | null>(() => {
    const m = this.state.latestMeasurement();
    if (!m || m.supplyTemp2C == null || m.returnTemp2C == null) return null;
    return Number((m.supplyTemp2C - m.returnTemp2C).toFixed(1));
  });

  readonly topUnreadNotifications = computed(() =>
    this.state
      .activeNotifications()
      .filter((n) => !n.acknowledged)
      .slice(0, 3),
  );

  readonly logForm = this.fb.group({
    boilerActualTempC: this.fb.control<number | null>(60, [Validators.min(20), Validators.max(95)]),
    supplyTempC: this.fb.nonNullable.control(25, [Validators.required, Validators.min(10), Validators.max(75)]),
    returnTempC: this.fb.nonNullable.control(21, [Validators.required, Validators.min(10), Validators.max(70)]),
    supplyTemp2C: this.fb.control<number | null>(25, [Validators.min(10), Validators.max(75)]),
    returnTemp2C: this.fb.control<number | null>(21, [Validators.min(10), Validators.max(70)]),
    systemPressureBar: this.fb.nonNullable.control(1.7, [Validators.required, Validators.min(0.2), Validators.max(4)]),
    cmMoisturePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10)]),
    roomTempC: this.fb.nonNullable.control(20, [Validators.required, Validators.min(5), Validators.max(40)]),
    flowRateLpm: this.fb.nonNullable.control(1.8, [Validators.required, Validators.min(0.1), Validators.max(6)]),
    boilerPowerCounterText: this.fb.nonNullable.control('', [optionalMeterValidator]),
    gasMeterText: this.fb.nonNullable.control('', [optionalMeterValidator]),
    note: this.fb.nonNullable.control(''),
  });

  private readonly boilerPowerDraft = signal<string>('');
  private readonly gasMeterDraft = signal<string>('');

  readonly powerDeltaPreview = computed<string | null>(() => {
    const activeDay = this.state.activeProtocol().activeDay;
    const parsed = parseOptionalMeterInput(this.boilerPowerDraft());
    const measurements = this.state.activeMeasurements();

    if (parsed !== null && !Number.isNaN(parsed)) {
      const merged = [
        ...measurements.filter((m) => m.day !== activeDay),
        {
          ...(measurements.find((m) => m.day === activeDay) ?? {
            id: 'draft',
            day: activeDay,
            timestamp: '',
            supplyTempC: 25,
            returnTempC: 21,
            roomTempC: 20,
            systemPressureBar: 1.7,
            flowRateLpm: 1.8,
            ambientHumidityPct: 60,
            cmMoisturePct: null,
            note: '',
            operator: '',
          }),
          boilerPowerCounterW: parsed,
        },
      ];
      const deltas = computeMeterDailyDeltas(merged, (m) => m.boilerPowerCounterW);
      const entry = deltas.get(activeDay);
      if (!entry) return null;
      if (entry.isCounterReset) {
        return `Piec: odczyt ${parsed} W mniejszy niż poprzedni (reset licznika)`;
      }
      if (entry.dailyDelta !== null && entry.fromDay !== null && entry.toDay !== null) {
        if (entry.spanDays > 1) {
          return `Piec: +${entry.totalDelta?.toFixed(0)} W (D${entry.fromDay}–D${entry.toDay}) → śr. ${entry.dailyDelta.toFixed(1)} W/d`;
        }
        return `Piec: delta dobowa +${entry.dailyDelta.toFixed(1)} W/d (od D${entry.fromDay})`;
      }
      return `Piec: odczyt bazowy ${parsed} W (D${activeDay})`;
    }

    const deltas = computeMeterDailyDeltas(measurements, (m) => m.boilerPowerCounterW);
    const saved = deltas.get(activeDay);
    if (saved?.dailyDelta !== null && saved?.dailyDelta !== undefined && saved.fromDay !== null && saved.toDay !== null) {
      return `Piec (uśrednione D${saved.fromDay}–D${saved.toDay}): ≈ ${saved.dailyDelta.toFixed(1)} W/d`;
    }
    return null;
  });

  readonly gasDeltaPreview = computed<string | null>(() => {
    const activeDay = this.state.activeProtocol().activeDay;
    const parsed = parseOptionalMeterInput(this.gasMeterDraft());
    const measurements = this.state.activeMeasurements();

    if (parsed !== null && !Number.isNaN(parsed)) {
      const merged = [
        ...measurements.filter((m) => m.day !== activeDay),
        {
          ...(measurements.find((m) => m.day === activeDay) ?? {
            id: 'draft-gas',
            day: activeDay,
            timestamp: '',
            supplyTempC: 25,
            returnTempC: 21,
            roomTempC: 20,
            systemPressureBar: 1.7,
            flowRateLpm: 1.8,
            ambientHumidityPct: 60,
            cmMoisturePct: null,
            note: '',
            operator: '',
          }),
          gasMeterM3: parsed,
        },
      ];
      const deltas = computeMeterDailyDeltas(merged, (m) => m.gasMeterM3);
      const entry = deltas.get(activeDay);
      if (!entry) return null;
      if (entry.isCounterReset) {
        return `Gaz: odczyt ${parsed} m³ mniejszy niż poprzedni`;
      }
      if (entry.dailyDelta !== null && entry.fromDay !== null && entry.toDay !== null) {
        if (entry.spanDays > 1) {
          return `Gaz: +${entry.totalDelta?.toFixed(2)} m³ (D${entry.fromDay}–D${entry.toDay}) → śr. ${entry.dailyDelta.toFixed(2)} m³/d`;
        }
        return `Gaz: delta dobowa +${entry.dailyDelta.toFixed(2)} m³/d (od D${entry.fromDay})`;
      }
      return `Gaz: odczyt bazowy ${parsed.toFixed(2)} m³ (D${activeDay})`;
    }

    const deltas = computeMeterDailyDeltas(measurements, (m) => m.gasMeterM3);
    const saved = deltas.get(activeDay);
    if (saved?.dailyDelta !== null && saved?.dailyDelta !== undefined && saved.fromDay !== null && saved.toDay !== null) {
      return `Gaz (uśrednione D${saved.fromDay}–D${saved.toDay}): ≈ ${saved.dailyDelta.toFixed(2)} m³/d`;
    }
    return null;
  });

  constructor() {
    this.logForm.controls.boilerPowerCounterText.valueChanges.subscribe((val) => {
      this.boilerPowerDraft.set(val);
    });
    this.logForm.controls.gasMeterText.valueChanges.subscribe((val) => {
      this.gasMeterDraft.set(val);
    });

    effect(() => {
      const protocol = this.state.activeProtocol();
      const step = this.state.activeDayStep();
      const existing = this.state
        .activeMeasurements()
        .find((m) => m.day === protocol.activeDay);

      if (existing) {
        const powerText =
          existing.boilerPowerCounterW !== null && existing.boilerPowerCounterW !== undefined
            ? `${existing.boilerPowerCounterW} W`
            : '';
        const gasText =
          existing.gasMeterM3 !== null && existing.gasMeterM3 !== undefined
            ? String(existing.gasMeterM3)
            : '';
        this.boilerPowerDraft.set(powerText);
        this.gasMeterDraft.set(gasText);
        this.logForm.patchValue({
          boilerActualTempC: existing.boilerActualTempC ?? protocol.boilerTempC,
          supplyTempC: existing.supplyTempC,
          returnTempC: existing.returnTempC,
          supplyTemp2C: existing.supplyTemp2C ?? existing.supplyTempC,
          returnTemp2C: existing.returnTemp2C ?? existing.returnTempC,
          systemPressureBar: existing.systemPressureBar,
          cmMoisturePct: existing.cmMoisturePct,
          roomTempC: existing.roomTempC,
          flowRateLpm: existing.flowRateLpm,
          boilerPowerCounterText: powerText,
          gasMeterText: gasText,
          note: existing.note,
        });
      } else {
        const defaultRet = Math.max(15, Number((step.targetSupplyTempC - 4.5).toFixed(1)));
        this.boilerPowerDraft.set('');
        this.gasMeterDraft.set('');
        this.logForm.patchValue({
          boilerActualTempC: protocol.hasMixingValve3D ? protocol.boilerTempC : step.targetSupplyTempC,
          supplyTempC: step.targetSupplyTempC,
          returnTempC: defaultRet,
          supplyTemp2C: step.targetSupplyTempC,
          returnTemp2C: defaultRet,
          systemPressureBar: 1.7,
          cmMoisturePct: null,
          roomTempC: 21,
          flowRateLpm: 1.8,
          boilerPowerCounterText: '',
          gasMeterText: '',
          note: '',
        });
      }
    });
  }

  onProtocolSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.state.selectProtocol(select.value);
  }

  submitLog(): void {
    if (this.logForm.invalid) return;
    const v = this.logForm.getRawValue();
    const step = this.state.activeDayStep();
    const toOptionalNum = (val: number | null): number | null =>
      val !== null && String(val) !== '' && !Number.isNaN(Number(val)) ? Number(val) : null;

    const parsedPower = parseOptionalMeterInput(v.boilerPowerCounterText);
    const parsedGas = parseOptionalMeterInput(v.gasMeterText);

    this.state.logMeasurement({
      day: step.day,
      timestamp: `${step.date} 08:30`,
      boilerActualTempC: toOptionalNum(v.boilerActualTempC),
      supplyTempC: Number(v.supplyTempC),
      returnTempC: Number(v.returnTempC),
      supplyTemp2C: toOptionalNum(v.supplyTemp2C),
      returnTemp2C: toOptionalNum(v.returnTemp2C),
      roomTempC: Number(v.roomTempC),
      systemPressureBar: Number(v.systemPressureBar),
      flowRateLpm: Number(v.flowRateLpm),
      ambientHumidityPct: 62,
      cmMoisturePct: toOptionalNum(v.cmMoisturePct),
      boilerPowerCounterW: parsedPower !== null && !Number.isNaN(parsedPower) ? parsedPower : null,
      gasMeterM3: parsedGas !== null && !Number.isNaN(parsedGas) ? parsedGas : null,
      note: v.note,
      operator: 'Użytkownik',
    });
  }
}
