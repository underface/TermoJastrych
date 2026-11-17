export type ScreedType = 'cement' | 'anhydrite' | 'cement_rapid';
export type HeatSourceType = 'heat_pump' | 'gas_boiler' | 'electric_boiler' | 'district_buffer';
export type FloorFinishType = 'ceramic_tile' | 'engineered_wood' | 'laminate_lvt' | 'resin';
export type NormProfileMode = 'pn_en_1264_functional' | 'pn_en_1264_cm_ready' | 'custom_validated';
export type HeatingPhase = 'stabilization' | 'ramp_up' | 'peak_hold' | 'cool_down' | 'cm_reheat';

export interface ProtocolConfig {
  id: string;
  name: string;
  location?: string;
  screedType: ScreedType;
  screedThicknessMm?: number;
  areaM2?: number;
  circuitCount?: number;
  heatSource: HeatSourceType;
  floorFinish: FloorFinishType;
  pourDate: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
  profileMode: NormProfileMode;
  initialTempC: number;
  maxSupplyTempC: number;
  stepUpPerDayC: number;
  stepDownPerDayC: number;
  initialHoldDays: number;
  peakHoldDays: number;
  cmReheatDays: number;
  activeDay: number;
  hasMixingValve3D: boolean;
  boilerTempC: number;
  mixingValveMaxTempC: number;
  installerName?: string;
  supervisorName?: string;
}

export interface PlannedDayStep {
  day: number;
  date: string;
  phase: HeatingPhase;
  phaseLabel: string;
  targetSupplyTempC: number;
  prevTargetTempC: number;
  deltaFromPrevC: number;
  instruction: string;
  isChangeDay: boolean;
}

export interface DailyMeasurement {
  id: string;
  day: number;
  timestamp: string;
  boilerActualTempC?: number | null;
  supplyTempC: number;
  returnTempC: number;
  supplyTemp2C?: number | null;
  returnTemp2C?: number | null;
  roomTempC: number;
  systemPressureBar: number;
  flowRateLpm: number;
  ambientHumidityPct: number;
  cmMoisturePct: number | null;
  boilerPowerCounterW?: number | null;
  gasMeterM3?: number | null;
  note: string;
  operator: string;
}

export interface NormValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  title: string;
  detail: string;
  normReference: string;
}

export interface HeatingNotification {
  id: string;
  protocolId: string;
  day: number;
  scheduledTime: string;
  type: 'temp_change' | 'measurement_due' | 'cm_check' | 'pressure_alert' | 'norm_warning';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  browserEnabled: boolean;
  soundEnabled: boolean;
  morningReminderTime: string;
  eveningReminderTime: string;
  remindTempChanges: boolean;
  remindDailyLog: boolean;
  remindPressureAnomalies: boolean;
}

export const SCREED_LABELS: Record<ScreedType, string> = {
  cement: 'Jastrych cementowy (CT)',
  anhydrite: 'Jastrych anhydrytowy (CA)',
  cement_rapid: 'Cementowy szybkowiążący (CT-Rapid)',
};

export const HEAT_SOURCE_LABELS: Record<HeatSourceType, string> = {
  heat_pump: 'Pompa ciepła',
  gas_boiler: 'Kocioł gazowy kondensacyjny',
  electric_boiler: 'Kocioł elektryczny',
  district_buffer: 'Węzeł / Bufor ciepła',
};

export const FLOOR_FINISH_LABELS: Record<FloorFinishType, string> = {
  ceramic_tile: 'Płytki ceramiczne / Gres / Kamień',
  engineered_wood: 'Deska warstwowa / Parkiet',
  laminate_lvt: 'Panele laminowane / LVT',
  resin: 'Żywica / Mikrocement',
};

export const NORM_MODE_LABELS: Record<NormProfileMode, string> = {
  pn_en_1264_functional: 'PN-EN 1264-4 Funkcyjne (Standard)',
  pn_en_1264_cm_ready: 'PN-EN 1264-4 + Dosuszanie pod okładzinę (CM)',
  custom_validated: 'Profil własny z kontrolą normy',
};

export const PHASE_LABELS: Record<HeatingPhase, string> = {
  stabilization: 'Faza 1 · Wygrzewanie wstępne',
  ramp_up: 'Faza 2 · Wzrost stopniowy',
  peak_hold: 'Faza 3 · Wygrzewanie maksymalne',
  cool_down: 'Faza 4 · Schładzanie kontrolowane',
  cm_reheat: 'Faza 5 · Dosuszanie końcowe (CM)',
};

export function addDaysIso(isoDate: string, daysToAdd: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return isoDate;
  }
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + daysToAdd));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const fromParts = fromIso.split('-').map(Number);
  const toParts = toIso.split('-').map(Number);
  if (
    fromParts.length !== 3 ||
    toParts.length !== 3 ||
    fromParts.some((n) => Number.isNaN(n)) ||
    toParts.some((n) => Number.isNaN(n))
  ) {
    return 0;
  }
  const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

