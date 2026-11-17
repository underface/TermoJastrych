import {isPlatformBrowser} from '@angular/common';
import {computed, inject, Injectable, PLATFORM_ID, signal} from '@angular/core';
import {
  createCleanStarterProtocol,
  createSeedData,
  DailyMeasurement,
  DEMO_PROTOCOL_IDS,
  generateCalendarIcs,
  generateHeatingSchedule,
  generateNotificationsForProtocol,
  getMaxAllowedCmMoisture,
  getMinimumCuringDays,
  HeatingNotification,
  NotificationSettings,
  ProtocolConfig,
  validateProtocolCompliance,
} from '../domain/heating-norm';

export type AppView = 'dashboard' | 'parameters' | 'log' | 'notifications';

export interface ToastBanner {
  id: string;
  severity: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
}

interface PersistedPayload {
  protocols: ProtocolConfig[];
  selectedProtocolId: string;
  measurementsByProtocol: Record<string, DailyMeasurement[]>;
  acknowledgedNotificationIds: string[];
  notificationSettings: NotificationSettings;
}

const STORAGE_KEY = 'termojastrych_state_v1';

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  browserEnabled: false,
  soundEnabled: true,
  morningReminderTime: '08:00',
  eveningReminderTime: '19:00',
  remindTempChanges: true,
  remindDailyLog: true,
  remindPressureAnomalies: true,
};

@Injectable({providedIn: 'root'})
export class HeatingState {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly seed = createSeedData();

  readonly activeView = signal<AppView>('dashboard');
  readonly protocols = signal<ProtocolConfig[]>(this.seed.protocols);
  readonly selectedProtocolId = signal<string>(this.seed.protocols[0].id);
  readonly measurementsByProtocol = signal<Record<string, DailyMeasurement[]>>(
    this.seed.measurementsByProtocol,
  );
  readonly acknowledgedNotificationIds = signal<string[]>([]);
  readonly notificationSettings = signal<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  readonly browserPermission = signal<NotificationPermission | 'unsupported'>('default');
  readonly toast = signal<ToastBanner | null>(null);
  readonly showNewProtocolModal = signal<boolean>(false);
  readonly showNewMeasurementModal = signal<boolean>(false);
  readonly showPrintModal = signal<boolean>(false);
  readonly showServerInstallModal = signal<boolean>(false);

  readonly activeProtocol = computed<ProtocolConfig>(() => {
    const list = this.protocols();
    const id = this.selectedProtocolId();
    return list.find((p) => p.id === id) ?? list[0];
  });

  readonly activeSchedule = computed(() => {
    return generateHeatingSchedule(this.activeProtocol());
  });

  readonly activeMeasurements = computed<DailyMeasurement[]>(() => {
    const map = this.measurementsByProtocol();
    const id = this.activeProtocol().id;
    return [...(map[id] ?? [])].sort((a, b) => a.day - b.day);
  });

  readonly activeValidationIssues = computed(() => {
    return validateProtocolCompliance(this.activeProtocol(), this.activeMeasurements());
  });

  readonly isNormCompliant = computed(() => {
    return !this.activeValidationIssues().some((issue) => issue.severity === 'error');
  });

  readonly activeDayStep = computed(() => {
    const schedule = this.activeSchedule();
    const day = this.activeProtocol().activeDay;
    return schedule.find((s) => s.day === day) ?? schedule[schedule.length - 1];
  });

  readonly latestMeasurement = computed<DailyMeasurement | null>(() => {
    const list = this.activeMeasurements();
    return list.length > 0 ? list[list.length - 1] : null;
  });

  readonly activeCmLimit = computed(() => {
    const p = this.activeProtocol();
    return getMaxAllowedCmMoisture(p.screedType, p.floorFinish);
  });

  readonly curingDaysElapsed = computed(() => {
    const p = this.activeProtocol();
    const fromParts = p.pourDate.split('-').map(Number);
    const toParts = p.startDate.split('-').map(Number);
    if (fromParts.length !== 3 || toParts.length !== 3) return 0;
    const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
    return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
  });

  readonly minCuringDaysRequired = computed(() => {
    return getMinimumCuringDays(this.activeProtocol().screedType);
  });

