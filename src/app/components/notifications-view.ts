import {ChangeDetectionStrategy, Component, effect, inject, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {PwaPushService} from '../services/pwa-push';
import {HeatingState} from '../state/heating-state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-notifications-view',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6" data-testid="notifications-view">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">
            Centrum powiadomień i harmonogram przypomnień
          </h1>
          <p class="text-sm text-slate-500 mt-1">
            Alerty o zmianie temperatury zasilania, braku odczytów dobowych i anomaliach ciśnienia.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label for="notif-protocol-select" class="sr-only">Wybierz obiekt</label>
          <select
            id="notif-protocol-select"
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
            (click)="state.triggerTestNotification()"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">notifications_active</mat-icon>
            Wyślij testowe powiadomienie
          </button>
          <button
            type="button"
            (click)="state.acknowledgeAllActive()"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <mat-icon class="!text-[16px] !w-4 !h-4">done_all</mat-icon>
            Potwierdź wszystkie
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left: Active & Acknowledged Alerts Feed -->
        <section class="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <h2 class="text-sm font-semibold text-slate-900">
              Powiadomienia dla protokołu: {{ state.activeProtocol().name }}
            </h2>
            <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                (click)="showAcknowledged.set(false)"
                class="px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
                [class.bg-white]="!showAcknowledged()"
                [class.text-slate-900]="!showAcknowledged()"
                [class.shadow-sm]="!showAcknowledged()"
                [class.text-slate-600]="showAcknowledged()"
              >
                Oczekujące ({{ state.unreadNotificationCount() }})
              </button>
              <button
                type="button"
                (click)="showAcknowledged.set(true)"
                class="px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
                [class.bg-white]="showAcknowledged()"
                [class.text-slate-900]="showAcknowledged()"
                [class.shadow-sm]="showAcknowledged()"
                [class.text-slate-600]="!showAcknowledged()"
              >
                Wszystkie ({{ state.activeNotifications().length }})
              </button>
            </div>
          </div>

          <div class="divide-y divide-slate-200 mt-2">
            @for (notif of visibleNotifications(); track notif.id) {
              <article
                class="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                [class.opacity-60]="notif.acknowledged"
              >
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      class="font-semibold"
                      [class.text-rose-700]="notif.severity === 'critical'"
                      [class.text-amber-700]="notif.severity === 'warning'"
                      [class.text-sky-700]="notif.severity === 'info'"
                    >
                      @if (notif.severity === 'critical') {
                        ✖ Krytyczny
                      } @else if (notif.severity === 'warning') {
                        ▲ Wymaga uwagi
                      } @else {
                        ● Informacja
                      }
                    </span>
                    <span aria-hidden="true" class="text-slate-300">·</span>
                    <span class="font-mono text-slate-500 tabular-nums">
                      Dzień {{ notif.day }} · {{ notif.scheduledTime }}
                    </span>
                  </div>

                  <h3 class="text-sm font-semibold text-slate-900">{{ notif.title }}</h3>
                  <p class="text-xs text-slate-600 leading-relaxed">{{ notif.message }}</p>
                </div>

                <div class="shrink-0">
                  @if (!notif.acknowledged) {
                    <button
                      type="button"
                      (click)="state.acknowledgeNotification(notif.id)"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
                    >
                      <mat-icon class="!text-[15px] !w-4 !h-4">check</mat-icon>
                      Potwierdź wykonanie
                    </button>
                  } @else {
                    <button
                      type="button"
                      (click)="state.unacknowledgeNotification(notif.id)"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
                    >
                      <mat-icon class="!text-[15px] !w-4 !h-4">undo</mat-icon>
                      Przywróć
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <div class="py-10 text-center text-sm text-slate-500">
                Wszystkie przypomnienia na bieżący dzień zostały potwierdzone.
              </div>
            }
          </div>
        </section>

        <!-- Right: PWA, Web Push (VAPID) & Schedule Settings -->
        <aside class="lg:col-span-4 space-y-5">
          <section class="bg-white border border-slate-200 rounded-xl p-5" data-testid="web-push-panel">
            <h2 class="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              Powiadomienia na telefon (PWA i Web Push)
            </h2>

            <div class="mt-4 space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-slate-600">Instalacja aplikacji (PWA)</span>
                <span class="font-mono font-semibold text-slate-900">
                  @if (pwa.isInstalled()) {
                    ● Zainstalowana
                  } @else if (pwa.isInstallable()) {
                    ○ Gotowa do instalacji
                  } @else {
                    ○ Tryb przeglądarki
                  }
                </span>
              </div>

              @if (!pwa.isInstalled()) {
                <button
                  type="button"
                  (click)="pwa.promptInstall()"
                  class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors"
                  data-testid="pwa-install-button"
                >
                  <mat-icon class="!text-[16px] !w-4 !h-4">install_mobile</mat-icon>
                  @if (pwa.isInstallable()) {
                    Zainstaluj aplikację (PWA)
                  } @else {
                    Instrukcja instalacji PWA (iOS / Android)
                  }
                </button>
              }

              <div class="pt-2 border-t border-slate-100 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">Zdalny Web Push (VAPID)</span>
                  <span
                    class="font-mono font-semibold"
                    [class.text-emerald-700]="pwa.pushSubscribed()"
                    [class.text-slate-700]="!pwa.pushSubscribed()"
                  >
                    @if (pwa.pushSubscribed()) {
                      ● Aktywna subskrypcja
                    } @else if (!pwa.pushSupported()) {
                      ✖ Nieobsługiwane
                    } @else {
                      ○ Nieaktywny
                    }
                  </span>
                </div>

                <div class="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Service Worker (sw.js)</span>
                  <span class="font-mono">
                    @if (pwa.swReady()) {
                      ● Zarejestrowany
                    } @else {
                      ○ Oczekuje
                    }
                  </span>
                </div>

                @if (!pwa.pushSubscribed()) {
                  <button
                    type="button"
                    (click)="activateWebPush()"
                    [disabled]="pwa.pushBusy()"
                    class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                    data-testid="web-push-subscribe-btn"
                  >
                    <mat-icon class="!text-[16px] !w-4 !h-4">notifications_active</mat-icon>
                    Aktywuj Web Push (gdy strona zamknięta)
                  </button>
                } @else {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      (click)="sendServerTestPush()"
                      [disabled]="pwa.pushBusy()"
                      class="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                      data-testid="web-push-test-btn"
                    >
                      <mat-icon class="!text-[15px] !w-4 !h-4">send</mat-icon>
                      Test Push z serwera
                    </button>
                    <button
                      type="button"
                      (click)="pwa.unsubscribePush()"
                      [disabled]="pwa.pushBusy()"
                      class="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      data-testid="web-push-unsubscribe-btn"
                    >
                      <mat-icon class="!text-[15px] !w-4 !h-4">notifications_off</mat-icon>
                      Wyłącz Push
                    </button>
                  </div>
                }

                @if (pwa.lastPushFeedback(); as fb) {
                  <div
                    class="p-2.5 rounded-lg border text-[11px] leading-relaxed"
                    [class.bg-emerald-50]="fb.severity === 'success'"
                    [class.border-emerald-200]="fb.severity === 'success'"
                    [class.text-emerald-900]="fb.severity === 'success'"
                    [class.bg-amber-50]="fb.severity === 'warning'"
                    [class.border-amber-200]="fb.severity === 'warning'"
                    [class.text-amber-950]="fb.severity === 'warning'"
                    [class.bg-rose-50]="fb.severity === 'error'"
                    [class.border-rose-200]="fb.severity === 'error'"
                    [class.text-rose-950]="fb.severity === 'error'"
                    [class.bg-slate-50]="fb.severity === 'info'"
                    [class.border-slate-200]="fb.severity === 'info'"
                    [class.text-slate-700]="fb.severity === 'info'"
                  >
                    {{ fb.message }}
                  </div>
                }
              </div>

              <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-2">
                <p class="font-semibold text-slate-900">Klucze VAPID i Android (Edge / Opera)</p>
                <p>
                  Serwer wygenerował już automatyczny klucz startowy do testów. Aby klucze były stałe na produkcji, wygeneruj je poniżej i wpisz jako <span class="font-mono">VAPID_PUBLIC_KEY</span> / <span class="font-mono">VAPID_PRIVATE_KEY</span> w zmiennych środowiskowych hostingu (Sekrety / <span class="font-mono">.env</span>).
                </p>
                <p>
                  Na Androidzie w <strong>Edge</strong> lub <strong>Operze</strong> zainstaluj PWA do ekranu głównego i ustaw w systemie <em>Bateria → Bez ograniczeń</em>, aby telefon nie usypiał powiadomień.
                </p>

                <button
                  type="button"
                  (click)="pwa.generateFreshVapidPair()"
                  [disabled]="pwa.pushBusy()"
                  class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                  data-testid="generate-vapid-btn"
                >
                  <mat-icon class="!text-[15px] !w-4 !h-4">vpn_key</mat-icon>
                  Wygeneruj własną parę kluczy VAPID
                </button>

                <button
                  type="button"
                  (click)="state.showServerInstallModal.set(true)"
                  class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                  data-testid="notif-server-install-btn"
                >
                  <mat-icon class="!text-[15px] !w-4 !h-4">dns</mat-icon>
                  Instrukcja instalacji na Proxmox
                </button>

                @if (pwa.generatedVapidPair(); as pair) {
                  <div class="p-2.5 rounded-md bg-white border border-slate-300 space-y-1.5 font-mono text-[10px] break-all text-slate-800" data-testid="vapid-pair-output">
                    <p><span class="text-slate-500">VAPID_PUBLIC_KEY=</span>{{ pair.publicKey }}</p>
                    <p><span class="text-slate-500">VAPID_PRIVATE_KEY=</span>{{ pair.privateKey }}</p>
                    <p><span class="text-slate-500">VAPID_SUBJECT=</span>{{ pair.subject }}</p>
                  </div>
                }
              </div>

              <div class="pt-2 border-t border-slate-100 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">Powiadomienia otwartej karty</span>
                  <span class="font-mono font-semibold text-slate-900">
                    @if (state.browserPermission() === 'granted') {
                      ● Dozwolone
                    } @else if (state.browserPermission() === 'denied') {
                      ✖ Zablokowane
                    } @else if (state.browserPermission() === 'unsupported') {
                      Niedostępne
                    } @else {
                      Oczekuje
                    }
                  </span>
                </div>

                <button
                  type="button"
                  (click)="state.requestBrowserNotificationPermission()"
                  class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <mat-icon class="!text-[16px] !w-4 !h-4">notifications</mat-icon>
                  Zezwól na alerty w otwartej karcie
                </button>

                <button
                  type="button"
                  (click)="state.downloadCalendarIcs()"
                  class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors"
                  data-testid="download-ics-button"
                >
                  <mat-icon class="!text-[16px] !w-4 !h-4">event_available</mat-icon>
                  Pobierz przypomnienia do kalendarza (.ics)
                </button>
              </div>
            </div>
          </section>

          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <h2 class="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
              Harmonogram i reguły alertów
            </h2>

            <form [formGroup]="settingsForm" class="mt-4 space-y-4 text-xs">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="notif-morning" class="block font-medium text-slate-700 mb-1">
                    Godzina zmiany nastawy
                  </label>
                  <input
                    id="notif-morning"
                    type="time"
                    formControlName="morningReminderTime"
                    class="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label for="notif-evening" class="block font-medium text-slate-700 mb-1">
                    Godzina kontroli wieczornej
                  </label>
                  <input
                    id="notif-evening"
                    type="time"
                    formControlName="eveningReminderTime"
                    class="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span class="text-slate-700 font-medium">Sygnał dźwiękowy alertu</span>
                <input
                  type="checkbox"
                  formControlName="soundEnabled"
                  class="w-4 h-4 accent-orange-600 rounded"
                />
              </label>

              <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span class="text-slate-700 font-medium">Przypomnienia o zmianie °C</span>
                <input
                  type="checkbox"
                  formControlName="remindTempChanges"
                  class="w-4 h-4 accent-orange-600 rounded"
                />
              </label>

              <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span class="text-slate-700 font-medium">Przypomnienia o braku pomiaru</span>
                <input
                  type="checkbox"
                  formControlName="remindDailyLog"
                  class="w-4 h-4 accent-orange-600 rounded"
                />
              </label>

              <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span class="text-slate-700 font-medium">Alerty ciśnienia i ΔT</span>
                <input
                  type="checkbox"
                  formControlName="remindPressureAnomalies"
                  class="w-4 h-4 accent-orange-600 rounded"
                />
              </label>
            </form>
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class NotificationsView {
  readonly state = inject(HeatingState);
  readonly pwa = inject(PwaPushService);
  private readonly fb = inject(FormBuilder);

  readonly showAcknowledged = signal<boolean>(false);

  readonly settingsForm = this.fb.nonNullable.group({
    soundEnabled: [true],
    morningReminderTime: ['08:00'],
    eveningReminderTime: ['19:00'],
    remindTempChanges: [true],
    remindDailyLog: [true],
    remindPressureAnomalies: [true],
  });

  onProtocolChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.state.selectProtocol(select.value);
  }

  async activateWebPush(): Promise<void> {
    await this.pwa.subscribePush(
      this.state.activeProtocol(),
      this.state.notificationSettings(),
    );
  }

  async sendServerTestPush(): Promise<void> {
    await this.pwa.sendTestPush(this.state.activeProtocol());
  }

  visibleNotifications = () => {
    const all = this.state.activeNotifications();
    if (this.showAcknowledged()) return all;
    return all.filter((n) => !n.acknowledged);
  };

  constructor() {
    effect(() => {
      const s = this.state.notificationSettings();
      this.settingsForm.patchValue(
        {
          soundEnabled: s.soundEnabled,
          morningReminderTime: s.morningReminderTime,
          eveningReminderTime: s.eveningReminderTime,
          remindTempChanges: s.remindTempChanges,
          remindDailyLog: s.remindDailyLog,
          remindPressureAnomalies: s.remindPressureAnomalies,
        },
        {emitEvent: false},
      );
    });

    this.settingsForm.valueChanges.subscribe((val) => {
      this.state.updateNotificationSettings(val);
    });
  }
}