export function getMinimumCuringDays(screedType: ScreedType): number {
  switch (screedType) {
    case 'cement':
      return 21;
    case 'anhydrite':
      return 7;
    case 'cement_rapid':
      return 5;
  }
}

export function getMaxAllowedCmMoisture(
  screedType: ScreedType,
  floorFinish: FloorFinishType,
): number {
  if (screedType === 'anhydrite') {
    return floorFinish === 'ceramic_tile' ? 0.5 : 0.3;
  }
  return floorFinish === 'ceramic_tile' || floorFinish === 'resin' ? 2.0 : 1.8;
}

export function generateHeatingSchedule(config: ProtocolConfig): PlannedDayStep[] {
  const steps: PlannedDayStep[] = [];
  const initialTemp = Math.max(15, Math.min(40, config.initialTempC));
  const maxTemp = Math.max(initialTemp, Math.min(65, config.maxSupplyTempC));
  const stepUp = Math.max(1, Math.min(15, config.stepUpPerDayC));
  const stepDown = Math.max(1, Math.min(15, config.stepDownPerDayC));
  const initialHold = Math.max(1, Math.min(10, config.initialHoldDays));
  const peakHold = Math.max(1, Math.min(14, config.peakHoldDays));

  let day = 1;
  let prevTemp = initialTemp;

  const pushStep = (
    phase: HeatingPhase,
    targetTemp: number,
    instruction: string,
  ) => {
    const delta = Number((targetTemp - prevTemp).toFixed(1));
    const isChangeDay = day === 1 || Math.abs(delta) > 0;
    steps.push({
      day,
      date: addDaysIso(config.startDate, day - 1),
      phase,
      phaseLabel: PHASE_LABELS[phase],
      targetSupplyTempC: targetTemp,
      prevTargetTempC: day === 1 ? targetTemp : prevTemp,
      deltaFromPrevC: day === 1 ? 0 : delta,
      instruction,
      isChangeDay,
    });
    prevTemp = targetTemp;
    day += 1;
  };

  // Phase 1: Initial Stabilization
  for (let i = 0; i < initialHold; i += 1) {
    pushStep(
      'stabilization',
      initialTemp,
      i === 0
        ? `Uruchom ogrzewanie i ustaw zasilanie na ${initialTemp}°C. Odpowietrz rozdzielacz i sprawdź przepływy.`
        : `Utrzymuj stałą temperaturę zasilania ${initialTemp}°C (dzień ${i + 1} z ${initialHold} stabilizacji wstępnej).`,
    );
  }

  // Phase 2: Gradual Ramp-Up (steps strictly below maxTemp)
  let currentTemp = initialTemp + stepUp;
  while (currentTemp < maxTemp) {
    pushStep(
      'ramp_up',
      currentTemp,
      `Podnieś temperaturę zasilania o +${stepUp}°C do poziomu ${currentTemp}°C i kontroluj dylatacje.`,
    );
    currentTemp += stepUp;
  }

  // Phase 3: Peak Hold (includes arrival at maxTemp for peakHold days)
  for (let i = 0; i < peakHold; i += 1) {
    const jump = Number((maxTemp - prevTemp).toFixed(1));
    const msg =
      i === 0 && jump > 0
        ? `Podnieś temperaturę zasilania o +${jump}°C do maksimum projektowego ${maxTemp}°C (dzień 1 z ${peakHold}).`
        : `Utrzymuj maksymalną temperaturę projektową ${maxTemp}°C bez przerw (dzień ${i + 1} z ${peakHold}).`;
    pushStep('peak_hold', maxTemp, msg);
  }

  // Phase 4: Controlled Cool-down back to initialTemp
  let coolTemp = maxTemp - stepDown;
  while (coolTemp > initialTemp) {
    pushStep(
      'cool_down',
      coolTemp,
      `Obniż temperaturę zasilania o -${stepDown}°C do poziomu ${coolTemp}°C. Unikaj przeciągów w budynku.`,
    );
    coolTemp -= stepDown;
  }
  if (prevTemp > initialTemp) {
    const drop = Number((prevTemp - initialTemp).toFixed(1));
    pushStep(
      'cool_down',
      initialTemp,
      `Obniż zasilanie o -${drop}°C do temperatury wyjściowej ${initialTemp}°C i zamknij cykl funkcyjny.`,
    );
  }

  // Phase 5: Optional CM Reheat & Readiness Cycle
  if (config.profileMode === 'pn_en_1264_cm_ready' && config.cmReheatDays > 0) {
    const reheatTemp = Math.min(maxTemp, Math.max(initialTemp + 10, maxTemp - 5));
    pushStep(
      'cm_reheat',
      reheatTemp,
      `Wykonaj pomiar wilgotności CM. Jeśli przekracza próg, podnieś ponownie zasilanie do ${reheatTemp}°C.`,
    );
    for (let i = 1; i < config.cmReheatDays; i += 1) {
      pushStep(
        'cm_reheat',
        reheatTemp,
        `Kontynuuj dosuszanie jastrychu przy ${reheatTemp}°C (dzień ${i + 1} z ${config.cmReheatDays}).`,
      );
    }
    pushStep(
      'cool_down',
      initialTemp,
      `Zakończ dosuszanie: obniż zasilanie do ${initialTemp}°C i wykonaj końcowy pomiar wilgotności CM.`,
    );
  }

  return steps;
}

