import {ChangeDetectionStrategy, Component, computed, input, output, signal} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {DailyMeasurement, HeatingPhase, PlannedDayStep} from '../domain/heating-norm';

interface PhaseBand {
  phase: HeatingPhase;
  label: string;
  startX: number;
  width: number;
  fillClass: string;
}

interface ChartPoint {
  day: number;
  date: string;
  shortDate: string;
  x: number;
  targetY: number;
  targetTemp: number;
  phaseLabel: string;
  instruction: string;
  actualSupply: number | null;
  actualSupplyY: number | null;
  actualReturn: number | null;
  actualReturnY: number | null;
  roomTemp: number | null;
  roomTempY: number | null;
  pressureBar: number | null;
  deviation: number | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-heating-curve-chart',
  imports: [MatIconModule],
  template: `
    <section
      class="bg-white border border-slate-200 rounded-xl p-5"
      aria-labelledby="main-chart-title"
      data-testid="heating-curve-chart"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 id="main-chart-title" class="text-base font-semibold text-slate-900">
            Krzywa wygrzewania PN-EN 1264-4 (Zadana vs Rzeczywista)
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Najedź na wykres, aby odczytać parametry dobowe · Kliknij dzień, aby ustawić podgląd
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Zakres osi czasu">
            <button
              type="button"
              (click)="rangeMode.set('all')"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
              [class.bg-white]="rangeMode() === 'all'"
              [class.text-slate-900]="rangeMode() === 'all'"
              [class.shadow-sm]="rangeMode() === 'all'"
              [class.text-slate-600]="rangeMode() !== 'all'"
            >
              Cały cykl ({{ schedule().length }} dni)
            </button>
            <button
              type="button"
              (click)="rangeMode.set('until_active')"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
              [class.bg-white]="rangeMode() === 'until_active'"
              [class.text-slate-900]="rangeMode() === 'until_active'"
              [class.shadow-sm]="rangeMode() === 'until_active'"
              [class.text-slate-600]="rangeMode() !== 'until_active'"
            >
              Do dnia {{ activeDay() }}
            </button>
          </div>

          <button
            type="button"
            (click)="showReturn.set(!showReturn())"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0"
            [class.border-sky-300]="showReturn()"
            [class.bg-sky-50]="showReturn()"
            [class.text-sky-800]="showReturn()"
            [class.border-slate-200]="!showReturn()"
            [class.text-slate-600]="!showReturn()"
          >
            <span class="w-2.5 h-0.5 bg-sky-600 inline-block"></span>
            Powrót
          </button>

          <button
            type="button"
            (click)="showRoom.set(!showRoom())"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0"
            [class.border-slate-400]="showRoom()"
            [class.bg-slate-100]="showRoom()"
            [class.text-slate-900]="showRoom()"
            [class.border-slate-200]="!showRoom()"
            [class.text-slate-600]="!showRoom()"
          >
            <span class="w-2.5 h-0.5 bg-slate-500 inline-block"></span>
            Pomieszczenie
          </button>
        </div>
      </div>

      <!-- Hover / Active Day HUD Readout -->
      @if (inspectedPoint(); as pt) {
        <div
          class="mt-4 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs"
          data-testid="chart-hud-readout"
        >
          <div class="flex flex-wrap items-center gap-2 text-slate-700">
            <span class="font-mono font-semibold text-slate-900 tabular-nums">
              Dzień {{ pt.day }}
            </span>
            <span aria-hidden="true" class="text-slate-300">·</span>
            <span class="font-mono text-slate-500 tabular-nums">{{ pt.date }}</span>
            <span aria-hidden="true" class="text-slate-300">·</span>
            <span class="font-medium text-slate-700">{{ pt.phaseLabel }}</span>
          </div>

          <div class="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            <span class="text-orange-700 font-semibold">
              Zadana: {{ pt.targetTemp.toFixed(1) }} °C
            </span>
            @if (pt.actualSupply !== null) {
              <span class="text-slate-900 font-semibold">
                Zasilanie: {{ pt.actualSupply.toFixed(1) }} °C
              </span>
            } @else {
              <span class="text-slate-400">Zasilanie: —</span>
            }
            @if (pt.actualReturn !== null) {
              <span class="text-sky-700">
                Powrót: {{ pt.actualReturn.toFixed(1) }} °C
              </span>
            }
            @if (pt.deviation !== null) {
              <span
                [class.text-rose-600]="MathAbs(pt.deviation) > 2.5"
                [class.text-emerald-700]="MathAbs(pt.deviation) <= 2.5"
              >
                Odchyłka: {{ pt.deviation >= 0 ? '+' : '' }}{{ pt.deviation.toFixed(1) }} °C
              </span>
            }
          </div>
        </div>
      }

      <!-- SVG Viewport -->
      <div class="mt-4 relative select-none">
        <svg
          class="w-full h-auto cursor-crosshair overflow-visible focus:outline-2 focus:outline-orange-600 rounded"
          viewBox="0 0 860 340"
          role="img"
          tabindex="0"
          aria-label="Wykres krzywej wygrzewania podłogówki — użyj strzałek lewo/prawo aby zmienić dzień"
          (mousemove)="onSvgPointerMove($event)"
          (mouseleave)="hoveredDay.set(null)"
          (click)="onSvgClick($event)"
          (keydown.arrowleft)="stepSelectedDay(-1)"
          (keydown.arrowright)="stepSelectedDay(1)"
        >
          <defs>
            <linearGradient id="targetCurveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ea580c" stop-opacity="0.14" />
              <stop offset="100%" stop-color="#ea580c" stop-opacity="0.01" />
            </linearGradient>
          </defs>

          <!-- Phase Bands -->
          @for (band of phaseBands(); track band.phase + '-' + band.startX) {
            <rect
              [attr.x]="band.startX"
              [attr.y]="padTop"
              [attr.width]="band.width"
              [attr.height]="plotHeight"
              [attr.class]="band.fillClass"
            />
            @if (band.width > 64) {
              <text
                [attr.x]="band.startX + 8"
                [attr.y]="padTop + 15"
                class="fill-slate-400 text-[10px] font-medium"
              >
                {{ band.label }}
              </text>
            }
          }

          <!-- Horizontal Temperature Grid -->
          @for (tick of yTicks; track tick.temp) {
            <line
              [attr.x1]="padLeft"
              [attr.y1]="tick.y"
              [attr.x2]="width - padRight"
              [attr.y2]="tick.y"
              stroke="#e2e8f0"
              stroke-width="1"
            />
            <text
              [attr.x]="padLeft - 10"
              [attr.y]="tick.y + 4"
              text-anchor="end"
              class="fill-slate-500 text-[11px] font-mono tabular-nums"
            >
              {{ tick.temp }}°
            </text>
          }

          <!-- 55C Normative Max Reference Line -->
          <line
            [attr.x1]="padLeft"
            [attr.y1]="normLimitY"
            [attr.x2]="width - padRight"
            [attr.y2]="normLimitY"
            stroke="#dc2626"
            stroke-width="1"
            stroke-dasharray="4 4"
            opacity="0.65"
          />
          <text
            [attr.x]="width - padRight - 4"
            [attr.y]="normLimitY - 5"
            text-anchor="end"
            class="fill-rose-600 text-[10px] font-mono"
          >
            Maks. limit normy 55°C
          </text>

          <!-- 3D Mixing Valve Limit Reference Line -->
          @if (mixingValveLimitY(); as valveY) {
            <line
              [attr.x1]="padLeft"
              [attr.y1]="valveY"
              [attr.x2]="width - padRight"
              [attr.y2]="valveY"
              stroke="#d97706"
              stroke-width="1.5"
              stroke-dasharray="6 4"
              opacity="0.85"
            />
            <text
              [attr.x]="width - padRight - 4"
              [attr.y]="valveY - 5"
              text-anchor="end"
              class="fill-amber-700 text-[10px] font-mono font-semibold"
            >
              Limit zaworu 3D: {{ mixingValveLimit() }}°C @if (boilerTemp(); as bTemp) { (Piec: {{ bTemp }}°C) }
            </text>
          }

          <!-- Vertical Day Grid & X-axis labels -->
          @for (pt of chartPoints(); track pt.day) {
            <line
              [attr.x1]="pt.x"
              [attr.y1]="padTop"
              [attr.x2]="pt.x"
              [attr.y2]="padTop + plotHeight"
              stroke="#f1f5f9"
              stroke-width="1"
            />
            @if (shouldShowDayTick(pt.day)) {
              <text
                [attr.x]="pt.x"
                [attr.y]="padTop + plotHeight + 18"
                text-anchor="middle"
                class="fill-slate-600 text-[11px] font-mono tabular-nums"
                [class.font-bold]="pt.day === activeDay()"
                [class.fill-orange-600]="pt.day === activeDay()"
              >
                D{{ pt.day }}
              </text>
              <text
                [attr.x]="pt.x"
                [attr.y]="padTop + plotHeight + 32"
                text-anchor="middle"
                class="fill-slate-400 text-[10px] font-mono tabular-nums"
              >
                {{ pt.shortDate }}
              </text>
            }
          }

          <!-- Active Day Marker -->
          @if (activeDayX(); as actX) {
            <line
              [attr.x1]="actX"
              [attr.y1]="padTop"
              [attr.x2]="actX"
              [attr.y2]="padTop + plotHeight"
              stroke="#ea580c"
              stroke-width="1.5"
              stroke-dasharray="3 3"
              opacity="0.85"
            />
          }

          <!-- Target Area + Line -->
          @if (targetAreaPath()) {
            <path [attr.d]="targetAreaPath()" fill="url(#targetCurveFill)" />
          }
          @if (targetLinePath()) {
            <path
              [attr.d]="targetLinePath()"
              fill="none"
              stroke="#ea580c"
              stroke-width="2.75"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          }

          <!-- Room Temp Series -->
          @if (showRoom() && roomLinePath()) {
            <path
              [attr.d]="roomLinePath()"
              fill="none"
              stroke="#64748b"
              stroke-width="1.5"
              stroke-dasharray="2 3"
            />
          }

          <!-- Return Temp Series -->
          @if (showReturn() && returnLinePath()) {
            <path
              [attr.d]="returnLinePath()"
              fill="none"
              stroke="#0284c7"
              stroke-width="2"
              stroke-dasharray="5 3"
            />
          }

          <!-- Actual Supply Series -->
          @if (actualSupplyLinePath()) {
            <path
              [attr.d]="actualSupplyLinePath()"
              fill="none"
              stroke="#0f172a"
              stroke-width="2.25"
              stroke-linejoin="round"
            />
          }

          <!-- Target & Actual Nodes -->
          @for (pt of chartPoints(); track pt.day) {
            <circle
              [attr.cx]="pt.x"
              [attr.cy]="pt.targetY"
              r="3.5"
              fill="#ffffff"
              stroke="#ea580c"
              stroke-width="2"
            />

            @if (showReturn() && pt.actualReturnY !== null) {
              <circle
                [attr.cx]="pt.x"
                [attr.cy]="pt.actualReturnY"
                r="3"
                fill="#0284c7"
                stroke="#ffffff"
                stroke-width="1.5"
              />
            }

            @if (pt.actualSupplyY !== null) {
              <circle
                [attr.cx]="pt.x"
                [attr.cy]="pt.actualSupplyY"
                r="4.5"
                [attr.fill]="pt.deviation !== null && MathAbs(pt.deviation) > 2.5 ? '#dc2626' : '#0f172a'"
                stroke="#ffffff"
                stroke-width="1.5"
              />
            }
          }

          <!-- Interactive Hover Crosshair -->
          @if (hoveredDay() !== null && inspectedPoint(); as hPt) {
            <line
              [attr.x1]="hPt.x"
              [attr.y1]="padTop"
              [attr.x2]="hPt.x"
              [attr.y2]="padTop + plotHeight"
              stroke="#0f172a"
              stroke-width="1"
              opacity="0.4"
            />
            <circle
              [attr.cx]="hPt.x"
              [attr.cy]="hPt.targetY"
              r="6"
              fill="none"
              stroke="#ea580c"
              stroke-width="2"
            />
          }
        </svg>
      </div>

      <!-- Legend -->
      <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
        <div class="flex flex-wrap items-center gap-5">
          <span class="inline-flex items-center gap-2">
            <span class="w-4 h-0.5 bg-orange-600 inline-block"></span>
            Krzywa normatywna (Zadana)
          </span>
          <span class="inline-flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block"></span>
            Zasilanie zmierzone
          </span>
          @if (showReturn()) {
            <span class="inline-flex items-center gap-2">
              <span class="w-4 h-0.5 bg-sky-600 inline-block"></span>
              Powrót zmierzony
            </span>
          }
          @if (showRoom()) {
            <span class="inline-flex items-center gap-2">
              <span class="w-4 h-0.5 bg-slate-500 inline-block"></span>
              Temp. pomieszczenia
            </span>
          }
        </div>
        <span class="text-slate-400 font-mono tabular-nums">
          Skala: 15°C – 60°C
        </span>
      </div>
    </section>
  `,
})
export class HeatingCurveChart {
  readonly schedule = input.required<PlannedDayStep[]>();
  readonly measurements = input.required<DailyMeasurement[]>();
  readonly activeDay = input.required<number>();
  readonly mixingValveLimit = input<number | null>(null);
  readonly boilerTemp = input<number | null>(null);
  readonly daySelected = output<number>();