  readonly activeNotifications = computed<HeatingNotification[]>(() => {
    const ackSet = new Set(this.acknowledgedNotificationIds());
    const raw = generateNotificationsForProtocol(
      this.activeProtocol(),
      this.activeSchedule(),
      this.activeMeasurements(),
      ackSet,
    );
    const settings = this.notificationSettings();
    return raw.filter((n) => {
      if (n.type === 'temp_change' && !settings.remindTempChanges) return false;
      if (n.type === 'measurement_due' && !settings.remindDailyLog) return false;
      if (n.type === 'pressure_alert' && !settings.remindPressureAnomalies) return false;
      return true;
    });
  });

  readonly unreadNotificationCount = computed(() => {
    return this.activeNotifications().filter((n) => !n.acknowledged).length;
  });

  readonly hasDemoData = computed(() => {
    const demoSet = new Set<string>(DEMO_PROTOCOL_IDS);
    return this.protocols().some((p) => demoSet.has(p.id));
  });

  constructor() {
    if (this.isBrowser) {
      this.loadFromStorage();
      if ('Notification' in window) {
        this.browserPermission.set(Notification.permission);
      } else {
        this.browserPermission.set('unsupported');
      }
    }
  }

  setView(view: AppView): void {
    this.activeView.set(view);
  }

  selectProtocol(id: string): void {
    this.selectedProtocolId.set(id);
    this.saveToStorage();
  }

  setActiveDay(day: number): void {
    const maxDay = this.activeSchedule().length;
    const clamped = Math.max(1, Math.min(maxDay, day));
    const currentId = this.activeProtocol().id;
    this.protocols.update((list) =>
      list.map((p) => (p.id === currentId ? {...p, activeDay: clamped} : p)),
    );
    this.saveToStorage();
  }

  updateActiveProtocol(patch: Partial<ProtocolConfig>): void {
    const currentId = this.activeProtocol().id;
    this.protocols.update((list) =>
      list.map((p) => {
        if (p.id !== currentId) return p;
        const updated = {...p, ...patch};
        const scheduleLen = generateHeatingSchedule(updated).length;
        return {
          ...updated,
          activeDay: Math.max(1, Math.min(scheduleLen, updated.activeDay)),
        };
      }),
    );
    this.saveToStorage();
    this.showToast('success', 'Parametry zapisane', 'Krzywa wygrzewania została przeliczona.');
  }

  createProtocol(newConfig: Omit<ProtocolConfig, 'id' | 'activeDay'>): void {
    const id = `prot-${Date.now()}`;
    const created: ProtocolConfig = {
      ...newConfig,
      id,
      activeDay: 1,
    };
    this.protocols.update((list) => [...list, created]);
    this.measurementsByProtocol.update((map) => ({...map, [id]: []}));
    this.selectedProtocolId.set(id);
    this.showNewProtocolModal.set(false);
    this.activeView.set('dashboard');
    this.saveToStorage();
    this.showToast('success', 'Utworzono protokół', `Aktywny projekt: ${created.name}`);
  }