export function validateProtocolCompliance(
  config: ProtocolConfig,
  measurements: DailyMeasurement[],
): NormValidationIssue[] {
  const issues: NormValidationIssue[] = [];
  const minCureDays = getMinimumCuringDays(config.screedType);
  const actualCureDays = diffDaysIso(config.pourDate, config.startDate);

  if (actualCureDays < minCureDays) {
    issues.push({
      id: 'cure_period',
      severity: 'error',
      code: 'KARENCJA',
      title: `Zbyt wczesne rozpoczęcie wygrzewania (${actualCureDays} z ${minCureDays} dni)`,
      detail: `${SCREED_LABELS[config.screedType]} wymaga minimum ${minCureDays} dni dojrzewania przed podaniem temperatury zasilania.`,
      normReference: 'PN-EN 1264-4 §4.4',
    });
  }

  if (config.initialTempC < 20 || config.initialTempC > 25) {
    issues.push({
      id: 'initial_temp',
      severity: config.initialTempC > 28 ? 'error' : 'warning',
      code: 'TEMP_START',
      title: `Temperatura początkowa (${config.initialTempC}°C) poza zakresem 20–25°C`,
      detail: 'Norma zaleca rozpoczęcie wygrzewania wstępnego od stałej temperatury zasilania 20–25°C.',
      normReference: 'PN-EN 1264-4 §4.4',
    });
  }

  if (config.initialHoldDays < 3) {
    issues.push({
      id: 'initial_hold',
      severity: 'error',
      code: 'CZAS_START',
      title: `Za krótka faza wstępna (${config.initialHoldDays} dni zamiast min. 3 dni)`,
      detail: 'Pierwszy etap o stałej temperaturze 25°C musi trwać minimum 3 pełne doby (72 godziny).',
      normReference: 'PN-EN 1264-4 §4.4',
    });
  }

  if (config.stepUpPerDayC > 5) {
    issues.push({
      id: 'ramp_rate',
      severity: 'error',
      code: 'SKOK_DOBOWY',
      title: `Zbyt duży skok dobowy (${config.stepUpPerDayC}°C/dobę > maks. 5°C)`,
      detail: 'Gwałtowne podnoszenie temperatury powyżej 5°C na dobę grozi naprężeniami termicznymi i pękaniem płyty grzewczej.',
      normReference: 'PN-EN 1264-4 / Wytyczne ITB',
    });
  }

  if (config.peakHoldDays < 4) {
    issues.push({
      id: 'peak_hold',
      severity: 'error',
      code: 'CZAS_MAKS',
      title: `Za krótkie wygrzewanie maksymalne (${config.peakHoldDays} dni zamiast min. 4 dni)`,
      detail: 'Maksymalną temperaturę projektową zasilania należy utrzymywać bez przerw przez minimum 4 dni.',
      normReference: 'PN-EN 1264-4 §4.4',
    });
  }

  if (config.maxSupplyTempC > 55) {
    issues.push({
      id: 'max_temp',
      severity: 'error',
      code: 'TEMP_MAKS',
      title: `Temperatura zasilania ${config.maxSupplyTempC}°C przekracza bezpieczne 55°C`,
      detail: 'W instalacjach podłogowych nie należy przekraczać 55°C na zasilaniu ze względu na trwałość rur i jastrychu.',
      normReference: 'PN-EN 1264-2 / 1264-4',
    });
  } else if (config.heatSource === 'heat_pump' && config.maxSupplyTempC > 48) {
    issues.push({
      id: 'hp_temp',
      severity: 'warning',
      code: 'POMPA_CIEPLA',
      title: `Wysoka temp. maksymalna (${config.maxSupplyTempC}°C) dla pompy ciepła`,
      detail: 'Standardowe układy z pompą ciepła projektuje się na zasilanie 35–45°C. Upewnij się co do wartości projektowej.',
      normReference: 'Projekt instalacji OZC',
    });
  }

  if (config.stepDownPerDayC > 10) {
    issues.push({
      id: 'cooldown_rate',
      severity: 'warning',
      code: 'SCHLADZANIE',
      title: `Zbyt szybkie schładzanie (${config.stepDownPerDayC}°C/dobę)`,
      detail: 'Zaleca się kontrolowane obniżanie temperatury o 5–10°C na dobę bez wychładzania przeciągami.',
      normReference: 'Wytyczne wykonawcze',
    });
  }

  if (config.hasMixingValve3D) {
    if (config.boilerTempC > 90) {
      issues.push({
        id: 'boiler_over_duro_max',
        severity: 'error',
        code: 'KOCIOL_MAX_90',
        title: `Temperatura kotła (${config.boilerTempC}°C) przekracza Tmax = 90°C grupy pompowej`,
        detail: 'Grupy pompowo-mieszające (np. Duro System 2 obiegi) dopuszczają maksymalnie 90°C po stronie pierwotnej.',
        normReference: 'Armatura grupy pompowej',
      });
    } else if (config.heatSource === 'gas_boiler' && config.boilerTempC > 82) {
      issues.push({
        id: 'boiler_over_condens_max',
        severity: 'warning',
        code: 'KOCIOL_82',
        title: `Temperatura kotła (${config.boilerTempC}°C) powyżej typowego maks. 82°C kotła kondensacyjnego`,
        detail: 'Kotły kondensacyjne (np. Bosch Condens GC5300iW 24 P) mają górny zakres c.o. 30–82°C; wyższa nastawa nie poprawia mieszania 3D i obniża kondensację.',
        normReference: 'Parametry źródła ciepła',
      });
    }

    if (config.maxSupplyTempC > config.mixingValveMaxTempC) {
      issues.push({
        id: 'mixing_valve_limit',
        severity: 'error',
        code: 'ZAWOR_3D',
        title: `Krzywa (${config.maxSupplyTempC}°C) przekracza limit zaworu 3D (${config.mixingValveMaxTempC}°C)`,
        detail: `Temperatura na piecu (${config.boilerTempC}°C) jest bezpiecznie separowana, ale zawór 3D ogranicza pętle do ${config.mixingValveMaxTempC}°C. Zwiększ nastawę zaworu 3D lub dopasuj temp. maksymalną krzywej do ${config.mixingValveMaxTempC}°C.`,
        normReference: 'Układ mieszający 3D',
      });
    } else if (config.mixingValveMaxTempC < 35) {
      issues.push({
        id: 'mixing_valve_low_max',
        severity: 'info',
        code: 'ZAWOR_3D_NISKI',
        title: `Niskotemperaturowy limit zaworu 3D (${config.mixingValveMaxTempC}°C przy piecu ${config.boilerTempC}°C)`,
        detail: `Wygrzewanie do ${config.mixingValveMaxTempC}°C jest zgodne z PN-EN 1264-4, jeśli jest to maksymalna temperatura projektowa pętli (np. pod parkiet/LVT). Gdy projekt zakłada 40–45°C, otwórz lub przestaw zawór 3D.`,
        normReference: 'PN-EN 1264-4 · Zawór 3D',
      });
    }
  }

  // Measurement-driven checks
  const sortedLogs = [...measurements].sort((a, b) => a.day - b.day);
  const latest = sortedLogs[sortedLogs.length - 1];
  if (latest) {
    if (latest.systemPressureBar < 1.0 || latest.systemPressureBar > 2.5) {
      issues.push({
        id: 'pressure_range',
        severity: latest.systemPressureBar < 0.8 ? 'error' : 'warning',
        code: 'CISNIENIE',
        title: `Nieprawidłowe ciśnienie w układzie: ${latest.systemPressureBar.toFixed(2)} bar (Dzień ${latest.day})`,
        detail: 'Zalecane ciśnienie robocze w instalacji podłogowej wynosi 1.2 – 2.2 bar. Sprawdź szczelność i naczynie przeponowe.',
        normReference: 'Kontrola szczelności',
      });
    }

    const deltaT = Number((latest.supplyTempC - latest.returnTempC).toFixed(1));
    if (deltaT > 10) {
      issues.push({
        id: 'delta_t_high',
        severity: 'warning',
        code: 'DELTA_T',
        title: `Wysoka różnica zasilanie/powrót Sekcja 1: ΔT = ${deltaT.toFixed(1)}°C (Dzień ${latest.day})`,
        detail: 'ΔT powyżej 10°C sugeruje zbyt mały przepływ na rotametrach lub zapowietrzenie pętli grzewczych.',
        normReference: 'Regulacja hydrauliczna',
      });
    }

    if (latest.supplyTemp2C != null && latest.returnTemp2C != null) {
      const deltaT2 = Number((latest.supplyTemp2C - latest.returnTemp2C).toFixed(1));
      if (deltaT2 > 10) {
        issues.push({
          id: 'delta_t2_high',
          severity: 'warning',
          code: 'DELTA_T2',
          title: `Wysoka różnica zasilanie/powrót Sekcja 2: ΔT = ${deltaT2.toFixed(1)}°C (Dzień ${latest.day})`,
          detail: 'ΔT powyżej 10°C w drugim obiegu sugeruje zbyt mały przepływ lub zapowietrzenie pętli.',
          normReference: 'Regulacja hydrauliczna',
        });
      }
    }

    const maxCm = getMaxAllowedCmMoisture(config.screedType, config.floorFinish);
    if (latest.cmMoisturePct !== null && latest.cmMoisturePct > maxCm) {
      issues.push({
        id: 'cm_moisture',
        severity: 'info',
        code: 'WILGOTNOSC_CM',
        title: `Wilgotność CM ${latest.cmMoisturePct.toFixed(2)}% > próg ${maxCm.toFixed(1)}% dla wybranej okładziny`,
        detail: `Dla ${FLOOR_FINISH_LABELS[config.floorFinish]} wymagana wilgotność końcowa to maks. ${maxCm.toFixed(1)}% CM.`,
        normReference: 'Warunek odbioru podłoża CM',
      });
    }
  }

  return issues;
}

