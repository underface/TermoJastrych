import {ChangeDetectionStrategy, Component, computed, effect, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {
  FLOOR_FINISH_LABELS,
  FloorFinishType,
  generateHeatingSchedule,
  getMaxAllowedCmMoisture,
  getMinimumCuringDays,
  HEAT_SOURCE_LABELS,
  HeatSourceType,
  NORM_MODE_LABELS,
  NormProfileMode,
  ProtocolConfig,
  SCREED_LABELS,
  ScreedType,
  validateProtocolCompliance,
} from '../domain/heating-norm';
import {HeatingState} from '../state/heating-state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-norm-parameters-view',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6" data-testid="norm-parameters-view">
      <!-- Top Action Header -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">
            Parametry normatywne i konfiguracja krzywej
          </h1>
          <p class="text-sm text-slate-500 mt-1">
            Zarządzaj parametrami jastrychu, terminami karencji oraz krzywą temperaturową zgodnie z PN-EN 1264-4.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label for="param-protocol-select" class="sr-only">Wybierz obiekt</label>
          <select
            id="param-protocol-select"
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
            (click)="state.showNewProtocolModal.set(true)"
            class="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
            Nowy protokół
          </button>
          <button
            type="button"
            (click)="applyNormPreset()"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">tune</mat-icon>
            Wzorzec PN-EN 1264-4
          </button>
          <button
            type="button"
            (click)="saveParameters()"
            [disabled]="form.invalid"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">save</mat-icon>
            Zapisz parametry
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Main Configuration Form -->
        <form [formGroup]="form" (ngSubmit)="saveParameters()" class="lg:col-span-8 space-y-6">
          <!-- Section 1: Obiekt i jastrych -->
          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <h2 class="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              01. Parametry jastrychu, okładziny i terminy
            </h2>

            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="param-name" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Nazwa projektu / strefy
                </label>
                <input
                  id="param-name"
                  type="text"
                  formControlName="name"
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-source" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Źródło ciepła
                </label>
                <select
                  id="param-source"
                  formControlName="heatSource"
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                >
                  @for (opt of heatSourceOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="param-screed" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Rodzaj jastrychu
                </label>
                <select
                  id="param-screed"
                  formControlName="screedType"
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                >
                  @for (opt of screedOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="param-finish" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Planowana okładzina podłogowa
                </label>
                <select
                  id="param-finish"
                  formControlName="floorFinish"
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                >
                  @for (opt of finishOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="param-pour-date" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Data wylania jastrychu
                </label>
                <input
                  id="param-pour-date"
                  type="date"
                  formControlName="pourDate"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-start-date" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Data startu wygrzewania
                </label>
                <input
                  id="param-start-date"
                  type="date"
                  formControlName="startDate"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>
            </div>
          </section>

          <!-- Section 2: Krzywa grzewcza -->
          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <h2 class="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              02. Krzywa temperaturowa PN-EN 1264-4
            </h2>

            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="sm:col-span-2">
                <label for="param-mode" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Tryb procedury wygrzewania
                </label>
                <select
                  id="param-mode"
                  formControlName="profileMode"
                  class="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                >
                  @for (opt of normModeOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="param-init-temp" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Temperatura początkowa [°C] (norma: 20–25°C)
                </label>
                <input
                  id="param-init-temp"
                  type="number"
                  formControlName="initialTempC"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-max-temp" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Maksymalna temperatura projektowa [°C]
                </label>
                <input
                  id="param-max-temp"
                  type="number"
                  formControlName="maxSupplyTempC"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-step-up" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Przyrost dobowy [°C/dobę] (maks. 5°C)
                </label>
                <input
                  id="param-step-up"
                  type="number"
                  formControlName="stepUpPerDayC"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-step-down" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Schładzanie dobowe [°C/dobę] (zalecane 5–10°C)
                </label>
                <input
                  id="param-step-down"
                  type="number"
                  formControlName="stepDownPerDayC"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-init-days" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Czas stabilizacji wstępnej [dni] (min. 3 dni)
                </label>
                <input
                  id="param-init-days"
                  type="number"
                  formControlName="initialHoldDays"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              <div>
                <label for="param-peak-days" class="block text-xs font-medium text-slate-700 mb-1.5">
                  Czas wygrzewania maksymalnego [dni] (min. 4 dni)
                </label>
                <input
                  id="param-peak-days"
                  type="number"
                  formControlName="peakHoldDays"
                  class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                />
              </div>

              @if (previewConfig().profileMode === 'pn_en_1264_cm_ready') {
                <div class="sm:col-span-2">
                  <label for="param-cm-days" class="block text-xs font-medium text-slate-700 mb-1.5">
                    Dodatkowe dni dosuszania przed pomiarem CM [dni]
                  </label>
                  <input
                    id="param-cm-days"
                    type="number"
                    formControlName="cmReheatDays"
                    class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                  />
                </div>
              }

              <!-- Boiler vs 3D Mixing Valve Section -->
              <div class="sm:col-span-2 pt-3 border-t border-slate-200 space-y-3">
                <label class="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    formControlName="hasMixingValve3D"
                    class="w-4 h-4 accent-orange-600 rounded"
                  />
                  Układ z piecem / kotłem i zaworem mieszającym 3D na pętle podłogowe
                </label>

                @if (form.controls.hasMixingValve3D.value) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label for="param-boiler-temp" class="block text-xs font-medium text-slate-700 mb-1.5">
                        Temperatura na piecu / kotle [°C]
                      </label>
                      <input
                        id="param-boiler-temp"
                        type="number"
                        formControlName="boilerTempC"
                        class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                      />
                    </div>
                    <div>
                      <label for="param-valve-max" class="block text-xs font-medium text-slate-700 mb-1.5">
                        Maks. temperatura za zaworem 3D [°C]
                      </label>
                      <input
                        id="param-valve-max"
                        type="number"
                        formControlName="mixingValveMaxTempC"
                        class="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-600"
                      />
                    </div>
                  </div>

                  <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <p class="font-semibold text-slate-900">
                      Profil: Bosch Condens 5300iW 24 P + Duro (2 obiegi) z zaworem Calido 3D
                    </p>
                    <p class="text-slate-600 leading-relaxed">
                      Kocioł Bosch GC5300iW 24 P grzeje w zakresie 30–82°C (ustaw np. 55–60°C), a zawór termostatyczny <strong>Calido 23–43°C (±2°C)</strong> w obu sekcjach grupy Duro obniża i stabilizuje temperaturę na pętle do <strong>maks. 43°C</strong> (pokrętło od MIN=23°C do MAX=43°C; strona pierwotna do 90°C / 6 bar).
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        (click)="applyBoschDuroPreset('ztm')"
                        class="px-3 py-1.5 font-semibold text-slate-900 bg-white border border-orange-300 rounded-md hover:bg-orange-50 transition-colors"
                        data-testid="preset-bosch-duro-ztm"
                      >
                        Calido / Duro ZTM 23–43°C (obie sekcje)
                      </button>
                      <button
                        type="button"
                        (click)="applyBoschDuroPreset('z3d')"
                        class="px-3 py-1.5 font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                        data-testid="preset-bosch-duro-z3d"
                      >
                        Duro Z3D z siłownikiem (maks. 45°C)
                      </button>
                    </div>
                  </div>

                  @if (previewConfig().maxSupplyTempC > previewConfig().mixingValveMaxTempC) {
                    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                      <span>
                        Krzywa zakłada {{ previewConfig().maxSupplyTempC }}°C, ale zawór 3D ogranicza pętle do {{ previewConfig().mixingValveMaxTempC }}°C.
                      </span>
                      <button
                        type="button"
                        (click)="capMaxToValve3D()"
                        class="px-3 py-1.5 font-semibold text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap"
                      >
                        Dopasuj krzywą do {{ previewConfig().mixingValveMaxTempC }}°C
                      </button>
                    </div>
                  }
                }
              </div>
            </div>
          </section>
        </form>

        <!-- Right Column: Live Compliance Auditor & Norm Summary -->
        <aside class="lg:col-span-4 space-y-5">
          <section class="bg-white border border-slate-200 rounded-xl p-5" data-testid="live-norm-auditor">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 class="text-sm font-semibold text-slate-900">
                Audyt zgodności na żywo
              </h2>
              @if (previewErrorsCount() === 0) {
                <span class="text-xs font-semibold text-emerald-700">● Zgodny</span>
              } @else {
                <span class="text-xs font-semibold text-rose-700">
                  ✖ {{ previewErrorsCount() }} niezgodności
                </span>
              }
            </div>

            <dl class="mt-4 space-y-2.5 text-xs">
              <div class="flex items-center justify-between py-1 border-b border-slate-100">
                <dt class="text-slate-500">Wymagana karencja</dt>
                <dd class="font-mono font-semibold text-slate-900 tabular-nums">
                  min. {{ previewMinCuring() }} dni
                </dd>
              </div>
              <div class="flex items-center justify-between py-1 border-b border-slate-100">
                <dt class="text-slate-500">Czas pełnego cyklu</dt>
                <dd class="font-mono font-semibold text-slate-900 tabular-nums">
                  {{ previewSchedule().length }} dni
                </dd>
              </div>
              <div class="flex items-center justify-between py-1 border-b border-slate-100">
                <dt class="text-slate-500">Próg wilgotności CM</dt>
                <dd class="font-mono font-semibold text-slate-900 tabular-nums">
                  ≤ {{ previewCmLimit().toFixed(1) }} %
                </dd>
              </div>
            </dl>

            <div class="mt-4 space-y-2.5">
              @if (previewIssues().length === 0) {
                <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  Wszystkie parametry mieszczą się w wymaganiach normy PN-EN 1264-4 oraz wytycznych ITB.
                </div>
              } @else {
                @for (issue of previewIssues(); track issue.id) {
                  <div
                    class="p-3 rounded-lg border text-xs"
                    [class.bg-rose-50]="issue.severity === 'error'"
                    [class.border-rose-200]="issue.severity === 'error'"
                    [class.text-rose-950]="issue.severity === 'error'"
                    [class.bg-amber-50]="issue.severity === 'warning'"
                    [class.border-amber-200]="issue.severity === 'warning'"
                    [class.text-amber-950]="issue.severity === 'warning'"
                    [class.bg-slate-50]="issue.severity === 'info'"
                    [class.border-slate-200]="issue.severity === 'info'"
                    [class.text-slate-800]="issue.severity === 'info'"
                  >
                    <p class="font-semibold">{{ issue.title }}</p>
                    <p class="mt-1 opacity-85 leading-relaxed">{{ issue.detail }}</p>
                    <p class="mt-1 font-mono text-[11px] opacity-75">{{ issue.normReference }}</p>
                  </div>
                }
              }
            </div>
          </section>

          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <h2 class="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              Wymagania PN-EN 1264-4
            </h2>
            <ul class="mt-3 space-y-2 text-xs text-slate-600 leading-relaxed">
              <li>1. Karencja po wylaniu: 21 dni (jastrych cementowy) lub 7 dni (anhydrytowy).</li>
              <li>2. Start od 20–25°C i utrzymanie stałej nastawy przez minimum 3 dni (72h).</li>
              <li>3. Stopniowe podnoszenie temperatury o maks. 5°C na dobę.</li>
              <li>4. Utrzymanie maksymalnej temperatury projektowej przez minimum 4 dni bez przerw.</li>
              <li>5. Kontrolowane schładzanie do temperatury wyjściowej i próba CM przed układaniem posadzki.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class NormParametersView {
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
    name: ['', [Validators.required, Validators.minLength(2)]],
    screedType: ['cement' as ScreedType, [Validators.required]],
    floorFinish: ['ceramic_tile' as FloorFinishType, [Validators.required]],
    heatSource: ['heat_pump' as HeatSourceType, [Validators.required]],
    pourDate: ['', [Validators.required]],
    startDate: ['', [Validators.required]],
    profileMode: ['pn_en_1264_functional' as NormProfileMode, [Validators.required]],
    initialTempC: [25, [Validators.required, Validators.min(15), Validators.max(40)]],
    maxSupplyTempC: [45, [Validators.required, Validators.min(25), Validators.max(65)]],
    stepUpPerDayC: [5, [Validators.required, Validators.min(1), Validators.max(15)]],
    stepDownPerDayC: [5, [Validators.required, Validators.min(1), Validators.max(15)]],
    initialHoldDays: [3, [Validators.required, Validators.min(1), Validators.max(10)]],
    peakHoldDays: [4, [Validators.required, Validators.min(1), Validators.max(14)]],
    cmReheatDays: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
    hasMixingValve3D: [true],
    boilerTempC: [60, [Validators.required, Validators.min(25), Validators.max(90)]],
    mixingValveMaxTempC: [45, [Validators.required, Validators.min(20), Validators.max(60)]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly previewConfig = computed<ProtocolConfig>(() => {
    const base = this.state.activeProtocol();
    const raw = this.formValue();
    return {
      ...base,
      ...raw,
    };
  });

  readonly previewSchedule = computed(() => generateHeatingSchedule(this.previewConfig()));

  readonly previewIssues = computed(() =>
    validateProtocolCompliance(this.previewConfig(), this.state.activeMeasurements()),
  );

  readonly previewErrorsCount = computed(
    () => this.previewIssues().filter((i) => i.severity === 'error').length,
  );

  readonly previewMinCuring = computed(() =>
    getMinimumCuringDays(this.previewConfig().screedType),
  );

  readonly previewCmLimit = computed(() =>
    getMaxAllowedCmMoisture(this.previewConfig().screedType, this.previewConfig().floorFinish),
  );

  constructor() {
    effect(() => {
      const p = this.state.activeProtocol();
      this.form.patchValue(
        {
          name: p.name,
          screedType: p.screedType,
          floorFinish: p.floorFinish,
          heatSource: p.heatSource,
          pourDate: p.pourDate,
          startDate: p.startDate,
          profileMode: p.profileMode,
          initialTempC: p.initialTempC,
          maxSupplyTempC: p.maxSupplyTempC,
          stepUpPerDayC: p.stepUpPerDayC,
          stepDownPerDayC: p.stepDownPerDayC,
          initialHoldDays: p.initialHoldDays,
          peakHoldDays: p.peakHoldDays,
          cmReheatDays: p.cmReheatDays,
          hasMixingValve3D: p.hasMixingValve3D,
          boilerTempC: p.boilerTempC,
          mixingValveMaxTempC: p.mixingValveMaxTempC,
        },
        {emitEvent: true},
      );
    });
  }

  applyNormPreset(): void {
    const heatSource = this.form.controls.heatSource.value;
    const hasValve = this.form.controls.hasMixingValve3D.value;
    const valveCap = this.form.controls.mixingValveMaxTempC.value;
    const defaultMax = heatSource === 'heat_pump' ? 45 : 50;
    this.form.patchValue({
      initialTempC: 25,
      maxSupplyTempC: hasValve ? Math.min(defaultMax, valveCap) : defaultMax,
      stepUpPerDayC: 5,
      stepDownPerDayC: 5,
      initialHoldDays: 3,
      peakHoldDays: 4,
    });
  }

  capMaxToValve3D(): void {
    const valveCap = this.form.controls.mixingValveMaxTempC.value;
    this.form.controls.maxSupplyTempC.setValue(valveCap);
  }

  applyBoschDuroPreset(valveType: 'z3d' | 'ztm'): void {
    const valveMax = valveType === 'ztm' ? 43 : 45;
    this.form.patchValue({
      heatSource: 'gas_boiler',
      hasMixingValve3D: true,
      boilerTempC: 60,
      mixingValveMaxTempC: valveMax,
      initialTempC: 25,
      maxSupplyTempC: valveMax,
      stepUpPerDayC: 5,
      stepDownPerDayC: 5,
      initialHoldDays: 3,
      peakHoldDays: 4,
    });
  }

  onProtocolChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.state.selectProtocol(select.value);
  }

  saveParameters(): void {
    if (this.form.invalid) return;
    this.state.updateActiveProtocol(this.form.getRawValue());
  }
}
