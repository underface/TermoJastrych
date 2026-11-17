import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  computeMeterDailyDeltas,
  computeMeterPeriodSummary,
  createCleanStarterProtocol,
  createSeedData,
  DEMO_PROTOCOL_IDS,
  diffDaysIso,
  generateCalendarIcs,
  generateHeatingSchedule,
  generateNotificationsForProtocol,
  getMaxAllowedCmMoisture,
  getMinimumCuringDays,
  isValidOptionalMeterText,
  parseOptionalMeterInput,
  validateProtocolCompliance,
  type DailyMeasurement,
  type NotificationSettings,
  type ProtocolConfig,
} from './heating-norm';

test('date helpers calculate ISO day offsets accurately without timezone drift', () => {
  assert.equal(addDaysIso('2026-10-16', 24), '2026-11-09');
  assert.equal(diffDaysIso('2026-10-16', '2026-11-09'), 24);
  assert.equal(diffDaysIso('2026-11-01', '2026-11-08'), 7);
});

test('minimum curing days and CM limits match PN-EN 1264-4 rules', () => {
  assert.equal(getMinimumCuringDays('cement'), 21);
  assert.equal(getMinimumCuringDays('anhydrite'), 7);
  assert.equal(getMinimumCuringDays('cement_rapid'), 5);

  assert.equal(getMaxAllowedCmMoisture('cement', 'ceramic_tile'), 2.0);
  assert.equal(getMaxAllowedCmMoisture('cement', 'engineered_wood'), 1.8);
  assert.equal(getMaxAllowedCmMoisture('anhydrite', 'ceramic_tile'), 0.5);
  assert.equal(getMaxAllowedCmMoisture('anhydrite', 'engineered_wood'), 0.3);
});

test('standard PN-EN 1264-4 schedule builds exact 14-day functional profile for 25->45C', () => {
  const { protocols } = createSeedData();
  const schedule = generateHeatingSchedule(protocols[0]);

  assert.equal(schedule.length, 14);
  assert.deepEqual(
    schedule.map((s) => s.targetSupplyTempC),
    [25, 25, 25, 30, 35, 40, 45, 45, 45, 45, 40, 35, 30, 25],
  );
  assert.equal(schedule[0].phase, 'stabilization');
  assert.equal(schedule[3].phase, 'ramp_up');
  assert.equal(schedule[6].phase, 'peak_hold');
  assert.equal(schedule[9].phase, 'peak_hold');
  assert.equal(schedule[10].phase, 'cool_down');
  assert.equal(schedule[13].targetSupplyTempC, 25);
});

test('CM-ready profile extends schedule with reheat and final cool-down', () => {
  const { protocols } = createSeedData();
  const schedule = generateHeatingSchedule(protocols[1]);
  assert.equal(schedule.length, 18);
  assert.equal(schedule[14].phase, 'cm_reheat');
  assert.equal(schedule[17].phase, 'cool_down');
  assert.equal(schedule[17].targetSupplyTempC, 25);
});

test('validator reports zero errors for compliant seed protocols and flags norm violations', () => {
  const { protocols, measurementsByProtocol } = createSeedData();
  const compliantIssues = validateProtocolCompliance(
    protocols[0],
    measurementsByProtocol[protocols[0].id],
  );
  assert.equal(
    compliantIssues.filter((i) => i.severity === 'error').length,
    0,
  );

  const nonCompliant: ProtocolConfig = {
    ...protocols[0],
    pourDate: '2026-11-01', // only 8 days before 2026-11-09 (< 21 days for cement)
    stepUpPerDayC: 10, // exceeds 5 C/day
    initialHoldDays: 1, // < 3 days
    peakHoldDays: 2, // < 4 days
    maxSupplyTempC: 60, // > 55 C
  };

  const issues = validateProtocolCompliance(nonCompliant, []);
  const codes = new Set(issues.map((i) => i.code));
  assert.ok(codes.has('KARENCJA'));
  assert.ok(codes.has('SKOK_DOBOWY'));
  assert.ok(codes.has('CZAS_START'));
  assert.ok(codes.has('CZAS_MAKS'));
  assert.ok(codes.has('TEMP_MAKS'));
});