export function generateNotificationsForProtocol(
  config: ProtocolConfig,
  schedule: PlannedDayStep[],
  measurements: DailyMeasurement[],
  acknowledgedIds: Set<string>,
): HeatingNotification[] {
  const notifications: HeatingNotification[] = [];
  const currentStep =
    schedule.find((s) => s.day === config.activeDay) ?? schedule[schedule.length - 1];
  const issues = validateProtocolCompliance(config, measurements);

  if (currentStep) {
    const tempChangeId = `${config.id}_step_day_${currentStep.day}`;
    notifications.push({
      id: tempChangeId,
      protocolId: config.id,
      day: currentStep.day,
      scheduledTime: '08:00',
      type: 'temp_change',
      severity: currentStep.isChangeDay ? 'warning' : 'info',
      title: currentStep.isChangeDay
        ? `Dzień ${currentStep.day}: Zmiana nastawy na ${currentStep.targetSupplyTempC}°C`
        : `Dzień ${currentStep.day}: Utrzymanie nastawy ${currentStep.targetSupplyTempC}°C`,
      message: currentStep.instruction,
      acknowledged: acknowledgedIds.has(tempChangeId),
      createdAt: currentStep.date,
    });

    const hasLogForActiveDay = measurements.some((m) => m.day === currentStep.day);
    if (!hasLogForActiveDay) {
      const logDueId = `${config.id}_log_due_day_${currentStep.day}`;
      notifications.push({
        id: logDueId,
        protocolId: config.id,
        day: currentStep.day,
        scheduledTime: '19:00',
        type: 'measurement_due',
        severity: 'warning',
        title: `Brak dzisiejszego odczytu (Dzień ${currentStep.day})`,
        message: `Zanotuj temperaturę zasilania, powrotu oraz ciśnienie robocze dla nastawy ${currentStep.targetSupplyTempC}°C.`,
        acknowledged: acknowledgedIds.has(logDueId),
        createdAt: currentStep.date,
      });
    }

    if (currentStep.day >= schedule.length - 2) {
      const maxCm = getMaxAllowedCmMoisture(config.screedType, config.floorFinish);
      const cmId = `${config.id}_cm_final_${currentStep.day}`;
      notifications.push({
        id: cmId,
        protocolId: config.id,
        day: currentStep.day,
        scheduledTime: '12:00',
        type: 'cm_check',
        severity: 'info',
        title: `Wymagany końcowy pomiar wilgotności CM (≤ ${maxCm.toFixed(1)}%)`,
        message: `Zbliża się koniec cyklu dla ${FLOOR_FINISH_LABELS[config.floorFinish]}. Wykonaj próbę karbidową CM przed układaniem podłogi.`,
        acknowledged: acknowledgedIds.has(cmId),
        createdAt: currentStep.date,
      });
    }
  }

  for (const issue of issues) {
    const issueNotifId = `${config.id}_issue_${issue.id}`;
    notifications.push({
      id: issueNotifId,
      protocolId: config.id,
      day: config.activeDay,
      scheduledTime: 'Natychmiast',
      type: issue.code === 'CISNIENIE' ? 'pressure_alert' : 'norm_warning',
      severity: issue.severity === 'error' ? 'critical' : issue.severity === 'warning' ? 'warning' : 'info',
      title: `${issue.normReference}: ${issue.title}`,
      message: issue.detail,
      acknowledged: acknowledgedIds.has(issueNotifId),
      createdAt: currentStep?.date ?? config.startDate,
    });
  }

  return notifications;
}

