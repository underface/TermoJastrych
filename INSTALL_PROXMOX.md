# Instrukcja instalacji TermoJastrych na serwerze Proxmox VE

Aplikacja działa jako serwer Node.js (Angular SSR + Express API do powiadomień Web Push) i zawiera wbudowany zegar harmonogramu działający 24/7.

> **Ważne dla Androida (Edge / Opera):**
> Powiadomienia Web Push i instalacja PWA wymagają bezpiecznego połączenia **HTTPS**. Sama strona otwarta po lokalnym `http://192.168.x.x:4000` nie pozwoli na rejestrację powiadomień push w telefonie.

---

## 1. Utwórz kontener LXC w konsoli (Shell) hosta Proxmox VE

Możesz utworzyć kontener przez interfejs WWW Proxmoxa (Debian 12 / Ubuntu 24.04, 1–2 CPU, 2048 MB RAM, 8 GB dysku) albo jednym ciągiem poleceń w **Proxmox Node → Shell**:

```bash
# 1. Pobierz najnowszy szablon Debian 12
pveam update
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/{print $2; exit}')
pveam download local "$TEMPLATE"

# 2. Utwórz nieuprzywilejowany kontener LXC (zmień 120 na wolne ID kontenera i local-lvm na swój storage)
pct create 120 "local:vztmpl/$TEMPLATE" \
  --hostname termojastrych \
  --cores 2 --memory 2048 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 1

# 3. Włącz /dev/net/tun w LXC (wymagane dla Tailscale)
cat <<'EOF' >> /etc/pve/lxc/120.conf
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF

# 4. Uruchom kontener i wejdź do jego konsoli
pct start 120
pct enter 120
```

*(Po kompilacji `ng build` zużycie RAM spada do ~100 MB — możesz wtedy zmniejszyć limit RAM kontenera np. do 512 MB).*

---

## 2. Zainstaluj Node.js 22 w konsoli LXC

```bash
apt update && apt install -y curl git unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
```

---

## 3. Wgraj kod projektu do `/opt/termojastrych` i zbuduj aplikację

Katalog `/opt/termojastrych` nie istnieje dopóki nie skopiujesz tam plików projektu (np. pobranych jako ZIP lub wyeksportowanych na GitHub):

**Wariant 1 — z repozytorium GitHub:**
```bash
git clone https://github.com/TWOJ_USER/TWOJE_REPO.git /opt/termojastrych
```

**Wariant 2 — z paczki `.zip` pobranej na komputer:**
Wyślij paczkę na serwer (`scp termojastrych.zip root@IP_KONTENERA:/root/`) i rozpakuj ją w LXC:
```bash
mkdir -p /opt/termojastrych
unzip /root/termojastrych.zip -d /opt/termojastrych
```

Następnie zainstaluj zależności i wykonaj kompilację produkcyjną (użyj `npm install`, ponieważ projekt nie używa `package-lock.json`):

```bash
cd /opt/termojastrych
npm install
npm run build
```

Gotowy serwer zostanie utworzony w `dist/app/server/server.mjs`.

---

## 4. Wygeneruj stałe klucze VAPID i utwórz plik `.env`

```bash
cd /opt/termojastrych
npx web-push generate-vapid-keys
```

Utwórz plik `/opt/termojastrych/.env`:

```env
PORT=4000
VAPID_PUBLIC_KEY=WKLEJ_KLUCZ_PUBLICZNY
VAPID_PRIVATE_KEY=WKLEJ_KLUCZ_PRYWATNY
VAPID_SUBJECT=mailto:twoj@email.pl
```

*(Klucze możesz też wygenerować bezpośrednio w aplikacji w zakładce **Powiadomienia → Wygeneruj własną parę kluczy VAPID**).*

> **Skąd wziąć `PUSH_CRON_SECRET`?**
> Na **Proxmoxie** zmienna `PUSH_CRON_SECRET` **nie jest w ogóle potrzebna** (pomiń ją w `.env`), ponieważ usługa `systemd` działa ciągle 24/7 i sama sprawdza harmonogram co 60 sekund. Jeśli jednak uruchamiasz aplikację na hostingu bezserwerowym (np. Cloud Run) z zewnętrznym cronem, `PUSH_CRON_SECRET` to dowolne własne losowe hasło, które sam wymyślasz (np. przez `openssl rand -hex 24`).

---

## 5. Uruchom jako usługę `systemd` (autostart 24/7)

Utwórz plik `/etc/systemd/system/termojastrych.service`:

```ini
[Unit]
Description=TermoJastrych PN-EN 1264-4 + Web Push Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/termojastrych
EnvironmentFile=/opt/termojastrych/.env
ExecStart=/usr/bin/node /opt/termojastrych/dist/app/server/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Włącz i uruchom usługę:

```bash
systemctl daemon-reload
systemctl enable --now termojastrych
systemctl status termojastrych
```

---

## 6. Włącz HTTPS (wymagane przez PWA i Web Push)

### Opcja A — Tylko prywatnie przez Tailscale (zalecana, bez otwierania portów na świat)
1. Upewnij się, że w kroku 1 dodałeś `/dev/net/tun` do `/etc/pve/lxc/120.conf`.
2. W konsoli kontenera LXC (`pct enter 120`) zainstaluj Tailscale i uruchom **prywatny** serwer HTTPS:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   tailscale serve --bg 4000
   ```
   *(Użyj `tailscale serve` — **nie** `tailscale funnel`. Wtedy adres `https://termojastrych.twoja-siec.ts.net` ma ważny certyfikat HTTPS i jest dostępny wyłącznie dla Twoich urządzeń zalogowanych w Tailscale).*
3. W panelu Tailscale (DNS) upewnij się, że masz włączone **MagicDNS** oraz **HTTPS Certificates**.
4. Otwórz aplikację na telefonie przez prywatny adres `https://termojastrych.twoja-siec.ts.net` (działa w domu i na budowie po LTE).

### Opcja B — Własna domena (Cloudflare Tunnel lub Nginx Proxy Manager)
* Skieruj subdomenę HTTPS z ważnym certyfikatem SSL na `http://127.0.0.1:4000` (lub lokalne IP kontenera na porcie `4000`).

---

## 7. Konfiguracja telefonu (Android + Edge / Opera)

1. Otwórz aplikację przez adres **`https://...`**.
2. Zainstaluj jako aplikację PWA (**Dodaj do ekranu głównego / Zainstaluj**).
3. W zakładce **Powiadomienia** kliknij **„Aktywuj Web Push (gdy strona zamknięta)”** oraz **„Test Push z serwera”**.
4. W ustawieniach Androida (**Aplikacje → Edge/Opera → Bateria**) ustaw **Bez ograniczeń**, aby system nie usypiał powiadomień przy zablokowanym ekranie.
5. Po uruchomieniu na własnym serwerze kliknij **„Usuń dane testowe / demo”** w stopce aplikacji, aby wyczyścić przykładowe protokoły.
