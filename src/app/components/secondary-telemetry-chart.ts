import {ChangeDetectionStrategy, Component, computed, input, signal} from '@angular/core';
import {DailyMeasurement, PlannedDayStep} from '../domain/heating-norm';

interface TelemetryRow {
  day: number;
  x: number;
  deltaT: number | null;
  deltaBarHeight: number;
  deltaBarY: number;
  pressureBar: number | null;
  pressureY: number | null;
  cmPct: number | null;
  cmY: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-secondary-telemetry-chart',
  template: `
    <section
      class="bg-white border border-slate-200 rounded-xl p-5"
      aria-labelledby="secondary-chart-title"
      data-testid="secondary-telemetry-chart"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 id="secondary-chart-title" class="text-base font-semibold text-slate-900">
            @if (mode() === 'hydraulics') {
              Stabilność hydrauliczna: ΔT oraz Ciśnienie w układzie
            } @else {
              Krzywa wysychania jastrychu (Wilgotność CM %)
            }
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            @if (mode() === 'hydraulics') {
              Różnica zasilanie/powrót (zalecane 3–8°C) i ciśnienie robocze (1.2–2.2 bar)
            } @else {
              Pomiary wilgotności metodą karbidową CM względem progu odbioru ({{ cmLimit().toFixed(1) }}%)
            }
          </p>
        </div>

        <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Tryb wykresu pomocniczego">
          <button
            type="button"
            (click)="mode.set('hydraulics')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="mode() === 'hydraulics'"
            [class.text-slate-900]="mode() === 'hydraulics'"
            [class.shadow-sm]="mode() === 'hydraulics'"
            [class.text-slate-600]="mode() !== 'hydraulics'"
          >
            ΔT i Ciśnienie
          </button>
          <button
            type="button"
            (click)="mode.set('moisture')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="mode() === 'moisture'"
            [class.text-slate-900]="mode() === 'moisture'"
            [class.shadow-sm]="mode() === 'moisture'"
            [class.text-slate-600]="mode() !== 'moisture'"
          >
            Wilgotność CM %
          </button>
        </div>
      </div>

      @if (measurements().length === 0) {
        <div class="py-12 text-center text-sm text-slate-500">
          Brak zarejestrowanych pomiarów dla tego protokołu. Dodaj pierwszy pomiar po prawej stronie, aby zobaczyć wykres.
        </div>
      } @else {
        <div class="mt-4">
          <svg
            class="w-full h-auto overflow-visible"
            viewBox="0 0 860 220"
            role="img"
            [attr.aria-label]="mode() === 'hydraulics' ? 'Wykres delta T i ciśnienia' : 'Wykres wilgotności CM'"
          >
            @if (mode() === 'hydraulics') {
              <!-- Safe pressure band 1.2 - 2.2 bar -->
              <rect
                [attr.x]="padLeft"
                [attr.y]="pressureToY(2.2)"
                [attr.width]="plotWidth"
                [attr.height]="pressureToY(1.2) - pressureToY(2.2)"
                class="fill-sky-50/70"
              />
              <text
                [attr.x]="padLeft + 8"
                [attr.y]="pressureToY(2.2) + 13"
                class="fill-sky-700 text-[10px] font-mono"
              >
                Zakres bezpieczny ciśnienia: 1.2 – 2.2 bar
              </text>

              <!-- Horizontal Grid -->
              @for (tick of deltaTicks; track tick.val) {
                <line
                  [attr.x1]="padLeft"
                  [attr.y1]="tick.y"
                  [attr.x2]="width - padRight"
                  [attr.y2]="tick.y"
                  stroke="#e2e8f0"
                  stroke-width="1"
                />
                <text
                  [attr.x]="padLeft - 8"
                  [attr.y]="tick.y + 4"
                  text-anchor="end"
                  class="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {{ tick.val }}°C
                </text>
              }

              <!-- Right Axis Pressure Labels -->
              @for (pTick of pressureTicks; track pTick.val) {
                <text
                  [attr.x]="width - padRight + 8"
                  [attr.y]="pTick.y + 4"
                  text-anchor="start"
                  class="fill-sky-700 text-[10px] font-mono tabular-nums"
                >
                  {{ pTick.val.toFixed(1) }} bar
                </text>
              }

              <!-- Delta T Bars -->
              @for (row of rows(); track row.day) {
                @if (row.deltaT !== null) {
                  <rect
                    [attr.x]="row.x - 10"
                    [attr.y]="row.deltaBarY"
                    width="20"
                    [attr.height]="row.deltaBarHeight"
                    rx="3"
                    [attr.fill]="row.deltaT > 10 ? '#dc2626' : '#f59e0b'"
                    opacity="0.75"
                  />
                  <text
                    [attr.x]="row.x"
                    [attr.y]="row.deltaBarY - 4"
                    text-anchor="middle"
                    class="fill-slate-700 text-[10px] font-mono tabular-nums"
                  >
                    {{ row.deltaT.toFixed(1) }}°
                  </text>
                }
                <text
                  [attr.x]="row.x"
                  [attr.y]="padTop + plotHeight + 16"
                  text-anchor="middle"
                  class="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  D{{ row.day }}
                </text>
              }

              <!-- Pressure Line -->
              @if (pressureLinePath()) {
                <path
                  [attr.d]="pressureLinePath()"
                  fill="none"
                  stroke="#0284c7"
                  stroke-width="2.25"
                />
              }
              @for (row of rows(); track row.day) {
                @if (row.pressureY !== null) {
                  <circle
                    [attr.cx]="row.x"
                    [attr.cy]="row.pressureY"
                    r="4"
                    fill="#0284c7"
                    stroke="#ffffff"
                    stroke-width="1.5"
                  />
                }
              }
            } @else {
              <!-- CM Moisture Mode -->
              @for (tick of cmTicks(); track tick.val) {
                <line
                  [attr.x1]="padLeft"
                  [attr.y1]="tick.y"
                  [attr.x2]="width - padRight"
                  [attr.y2]="tick.y"
                  stroke="#e2e8f0"
                  stroke-width="1"
                />
                <text
                  [attr.x]="padLeft - 8"
                  [attr.y]="tick.y + 4"
                  text-anchor="end"
                  class="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {{ tick.val.toFixed(1) }}%
                </text>
              }

              <!-- Normative Threshold Line -->
              <line
                [attr.x1]="padLeft"
                [attr.y1]="cmToY(cmLimit())"
                [attr.x2]="width - padRight"
                [attr.y2]="cmToY(cmLimit())"
                stroke="#16a34a"
                stroke-width="1.5"
                stroke-dasharray="5 3"
              />
              <text
                [attr.x]="width - padRight - 4"
                [attr.y]="cmToY(cmLimit()) - 6"
                text-anchor="end"
                class="fill-emerald-700 text-[10px] font-mono font-semibold"
              >
                Próg odbioru CM ≤ {{ cmLimit().toFixed(1) }}%
              </text>

              <!-- Day axis labels -->
              @for (row of rows(); track row.day) {
                <text
                  [attr.x]="row.x"
                  [attr.y]="padTop + plotHeight + 16"
                  text-anchor="middle"
                  class="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  D{{ row.day }}
                </text>
              }

              @if (cmLinePath()) {
                <path
                  [attr.d]="cmLinePath()"
                  fill="none"
                  stroke="#0f172a"
                  stroke-width="2.25"
                />
              }

              @for (row of rows(); track row.day) {
                @if (row.cmY !== null && row.cmPct !== null) {
                  <circle
                    [attr.cx]="row.x"
                    [attr.cy]="row.cmY"
                    r="5"
                    [attr.fill]="row.cmPct <= cmLimit() ? '#16a34a' : '#ea580c'"
                    stroke="#ffffff"
                    stroke-width="1.5"
                  />
                  <text
                    [attr.x]="row.x"
                    [attr.y]="row.cmY - 9"
                    text-anchor="middle"
                    class="fill-slate-800 text-[10px] font-mono font-semibold tabular-nums"
                  >
                    {{ row.cmPct.toFixed(2) }}%
                  </text>
                }
              }
            }
          </svg>

          @if (mode() === 'moisture' && cmCount() === 0) {
            <p class="mt-2 text-xs text-slate-500 text-center">
              Brak wpisanych pomiarów wilgotności metodą CM. Uzupełnij pole „Wilgotność CM (%)” w formularzu pomiaru.
            </p>
          }
        </div>
      }
    </section>
  `,
})
export class SecondaryTelemetryChart {
  readonly schedule = input.required<PlannedDayStep[]>();
  readonly measurements = input.required<DailyMeasurement[]>();
  readonly cmLimit = input.required<number>();