export const DEMO_PROTOCOL_IDS = ['prot-parter-01', 'prot-pietro-02'] as const;

export function createCleanStarterProtocol(): ProtocolConfig {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayIso = `${y}-${m}-${d}`;
  return {
    id: `prot-clean-${Date.now()}`,
    name: 'Moja instalacja podłogowa',
    screedType: 'cement',
    heatSource: 'gas_boiler',
    floorFinish: 'ceramic_tile',
    pourDate: addDaysIso(todayIso, -22),
    startDate: todayIso,
    profileMode: 'pn_en_1264_functional',
    initialTempC: 25,
    maxSupplyTempC: 43,
    stepUpPerDayC: 5,
    stepDownPerDayC: 5,
    initialHoldDays: 3,
    peakHoldDays: 4,
    cmReheatDays: 0,
    activeDay: 1,
    hasMixingValve3D: true,
    boilerTempC: 60,
    mixingValveMaxTempC: 43,
  };
}

export function createSeedData(): {
  protocols: ProtocolConfig[];
  measurementsByProtocol: Record<string, DailyMeasurement[]>;
} {
  const p1: ProtocolConfig = {
    id: 'prot-parter-01',
    name: 'Dom Jednorodzinny — Parter',
    location: 'Salon, Kuchnia, Wiatrołap · 96 m²',
    screedType: 'cement',
    screedThicknessMm: 65,
    areaM2: 96,
    circuitCount: 9,
    heatSource: 'heat_pump',
    floorFinish: 'ceramic_tile',
    pourDate: '2026-10-16',
    startDate: '2026-11-09',
    profileMode: 'pn_en_1264_functional',
    initialTempC: 25,
    maxSupplyTempC: 45,
    stepUpPerDayC: 5,
    stepDownPerDayC: 5,
    initialHoldDays: 3,
    peakHoldDays: 4,
    cmReheatDays: 0,
    activeDay: 8,
    hasMixingValve3D: true,
    boilerTempC: 60,
    mixingValveMaxTempC: 45,
    installerName: 'Marek Kowalski (Instal-Tech)',
    supervisorName: 'Jan Nowak (Kierownik budowy)',
  };

  const p2: ProtocolConfig = {
    id: 'prot-pietro-02',
    name: 'Apartamentowiec — Strefa B (Anhydryt)',
    location: 'Piętro 2 · Sypialnie i Korytarz · 74 m²',
    screedType: 'anhydrite',
    screedThicknessMm: 50,
    areaM2: 74,
    circuitCount: 7,
    heatSource: 'gas_boiler',
    floorFinish: 'engineered_wood',
    pourDate: '2026-11-04',
    startDate: '2026-11-13',
    profileMode: 'pn_en_1264_cm_ready',
    initialTempC: 25,
    maxSupplyTempC: 45,
    stepUpPerDayC: 5,
    stepDownPerDayC: 5,
    initialHoldDays: 3,
    peakHoldDays: 4,
    cmReheatDays: 3,
    activeDay: 4,
    hasMixingValve3D: true,
    boilerTempC: 58,
    mixingValveMaxTempC: 45,
    installerName: 'Piotr Zieliński',
    supervisorName: 'Anna Wiśniewska',
  };

  const p1Measurements: DailyMeasurement[] = [
    {
      id: 'm1',
      day: 1,
      timestamp: '2026-11-09 08:30',
      supplyTempC: 25.1,
      returnTempC: 21.4,
      roomTempC: 16.5,
      systemPressureBar: 1.65,
      flowRateLpm: 1.8,
      ambientHumidityPct: 76,
      cmMoisturePct: 3.4,
      note: 'Rozruch pompy, odpowietrzenie wszystkich 9 pętli na rozdzielaczu.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm2',
      day: 2,
      timestamp: '2026-11-10 08:15',
      supplyTempC: 25.0,
      returnTempC: 22.1,
      roomTempC: 17.8,
      systemPressureBar: 1.64,
      flowRateLpm: 1.8,
      ambientHumidityPct: 74,
      cmMoisturePct: null,
      note: 'Praca stabilna, brak spadków ciśnienia.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm3',
      day: 3,
      timestamp: '2026-11-11 08:20',
      supplyTempC: 25.2,
      returnTempC: 22.6,
      roomTempC: 18.4,
      systemPressureBar: 1.63,
      flowRateLpm: 1.8,
      ambientHumidityPct: 71,
      cmMoisturePct: null,
      note: 'Koniec fazy wstępnej (72h). Dylatacje obwodowe czyste.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm4',
      day: 4,
      timestamp: '2026-11-12 08:05',
      supplyTempC: 30.1,
      returnTempC: 25.8,
      roomTempC: 19.6,
      systemPressureBar: 1.68,
      flowRateLpm: 1.8,
      ambientHumidityPct: 68,
      cmMoisturePct: 2.9,
      note: 'Podniesiono nastawę do 30°C. Wzrost wilgotności w pomieszczeniu — uchylono okna.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm5',
      day: 5,
      timestamp: '2026-11-13 08:10',
      supplyTempC: 34.8,
      returnTempC: 29.9,
      roomTempC: 21.1,
      systemPressureBar: 1.71,
      flowRateLpm: 1.8,
      ambientHumidityPct: 65,
      cmMoisturePct: null,
      note: 'Nastawa 35°C osiągnięta w 45 min.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm6',
      day: 6,
      timestamp: '2026-11-14 08:25',
      supplyTempC: 40.2,
      returnTempC: 34.7,
      roomTempC: 22.8,
      systemPressureBar: 1.74,
      flowRateLpm: 1.9,
      ambientHumidityPct: 61,
      cmMoisturePct: null,
      note: 'Nastawa 40°C. Brak rys skurczowych na powierzchni jastrychu.',
      operator: 'M. Kowalski',
    },
    {
      id: 'm7',
      day: 7,
      timestamp: '2026-11-15 08:10',
      supplyTempC: 44.9,
      returnTempC: 39.1,
      roomTempC: 24.3,
      systemPressureBar: 1.77,
      flowRateLpm: 1.9,
      ambientHumidityPct: 57,
      cmMoisturePct: 2.3,
      note: 'Osiągnięto maksymalną temp. projektową 45°C. Start 4-dniowego plateau.',
      operator: 'M. Kowalski',
    },
  ];

  const p2Measurements: DailyMeasurement[] = [
    {
      id: 'm2-1',
      day: 1,
      timestamp: '2026-11-13 09:00',
      supplyTempC: 25.0,
      returnTempC: 21.8,
      roomTempC: 17.2,
      systemPressureBar: 1.55,
      flowRateLpm: 1.6,
      ambientHumidityPct: 72,
      cmMoisturePct: 1.6,
      note: 'Mleczko anhydrytowe przeszlifowane przed startem.',
      operator: 'P. Zieliński',
    },
    {
      id: 'm2-2',
      day: 2,
      timestamp: '2026-11-14 09:00',
      supplyTempC: 25.2,
      returnTempC: 22.4,
      roomTempC: 18.0,
      systemPressureBar: 1.54,
      flowRateLpm: 1.6,
      ambientHumidityPct: 69,
      cmMoisturePct: null,
      note: 'Stabilizacja 25°C przebiega wzorowo.',
      operator: 'P. Zieliński',
    },
    {
      id: 'm2-3',
      day: 3,
      timestamp: '2026-11-15 09:00',
      supplyTempC: 24.9,
      returnTempC: 22.3,
      roomTempC: 18.6,
      systemPressureBar: 1.54,
      flowRateLpm: 1.6,
      ambientHumidityPct: 66,
      cmMoisturePct: null,
      note: 'Zakończono 3 dobę wstępną.',
      operator: 'P. Zieliński',
    },
  ];

  return {
    protocols: [p1, p2],
    measurementsByProtocol: {
      [p1.id]: p1Measurements,
      [p2.id]: p2Measurements,
    },
  };
}

