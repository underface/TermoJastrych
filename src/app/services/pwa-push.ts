import {isPlatformBrowser} from '@angular/common';
import {inject, Injectable, PLATFORM_ID, signal} from '@angular/core';
import {NotificationSettings, ProtocolConfig} from '../domain/heating-norm';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

interface PublicKeyResponse {
  publicKey: string;
  subject: string;
  configuredViaEnv: boolean;
  activeSubscriptions: number;
}

export interface GeneratedVapidPair {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

@Injectable({providedIn: 'root'})
export class PwaPushService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;

  readonly isOnline = signal<boolean>(true);
  readonly isInstalled = signal<boolean>(false);
  readonly isInstallable = signal<boolean>(false);
  readonly isIOS = signal<boolean>(false);
  readonly showIOSGuide = signal<boolean>(false);

  readonly swSupported = signal<boolean>(false);
  readonly swReady = signal<boolean>(false);
  readonly pushSupported = signal<boolean>(false);
  readonly pushSubscribed = signal<boolean>(false);
  readonly pushBusy = signal<boolean>(false);
  readonly pushEndpoint = signal<string | null>(null);
  readonly vapidPublicKey = signal<string | null>(null);
  readonly vapidConfiguredViaEnv = signal<boolean>(false);
  readonly activeServerSubscriptions = signal<number>(0);
  readonly generatedVapidPair = signal<GeneratedVapidPair | null>(null);
  readonly lastPushFeedback = signal<{
    severity: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);

  constructor() {
    if (this.isBrowser) {
      this.initBrowserCapabilities();
    }
  }