  readonly mode = signal<'hydraulics' | 'moisture'>('hydraulics');

  readonly width = 860;
  readonly height = 220;
  readonly padLeft = 48;
  readonly padRight = 54;
  readonly padTop = 18;
  readonly padBottom = 30;
  readonly plotWidth = this.width - this.padLeft - this.padRight;
  readonly plotHeight = this.height - this.padTop - this.padBottom;

  readonly deltaTicks = [0, 4, 8, 12].map((val) => ({
    val,
    y: this.deltaToY(val),
  }));

  readonly pressureTicks = [0.5, 1.5, 2.5, 3.0].map((val) => ({
    val,
    y: this.pressureToY(val),
  }));

  readonly cmTicks = computed(() => {
    const maxVal = this.cmMaxScale();
    const step = maxVal / 4;
    return [0, step, step * 2, step * 3, maxVal].map((val) => ({
      val,
      y: this.cmToY(val),
    }));
  });

  readonly cmMaxScale = computed(() => {
    const values = this.measurements()
      .map((m) => m.cmMoisturePct)
      .filter((v): v is number => v !== null);
    const maxMeasured = values.length > 0 ? Math.max(...values) : 0;
    return Math.max(4.0, Math.ceil(Math.max(maxMeasured, this.cmLimit() + 1) * 2) / 2);
  });