function formatIcsDateTime(isoDate: string, hhmm: string): string {
  const dateCompact = isoDate.replaceAll('-', '');
  const [hh = '08', mm = '00'] = hhmm.split(':');
  return `${dateCompact}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
}

export function generateCalendarIcs(
  config: ProtocolConfig,
  schedule: PlannedDayStep[],
  settings: NotificationSettings,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TermoJastrych//PN-EN 1264-4//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const step of schedule) {
    const startMorning = formatIcsDateTime(step.date, settings.morningReminderTime);
    const uidMorning = `${config.id}-d${step.day}-morning@termojastrych`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidMorning}`,
      `DTSTAMP:${startMorning}`,
      `DTSTART:${startMorning}`,
      `DTEND:${startMorning}`,
      `SUMMARY:${config.name} — Dzień ${step.day}: Nastawa ${step.targetSupplyTempC}°C`,
      `DESCRIPTION:${step.phaseLabel}. ${step.instruction}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Ustaw zasilanie na ${step.targetSupplyTempC}°C (Dzień ${step.day})`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );

    if (settings.remindDailyLog) {
      const startEvening = formatIcsDateTime(step.date, settings.eveningReminderTime);
      const uidEvening = `${config.id}-d${step.day}-evening@termojastrych`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uidEvening}`,
        `DTSTAMP:${startEvening}`,
        `DTSTART:${startEvening}`,
        `DTEND:${startEvening}`,
        `SUMMARY:${config.name} — Dzień ${step.day}: Odczyt pomiarów i ciśnienia`,
        `DESCRIPTION:Zapisz temperaturę zasilania, powrotu oraz ciśnienie dla nastawy ${step.targetSupplyTempC}°C.`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:Wieczorna kontrola podłogówki (Dzień ${step.day})`,
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export interface MeterDeltaEntry {
  day: number;
  reading: number | null;
  totalDelta: number | null;
  dailyDelta: number | null;
  fromDay: number | null;
  toDay: number | null;
  spanDays: number;
  isAveraged: boolean;
  isCounterReset: boolean;
}

