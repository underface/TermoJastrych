import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateVAPIDKeys, sendNotification, setVapidDetails} from 'web-push';
import {
  generateHeatingSchedule,
  NotificationSettings,
  ProtocolConfig,
} from './app/domain/heating-norm';
import {
  evaluateDuePushNotifications,
  PushSubscriptionRecord,
  WebPushSubscriptionJSON,
} from './app/domain/push-scheduler';

interface PersistedPushStore {
  vapidKeys?: {
    publicKey: string;
    privateKey: string;
  };
  subscriptions: Record<string, PushSubscriptionRecord>;
  sentKeys: string[];
}

const STORE_PATH = join(tmpdir(), 'termojastrych-webpush-store.json');
const MAX_SENT_HISTORY = 2000;

function loadStore(): PersistedPushStore {
  try {
    if (existsSync(STORE_PATH)) {
      const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<PersistedPushStore>;
      return {
        vapidKeys: parsed.vapidKeys,
        subscriptions: parsed.subscriptions ?? {},
        sentKeys: Array.isArray(parsed.sentKeys) ? parsed.sentKeys : [],
      };
    }
  } catch {
    // Fallback to clean store on malformed file
  }
  return {subscriptions: {}, sentKeys: []};
}

function saveStore(store: PersistedPushStore): void {
  try {
    const trimmedSent =
      store.sentKeys.length > MAX_SENT_HISTORY
        ? store.sentKeys.slice(store.sentKeys.length - MAX_SENT_HISTORY)
        : store.sentKeys;
    writeFileSync(
      STORE_PATH,
      JSON.stringify({...store, sentKeys: trimmedSent}, null, 2),
      'utf8',
    );
  } catch {
    // Ignore filesystem errors in read-only sandboxes
  }
}

function resolveVapidConfig(store: PersistedPushStore): {
  publicKey: string;
  privateKey: string;
  subject: string;
  configuredViaEnv: boolean;
} {
  const envPublic = process.env['VAPID_PUBLIC_KEY']?.trim() ?? '';
  const envPrivate = process.env['VAPID_PRIVATE_KEY']?.trim() ?? '';
  const subject =
    process.env['VAPID_SUBJECT']?.trim() || 'mailto:kontakt@termojastrych.local';

  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject,
      configuredViaEnv: true,
    };
  }

  if (!store.vapidKeys?.publicKey || !store.vapidKeys?.privateKey) {
    const generated = generateVAPIDKeys();
    store.vapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
    };
    saveStore(store);
  }

  return {
    publicKey: store.vapidKeys.publicKey,
    privateKey: store.vapidKeys.privateKey,
    subject,
    configuredViaEnv: false,
  };
}

function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

function isValidSubscription(sub: unknown): sub is WebPushSubscriptionJSON {
  if (!sub || typeof sub !== 'object') return false;
  const candidate = sub as Partial<WebPushSubscriptionJSON>;
  return (
    typeof candidate.endpoint === 'string' &&
    candidate.endpoint.startsWith('http') &&
    Boolean(candidate.keys) &&
    typeof candidate.keys?.p256dh === 'string' &&
    typeof candidate.keys?.auth === 'string'
  );
}

async function runPushTick(now = new Date()): Promise<{
  checked: number;
  sent: number;
  removed: number;
  failed: number;
}> {
  const store = loadStore();
  const vapid = resolveVapidConfig(store);
  setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const records = Object.values(store.subscriptions);
  const sentSet = new Set(store.sentKeys);
  const jobs = evaluateDuePushNotifications(records, sentSet, now, 90);

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await sendNotification(
        job.subscription,
        JSON.stringify(job.payload),
        {TTL: 3600},
      );
      sent += 1;
      if (!sentSet.has(job.dedupeKey)) {
        sentSet.add(job.dedupeKey);
        store.sentKeys.push(job.dedupeKey);
      }
    } catch (err: unknown) {
      const statusCode =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? Number((err as {statusCode?: number}).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        delete store.subscriptions[job.endpoint];
        removed += 1;
      } else {
        failed += 1;
      }
    }
  }

  if (sent > 0 || removed > 0) {
    saveStore(store);
  }

  return {
    checked: records.length,
    sent,
    removed,
    failed,
  };
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use('/api', express.json({limit: '256kb'}));

app.get('/api/push/public-key', (_req, res) => {
  const store = loadStore();
  const vapid = resolveVapidConfig(store);
  res.json({
    publicKey: vapid.publicKey,
    subject: vapid.subject,
    configuredViaEnv: vapid.configuredViaEnv,
    activeSubscriptions: Object.keys(store.subscriptions).length,
  });
});

app.post('/api/push/generate-vapid', (_req, res) => {
  const fresh = generateVAPIDKeys();
  res.json({
    publicKey: fresh.publicKey,
    privateKey: fresh.privateKey,
    subject: 'mailto:kontakt@termojastrych.local',
  });
});

