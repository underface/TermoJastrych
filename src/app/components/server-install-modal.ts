import {ChangeDetectionStrategy, Component, output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-server-install-modal',
  imports: [MatIconModule],
  template: `
    <div
      class="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-install-title"
      data-testid="server-install-modal"
    >
      <div class="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 id="server-install-title" class="text-base font-bold text-slate-900">
              Instrukcja instalacji na własnym serwerze (Proxmox LXC)
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Pełne wdrożenie z serwerem Web Push 24/7 oraz HTTPS dla Androida (Edge / Opera).
            </p>
          </div>
          <button
            type="button"
            (click)="closed.emit()"
            aria-label="Zamknij instrukcję Proxmox"
            class="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <mat-icon class="!text-[20px] !w-5 !h-5">close</mat-icon>
          </button>
        </div>

        <div class="p-6 space-y-4 text-xs text-slate-700 leading-relaxed">
          <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
            <strong>Ważne (HTTPS):</strong> Web Push i instalacja PWA na Androidzie (Edge / Opera) wymagają szyfrowanego adresu <span class="font-mono">https://</span>. Na zwykłym <span class="font-mono">http://192.168.x.x:4000</span> przeglądarka zablokuje powiadomienia.
          </div>

          <section class="space-y-1.5">
            <h3 class="font-semibold text-slate-900">1. Kontener LXC w Proxmox + Node.js 22</h3>
            <p>Utwórz LXC (Debian 12 lub Ubuntu 24.04 · 2 vCPU · 2 GB RAM · 8 GB dysku), a następnie zainstaluj Node.js:</p>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">apt update && apt install -y curl git unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs</pre>
          </section>

          <section class="space-y-1.5">
            <h3 class="font-semibold text-slate-900">2. Budowanie projektu</h3>
            <p>Wgraj kod aplikacji do <span class="font-mono">/opt/termojastrych</span> (również w pliku <span class="font-mono">INSTALL_PROXMOX.md</span> w repozytorium):</p>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">cd /opt/termojastrych
npm ci
npm run build</pre>
          </section>

          <section class="space-y-1.5">
            <h3 class="font-semibold text-slate-900">3. Klucze VAPID i plik .env</h3>
            <p>Wygeneruj klucze poleceniem <span class="font-mono">npx web-push generate-vapid-keys</span> (lub przyciskiem w zakładce Powiadomienia) i zapisz w <span class="font-mono">/opt/termojastrych/.env</span>:</p>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">PORT=4000
VAPID_PUBLIC_KEY=TWOJ_KLUCZ_PUBLICZNY
VAPID_PRIVATE_KEY=TWOJ_KLUCZ_PRYWATNY
VAPID_SUBJECT=mailto:twoj@email.pl</pre>
            <p class="text-[11px] text-slate-500">
              <strong>Uwaga o PUSH_CRON_SECRET:</strong> na Proxmoxie <strong>nie potrzebujesz</strong> zmiennej <span class="font-mono">PUSH_CRON_SECRET</span> — możesz ją pominąć, bo wbudowany zegar działa automatycznie co 60 s. Jest ona potrzebna wyłącznie na hostingu bezserwerowym (np. Cloud Run) jako dowolne hasło wymyślone przez Ciebie do ochrony <span class="font-mono">/api/push/tick</span>.
            </p>
          </section>

          <section class="space-y-1.5">
            <h3 class="font-semibold text-slate-900">4. Usługa systemd (start 24/7)</h3>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto"># /etc/systemd/system/termojastrych.service
[Service]
WorkingDirectory=/opt/termojastrych
EnvironmentFile=/opt/termojastrych/.env
ExecStart=/usr/bin/node /opt/termojastrych/dist/app/server/server.mjs
Restart=always</pre>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">systemctl daemon-reload && systemctl enable --now termojastrych</pre>
          </section>

          <section class="space-y-1.5">
            <h3 class="font-semibold text-slate-900">5. Szybkie HTTPS przez Tailscale (bez otwierania portów)</h3>
            <pre class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
tailscale serve --bg 4000</pre>
            <p>Otwórz wygenerowany adres <span class="font-mono">https://...ts.net</span> w Edge lub Operze na Androidzie, zainstaluj PWA i aktywuj Web Push.</p>
          </section>
        </div>

        <div class="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            (click)="closed.emit()"
            class="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Zamknij instrukcję
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ServerInstallModal {
  readonly closed = output<void>();
}
