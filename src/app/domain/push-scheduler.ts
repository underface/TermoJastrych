import {
  generateHeatingSchedule,
  NotificationSettings,
  ProtocolConfig,
} from './heating-norm';

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: WebPushSubscriptionKeys;
}

export interface PushSubscriptionRecord {
  id: string;
  subscription: WebPushSubscriptionJSON;
  protocol: ProtocolConfig;
  settings: NotificationSettings;
  timezone: string;
  updatedAt: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
}

export interface DuePushJob {
  dedupeKey: string;
  endpoint: string;
  subscription: WebPushSubscriptionJSON;
  slot: 'morning' | 'evening';
  payload: PushPayload;
}

export function parseHhmmToMinutes(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return 8 * 60;
  }
  const hh = Math.max(0, Math.min(23, parts[0]));
  const mm = Math.max(0, Math.min(59, parts[1]));
  return hh * 60 + mm;
}

export function getZonedDateAndTime(
  now: Date,
  timeZone: string,
): {date: string; hhmm: string; minutesSinceMidnight: number} {
  let safeZone = timeZone || 'Europe/Warsaw';
  try {
    new Intl.DateTimeFormat('en-CA', {timeZone: safeZone}).format(now);
  } catch {
    safeZone = 'Europe/Warsaw';
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const year = map['year'] ?? '2026';
  const month = map['month'] ?? '01';
  const day = map['day'] ?? '01';
  const hour = map['hour'] === '24' ? '00' : (map['hour'] ?? '08');
  const minute = map['minute'] ?? '00';

  const date = `${year}-${month}-${day}`;
  const hhmm = `${hour}:${minute}`;
  return {
    date,
    hhmm,
    minutesSinceMidnight: Number(hour) * 60 + Number(minute),
  };
}

export function evaluateDuePushNotifications(
  records: PushSubscriptionRecord[],
  sentKeys: Set<string>,
  now: Date,
  catchUpWindowMinutes = 90,
): DuePushJob[] {
  const dueJobs: DuePushJob[] = [];

  for (const record of records) {
    const {protocol, settings, timezone, subscription} = record;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      continue;
    }

    const zoned = getZonedDateAndTime(now, timezone);
    const schedule = generateHeatingSchedule(protocol);
    const step = schedule.find((s) => s.date === zoned.date);
    if (!step) {
      continue;
    }

    const valveNote = protocol.hasMixingValve3D
      ? ` (Zawór 3D maks. ${protocol.mixingValveMaxTempC}°C)`
      : '';

    if (settings.remindTempChanges) {
      const targetMin = parseHhmmToMinutes(settings.morningReminderTime);
      const diff = zoned.minutesSinceMidnight - targetMin;
      if (diff >= 0 && diff <= catchUpWindowMinutes) {
        const dedupeKey = `${subscription.endpoint}::${protocol.id}::${zoned.date}::morning`;
        if (!sentKeys.has(dedupeKey)) {
          dueJobs.push({
            dedupeKey,
            endpoint: subscription.endpoint,
            subscription,
            slot: 'morning',
            payload: {
              title: step.isChangeDay
                ? `${protocol.name} — Dzień ${step.day}: Nastawa ${step.targetSupplyTempC}°C`
                : `${protocol.name} — Dzień ${step.day}: Utrzymaj ${step.targetSupplyTempC}°C`,
              body: `${step.instruction}${valveNote}`,
              url: '/',
              tag: `termojastrych-${protocol.id}-d${step.day}-morning`,
              requireInteraction: step.isChangeDay,
            },
          });
        }
      }
    }

    if (settings.remindDailyLog) {
      const targetMin = parseHhmmToMinutes(settings.eveningReminderTime);
      const diff = zoned.minutesSinceMidnight - targetMin;
      if (diff >= 0 && diff <= catchUpWindowMinutes) {
        const dedupeKey = `${subscription.endpoint}::${protocol.id}::${zoned.date}::evening`;
        if (!sentKeys.has(dedupeKey)) {
          dueJobs.push({
            dedupeKey,
            endpoint: subscription.endpoint,
            subscription,
            slot: 'evening',
            payload: {
              title: `${protocol.name} — Dzień ${step.day}: Wieczorny odczyt pomiarów`,
              body: `Zanotuj temperaturę zasilania/powrotu oraz ciśnienie dla nastawy ${step.targetSupplyTempC}°C${valveNote}.`,
              url: '/',
              tag: `termojastrych-${protocol.id}-d${step.day}-evening`,
              requireInteraction: false,
            },
          });
        }
      }
    }
  }

  return dueJobs;
}