  readonly rangeMode = signal<'all' | 'until_active'>('all');
  readonly showReturn = signal<boolean>(true);
  readonly showRoom = signal<boolean>(false);
  readonly hoveredDay = signal<number | null>(null);

  readonly width = 860;
  readonly height = 340;
  readonly padLeft = 48;
  readonly padRight = 24;
  readonly padTop = 20;
  readonly padBottom = 46;
  readonly plotWidth = this.width - this.padLeft - this.padRight;
  readonly plotHeight = this.height - this.padTop - this.padBottom;
  readonly minTemp = 15;
  readonly maxTemp = 60;

  readonly yTicks = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((temp) => ({
    temp,
    y: this.tempToY(temp),
  }));

  readonly normLimitY = this.tempToY(55);

  readonly mixingValveLimitY = computed<number | null>(() => {
    const limit = this.mixingValveLimit();
    return limit !== null ? this.tempToY(limit) : null;
  });

  readonly visibleSteps = computed(() => {
    const all = this.schedule();
    if (this.rangeMode() === 'until_active') {
      const cap = Math.max(3, this.activeDay());
      return all.filter((s) => s.day <= cap);
    }
    return all;
  });

  readonly chartPoints = computed<ChartPoint[]>(() => {
    const steps = this.visibleSteps();
    const measMap = new Map<number, DailyMeasurement>();
    for (const m of this.measurements()) {
      measMap.set(m.day, m);
    }
    const n = steps.length;
    return steps.map((s, idx) => {
      const x =
        n <= 1
          ? this.padLeft + this.plotWidth / 2
          : this.padLeft + (idx / (n - 1)) * this.plotWidth;
      const m = measMap.get(s.day);
      const actualSupply = m ? m.supplyTempC : null;
      const actualReturn = m ? m.returnTempC : null;
      const roomTemp = m ? m.roomTempC : null;
      const dateParts = s.date.split('-');
      const shortDate = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}` : s.date;

      return {
        day: s.day,
        date: s.date,
        shortDate,
        x,
        targetY: this.tempToY(s.targetSupplyTempC),
        targetTemp: s.targetSupplyTempC,
        phaseLabel: s.phaseLabel,
        instruction: s.instruction,
        actualSupply,
        actualSupplyY: actualSupply !== null ? this.tempToY(actualSupply) : null,
        actualReturn,
        actualReturnY: actualReturn !== null ? this.tempToY(actualReturn) : null,
        roomTemp,
        roomTempY: roomTemp !== null ? this.tempToY(roomTemp) : null,
        pressureBar: m ? m.systemPressureBar : null,
        deviation: actualSupply !== null ? Number((actualSupply - s.targetSupplyTempC).toFixed(1)) : null,
      };
    });
  });

  readonly phaseBands = computed<PhaseBand[]>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return [];
    const steps = this.visibleSteps();
    const bands: PhaseBand[] = [];
    const halfStep = pts.length > 1 ? (pts[1].x - pts[0].x) / 2 : this.plotWidth / 2;

    let runStart = 0;
    for (let i = 1; i <= steps.length; i += 1) {
      if (i === steps.length || steps[i].phase !== steps[runStart].phase) {
        const phase = steps[runStart].phase;
        const leftX = runStart === 0 ? this.padLeft : pts[runStart].x - halfStep;
        const rightX = i === steps.length ? this.width - this.padRight : pts[i - 1].x + halfStep;
        bands.push({
          phase,
          label: this.shortPhaseLabel(phase),
          startX: leftX,
          width: Math.max(0, rightX - leftX),
          fillClass: this.phaseFillClass(phase),
        });
        runStart = i;
      }
    }
    return bands;
  });

  readonly activeDayX = computed<number | null>(() => {
    const found = this.chartPoints().find((p) => p.day === this.activeDay());
    return found ? found.x : null;
  });

  readonly inspectedPoint = computed<ChartPoint | null>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return null;
    const hDay = this.hoveredDay();
    if (hDay !== null) {
      return pts.find((p) => p.day === hDay) ?? pts[0];
    }
    return pts.find((p) => p.day === this.activeDay()) ?? pts[pts.length - 1];
  });

  readonly targetLinePath = computed(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.targetY.toFixed(1)}`).join(' ');
  });