export interface MeterPeriodSummary {
  firstDay: number;
  lastDay: number;
  firstReading: number;
  lastReading: number;
  totalDelta: number | null;
  avgDailyDelta: number | null;
  readingsCount: number;
}

/**
 * Parses flexible meter input such as "1203W", "1400 W", "1 400,5 W", "1245.6 m3", "1245,6 m³".
 * Returns null for empty input; returns NaN for invalid non-empty strings.
 */
export function parseOptionalMeterInput(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : Number.NaN;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip optional trailing units like W, Wh, kW, kWh, m3, m³ and whitespace
  const withoutUnits = trimmed
    .replace(/\s*(kwh|wh|w|m3|m³)\s*$/i, '')
    .replace(/\s+/g, '')
    .replace(',', '.');

  if (!/^\d+(\.\d+)?$/.test(withoutUnits)) {
    return Number.NaN;
  }
  const parsed = Number(withoutUnits);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export function isValidOptionalMeterText(raw: string | number | null | undefined): boolean {
  const parsed = parseOptionalMeterInput(raw);
  return parsed === null || !Number.isNaN(parsed);
}

/**
 * Computes daily consumption deltas from cumulative readings, automatically averaging across
 * skipped days when readings are omitted for 1 or more days ("od - do").
 */
export function computeMeterDailyDeltas(
  measurements: DailyMeasurement[],
  selector: (m: DailyMeasurement) => number | null | undefined,
): Map<number, MeterDeltaEntry> {
  const result = new Map<number, MeterDeltaEntry>();
  const sorted = [...measurements].sort((a, b) => a.day - b.day);

  const anchors: {day: number; value: number}[] = [];
  for (const m of sorted) {
    const val = selector(m);
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      anchors.push({day: m.day, value: val});
    }
  }

  // Initialize entries for all logged days so skipped days can still receive interval averages
  for (const m of sorted) {
    const val = selector(m);
    const hasVal = val !== null && val !== undefined && Number.isFinite(val);
    result.set(m.day, {
      day: m.day,
      reading: hasVal ? Number(val) : null,
      totalDelta: null,
      dailyDelta: null,
      fromDay: null,
      toDay: null,
      spanDays: 0,
      isAveraged: false,
      isCounterReset: false,
    });
  }

  for (let i = 1; i < anchors.length; i += 1) {
    const prev = anchors[i - 1];
    const curr = anchors[i];
    const spanDays = curr.day - prev.day;
    if (spanDays <= 0) continue;

    const totalDelta = Number((curr.value - prev.value).toFixed(4));
    const isReset = totalDelta < 0;
    const dailyDelta = isReset ? null : Number((totalDelta / spanDays).toFixed(4));
    const isMultiDay = spanDays > 1;

    // Assign to all days in (prev.day .. curr.day] that exist in measurements, plus anchor curr.day
    for (let d = prev.day + 1; d <= curr.day; d += 1) {
      const existing = result.get(d);
      if (existing || d === curr.day) {
        result.set(d, {
          day: d,
          reading: d === curr.day ? curr.value : existing?.reading ?? null,
          totalDelta: isReset ? null : totalDelta,
          dailyDelta,
          fromDay: prev.day,
          toDay: curr.day,
          spanDays,
          isAveraged: isMultiDay || d !== curr.day,
          isCounterReset: isReset,
        });
      }
    }
  }

  return result;
}