  readonly cmCount = computed(() => {
    return this.measurements().filter((m) => m.cmMoisturePct !== null).length;
  });

  readonly rows = computed<TelemetryRow[]>(() => {
    const steps = this.schedule();
    const measMap = new Map<number, DailyMeasurement>();
    for (const m of this.measurements()) {
      measMap.set(m.day, m);
    }
    const n = steps.length;
    const baseBottom = this.padTop + this.plotHeight;

    return steps.map((s, idx) => {
      const x =
        n <= 1
          ? this.padLeft + this.plotWidth / 2
          : this.padLeft + (idx / (n - 1)) * this.plotWidth;
      const m = measMap.get(s.day);
      const deltaT = m ? Number(Math.max(0, m.supplyTempC - m.returnTempC).toFixed(1)) : null;
      const deltaBarY = deltaT !== null ? this.deltaToY(deltaT) : baseBottom;
      const deltaBarHeight = deltaT !== null ? Math.max(2, baseBottom - deltaBarY) : 0;
      const pressureBar = m ? m.systemPressureBar : null;
      const cmPct = m && m.cmMoisturePct !== null ? m.cmMoisturePct : null;

      return {
        day: s.day,
        x,
        deltaT,
        deltaBarHeight,
        deltaBarY,
        pressureBar,
        pressureY: pressureBar !== null ? this.pressureToY(pressureBar) : null,
        cmPct,
        cmY: cmPct !== null ? this.cmToY(cmPct) : null,
      };
    });
  });

  readonly pressureLinePath = computed(() => {
    const pts = this.rows().filter((r) => r.pressureY !== null);
    if (pts.length < 2) return '';
    return pts
      .map((r, idx) => `${idx === 0 ? 'M' : 'L'} ${r.x.toFixed(1)} ${(r.pressureY ?? 0).toFixed(1)}`)
      .join(' ');
  });

  readonly cmLinePath = computed(() => {
    const pts = this.rows().filter((r) => r.cmY !== null);
    if (pts.length < 2) return '';
    return pts
      .map((r, idx) => `${idx === 0 ? 'M' : 'L'} ${r.x.toFixed(1)} ${(r.cmY ?? 0).toFixed(1)}`)
      .join(' ');
  });

  deltaToY(val: number): number {
    const clamped = Math.max(0, Math.min(14, val));
    const ratio = clamped / 14;
    return this.padTop + this.plotHeight - ratio * this.plotHeight;
  }

  pressureToY(bar: number): number {
    const clamped = Math.max(0.5, Math.min(3.2, bar));
    const ratio = (clamped - 0.5) / 2.7;
    return this.padTop + this.plotHeight - ratio * this.plotHeight;
  }

  cmToY(pct: number): number {
    const maxVal = this.cmMaxScale();
    const clamped = Math.max(0, Math.min(maxVal, pct));
    const ratio = clamped / maxVal;
    return this.padTop + this.plotHeight - ratio * this.plotHeight;
  }
}
