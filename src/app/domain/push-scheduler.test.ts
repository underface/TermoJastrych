import assert from 'node:assert/strict';
import test from 'node:test';
import {createSeedData, NotificationSettings} from './heating-norm';
import {
  evaluateDuePushNotifications,
  getZonedDateAndTime,
  parseHhmmToMinutes,
  PushSubscriptionRecord,
} from './push-scheduler';

const BASE_SETTINGS: NotificationSettings = {
  browserEnabled: true,
  soundEnabled: true,
  morningReminderTime: '08:00',
  eveningReminderTime: '19:00',
  remindTempChanges: true,
  remindDailyLog: true,
  remindPressureAnomalies: true,
};

function makeRecord(overrides?: Partial<PushSubscriptionRecord>): PushSubscriptionRecord {
  const seed = createSeedData();
  return {
    id: 'sub-1',
    subscription: {
      endpoint: 'https://push.example.test/sub/abc123',
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key',
      },
    },
    protocol: seed.protocols[0], // startDate: 2026-11-09, hasMixingValve3D: true
    settings: BASE_SETTINGS,
    timezone: 'Europe/Warsaw',
    updatedAt: '2026-11-09T07:00:00Z',
    ...overrides,
  };
}

test('parseHhmmToMinutes and getZonedDateAndTime handle Europe/Warsaw accurately', () => {
  assert.equal(parseHhmmToMinutes('08:30'), 510);
  assert.equal(parseHhmmToMinutes('19:15'), 1155);

  // In November Poland is CET (UTC+1), so 07:10 UTC == 08:10 Europe/Warsaw
  const zoned = getZonedDateAndTime(new Date('2026-11-09T07:10:00Z'), 'Europe/Warsaw');
  assert.equal(zoned.date, '2026-11-09');
  assert.equal(zoned.hhmm, '08:10');
  assert.equal(zoned.minutesSinceMidnight, 490);
});

test('evaluateDuePushNotifications fires morning alert within window and includes 3D valve note', () => {
  const record = makeRecord();
  const sentKeys = new Set<string>();
  // 2026-11-09 08:15 CET (07:15 UTC) — Day 1 of seed protocol 1
  const now = new Date('2026-11-09T07:15:00Z');

  const due = evaluateDuePushNotifications([record], sentKeys, now, 90);
  assert.equal(due.length, 1);
  assert.equal(due[0].slot, 'morning');
  assert.ok(due[0].payload.title.includes('Dzień 1'));
  assert.ok(due[0].payload.title.includes('25°C'));
  assert.ok(due[0].payload.body.includes('Zawór 3D maks. 45°C'));
  assert.equal(due[0].payload.requireInteraction, true);

  // Deduplication prevents duplicate sends in same day
  sentKeys.add(due[0].dedupeKey);
  const dueSecondPass = evaluateDuePushNotifications([record], sentKeys, now, 90);
  assert.equal(dueSecondPass.length, 0);
});

test('evaluateDuePushNotifications fires evening reminder and skips outside window or disabled rules', () => {
  const record = makeRecord();
  const sentKeys = new Set<string>();

  // 19:20 CET (18:20 UTC) -> triggers evening reminder
  const eveningDue = evaluateDuePushNotifications(
    [record],
    sentKeys,
    new Date('2026-11-09T18:20:00Z'),
    90,
  );
  assert.equal(eveningDue.length, 1);
  assert.equal(eveningDue[0].slot, 'evening');
  assert.ok(eveningDue[0].payload.title.includes('Wieczorny odczyt'));

  // 22:00 CET (21:00 UTC) -> outside 90-minute catch-up window
  const lateDue = evaluateDuePushNotifications(
    [record],
    sentKeys,
    new Date('2026-11-09T21:00:00Z'),
    90,
  );
  assert.equal(lateDue.length, 0);

  // Disabled remindDailyLog suppresses evening slot
  const disabledRecord = makeRecord({
    settings: {...BASE_SETTINGS, remindDailyLog: false},
  });
  const suppressedDue = evaluateDuePushNotifications(
    [disabledRecord],
    sentKeys,
    new Date('2026-11-09T18:20:00Z'),
    90,
  );
  assert.equal(suppressedDue.length, 0);
});

test('evaluateDuePushNotifications skips dates outside protocol schedule', () => {
  const record = makeRecord();
  const sentKeys = new Set<string>();
  const beforeStart = evaluateDuePushNotifications(
    [record],
    sentKeys,
    new Date('2026-11-08T07:10:00Z'),
    90,
  );
  assert.equal(beforeStart.length, 0);
});