  private initBrowserCapabilities(): void {
    this.isOnline.set(navigator.onLine);
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));

    const nav = window.navigator as Navigator & {standalone?: boolean};
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    this.isInstalled.set(standalone);

    const ua = nav.userAgent.toLowerCase();
    this.isIOS.set(/iphone|ipad|ipod/.test(ua));

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredInstallPrompt = event as BeforeInstallPromptEvent;
      this.isInstallable.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.deferredInstallPrompt = null;
    });

    const hasSw = 'serviceWorker' in navigator;
    const hasPush = hasSw && 'PushManager' in window && 'Notification' in window;
    this.swSupported.set(hasSw);
    this.pushSupported.set(hasPush);

    if (hasSw) {
      void this.registerServiceWorker();
    }
    void this.fetchPublicKeyStatus();
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {scope: '/'});
      this.swRegistration = reg;
      this.swReady.set(true);

      if ('pushManager' in reg) {
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          this.pushSubscribed.set(true);
          this.pushEndpoint.set(existingSub.endpoint);
        }
      }
    } catch {
      this.swReady.set(false);
    }
  }

  async fetchPublicKeyStatus(): Promise<string | null> {
    if (!this.isBrowser) return null;
    try {
      const resp = await fetch('/api/push/public-key');
      if (!resp.ok) return null;
      const data = (await resp.json()) as PublicKeyResponse;
      this.vapidPublicKey.set(data.publicKey);
      this.vapidConfiguredViaEnv.set(data.configuredViaEnv);
      this.activeServerSubscriptions.set(data.activeSubscriptions ?? 0);
      return data.publicKey;
    } catch {
      return null;
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.isBrowser) return false;
    if (this.deferredInstallPrompt) {
      await this.deferredInstallPrompt.prompt();
      const {outcome} = await this.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        this.isInstalled.set(true);
        this.isInstallable.set(false);
        this.deferredInstallPrompt = null;
        return true;
      }
      return false;
    }
    this.showIOSGuide.set(true);
    return false;
  }

  async subscribePush(
    protocol: ProtocolConfig,
    settings: NotificationSettings,
  ): Promise<boolean> {
    if (!this.isBrowser || !this.pushSupported()) {
      this.lastPushFeedback.set({
        severity: 'warning',
        message: 'Twoja przeglądarka lub tryb uruchomienia nie obsługuje Service Worker / Push API.',
      });
      return false;
    }

    this.pushBusy.set(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.lastPushFeedback.set({
          severity: 'warning',
          message: 'Brak zgody na powiadomienia. Zezwól na powiadomienia w ustawieniach przeglądarki lub systemu.',
        });
        return false;
      }

      const reg = this.swRegistration ?? (await navigator.serviceWorker.ready);
      this.swRegistration = reg;
      this.swReady.set(true);

      const key = this.vapidPublicKey() ?? (await this.fetchPublicKeyStatus());
      if (!key) {
        this.lastPushFeedback.set({
          severity: 'error',
          message: 'Nie udało się pobrać klucza publicznego VAPID z serwera.',
        });
        return false;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }

      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          subscription: sub.toJSON(),
          protocol,
          settings,
          timezone,
        }),
      });

      if (!res.ok) {
        this.lastPushFeedback.set({
          severity: 'error',
          message: 'Serwer odrzucił rejestrację subskrypcji Push.',
        });
        return false;
      }

      const body = (await res.json()) as {activeSubscriptions?: number};
      this.pushSubscribed.set(true);
      this.pushEndpoint.set(sub.endpoint);
      this.activeServerSubscriptions.set(body.activeSubscriptions ?? 1);
      this.lastPushFeedback.set({
        severity: 'success',
        message: 'Urządzenie zapisane do zdalnych powiadomień Web Push (VAPID).',
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Błąd rejestracji Web Push.';
      this.lastPushFeedback.set({
        severity: 'error',
        message: `Nie udało się aktywować Web Push: ${msg}`,
      });
      return false;
    } finally {
      this.pushBusy.set(false);
    }
  }

  async unsubscribePush(): Promise<void> {
    if (!this.isBrowser) return;
    this.pushBusy.set(true);
    try {
      const reg = this.swRegistration ?? (await navigator.serviceWorker.getRegistration('/'));
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? this.pushEndpoint();

      if (sub) {
        await sub.unsubscribe();
      }
      if (endpoint) {
        const res = await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({endpoint}),
        });
        if (res.ok) {
          const data = (await res.json()) as {activeSubscriptions?: number};
          this.activeServerSubscriptions.set(data.activeSubscriptions ?? 0);
        }
      }

      this.pushSubscribed.set(false);
      this.pushEndpoint.set(null);
      this.lastPushFeedback.set({
        severity: 'info',
        message: 'Zdalne powiadomienia Web Push zostały wyłączone na tym urządzeniu.',
      });
    } catch {
      this.lastPushFeedback.set({
        severity: 'warning',
        message: 'Nie udało się w pełni wyrejestrować subskrypcji Push.',
      });
    } finally {
      this.pushBusy.set(false);
    }
  }

  async syncPushSchedule(
    protocol: ProtocolConfig,
    settings: NotificationSettings,
  ): Promise<void> {
    if (!this.isBrowser || !this.pushSubscribed()) return;
    const endpoint = this.pushEndpoint();
    if (!endpoint) return;

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

    try {
      const res = await fetch('/api/push/sync', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({endpoint, protocol, settings, timezone}),
      });
      if (res.status === 404) {
        // Server store reset (e.g. cold restart) — re-subscribe silently
        const reg = this.swRegistration ?? (await navigator.serviceWorker.getRegistration('/'));
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              subscription: sub.toJSON(),
              protocol,
              settings,
              timezone,
            }),
          });
        }
      }
    } catch {
      // Offline or transient sync error — silent retry next change
    }
  }

  async sendTestPush(protocol: ProtocolConfig): Promise<void> {
    if (!this.isBrowser) return;
    this.pushBusy.set(true);
    try {
      const reg = this.swRegistration ?? (await navigator.serviceWorker.getRegistration('/'));
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) {
        this.lastPushFeedback.set({
          severity: 'warning',
          message: 'Najpierw kliknij „Aktywuj Web Push”, aby zarejestrować urządzenie.',
        });
        return;
      }

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          subscription: sub.toJSON(),
          protocol,
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {error?: string};
        this.lastPushFeedback.set({
          severity: 'error',
          message: errBody.error ?? 'Błąd wysyłki testowego Push z serwera.',
        });
        return;
      }

      this.lastPushFeedback.set({
        severity: 'success',
        message: 'Serwer wysłał testowy sygnał Web Push do Service Workera.',
      });
    } catch {
      this.lastPushFeedback.set({
        severity: 'error',
        message: 'Brak połączenia z serwerem Web Push.',
      });
    } finally {
      this.pushBusy.set(false);
    }
  }

  async generateFreshVapidPair(): Promise<void> {
    if (!this.isBrowser) return;
    this.pushBusy.set(true);
    try {
      const res = await fetch('/api/push/generate-vapid', {method: 'POST'});
      if (!res.ok) {
        this.lastPushFeedback.set({
          severity: 'error',
          message: 'Nie udało się wygenerować pary kluczy VAPID.',
        });
        return;
      }
      const pair = (await res.json()) as GeneratedVapidPair;
      this.generatedVapidPair.set(pair);
    } catch {
      this.lastPushFeedback.set({
        severity: 'error',
        message: 'Brak połączenia z serwerem podczas generowania kluczy VAPID.',
      });
    } finally {
      this.pushBusy.set(false);
    }
  }
}
