import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {
  addDaysIso,
  FLOOR_FINISH_LABELS,
  FloorFinishType,
  getMinimumCuringDays,
  HEAT_SOURCE_LABELS,
  HeatSourceType,
  NORM_MODE_LABELS,
  NormProfileMode,
  SCREED_LABELS,
  ScreedType,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-new-protocol-modal',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-protocol-title"
      data-testid="new-protocol-modal"
    >
      <div class="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="new-protocol-title" class="text-base font-bold text-slate-900">
              Nowy protokół wygrzewania jastrychu
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Automatyczna konfiguracja krzywej zgodnie z PN-EN 1264-4
            </p>
          </div>
          <button
            type="button"
            (click)="state.showNewProtocolModal.set(false)"
            aria-label="Zamknij okno nowego protokołu"
            class="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <mat-icon class="!text-[20px] !w-5 !h-5">close</mat-icon>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="p-6 space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label for="np-name" class="block font-medium text-slate-700 mb-1">
                Nazwa inwestycji / strefy
              </label>
              <input
                id="np-name"
                type="text"
                formControlName="name"
                placeholder="np. Dom — Cała instalacja"
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label for="np-screed" class="block font-medium text-slate-700 mb-1">
                Typ jastrychu
              </label>
              <select
                id="np-screed"
                formControlName="screedType"
                (change)="onScreedOrPourChange()"
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                @for (opt of screedOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="np-finish" class="block font-medium text-slate-700 mb-1">
                Docelowa okładzina
              </label>
              <select
                id="np-finish"
                formControlName="floorFinish"
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                @for (opt of finishOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="np-source" class="block font-medium text-slate-700 mb-1">
                Źródło ciepła
              </label>
              <select
                id="np-source"
                formControlName="heatSource"
                (change)="onHeatSourceChange()"
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                @for (opt of heatSourceOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="np-mode" class="block font-medium text-slate-700 mb-1">
                Tryb normy PN-EN 1264-4
              </label>
              <select
                id="np-mode"
                formControlName="profileMode"
                class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                @for (opt of normModeOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="np-pour" class="block font-medium text-slate-700 mb-1">
                Data wylania jastrychu
              </label>
              <input
                id="np-pour"
                type="date"
                formControlName="pourDate"
                (change)="onScreedOrPourChange()"
                class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label for="np-start" class="block font-medium text-slate-700 mb-1">
                Planowany start wygrzewania
              </label>
              <input
                id="np-start"
                type="date"
                formControlName="startDate"
                class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="np-max-temp" class="block font-medium text-slate-700 mb-1">
                Maks. temp. projektowa pętli [°C]
              </label>
              <input
                id="np-max-temp"
                type="number"
                formControlName="maxSupplyTempC"
                class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div class="sm:col-span-2 pt-2 border-t border-slate-100 space-y-3">
              <label class="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-800">
                <input
                  type="checkbox"
                  formControlName="hasMixingValve3D"
                  class="w-4 h-4 accent-orange-600 rounded"
                />
                Układ z kotłem/piecem i zaworem mieszającym 3D na pętle podłogowe
              </label>

              @if (form.controls.hasMixingValve3D.value) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label for="np-boiler-temp" class="block font-medium text-slate-700 mb-1">
                      Temp. na piecu / kotle [°C]
                    </label>
                    <input
                      id="np-boiler-temp"
                      type="number"
                      formControlName="boilerTempC"
                      class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label for="np-valve-max" class="block font-medium text-slate-700 mb-1">
                      Maks. zaworu 3D na pętle [°C]
                    </label>
                    <input
                      id="np-valve-max"
                      type="number"
                      formControlName="mixingValveMaxTempC"
                      class="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              (click)="state.showNewProtocolModal.set(false)"
              class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              [disabled]="form.invalid"
              class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
              Utwórz protokół
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class NewProtocolModal {
  readonly state = inject(HeatingState);
  private readonly fb = inject(FormBuilder);

  readonly screedOptions = (Object.keys(SCREED_LABELS) as ScreedType[]).map((value) => ({
    value,
    label: SCREED_LABELS[value],
  }));

  readonly heatSourceOptions = (Object.keys(HEAT_SOURCE_LABELS) as HeatSourceType[]).map((value) => ({
    value,
    label: HEAT_SOURCE_LABELS[value],
  }));

  readonly finishOptions = (Object.keys(FLOOR_FINISH_LABELS) as FloorFinishType[]).map((value) => ({
    value,
    label: FLOOR_FINISH_LABELS[value],
  }));

  readonly normModeOptions = (Object.keys(NORM_MODE_LABELS) as NormProfileMode[]).map((value) => ({
    value,
    label: NORM_MODE_LABELS[value],
  }));

  readonly form = this.fb.nonNullable.group({
    name: ['Nowa Strefa Grzewcza', [Validators.required, Validators.minLength(2)]],
    screedType: ['cement' as ScreedType, [Validators.required]],
    floorFinish: ['ceramic_tile' as FloorFinishType, [Validators.required]],
    heatSource: ['gas_boiler' as HeatSourceType, [Validators.required]],
    profileMode: ['pn_en_1264_functional' as NormProfileMode, [Validators.required]],
    pourDate: ['2026-10-20', [Validators.required]],
    startDate: ['2026-11-11', [Validators.required]],
    maxSupplyTempC: [43, [Validators.required, Validators.min(30), Validators.max(60)]],
    hasMixingValve3D: [true],
    boilerTempC: [60, [Validators.required, Validators.min(25), Validators.max(90)]],
    mixingValveMaxTempC: [43, [Validators.required, Validators.min(20), Validators.max(60)]],
  });

  onScreedOrPourChange(): void {
    const screed = this.form.controls.screedType.value;
    const pour = this.form.controls.pourDate.value;
    if (pour) {
      const minDays = getMinimumCuringDays(screed);
      this.form.controls.startDate.setValue(addDaysIso(pour, minDays + 1));
    }
  }

  onHeatSourceChange(): void {
    const hs = this.form.controls.heatSource.value;
    this.form.controls.maxSupplyTempC.setValue(hs === 'heat_pump' ? 45 : 43);
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.state.createProtocol({
      name: v.name,
      screedType: v.screedType,
      heatSource: v.heatSource,
      floorFinish: v.floorFinish,
      pourDate: v.pourDate,
      startDate: v.startDate,
      profileMode: v.profileMode,
      initialTempC: 25,
      maxSupplyTempC: v.maxSupplyTempC,
      stepUpPerDayC: 5,
      stepDownPerDayC: 5,
      initialHoldDays: 3,
      peakHoldDays: 4,
      cmReheatDays: v.profileMode === 'pn_en_1264_cm_ready' ? 3 : 0,
      hasMixingValve3D: v.hasMixingValve3D,
      boilerTempC: v.boilerTempC,
      mixingValveMaxTempC: v.mixingValveMaxTempC,
    });
  }
}
