import {isPlatformBrowser} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {
  DailyMeasurement,
  FLOOR_FINISH_LABELS,
  HEAT_SOURCE_LABELS,
  SCREED_LABELS,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-print-protocol-modal',
  imports: [MatIconModule],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-protocol-title"
      data-testid="print-protocol-modal"
    >
      <div class="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div class="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 id="print-protocol-title" class="text-base font-bold text-slate-900">
            Protokół wygrzewania jastrychu wg PN-EN 1264-4
          </h2>
          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="printNow()"
              class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              <mat-icon class="!text-[16px] !w-4 !h-4">print</mat-icon>
              Drukuj / Zapisz PDF
            </button>
            <button
              type="button"
              (click)="state.showPrintModal.set(false)"
              aria-label="Zamknij podgląd protokołu"
              class="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <mat-icon class="!text-[20px] !w-5 !h-5">close</mat-icon>
            </button>
          </div>
        </div>

        <div class="p-8 space-y-6 text-slate-900 text-xs">
          <div class="border-b-2 border-slate-900 pb-4 flex flex-wrap justify-between gap-4">
            <div>
              <p class="text-[11px] font-mono text-slate-500">DOKUMENT TECHNICZNY · PN-EN 1264-4</p>
              <h3 class="text-lg font-bold mt-1">
                Protokół pierwszego uruchomienia i wygrzewania ogrzewania podłogowego
              </h3>
              <p class="text-slate-600 mt-1">
                Obiekt / strefa: {{ state.activeProtocol().name }}
              </p>
            </div>
            <div class="text-right font-mono tabular-nums">
              <div>Status zgodności: {{ state.isNormCompliant() ? 'ZGODNY Z NORMĄ' : 'WYKRYTO ODCHYLENIA' }}</div>
              <div class="text-slate-500 mt-1">
                Karencja: {{ state.curingDaysElapsed() }} dni (min. {{ state.minCuringDaysRequired() }} dni)
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div>
              <span class="text-slate-500 block">Rodzaj jastrychu</span>
              <span class="font-semibold">{{ screedLabel() }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Źródło ciepła</span>
              <span class="font-semibold">{{ heatSourceLabel() }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Planowana okładzina</span>
              <span class="font-semibold">{{ finishLabel() }} (limit CM ≤ {{ state.activeCmLimit().toFixed(1) }}%)</span>
            </div>
            <div>
              <span class="text-slate-500 block">Data wylania / Startu</span>
              <span class="font-mono font-semibold tabular-nums">
                {{ state.activeProtocol().pourDate }} / {{ state.activeProtocol().startDate }}
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">Zakres temperatur</span>
              <span class="font-mono font-semibold tabular-nums">
                {{ state.activeProtocol().initialTempC }}°C → {{ state.activeProtocol().maxSupplyTempC }}°C
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">Układ mieszający 3D</span>
              <span class="font-mono font-semibold tabular-nums">
                @if (state.activeProtocol().hasMixingValve3D) {
                  Piec {{ state.activeProtocol().boilerTempC }}°C / 3D maks. {{ state.activeProtocol().mixingValveMaxTempC }}°C
                } @else {
                  Bezpośrednio ze źródła
                }
              </span>
            </div>
          </div>

          <table class="w-full text-left border-collapse border border-slate-300">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-300">
                <th class="py-2 px-3 border-r border-slate-300">Dzień</th>
                <th class="py-2 px-3 border-r border-slate-300">Data</th>
                <th class="py-2 px-3 border-r border-slate-300">Faza</th>
                <th class="py-2 px-3 border-r border-slate-300 text-right">Zadana °C</th>
                <th class="py-2 px-3 border-r border-slate-300 text-right">Zasilanie S1 / S2</th>
                <th class="py-2 px-3 border-r border-slate-300 text-right">Powrót S1 / S2</th>
                <th class="py-2 px-3 border-r border-slate-300 text-right">Ciśn. bar</th>
                <th class="py-2 px-3 text-right">CM %</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 font-mono tabular-nums">
              @for (item of protocolRows(); track item.day) {
                <tr>
                  <td class="py-1.5 px-3 border-r border-slate-200">D{{ item.day }}</td>
                  <td class="py-1.5 px-3 border-r border-slate-200">{{ item.date }}</td>
                  <td class="py-1.5 px-3 border-r border-slate-200 font-sans">{{ item.phase }}</td>
                  <td class="py-1.5 px-3 border-r border-slate-200 text-right">{{ item.target.toFixed(1) }}</td>
                  <td class="py-1.5 px-3 border-r border-slate-200 text-right">
                    @if (item.m) {
                      {{ item.m.supplyTempC.toFixed(1) }}
                      @if (item.m.supplyTemp2C !== null && item.m.supplyTemp2C !== undefined) {
                        / {{ item.m.supplyTemp2C.toFixed(1) }}
                      }
                    } @else {
                      —
                    }
                  </td>
                  <td class="py-1.5 px-3 border-r border-slate-200 text-right">
                    @if (item.m) {
                      {{ item.m.returnTempC.toFixed(1) }}
                      @if (item.m.returnTemp2C !== null && item.m.returnTemp2C !== undefined) {
                        / {{ item.m.returnTemp2C.toFixed(1) }}
                      }
                    } @else {
                      —
                    }
                  </td>
                  <td class="py-1.5 px-3 border-r border-slate-200 text-right">
                    {{ item.m ? item.m.systemPressureBar.toFixed(2) : '—' }}
                  </td>
                  <td class="py-1.5 px-3 text-right">
                    {{ item.m && item.m.cmMoisturePct !== null ? item.m.cmMoisturePct.toFixed(2) : '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6">
            <div class="border-t border-slate-400 pt-2">
              <p class="font-semibold">Wykonawca instalacji</p>
              <p class="text-slate-500 mt-1">Podpis i data odbioru</p>
            </div>
            <div class="border-t border-slate-400 pt-2">
              <p class="font-semibold">Inwestor / Kierownik budowy</p>
              <p class="text-slate-500 mt-1">Podpis i data odbioru</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PrintProtocolModal {
  readonly state = inject(HeatingState);
  private readonly platformId = inject(PLATFORM_ID);

  readonly screedLabel = computed(() => SCREED_LABELS[this.state.activeProtocol().screedType]);
  readonly heatSourceLabel = computed(
    () => HEAT_SOURCE_LABELS[this.state.activeProtocol().heatSource],
  );
  readonly finishLabel = computed(
    () => FLOOR_FINISH_LABELS[this.state.activeProtocol().floorFinish],
  );

  readonly protocolRows = computed(() => {
    const measMap = new Map<number, DailyMeasurement>();
    for (const m of this.state.activeMeasurements()) {
      measMap.set(m.day, m);
    }
    return this.state.activeSchedule().map((s) => ({
      day: s.day,
      date: s.date,
      phase: s.phaseLabel,
      target: s.targetSupplyTempC,
      m: measMap.get(s.day) ?? null,
    }));
  });

  printNow(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.print();
    }
  }
}