  logMeasurement(entry: Omit<DailyMeasurement, 'id'>): void {
    const protId = this.activeProtocol().id;
    const newItem: DailyMeasurement = {
      ...entry,
      id: `meas-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    };
    this.measurementsByProtocol.update((map) => {
      const existing = map[protId] ?? [];
      const filtered = existing.filter((m) => m.day !== entry.day);
      return {
        ...map,
        [protId]: [...filtered, newItem].sort((a, b) => a.day - b.day),
      };
    });
    this.saveToStorage();

    if (entry.systemPressureBar < 1.0 || entry.systemPressureBar > 2.5) {
      this.playChime();
      this.dispatchBrowserNotification(
        'Alert ciśnienia w instalacji',
        `Dzień ${entry.day}: odczyt ${entry.systemPressureBar.toFixed(2)} bar poza zakresem 1.0–2.5 bar.`,
      );
      this.showToast(
        'warning',
        `Zapisano pomiar · Alert ciśnienia (${entry.systemPressureBar.toFixed(2)} bar)`,
        'Sprawdź zawór dopełniający i naczynie przeponowe.',
      );
    } else {
      this.showToast(
        'success',
        `Zapisano pomiar dla Dnia ${entry.day}`,
        `Zasilanie ${entry.supplyTempC.toFixed(1)}°C / Powrót ${entry.returnTempC.toFixed(1)}°C`,
      );
    }
  }

  deleteMeasurement(measurementId: string): void {
    const protId = this.activeProtocol().id;
    this.measurementsByProtocol.update((map) => ({
      ...map,
      [protId]: (map[protId] ?? []).filter((m) => m.id !== measurementId),
    }));
    this.saveToStorage();
    this.showToast('info', 'Usunięto wpis', 'Wpis pomiarowy został usunięty z dziennika.');
  }

  acknowledgeNotification(id: string): void {
    this.acknowledgedNotificationIds.update((list) =>
      list.includes(id) ? list : [...list, id],
    );
    this.saveToStorage();
  }

  unacknowledgeNotification(id: string): void {
    this.acknowledgedNotificationIds.update((list) => list.filter((x) => x !== id));
    this.saveToStorage();
  }

  acknowledgeAllActive(): void {
    const ids = this.activeNotifications().map((n) => n.id);
    this.acknowledgedNotificationIds.update((list) => Array.from(new Set([...list, ...ids])));
    this.saveToStorage();
    this.showToast('success', 'Potwierdzono wszystkie', 'Wszystkie bieżące alerty zostały odhaczone.');
  }

  updateNotificationSettings(patch: Partial<NotificationSettings>): void {
    this.notificationSettings.update((curr) => ({...curr, ...patch}));
    this.saveToStorage();
  }

  async requestBrowserNotificationPermission(): Promise<void> {
    if (!this.isBrowser || !('Notification' in window)) {
      this.browserPermission.set('unsupported');
      this.showToast(
        'warning',
        'Powiadomienia przeglądarkowe niedostępne',
        'Ta przeglądarka nie obsługuje natywnego API powiadomień. Alerty działają w aplikacji.',
      );
      return;
    }

    try {
      const result = await Notification.requestPermission();
      this.browserPermission.set(result);
      if (result === 'granted') {
        this.updateNotificationSettings({browserEnabled: true});
        this.dispatchBrowserNotification(
          'TermoJastrych — Powiadomienia aktywne',
          'Otrzymasz przypomnienia o zmianach temperatury i pomiarach PN-EN 1264-4.',
        );
        this.showToast('success', 'Powiadomienia włączone', 'Zgoda na powiadomienia systemowe została zapisana.');
      } else {
        this.updateNotificationSettings({browserEnabled: false});
        this.showToast('warning', 'Brak zgody przeglądarki', 'Możesz nadal korzystać z centrum alertów w aplikacji.');
      }
    } catch {
      this.showToast('info', 'Tryb alertów w aplikacji', 'Powiadomienia będą wyświetlane bezpośrednio w panelu.');
    }
  }

  triggerTestNotification(): void {
    const step = this.activeDayStep();
    const title = `Dzień ${step.day}: Nastawa ${step.targetSupplyTempC}°C`;
    const body = step.instruction;

    this.playChime();
    this.dispatchBrowserNotification(title, body);
    this.showToast('info', `Test powiadomienia · ${title}`, body);
  }

  resetDemoData(): void {
    const fresh = createSeedData();
    this.protocols.set(fresh.protocols);
    this.selectedProtocolId.set(fresh.protocols[0].id);
    this.measurementsByProtocol.set(fresh.measurementsByProtocol);
    this.acknowledgedNotificationIds.set([]);
    this.saveToStorage();
    this.showToast('info', 'Przywrócono dane wzorcowe', 'Załadowano przykładowe protokoły PN-EN 1264-4.');
  }

  clearDemoData(): void {
    const demoSet = new Set<string>(DEMO_PROTOCOL_IDS);
    const customProtocols = this.protocols().filter((p) => !demoSet.has(p.id));

    if (customProtocols.length > 0 && this.hasDemoData()) {
      const nextMeasurements: Record<string, DailyMeasurement[]> = {};
      const currentMap = this.measurementsByProtocol();
      for (const p of customProtocols) {
        nextMeasurements[p.id] = currentMap[p.id] ?? [];
      }
      this.protocols.set(customProtocols);
      this.measurementsByProtocol.set(nextMeasurements);
      if (!customProtocols.some((p) => p.id === this.selectedProtocolId())) {
        this.selectedProtocolId.set(customProtocols[0].id);
      }
      this.acknowledgedNotificationIds.update((ids) =>
        ids.filter((id) => !DEMO_PROTOCOL_IDS.some((demoId) => id.startsWith(demoId))),
      );
      this.saveToStorage();
      this.showToast(
        'success',
        'Usunięto dane testowe / demo',
        'Pozostawiono wyłącznie Twoje własne protokoły i pomiary.',
      );
      return;
    }

    const clean = createCleanStarterProtocol();
    this.protocols.set([clean]);
    this.selectedProtocolId.set(clean.id);
    this.measurementsByProtocol.set({[clean.id]: []});
    this.acknowledgedNotificationIds.set([]);
    this.saveToStorage();
    this.showToast(
      'success',
      'Usunięto dane testowe / demo',
      'Utworzono czysty protokół startowy bez przykładowych pomiarów.',
    );
  }

  downloadCalendarIcs(): void {
    if (!this.isBrowser) return;
    const protocol = this.activeProtocol();
    const ics = generateCalendarIcs(
      protocol,
      this.activeSchedule(),
      this.notificationSettings(),
    );
    const blob = new Blob([ics], {type: 'text/calendar;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wygrzewanie-${protocol.id}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showToast(
      'success',
      'Pobrano plik kalendarza (.ics)',
      'Zaimportuj go do Kalendarza Google lub Apple w telefonie, aby dostawać powiadomienia push także przy zamkniętej stronie.',
    );
  }

  dismissToast(): void {
    this.toast.set(null);
  }

  private showToast(
    severity: ToastBanner['severity'],
    title: string,
    message: string,
  ): void {
    const id = `toast-${Date.now()}`;
    this.toast.set({id, severity, title, message});
    if (this.isBrowser) {
      setTimeout(() => {
        if (this.toast()?.id === id) {
          this.toast.set(null);
        }
      }, 5000);
    }
  }

  private dispatchBrowserNotification(title: string, body: string): void {
    if (!this.isBrowser || !('Notification' in window)) return;
    if (Notification.permission === 'granted' && this.notificationSettings().browserEnabled) {
      try {
        new Notification(title, {body});
      } catch {
        // Ignore browser notification errors in restricted headless contexts
      }
    }
  }

  private playChime(): void {
    if (!this.isBrowser || !this.notificationSettings().soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.34);
    } catch {
      // Ignore Web Audio autoplay blocks
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedPayload>;
      if (Array.isArray(parsed.protocols) && parsed.protocols.length > 0) {
        const normalized = parsed.protocols.map((p) => ({
          ...p,
          hasMixingValve3D: p.hasMixingValve3D ?? false,
          boilerTempC: p.boilerTempC ?? 60,
          mixingValveMaxTempC: p.mixingValveMaxTempC ?? 45,
        }));
        this.protocols.set(normalized);
      }
      if (typeof parsed.selectedProtocolId === 'string') {
        this.selectedProtocolId.set(parsed.selectedProtocolId);
      }
      if (parsed.measurementsByProtocol && typeof parsed.measurementsByProtocol === 'object') {
        this.measurementsByProtocol.set(parsed.measurementsByProtocol);
      }
      if (Array.isArray(parsed.acknowledgedNotificationIds)) {
        this.acknowledgedNotificationIds.set(parsed.acknowledgedNotificationIds);
      }
      if (parsed.notificationSettings && typeof parsed.notificationSettings === 'object') {
        this.notificationSettings.set({
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...parsed.notificationSettings,
        });
      }
    } catch {
      // Fallback to seed data on malformed localStorage
    }
  }

  private saveToStorage(): void {
    if (!this.isBrowser) return;
    try {
      const payload: PersistedPayload = {
        protocols: this.protocols(),
        selectedProtocolId: this.selectedProtocolId(),
        measurementsByProtocol: this.measurementsByProtocol(),
        acknowledgedNotificationIds: this.acknowledgedNotificationIds(),
        notificationSettings: this.notificationSettings(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
  }
}