test('3D mixing valve validates loop cap independently of 60C boiler temperature', () => {
  const { protocols } = createSeedData();
  const cappedByValve: ProtocolConfig = {
    ...protocols[0],
    hasMixingValve3D: true,
    boilerTempC: 60,
    mixingValveMaxTempC: 34,
    maxSupplyTempC: 45,
  };
  const issuesOver = validateProtocolCompliance(cappedByValve, []);
  assert.ok(issuesOver.some((i) => i.code === 'ZAWOR_3D' && i.severity === 'error'));

  const alignedWithValve: ProtocolConfig = {
    ...cappedByValve,
    maxSupplyTempC: 34,
  };
  const issuesOk = validateProtocolCompliance(alignedWithValve, []);
  assert.equal(issuesOk.filter((i) => i.severity === 'error').length, 0);
  assert.ok(issuesOk.some((i) => i.code === 'ZAWOR_3D_NISKI' && i.severity === 'info'));

  const boilerOverCondens: ProtocolConfig = {
    ...alignedWithValve,
    heatSource: 'gas_boiler',
    boilerTempC: 85,
  };
  assert.ok(
    validateProtocolCompliance(boilerOverCondens, []).some(
      (i) => i.code === 'KOCIOL_82' && i.severity === 'warning',
    ),
  );

  const boilerOverDuro: ProtocolConfig = {
    ...alignedWithValve,
    heatSource: 'gas_boiler',
    boilerTempC: 95,
  };
  assert.ok(
    validateProtocolCompliance(boilerOverDuro, []).some(
      (i) => i.code === 'KOCIOL_MAX_90' && i.severity === 'error',
    ),
  );
});

test('notifications reflect active day instruction and missing daily measurement', () => {
  const { protocols, measurementsByProtocol } = createSeedData();
  const schedule = generateHeatingSchedule(protocols[0]);
  const ack = new Set<string>();
  const notifs = generateNotificationsForProtocol(
    protocols[0],
    schedule,
    measurementsByProtocol[protocols[0].id],
    ack,
  );

  assert.ok(notifs.some((n) => n.type === 'temp_change' && n.day === 8));
  assert.ok(notifs.some((n) => n.type === 'measurement_due' && n.day === 8));
});

test('generateCalendarIcs generates valid RFC 5545 VEVENT alarms for all protocol days', () => {
  const { protocols } = createSeedData();
  const schedule = generateHeatingSchedule(protocols[0]);
  const settings: NotificationSettings = {
    browserEnabled: false,
    soundEnabled: true,
    morningReminderTime: '08:00',
    eveningReminderTime: '19:30',
    remindTempChanges: true,
    remindDailyLog: true,
    remindPressureAnomalies: true,
  };
  const ics = generateCalendarIcs(protocols[0], schedule, settings);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('BEGIN:VALARM'));
  assert.ok(ics.includes('DTSTART:20261109T080000'));
  assert.ok(ics.includes('DTSTART:20261109T193000'));
  assert.ok(ics.endsWith('END:VCALENDAR'));
});

test('createCleanStarterProtocol creates a non-demo Bosch+Duro 3D starter protocol', () => {
  const starter = createCleanStarterProtocol();
  assert.ok(!DEMO_PROTOCOL_IDS.includes(starter.id as (typeof DEMO_PROTOCOL_IDS)[number]));
  assert.equal(starter.activeDay, 1);
  assert.equal(starter.hasMixingValve3D, true);
  assert.equal(starter.mixingValveMaxTempC, 43);
  assert.equal(starter.maxSupplyTempC, 43);
  assert.ok(generateHeatingSchedule(starter).length >= 10);
});

