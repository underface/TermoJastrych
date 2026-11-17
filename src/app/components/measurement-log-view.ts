import {isPlatformBrowser} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {
  computeMeterDailyDeltas,
  computeMeterPeriodSummary,
  DailyMeasurement,
  MeterDeltaEntry,
  PlannedDayStep,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';

interface JournalRow {
  step: PlannedDayStep;
  measurement: DailyMeasurement | null;
  deltaT: number | null;
  deviation: number | null;
  powerDelta: MeterDeltaEntry | null;
  gasDelta: MeterDeltaEntry | null;
  hasWarning: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-measurement-log-view',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6" data-testid="measurement-log-view">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">
            Dziennik pomiarów i harmonogram dobowy
          </h1>
          <p class="text-sm text-slate-500 mt-1">
            Porównanie nastaw normatywnych z odczytami z rozdzielacza, ciśnieniem roboczym i próbami CM.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <label for="log-protocol-select" class="sr-only">Wybierz obiekt</label>
          <select
            id="log-protocol-select"
            [value]="state.activeProtocol().id"
            (change)="onProtocolChange($event)"
            class="px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            @for (prot of state.protocols(); track prot.id) {
              <option [value]="prot.id" [selected]="prot.id === state.activeProtocol().id">{{ prot.name }}</option>
            }
          </select>
          <button
            type="button"
            (click)="exportCsv()"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">download</mat-icon>
            Eksportuj CSV
          </button>
          <button
            type="button"
            (click)="state.showPrintModal.set(true)"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">print</mat-icon>
            Protokół odbioru
          </button>
        </div>
      </div>

      <!-- Filter & Search Bar -->
      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Filtr dziennika">
          <button
            type="button"
            (click)="filterMode.set('all')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="filterMode() === 'all'"
            [class.text-slate-900]="filterMode() === 'all'"
            [class.shadow-sm]="filterMode() === 'all'"
            [class.text-slate-600]="filterMode() !== 'all'"
          >
            Wszystkie dni ({{ rows().length }})
          </button>
          <button
            type="button"
            (click)="filterMode.set('logged')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="filterMode() === 'logged'"
            [class.text-slate-900]="filterMode() === 'logged'"
            [class.shadow-sm]="filterMode() === 'logged'"
            [class.text-slate-600]="filterMode() !== 'logged'"
          >
            Z pomiarami
          </button>
          <button
            type="button"
            (click)="filterMode.set('missing')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="filterMode() === 'missing'"
            [class.text-slate-900]="filterMode() === 'missing'"
            [class.shadow-sm]="filterMode() === 'missing'"
            [class.text-slate-600]="filterMode() !== 'missing'"
          >
            Oczekujące
          </button>
          <button
            type="button"
            (click)="filterMode.set('warnings')"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            [class.bg-white]="filterMode() === 'warnings'"
            [class.text-slate-900]="filterMode() === 'warnings'"
            [class.shadow-sm]="filterMode() === 'warnings'"
            [class.text-slate-600]="filterMode() !== 'warnings'"
          >
            Odchylenia
          </button>
        </div>

        <form [formGroup]="searchForm" class="w-full sm:w-64">
          <label for="log-search" class="sr-only">Szukaj w dzienniku</label>
          <input
            id="log-search"
            type="search"
            formControlName="query"
            placeholder="Szukaj po dniu, fazie lub notatce..."
            class="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
          />
        </form>
      </div>

      @if (powerSummary() || gasSummary()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="meter-summary-cards">
          @if (powerSummary(); as ps) {
            <div class="bg-white border border-slate-200 rounded-xl p-4">
              <div class="text-xs font-medium text-slate-500">
                Zużycie mocy / energii pieca (D{{ ps.firstDay }}–D{{ ps.lastDay }})
              </div>
              <div class="mt-1.5 flex flex-wrap items-baseline gap-2 font-mono tabular-nums">
                @if (ps.avgDailyDelta !== null && ps.totalDelta !== null) {
                  <span class="text-lg font-bold text-slate-900">
                    śr. {{ ps.avgDailyDelta.toFixed(1) }} W/d
                  </span>
                  <span class="text-xs text-slate-600">
                    (łącznie +{{ ps.totalDelta.toFixed(0) }} W · od {{ ps.firstReading }} W do {{ ps.lastReading }} W)
                  </span>
                } @else {
                  <span class="text-base font-semibold text-slate-900">
                    Odczyt bazowy: {{ ps.firstReading }} W (D{{ ps.firstDay }})
                  </span>
                  <span class="text-xs text-slate-500">Dodaj kolejny odczyt, aby wyliczyć deltę dobową</span>
                }
              </div>
            </div>
          }

          @if (gasSummary(); as gs) {
            <div class="bg-white border border-slate-200 rounded-xl p-4">
              <div class="text-xs font-medium text-slate-500">
                Zużycie gazu z licznika (D{{ gs.firstDay }}–D{{ gs.lastDay }})
              </div>
              <div class="mt-1.5 flex flex-wrap items-baseline gap-2 font-mono tabular-nums">
                @if (gs.avgDailyDelta !== null && gs.totalDelta !== null) {
                  <span class="text-lg font-bold text-slate-900">
                    śr. {{ gs.avgDailyDelta.toFixed(2) }} m³/d
                  </span>
                  <span class="text-xs text-slate-600">
                    (łącznie +{{ gs.totalDelta.toFixed(2) }} m³ · od {{ gs.firstReading.toFixed(2) }} do {{ gs.lastReading.toFixed(2) }} m³)
                  </span>
                } @else {
                  <span class="text-base font-semibold text-slate-900">
                    Odczyt bazowy: {{ gs.firstReading.toFixed(2) }} m³ (D{{ gs.firstDay }})
                  </span>
                  <span class="text-xs text-slate-500">Dodaj kolejny odczyt, aby wyliczyć deltę dobową</span>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- High-Density Data Table -->
      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th class="py-3 px-4">Dzień / Data</th>
                <th class="py-3 px-3">Faza normy</th>
                <th class="py-3 px-3 text-right">Zadana</th>
                <th class="py-3 px-3 text-right">Zasilanie</th>
                <th class="py-3 px-3 text-right">Powrót</th>
                <th class="py-3 px-3 text-right">ΔT</th>
                <th class="py-3 px-3 text-right">Ciśnienie</th>
                <th class="py-3 px-3 text-right">Moc [W] (Δ/d)</th>
                <th class="py-3 px-3 text-right">Gaz [m³] (Δ/d)</th>
                <th class="py-3 px-3 text-right">CM %</th>
                <th class="py-3 px-4">Uwagi wykonawcy</th>
                <th class="py-3 px-4 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 text-xs">
              @for (row of filteredRows(); track row.step.day) {
                <tr
                  class="hover:bg-slate-50/80 transition-colors"
                  [class.bg-orange-50/40]="row.step.day === state.activeProtocol().activeDay"
                >
                  <td class="py-3 px-4 whitespace-nowrap">
                    <div class="font-mono font-semibold text-slate-900 tabular-nums">
                      Dzień {{ row.step.day }}
                    </div>
                    <div class="font-mono text-[11px] text-slate-500 tabular-nums">
                      {{ row.step.date }}
                    </div>
                  </td>
                  <td class="py-3 px-3 text-slate-700 max-w-[200px]">
                    <div class="font-medium">{{ row.step.phaseLabel }}</div>
                    @if (row.step.deltaFromPrevC !== 0) {
                      <div class="text-[11px] font-mono text-orange-700 tabular-nums">
                        Krok: {{ row.step.deltaFromPrevC > 0 ? '+' : '' }}{{ row.step.deltaFromPrevC }}°C
                      </div>
                    }
                  </td>
                  <td class="py-3 px-3 text-right font-mono font-semibold text-orange-700 tabular-nums whitespace-nowrap">
                    {{ row.step.targetSupplyTempC.toFixed(1) }} °C
                  </td>

                  @if (row.measurement; as m) {
                    <td
                      class="py-3 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap"
                      [class.text-rose-700]="row.deviation !== null && MathAbs(row.deviation) > 2.5"
                      [class.text-slate-900]="row.deviation === null || MathAbs(row.deviation) <= 2.5"
                    >
                      <div>S1: {{ m.supplyTempC.toFixed(1) }} °C</div>
                      @if (m.supplyTemp2C !== null && m.supplyTemp2C !== undefined) {
                        <div class="text-[11px] font-normal text-slate-500">S2: {{ m.supplyTemp2C.toFixed(1) }} °C</div>
                      }
                      @if (m.boilerActualTempC !== null && m.boilerActualTempC !== undefined) {
                        <div class="text-[11px] font-normal text-amber-700">Piec: {{ m.boilerActualTempC.toFixed(0) }}°C</div>
                      }
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-sky-700 tabular-nums whitespace-nowrap">
                      <div>S1: {{ m.returnTempC.toFixed(1) }} °C</div>
                      @if (m.returnTemp2C !== null && m.returnTemp2C !== undefined) {
                        <div class="text-[11px] text-sky-600/80">S2: {{ m.returnTemp2C.toFixed(1) }} °C</div>
                      }
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      <div>{{ row.deltaT !== null ? row.deltaT.toFixed(1) + ' °C' : '—' }}</div>
                      @if (
                        m.supplyTemp2C !== null &&
                        m.supplyTemp2C !== undefined &&
                        m.returnTemp2C !== null &&
                        m.returnTemp2C !== undefined
                      ) {
                        <div class="text-[11px] text-slate-500">
                          S2: {{ (m.supplyTemp2C - m.returnTemp2C).toFixed(1) }} °C
                        </div>
                      }
                    </td>
                    <td
                      class="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                      [class.text-rose-700]="m.systemPressureBar < 1.0 || m.systemPressureBar > 2.5"
                      [class.text-slate-700]="m.systemPressureBar >= 1.0 && m.systemPressureBar <= 2.5"
                    >
                      {{ m.systemPressureBar.toFixed(2) }} bar
                    </td>
                    <td class="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      @if (row.powerDelta; as pd) {
                        @if (pd.reading !== null) {
                          <div class="font-semibold text-slate-900">{{ pd.reading }} W</div>
                          @if (pd.isCounterReset) {
                            <div class="text-[11px] text-rose-600">reset licznika</div>
                          } @else if (pd.dailyDelta !== null) {
                            @if (pd.spanDays > 1 && pd.fromDay !== null && pd.toDay !== null) {
                              <div class="text-[11px] text-orange-700">
                                śr. {{ pd.dailyDelta.toFixed(1) }} W/d (D{{ pd.fromDay }}–D{{ pd.toDay }}: +{{ pd.totalDelta?.toFixed(0) }} W)
                              </div>
                            } @else {
                              <div class="text-[11px] text-emerald-700">+{{ pd.dailyDelta.toFixed(1) }} W/d</div>
                            }
                          } @else {
                            <div class="text-[11px] text-slate-400">baza</div>
                          }
                        } @else if (pd.dailyDelta !== null && pd.fromDay !== null && pd.toDay !== null) {
                          <div class="text-slate-400">—</div>
                          <div class="text-[11px] text-slate-500">
                            ≈ {{ pd.dailyDelta.toFixed(1) }} W/d (D{{ pd.fromDay }}–D{{ pd.toDay }})
                          </div>
                        } @else {
                          <span class="text-slate-400">—</span>
                        }
                      } @else {
                        <span class="text-slate-400">—</span>
                      }
                    </td>
                    <td class="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      @if (row.gasDelta; as gd) {
                        @if (gd.reading !== null) {
                          <div class="font-semibold text-slate-900">{{ gd.reading.toFixed(2) }} m³</div>
                          @if (gd.isCounterReset) {
                            <div class="text-[11px] text-rose-600">reset licznika</div>
                          } @else if (gd.dailyDelta !== null) {
                            @if (gd.spanDays > 1 && gd.fromDay !== null && gd.toDay !== null) {
                              <div class="text-[11px] text-orange-700">
                                śr. {{ gd.dailyDelta.toFixed(2) }} m³/d (D{{ gd.fromDay }}–D{{ gd.toDay }}: +{{ gd.totalDelta?.toFixed(2) }} m³)
                              </div>
                            } @else {
                              <div class="text-[11px] text-emerald-700">+{{ gd.dailyDelta.toFixed(2) }} m³/d</div>
                            }
                          } @else {
                            <div class="text-[11px] text-slate-400">baza</div>
                          }
                        } @else if (gd.dailyDelta !== null && gd.fromDay !== null && gd.toDay !== null) {
                          <div class="text-slate-400">—</div>
                          <div class="text-[11px] text-slate-500">
                            ≈ {{ gd.dailyDelta.toFixed(2) }} m³/d (D{{ gd.fromDay }}–D{{ gd.toDay }})
                          </div>
                        } @else {
                          <span class="text-slate-400">—</span>
                        }
                      } @else {
                        <span class="text-slate-400">—</span>
                      }
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {{ m.cmMoisturePct !== null ? m.cmMoisturePct.toFixed(2) + '%' : '—' }}
                    </td>
                    <td class="py-3 px-4 text-slate-600 max-w-[240px] truncate" [title]="m.note">
                      {{ m.note || '—' }}
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        (click)="state.deleteMeasurement(m.id)"
                        [attr.aria-label]="'Usuń pomiar z dnia ' + row.step.day"
                        class="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 rounded transition-colors"
                      >
                        <mat-icon class="!text-[15px] !w-4 !h-4">delete</mat-icon>
                        Usuń
                      </button>
                    </td>
                  } @else {
                    <td colspan="7" class="py-3 px-3 text-slate-400 italic">
                      Oczekuje na odczyt z rozdzielacza
                    </td>
                    <td class="py-3 px-4 text-slate-400">—</td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        (click)="jumpToLogDay(row.step.day)"
                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        <mat-icon class="!text-[14px] !w-3.5 !h-3.5">edit</mat-icon>
                        Uzupełnij
                      </button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td colspan="12" class="py-10 text-center text-sm text-slate-500">
                    Brak wpisów spełniających kryteria filtrowania.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MeasurementLogView {
  readonly state = inject(HeatingState);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);

  readonly filterMode = signal<'all' | 'logged' | 'missing' | 'warnings'>('all');

  readonly searchForm = this.fb.nonNullable.group({
    query: [''],
  });

  readonly searchQuery = signal<string>('');

  constructor() {
    this.searchForm.controls.query.valueChanges.subscribe((val) => {
      this.searchQuery.set(val.trim().toLowerCase());
    });
  }

  readonly powerSummary = computed(() =>
    computeMeterPeriodSummary(this.state.activeMeasurements(), (m) => m.boilerPowerCounterW),
  );

  readonly gasSummary = computed(() =>
    computeMeterPeriodSummary(this.state.activeMeasurements(), (m) => m.gasMeterM3),
  );

  readonly rows = computed<JournalRow[]>(() => {
    const schedule = this.state.activeSchedule();
    const measurements = this.state.activeMeasurements();
    const powerMap = computeMeterDailyDeltas(measurements, (m) => m.boilerPowerCounterW);
    const gasMap = computeMeterDailyDeltas(measurements, (m) => m.gasMeterM3);
    const measMap = new Map<number, DailyMeasurement>();
    for (const m of measurements) {
      measMap.set(m.day, m);
    }

    return schedule.map((step) => {
      const m = measMap.get(step.day) ?? null;
      const deltaT = m ? Number((m.supplyTempC - m.returnTempC).toFixed(1)) : null;
      const deviation = m ? Number((m.supplyTempC - step.targetSupplyTempC).toFixed(1)) : null;
      const hasWarning = Boolean(
        m &&
          (Math.abs(deviation ?? 0) > 2.5 ||
            m.systemPressureBar < 1.0 ||
            m.systemPressureBar > 2.5 ||
            (deltaT ?? 0) > 10),
      );
      return {
        step,
        measurement: m,
        deltaT,
        deviation,
        powerDelta: powerMap.get(step.day) ?? null,
        gasDelta: gasMap.get(step.day) ?? null,
        hasWarning,
      };
    });
  });

  readonly filteredRows = computed(() => {
    const mode = this.filterMode();
    const q = this.searchQuery();
    return this.rows().filter((r) => {
      if (mode === 'logged' && !r.measurement) return false;
      if (mode === 'missing' && r.measurement) return false;
      if (mode === 'warnings' && !r.hasWarning) return false;
      if (!q) return true;
      const hay = [
        `dzień ${r.step.day}`,
        r.step.date,
        r.step.phaseLabel,
        r.measurement?.note ?? '',
        r.measurement?.operator ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  MathAbs(v: number): number {
    return Math.abs(v);
  }

  onProtocolChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.state.selectProtocol(select.value);
  }

  jumpToLogDay(day: number): void {
    this.state.setActiveDay(day);
    this.state.setView('dashboard');
  }

  exportCsv(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const headers = [
      'Dzien',
      'Data',
      'Faza',
      'Zadana_C',
      'Temp_Pieca_C',
      'Zasilanie_S1_C',
      'Powrot_S1_C',
      'Zasilanie_S2_C',
      'Powrot_S2_C',
      'DeltaT_S1_C',
      'Cisnienie_bar',
      'Moc_Pieca_W',
      'Moc_Pieca_Delta_Dzienna_W',
      'Licznik_Gazu_m3',
      'Gaz_Delta_Dzienna_m3',
      'Przeplyw_l_min',
      'Wilgotnosc_CM_pct',
      'Uwagi',
    ];
    const lines = [headers.join(';')];
    for (const r of this.rows()) {
      const m = r.measurement;
      lines.push(
        [
          r.step.day,
          r.step.date,
          `"${r.step.phaseLabel}"`,
          r.step.targetSupplyTempC,
          m?.boilerActualTempC ?? '',
          m ? m.supplyTempC : '',
          m ? m.returnTempC : '',
          m?.supplyTemp2C ?? '',
          m?.returnTemp2C ?? '',
          r.deltaT ?? '',
          m ? m.systemPressureBar : '',
          m?.boilerPowerCounterW ?? '',
          r.powerDelta?.dailyDelta !== null && r.powerDelta?.dailyDelta !== undefined
            ? r.powerDelta.dailyDelta.toFixed(1)
            : '',
          m?.gasMeterM3 ?? '',
          r.gasDelta?.dailyDelta !== null && r.gasDelta?.dailyDelta !== undefined
            ? r.gasDelta.dailyDelta.toFixed(2)
            : '',
          m ? m.flowRateLpm : '',
          m?.cmMoisturePct ?? '',
          `"${(m?.note ?? '').replaceAll('"', '""')}"`,
        ].join(';'),
      );
    }
    const blob = new Blob([lines.join('\n')], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dziennik-wygrzewania-${this.state.activeProtocol().id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