  readonly targetAreaPath = computed(() => {
    const pts = this.chartPoints();
    if (pts.length < 2) return '';
    const line = this.targetLinePath();
    const bottomY = (this.padTop + this.plotHeight).toFixed(1);
    return `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`;
  });

  readonly actualSupplyLinePath = computed(() => {
    const pts = this.chartPoints().filter((p) => p.actualSupplyY !== null);
    if (pts.length < 2) return '';
    return pts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${(p.actualSupplyY ?? 0).toFixed(1)}`)
      .join(' ');
  });

  readonly returnLinePath = computed(() => {
    const pts = this.chartPoints().filter((p) => p.actualReturnY !== null);
    if (pts.length < 2) return '';
    return pts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${(p.actualReturnY ?? 0).toFixed(1)}`)
      .join(' ');
  });

  readonly roomLinePath = computed(() => {
    const pts = this.chartPoints().filter((p) => p.roomTempY !== null);
    if (pts.length < 2) return '';
    return pts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${(p.roomTempY ?? 0).toFixed(1)}`)
      .join(' ');
  });

  MathAbs(v: number): number {
    return Math.abs(v);
  }

  shouldShowDayTick(day: number): boolean {
    const total = this.chartPoints().length;
    if (total <= 16) return true;
    return day === 1 || day === total || day % 2 === 1;
  }

  onSvgPointerMove(event: MouseEvent): void {
    const day = this.findNearestDayFromEvent(event);
    if (day !== null) {
      this.hoveredDay.set(day);
    }
  }

  onSvgClick(event: MouseEvent): void {
    const day = this.findNearestDayFromEvent(event);
    if (day !== null) {
      this.daySelected.emit(day);
    }
  }

  stepSelectedDay(delta: number): void {
    const total = this.schedule().length;
    const next = Math.max(1, Math.min(total, this.activeDay() + delta));
    this.daySelected.emit(next);
  }

  private findNearestDayFromEvent(event: MouseEvent): number | null {
    const svg = event.currentTarget as SVGSVGElement | null;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const svgX = ((event.clientX - rect.left) / rect.width) * this.width;
    const pts = this.chartPoints();
    if (pts.length === 0) return null;
    let closest = pts[0];
    let minDist = Math.abs(pts[0].x - svgX);
    for (const p of pts) {
      const d = Math.abs(p.x - svgX);
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
    return closest.day;
  }

  private tempToY(temp: number): number {
    const clamped = Math.max(this.minTemp, Math.min(this.maxTemp, temp));
    const ratio = (clamped - this.minTemp) / (this.maxTemp - this.minTemp);
    return this.padTop + this.plotHeight - ratio * this.plotHeight;
  }

  private shortPhaseLabel(phase: HeatingPhase): string {
    switch (phase) {
      case 'stabilization':
        return 'Faza 1 · Wstępna';
      case 'ramp_up':
        return 'Faza 2 · Wzrost';
      case 'peak_hold':
        return 'Faza 3 · Maksimum';
      case 'cool_down':
        return 'Faza 4 · Schładzanie';
      case 'cm_reheat':
        return 'Faza 5 · Dosuszanie';
    }
  }

  private phaseFillClass(phase: HeatingPhase): string {
    switch (phase) {
      case 'stabilization':
        return 'fill-slate-50/70';
      case 'ramp_up':
        return 'fill-amber-50/50';
      case 'peak_hold':
        return 'fill-orange-50/60';
      case 'cool_down':
        return 'fill-sky-50/50';
      case 'cm_reheat':
        return 'fill-amber-50/40';
    }
  }
}