export function computeMeterPeriodSummary(
  measurements: DailyMeasurement[],
  selector: (m: DailyMeasurement) => number | null | undefined,
): MeterPeriodSummary | null {
  const sorted = [...measurements].sort((a, b) => a.day - b.day);
  const anchors: {day: number; value: number}[] = [];
  for (const m of sorted) {
    const val = selector(m);
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      anchors.push({day: m.day, value: val});
    }
  }

  if (anchors.length === 0) return null;
  if (anchors.length === 1) {
    return {
      firstDay: anchors[0].day,
      lastDay: anchors[0].day,
      firstReading: anchors[0].value,
      lastReading: anchors[0].value,
      totalDelta: null,
      avgDailyDelta: null,
      readingsCount: 1,
    };
  }

  let totalDelta = 0;
  let totalSpanDays = 0;
  for (let i = 1; i < anchors.length; i += 1) {
    const span = anchors[i].day - anchors[i - 1].day;
    const delta = anchors[i].value - anchors[i - 1].value;
    if (span > 0 && delta >= 0) {
      totalDelta += delta;
      totalSpanDays += span;
    }
  }

  return {
    firstDay: anchors[0].day,
    lastDay: anchors[anchors.length - 1].day,
    firstReading: anchors[0].value,
    lastReading: anchors[anchors.length - 1].value,
    totalDelta: totalSpanDays > 0 ? Number(totalDelta.toFixed(4)) : null,
    avgDailyDelta: totalSpanDays > 0 ? Number((totalDelta / totalSpanDays).toFixed(4)) : null,
    readingsCount: anchors.length,
  };
}
