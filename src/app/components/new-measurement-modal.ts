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
  isValidOptionalMeterText,
  parseOptionalMeterInput,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';

function optionalMeterValidator(control: AbstractControl): ValidationErrors | null {
  return isValidOptionalMeterText(control.value as string) ? null : {invalidMeter: true};
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-new-measurement-modal',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div
      class="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-measurement-title"
      data-testid="new-measurement-modal"
    >
      <div class="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 id="new-measurement-title" class="text-base font-bold text-slate-900">
              Nowy pomiar dobowy · {{ state.activeProtocol().name }}
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Odczyty kotła, obu sekcji (S1 / S2) oraz opcjonalne stany liczników mocy i gazu.
            </p>
          </div>
          <button
            type="button"
            (click)="state.showNewMeasurementModal.set(false)"
            aria-label="Zamknij okno nowego pomiaru"
            class="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            data-testid="new-measurement-close"
          >
            <mat-icon class="!text-[20px] !w-5 !h-5">close</mat-icon>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="p-6 space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2">
              <label for="nm-day" class="block font-medium text-slate-700 mb-1">
                Dzień procedury
              </label>
              <select
                id="nm-day"
                formControlName="day"
                (change)="onDayChange($event)"
                class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                @for (step of state.activeSchedule(); track step.day) {
                  <option [value]="step.day">
                    Dzień {{ step.day }} ({{ step.date }}) · Zadana {{ step.targetSupplyTempC }}°C
                  </option>
                }
              </select>
            </div>

            <div>
              <label for="nm-boiler" class="block font-medium text-slate-700 mb-1">
                Temp. pieca [°C]
              </label>
              <input
                id="nm-boiler"
                type="number"
                step="0.5"
                formControlName="boilerActualTempC"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label for="nm-pressure" class="block font-medium text-slate-700 mb-1">
                Ciśnienie [bar]
              </label>
              <input
                id="nm-pressure"
                type="number"
                step="0.01"
                formControlName="systemPressureBar"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div>
              <label for="nm-supply" class="block font-medium text-slate-700 mb-1">
                Zasilanie Sekcja 1 [°C]
              </label>
              <input
                id="nm-supply"
                type="number"
                step="0.1"
                formControlName="supplyTempC"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label for="nm-return" class="block font-medium text-slate-700 mb-1">
                Powrót Sekcja 1 [°C]
              </label>
              <input
                id="nm-return"
                type="number"
                step="0.1"
                formControlName="returnTempC"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div>
              <label for="nm-supply-2" class="block font-medium text-slate-700 mb-1">
                Zasilanie Sekcja 2 [°C]
              </label>
              <input
                id="nm-supply-2"
                type="number"
                step="0.1"
                formControlName="supplyTemp2C"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label for="nm-return-2" class="block font-medium text-slate-700 mb-1">
                Powrót Sekcja 2 [°C]
              </label>
              <input
                id="nm-return-2"
                type="number"
                step="0.1"
                formControlName="returnTemp2C"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div>
              <label for="nm-room" class="block font-medium text-slate-700 mb-1">
                Temp. w pokoju [°C]
              </label>
              <input
                id="nm-room"
                type="number"
                step="0.1"
                formControlName="roomTempC"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label for="nm-flow" class="block font-medium text-slate-700 mb-1">
                Przepływ [l/min]
              </label>
              <input
                id="nm-flow"
                type="number"
                step="0.1"
                formControlName="flowRateLpm"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div>
              <label for="nm-boiler-power" class="block font-medium text-slate-700 mb-1">
                Licznik mocy pieca [W] <span class="text-slate-400 font-normal">(opcja)</span>
              </label>
              <input
                id="nm-boiler-power"
                type="text"
                formControlName="boilerPowerCounterText"
                placeholder="np. 1203W lub 1400 W"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                [class.border-rose-400]="form.controls.boilerPowerCounterText.invalid"
              />
            </div>
            <div>
              <label for="nm-gas-meter" class="block font-medium text-slate-700 mb-1">
                Licznik gazu [m³] <span class="text-slate-400 font-normal">(opcja)</span>
              </label>
              <input
                id="nm-gas-meter"
                type="text"
                formControlName="gasMeterText"
                placeholder="np. 1245.5 m3"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                [class.border-rose-400]="form.controls.gasMeterText.invalid"
              />
            </div>
          </div>

          @if (powerDeltaPreview() || gasDeltaPreview()) {
            <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700 space-y-0.5 tabular-nums">
              @if (powerDeltaPreview(); as pp) {
                <div>{{ pp }}</div>
              }
              @if (gasDeltaPreview(); as gp) {
                <div>{{ gp }}</div>
              }
            </div>
          }

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="nm-cm" class="block font-medium text-slate-700 mb-1">
                Wilgotność CM [%] <span class="text-slate-400 font-normal">(opcja)</span>
              </label>
              <input
                id="nm-cm"
                type="number"
                step="0.05"
                formControlName="cmMoisturePct"
                placeholder="np. przy odbiorze"
                class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label for="nm-note" class="block font-medium text-slate-700 mb-1">
                Uwagi z rozdzielacza / dylatacji
              </label>
              <input
                id="nm-note"
                type="text"
                formControlName="note"
                placeholder="np. Odpowietrzono pętle..."
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>

          <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              (click)="state.showNewMeasurementModal.set(false)"
              class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              [disabled]="form.invalid"
              class="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              data-testid="new-measurement-submit"
            >
              <mat-icon class="!text-[16px] !w-4 !h-4">add_task</mat-icon>
              Zapisz pomiar (Dzień {{ selectedDay() }})
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class NewMeasurementModal {
  readonly state = inject(HeatingState);
  private readonly fb = inject(FormBuilder);

  readonly selectedDay = signal<number>(this.state.activeProtocol().activeDay);
  private readonly boilerPowerDraft = signal<string>('');
  private readonly gasMeterDraft = signal<string>('');

  readonly form = this.fb.group({
    day: this.fb.nonNullable.control(this.state.activeProtocol().activeDay, [Validators.required]),
    boilerActualTempC: this.fb.control<number | null>(60, [Validators.min(20), Validators.max(95)]),
    supplyTempC: this.fb.nonNullable.control(25, [Validators.required, Validators.min(10), Validators.max(75)]),
    returnTempC: this.fb.nonNullable.control(21, [Validators.required, Validators.min(10), Validators.max(70)]),
    supplyTemp2C: this.fb.control<number | null>(25, [Validators.min(10), Validators.max(75)]),
    returnTemp2C: this.fb.control<number | null>(21, [Validators.min(10), Validators.max(70)]),
    systemPressureBar: this.fb.nonNullable.control(1.7, [Validators.required, Validators.min(0.2), Validators.max(4)]),
    cmMoisturePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10)]),
    roomTempC: this.fb.nonNullable.control(21, [Validators.required, Validators.min(5), Validators.max(40)]),
    flowRateLpm: this.fb.nonNullable.control(1.8, [Validators.required, Validators.min(0.1), Validators.max(6)]),
    boilerPowerCounterText: this.fb.nonNullable.control('', [optionalMeterValidator]),
    gasMeterText: this.fb.nonNullable.control('', [optionalMeterValidator]),
    note: this.fb.nonNullable.control(''),
  });

  readonly powerDeltaPreview = computed<string | null>(() => {
    const day = this.selectedDay();
    const parsed = parseOptionalMeterInput(this.boilerPowerDraft());
    const measurements = this.state.activeMeasurements();

    if (parsed !== null && !Number.isNaN(parsed)) {
      const merged = [
        ...measurements.filter((m) => m.day !== day),
        {
          ...(measurements.find((m) => m.day === day) ?? {
            id: 'draft-modal-p',
            day,
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
      const entry = computeMeterDailyDeltas(merged, (m) => m.boilerPowerCounterW).get(day);
      if (!entry) return null;
      if (entry.isCounterReset) return `Piec: odczyt ${parsed} W mniejszy niż poprzedni`;
      if (entry.dailyDelta !== null && entry.fromDay !== null && entry.toDay !== null) {
        return entry.spanDays > 1
          ? `Piec: +${entry.totalDelta?.toFixed(0)} W (D${entry.fromDay}–D${entry.toDay}) → śr. ${entry.dailyDelta.toFixed(1)} W/d`
          : `Piec: delta dobowa +${entry.dailyDelta.toFixed(1)} W/d (od D${entry.fromDay})`;
      }
      return `Piec: odczyt bazowy ${parsed} W (D${day})`;
    }
    return null;
  });

  readonly gasDeltaPreview = computed<string | null>(() => {
    const day = this.selectedDay();
    const parsed = parseOptionalMeterInput(this.gasMeterDraft());
    const measurements = this.state.activeMeasurements();

    if (parsed !== null && !Number.isNaN(parsed)) {
      const merged = [
        ...measurements.filter((m) => m.day !== day),
        {
          ...(measurements.find((m) => m.day === day) ?? {
            id: 'draft-modal-g',
            day,
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
      const entry = computeMeterDailyDeltas(merged, (m) => m.gasMeterM3).get(day);
      if (!entry) return null;
      if (entry.isCounterReset) return `Gaz: odczyt ${parsed} m³ mniejszy niż poprzedni`;
      if (entry.dailyDelta !== null && entry.fromDay !== null && entry.toDay !== null) {
        return entry.spanDays > 1
          ? `Gaz: +${entry.totalDelta?.toFixed(2)} m³ (D${entry.fromDay}–D${entry.toDay}) → śr. ${entry.dailyDelta.toFixed(2)} m³/d`
          : `Gaz: delta dobowa +${entry.dailyDelta.toFixed(2)} m³/d (od D${entry.fromDay})`;
      }
      return `Gaz: odczyt bazowy ${parsed.toFixed(2)} m³ (D${day})`;
    }
    return null;
  });

  constructor() {
    this.form.controls.boilerPowerCounterText.valueChanges.subscribe((val) => {
      this.boilerPowerDraft.set(val);
    });
    this.form.controls.gasMeterText.valueChanges.subscribe((val) => {
      this.gasMeterDraft.set(val);
    });

    effect(() => {
      const day = this.selectedDay();
      this.populateForDay(day);
    });
  }

  onDayChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const nextDay = Number(select.value);
    if (Number.isFinite(nextDay)) {
      this.selectedDay.set(nextDay);
    }
  }

  private populateForDay(day: number): void {
    const protocol = this.state.activeProtocol();
    const schedule = this.state.activeSchedule();
    const step = schedule.find((s) => s.day === day) ?? schedule[0];
    const existing = this.state.activeMeasurements().find((m) => m.day === day);

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
      this.form.patchValue(
        {
          day,
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
        },
        {emitEvent: false},
      );
    } else if (step) {
      const defaultRet = Math.max(15, Number((step.targetSupplyTempC - 4.5).toFixed(1)));
      this.boilerPowerDraft.set('');
      this.gasMeterDraft.set('');
      this.form.patchValue(
        {
          day,
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
        },
        {emitEvent: false},
      );
    }
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const day = Number(v.day);
    const schedule = this.state.activeSchedule();
    const step = schedule.find((s) => s.day === day) ?? schedule[0];
    const toOptionalNum = (val: number | null): number | null =>
      val !== null && String(val) !== '' && !Number.isNaN(Number(val)) ? Number(val) : null;

    const parsedPower = parseOptionalMeterInput(v.boilerPowerCounterText);
    const parsedGas = parseOptionalMeterInput(v.gasMeterText);

    this.state.setActiveDay(day);
    this.state.logMeasurement({
      day,
      timestamp: `${step?.date ?? ''} 08:30`.trim(),
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
    this.state.showNewMeasurementModal.set(false);
  }
}