test('validateProtocolCompliance flags excessive delta T on Sekcja 2 (DELTA_T2)', () => {
  const starter = createCleanStarterProtocol();
  const issues = validateProtocolCompliance(starter, [
    {
      id: 'm-s2',
      day: 1,
      timestamp: '2026-11-17 08:00',
      boilerActualTempC: 60,
      supplyTempC: 25,
      returnTempC: 21,
      supplyTemp2C: 36,
      returnTemp2C: 24,
      roomTempC: 19,
      systemPressureBar: 1.7,
      flowRateLpm: 1.8,
      ambientHumidityPct: 60,
      cmMoisturePct: null,
      note: '',
      operator: 'Test',
    },
  ]);
  assert.ok(issues.some((i) => i.code === 'DELTA_T2' && i.severity === 'warning'));
});

test('parseOptionalMeterInput handles inputs like 1203W, 1400 W, 1245,6 m3 and empty strings', () => {
  assert.equal(parseOptionalMeterInput(''), null);
  assert.equal(parseOptionalMeterInput('   '), null);
  assert.equal(parseOptionalMeterInput('1203W'), 1203);
  assert.equal(parseOptionalMeterInput('1400 W'), 1400);
  assert.equal(parseOptionalMeterInput('1 400,5 W'), 1400.5);
  assert.equal(parseOptionalMeterInput('1245,6 m3'), 1245.6);
  assert.equal(parseOptionalMeterInput('1245.6 m³'), 1245.6);
  assert.equal(isValidOptionalMeterText('1400 W'), true);
  assert.equal(isValidOptionalMeterText('abc'), false);
});

test('computeMeterDailyDeltas averages across 3 skipped days (od - do) and computes period summary', () => {
  const mkDay = (
    day: number,
    boilerPowerCounterW: number | null,
    gasMeterM3: number | null,
  ): DailyMeasurement => ({
    id: `m-${day}`,
    day,
    timestamp: `2026-11-0${day} 08:00`,
    supplyTempC: 25,
    returnTempC: 21,
    roomTempC: 20,
    systemPressureBar: 1.7,
    flowRateLpm: 1.8,
    ambientHumidityPct: 60,
    cmMoisturePct: null,
    boilerPowerCounterW,
    gasMeterM3,
    note: '',
    operator: 'Test',
  });

  const logs: DailyMeasurement[] = [
    mkDay(1, 1203, 100.0),
    mkDay(2, null, null),
    mkDay(3, null, null),
    mkDay(4, 1503, 109.0),
    mkDay(5, 1653, 112.5),
  ];

  const powerMap = computeMeterDailyDeltas(logs, (m) => m.boilerPowerCounterW);
  assert.equal(powerMap.get(1)?.reading, 1203);
  assert.equal(powerMap.get(1)?.dailyDelta, null);

  // Days 2 and 3 omitted -> D1..D4 delta = +300 W over 3 days -> 100 W/day average
  assert.equal(powerMap.get(2)?.dailyDelta, 100);
  assert.equal(powerMap.get(2)?.fromDay, 1);
  assert.equal(powerMap.get(2)?.toDay, 4);
  assert.equal(powerMap.get(3)?.dailyDelta, 100);
  assert.equal(powerMap.get(4)?.totalDelta, 300);
  assert.equal(powerMap.get(4)?.dailyDelta, 100);
  assert.equal(powerMap.get(4)?.spanDays, 3);
  assert.equal(powerMap.get(4)?.isAveraged, true);

  // Day 5 has consecutive reading -> +150 W/day
  assert.equal(powerMap.get(5)?.dailyDelta, 150);
  assert.equal(powerMap.get(5)?.isAveraged, false);

  const gasMap = computeMeterDailyDeltas(logs, (m) => m.gasMeterM3);
  assert.equal(gasMap.get(4)?.totalDelta, 9);
  assert.equal(gasMap.get(4)?.dailyDelta, 3);
  assert.equal(gasMap.get(5)?.dailyDelta, 3.5);

  const powerSummary = computeMeterPeriodSummary(logs, (m) => m.boilerPowerCounterW);
  assert.equal(powerSummary?.totalDelta, 450);
  assert.equal(powerSummary?.avgDailyDelta, 112.5);
});