app.post('/api/push/subscribe', (req, res) => {
  const body = req.body as {
    subscription?: unknown;
    protocol?: ProtocolConfig;
    settings?: NotificationSettings;
    timezone?: string;
  };

  if (!isValidSubscription(body?.subscription) || !body?.protocol || !body?.settings) {
    res.status(400).json({error: 'Nieprawidłowe dane subskrypcji Web Push.'});
    return;
  }

  const store = loadStore();
  const id = hashEndpoint(body.subscription.endpoint);
  store.subscriptions[body.subscription.endpoint] = {
    id,
    subscription: body.subscription,
    protocol: body.protocol,
    settings: body.settings,
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'Europe/Warsaw',
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);

  res.json({
    ok: true,
    id,
    activeSubscriptions: Object.keys(store.subscriptions).length,
  });
});

app.post('/api/push/sync', (req, res) => {
  const body = req.body as {
    endpoint?: string;
    protocol?: ProtocolConfig;
    settings?: NotificationSettings;
    timezone?: string;
  };

  if (!body?.endpoint || !body?.protocol || !body?.settings) {
    res.status(400).json({error: 'Brak endpointu lub parametrów protokołu.'});
    return;
  }

  const store = loadStore();
  const existing = store.subscriptions[body.endpoint];
  if (!existing) {
    res.status(404).json({error: 'Subskrypcja nie została znaleziona na serwerze.'});
    return;
  }

  store.subscriptions[body.endpoint] = {
    ...existing,
    protocol: body.protocol,
    settings: body.settings,
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : existing.timezone,
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);

  res.json({ok: true, id: existing.id});
});

app.post('/api/push/unsubscribe', (req, res) => {
  const body = req.body as {endpoint?: string};
  if (!body?.endpoint) {
    res.status(400).json({error: 'Brak adresu endpoint subskrypcji.'});
    return;
  }

  const store = loadStore();
  const existed = Boolean(store.subscriptions[body.endpoint]);
  delete store.subscriptions[body.endpoint];
  if (existed) {
    saveStore(store);
  }

  res.json({
    ok: true,
    removed: existed,
    activeSubscriptions: Object.keys(store.subscriptions).length,
  });
});

app.post('/api/push/send-test', async (req, res) => {
  const body = req.body as {
    subscription?: unknown;
    endpoint?: string;
    protocol?: ProtocolConfig;
  };

  const store = loadStore();
  const vapid = resolveVapidConfig(store);
  setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  let targetSub: WebPushSubscriptionJSON | undefined;
  let protocol = body?.protocol;

  if (isValidSubscription(body?.subscription)) {
    targetSub = body.subscription;
  } else if (typeof body?.endpoint === 'string' && store.subscriptions[body.endpoint]) {
    targetSub = store.subscriptions[body.endpoint].subscription;
    protocol = protocol ?? store.subscriptions[body.endpoint].protocol;
  }

  if (!targetSub) {
    res.status(400).json({error: 'Brak aktywnej subskrypcji Push na tym urządzeniu.'});
    return;
  }

  const schedule = protocol ? generateHeatingSchedule(protocol) : [];
  const step =
    schedule.find((s) => s.day === protocol?.activeDay) ?? schedule[0];
  const valveSuffix = protocol?.hasMixingValve3D
    ? ` · Zawór 3D maks. ${protocol.mixingValveMaxTempC}°C`
    : '';

  const payload = {
    title: step
      ? `TermoJastrych (Test Push) — Dzień ${step.day}: ${step.targetSupplyTempC}°C`
      : 'TermoJastrych — Test zdalnego Web Push',
    body: step
      ? `${step.instruction}${valveSuffix}`
      : 'Połączenie Web Push (VAPID) z serwerem działa poprawnie.',
    url: '/',
    tag: 'termojastrych-test-push',
    requireInteraction: false,
  };

  try {
    const result = await sendNotification(
      targetSub,
      JSON.stringify(payload),
      {TTL: 300},
    );
    res.json({ok: true, statusCode: result.statusCode});
  } catch (err: unknown) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as {statusCode?: number}).statusCode)
        : 500;
    if (statusCode === 404 || statusCode === 410) {
      delete store.subscriptions[targetSub.endpoint];
      saveStore(store);
    }
    const message = err instanceof Error ? err.message : 'Błąd wysyłki Web Push';
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: message,
      statusCode,
    });
  }
});

const handleTickRequest = async (req: express.Request, res: express.Response) => {
  const configuredSecret = process.env['PUSH_CRON_SECRET']?.trim();
  if (configuredSecret) {
    const authHeader = req.header('authorization') ?? '';
    const querySecret = typeof req.query['secret'] === 'string' ? req.query['secret'] : '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (bearer !== configuredSecret && querySecret !== configuredSecret) {
      res.status(401).json({error: 'Nieprawidłowy token PUSH_CRON_SECRET.'});
      return;
    }
  }

  const summary = await runPushTick(new Date());
  res.json({ok: true, timestamp: new Date().toISOString(), ...summary});
};

app.post('/api/push/tick', handleTickRequest);
app.get('/api/push/tick', handleTickRequest);

/**
 * Ensure Service Worker & Web App Manifest are never aggressively cached.
 */
app.use((req, res, next) => {
  if (req.path === '/sw.js' || req.path === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

const globalKey = '__termojastrych_push_interval__';
const globalHolder = globalThis as Record<string, unknown>;

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    if (!globalHolder[globalKey]) {
      globalHolder[globalKey] = setInterval(() => {
        runPushTick(new Date()).catch(() => undefined);
      }, 60_000);
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
