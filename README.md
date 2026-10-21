# RxPOS

Pharmacy point of sale and management system that works **offline** and **online**: on Windows PCs, Android phones and in any browser,
across all your branches.

**Live:** https://rxposug.com. Each pharmacy has its own address, e.g. https://rxposug.com/citycare-ntinda.
The **owner** signs in on https://rxposug.com with the owner email and password (or the master key at https://rxposug.com/#/owner).

## Features

| Area | What you get |
| --- | --- |
| Sales | POS – Retail (F2) & Wholesale (F3), barcode scanning, **full keyboard control** (arrow keys through medicines, Alt+1…9 payment, Alt+↑/↓ cart lines; press ? for the list), **sales on hold** (Alt+H, switch with Alt+←/→, kept through a reload), **MTN MoMo & Airtel Money payment requests** (customer approves on their phone), cash / card / bank / insurance / credit, discounts, VAT, 58/80 mm thermal receipts with barcode (auto-print option), proformas (F10), refunds back into the same batches, sales history (F6) |
| Batches & expiry | Every delivery is a **batch** with its own expiry; sales use **first-expiry-first-out** automatically; expired stock is blocked unless the pharmacist confirms; per-batch stock card, counts, adjustments and write-offs |
| Medicine inventory | 9,700-item **standard catalog** in one click, **Excel/CSV import** with column matching, medicine list, formulations, inventory (F7), add stock (F4) with **new medicines added on the spot**, unit cost **or line total** (the other is worked out), **retail price worked out from the markup** (editable; never lowers an existing price; optional rounding in Settings) and an unfinished delivery kept through a reload, purchase history, quick edit, **barcode label printing** (Code 128, any label size / A4 sheets) |
| Stock count | **Stock take** that makes RxPOS match the shelves: full count, one shelf, a formulation, expiring stock, highest-value items, random spot checks or scan-as-you-go; **blind counts**; barcode scanning with Enter to the next box; a box per batch and batches found on the shelf; several people counting at once on different devices; sales made during the count are not undone; review shortages / extras with values, then post; count sheets (PDF) and CSV |
| Suppliers & money | **Returns to supplier** (credit note or refund), **supplier price comparison** (Reorder buys from the cheapest), **profit & margins** report with price check, **daily owner summary** email at 9 pm (preview / WhatsApp share in Settings) |
| Safety | **Controlled drugs register** (patient, prescriber, prescription recorded at the POS; running balances), **batch recall lookup**, **two-step sign-in** with an authenticator app |
| Scanning & packs | **Camera barcode scanning** (POS, Add Stock, Stock Count scan-to-count), **sell / receive by pack** (strip, box) with stock kept in tablets |
| Reorder | **Smart reorder suggestions** from real sales velocity, lead time and target cover; **dead-stock report**; purchase orders (print / WhatsApp to supplier) that receive straight into Add Stock |
| Branches | Unlimited branches, stock per branch, **stock transfers** (in transit → received, shortages recorded), owner overview of every branch, branch filters in sales & reports |
| People | Customers (allergies, insurance, credit limit), suppliers, prescriptions with refill intervals, **refill & debt reminders by WhatsApp or SMS** |
| Finance | Expenses & categories, banks with live balances, deposits / withdrawals / transfers, loans, debtors, creditors, cash book |
| Reports | Dashboard (today vs yesterday, 30-day trend, sales vs expenses, top 10), sales, sales by product, purchases, expenses, stock valuation, income statement, CSV export everywhere |
| Security | Accounts created by the owner (administrators) and each pharmacy's admin (staff), salted PBKDF2 passwords, first-sign-in password change, roles & permissions enforced on the server, **audit log** |
| Engagement | **Idle-screen promotions** (short expiry, slow movers, high value, best margin) with one-tap **WhatsApp sharing**, "Promote today" on the dashboard, **hourly reminders** with a soft chime, notification bell |
| Planner | **Calendar** with team events, refills due and expiring stock; subscribe in **Google Calendar / Outlook / phone** (private ICS link) |
| Storage | **Weather** for the pharmacy's town (Open-Meteo), storage advice, **fridge / room temperature log** with safe ranges and trend |
| Reliability | Works fully offline after the first sign-in, pushes changes within seconds and pulls every 10 s, 7 daily on-device snapshots, crash-recovery screen, dark mode, Ctrl+K search |

## Automatic updates

Every device keeps itself on the newest version published at rxposug.com (deployed from `main`); nobody reinstalls anything.

* **Browser / installed web app:** checks every 10 minutes and when it comes back to the screen; the new version is applied when nothing is in progress (no open sale, dialog or typing) or while the app is in the background.
* **Windows app:** downloads only the files that changed (each checked by SHA-256), switches when idle or at the next start, and goes back to the previous version by itself if a new one fails to start (`electron/updater.cjs`).
* **Android app:** downloads the new version in the background and switches at the next start or when idle, with the same automatic roll-back (Capgo updater, `src/update.js`).
* The version stays **1.0**; each build is identified by its commit time (shown in Settings → Data & backup → App version, with *Check for updates*).
* A new installer / APK is only needed when the native app itself changes (a new permission or plugin): raise `shell` in `scripts/release-files.mjs` and `SHELL` in `src/update.js` / `electron/updater.cjs`, and older apps say that a new installer is needed.

## How offline + online works

* Every device (desktop app or browser) keeps its **full database locally** (IndexedDB) and works with no network.
* Stock is never stored as a single number: every sale, purchase, refund and adjustment is a **stock movement**, and stock is the sum of movements. That lets devices that sold offline merge without losing sales.
* The first sign-in on a device (needs internet) downloads the pharmacy. After that it works offline, pushes its changes about 1.5 s after they are made, pulls everyone else's every 10 s (60 s in the background), and syncs immediately when the connection comes back. Conflicting edits to the same record: the latest edit wins.
* The browser version installs a service worker, so it opens even without internet.

## Installing the desktop app (Windows)

Download the latest `RxPOS Setup x.y.z.exe` (installer) or `RxPOS-Portable-x.y.z.exe` from this repository's **Releases** page (or from the latest **Actions** run → *RxPOS-Windows* artifact).
If Windows SmartScreen warns about an unknown publisher, choose *More info → Run anyway* (the app isn't code-signed).

## Running the Hub (for sync and online browser access)

Pick a strong secret (12+ characters) as the **sync key**. Everyone who has it can read and change the data, so keep it private.

**On the main Windows PC (same building / LAN), no extra software needed:**

```bat
"%LOCALAPPDATA%\Programs\RxPOS\RxPOS.exe" --hub --key=YOUR-SECRET-KEY
```

Other devices then link to `http://<main-PC-IP>:8686`. Allow port 8686 through Windows Firewall.

**On a server (online access from anywhere), needs Node.js 18+:**

```bash
RXPOS_SYNC_KEY=YOUR-SECRET-KEY node server/hub.mjs --port 8686 --data ./hub-data
```

Put it behind HTTPS (e.g. Caddy, nginx, or a host such as Render/Railway/Fly.io). Open `https://your-hub-address` in any browser to use RxPOS online. The hub serves the web app too.
The `RxPOS-Hub.zip` artifact from GitHub Actions contains everything needed. The hub keeps daily backups in `hub-data/backups`.

## Putting RxPOS online (recommended: Cloudflare, free, no card, no server)

The repo is ready for **Cloudflare Workers + D1** (free plan: 100,000 requests/day, 5 GB database, no credit card).
One deployment serves the web app *and* the sync hub on a free `https://<worker-name>.<your-name>.workers.dev` address (ours: api.rxposug.com),
on Cloudflare's global network (with servers in Africa), redeploying automatically on every push to GitHub.

1. Create a free account at **dash.cloudflare.com/sign-up**.
2. **Workers & Pages → Create → Import a repository** → connect GitHub → choose `rxpos`.
   * Build command: `npm ci && npm run build`  ·  Deploy command: `npx wrangler deploy`
   * The D1 database is created automatically on the first deploy.
3. After it deploys: **your Worker → Settings → Variables and Secrets → Add** → type *Secret*, name `SYNC_KEY`, value = a long secret (12+ characters). Save and redeploy.
4. Open your Worker address (ours: `https://rxposug.com`). That is RxPOS online. On Android/desktop browsers use *Install app / Add to Home screen*.
5. On every PC and phone: **Settings → Online sync** → that address + the same `SYNC_KEY`.

Check it: `https://api.rxposug.com/api/health` → `"configured": true`.

## Alternative: your own server with Coolify

[Coolify](https://github.com/coollabsio/coolify) (open source, Apache-2.0) is a self-hosted Heroku/Vercel alternative.
It deploys the hub straight from this private GitHub repo, gives it HTTPS automatically, keeps the data on a persistent disk,
and redeploys on every push. The hub then runs 24/7 on a server, not depending on the pharmacy PC or its power and internet.

1. **Get a small Linux server** (1 vCPU / 1–2 GB RAM is plenty). Free option: Oracle Cloud *Always Free* ARM VM. Cheap options: Hetzner, Contabo, DigitalOcean (about US$4–6/month).
2. **Install Coolify** on it (one command, from the Coolify docs):
   `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`, then open `http://<server-ip>:8000` and create the admin account.
3. **Connect GitHub:** *Sources → + Add → GitHub App*, and give it access to the private `rxpos` repository.
4. **Create the app:** *Projects → + New → Private Repository (GitHub App)* → `rxpos`, branch `main`, **Build Pack: Dockerfile**, port **8686**.
5. **Environment variable:** `RXPOS_SYNC_KEY` = a long secret (mark it *secret*).
6. **Persistent storage:** *Storages → + Add → Volume*, destination path **`/data`**. Without this, data is lost on redeploy.
7. **Domain:** keep Coolify's free generated `*.sslip.io` address, or enter your own domain. Coolify gets a Let's Encrypt HTTPS certificate automatically.
8. **Deploy.** Then:
   * open `https://<your-hub-address>` in any browser (phone, laptop, branch) to use RxPOS online. It keeps working offline once opened;
   * in each desktop app: *Settings → Online sync* → `https://<your-hub-address>` + the sync key.

Health check: `https://<your-hub-address>/api/health`. Backups: `/data/backups` inside the volume (daily, 30 kept). Coolify can also back up volumes.

The same image runs on any Docker host: `docker compose up -d` (put `RXPOS_SYNC_KEY=...` in a `.env` file).

### Alternative: keep the hub on the main PC, reachable online (Cloudflare Tunnel)

If you'd rather not run a server, [cloudflared](https://github.com/cloudflare/cloudflared) (open source, free tier) publishes the main PC's hub on an HTTPS address without opening router ports:

```bat
"%LOCALAPPDATA%\Programs\RxPOS\RxPOS.exe" --hub --key=YOUR-SECRET-KEY
cloudflared tunnel --url http://localhost:8686
```

The quick tunnel prints a random `https://….trycloudflare.com` address that changes on every restart. For a permanent address, add a domain to a free Cloudflare account and create a named tunnel.
Downside: online access only works while that PC is on and connected, so prefer Coolify for branches in other towns.

## Pharmacies, the owner console & signing in

Only the RxPOS owner creates pharmacies. Open **https://rxposug.com/#/owner** (web only) with the owner key
(`OWNER_KEY` secret; a copy is kept in `Documents\RxPOS-Data\RxPOS-OWNER-KEY.txt` on the setup PC).

1. **New pharmacy** → name, web address (e.g. `/citycare-ntinda`), extra branches, features, and the **administrator account**
   (temporary password; they choose their own at first sign-in). Copy or WhatsApp the welcome message.
2. Open a pharmacy to: edit its name, web address and notes; switch **features** on/off; add/edit/disable/delete **staff**
   (including more admins); add/rename/delete **branches**; browse, search, edit, add or delete **any record**; **export** all data or
   **import** a backup; set its own Mobile Money / SMS keys; issue a sync key; **reset** its data; **delete** it; suspend/reactivate it.
3. The pharmacy's administrator signs in at its web address (or in the Windows/Android app with the same email and password)
   and adds the other staff in **Users & Roles**. Admins cannot create other admins, add branches or change features: the cloud refuses it.

The Windows and Android apps only sign in to existing accounts; they have no "new pharmacy", branch or feature settings.

## Database: Cloudflare D1 or Turso (libSQL)

The cloud runs on Cloudflare D1 by default. To move it to [Turso](https://turso.tech) (open-source libSQL, MIT; free plan about
10 million row writes a month instead of D1's 100,000 a day):

1. Create a database and a read/write token at app.turso.tech, then run `deploysetup-turso.ps1` (stores `TURSO_URL` and `TURSO_AUTH_TOKEN` as Cloudflare secrets).
2. Copy everything: `node scripts/move-to-turso.mjs https://api.rxposug.com <owner key file>` (stops with "OK" when both sides match).
3. Set `"DB_BACKEND": "turso"` in `wrangler.jsonc` and `npx wrangler deploy`. To go back, set it to `""` and deploy.

The standard 9,710-medicine catalog is built into the apps, so it is never stored per pharmacy: creating a pharmacy costs a few
records, and only medicines a pharmacy adds or changes are synced. `node worker/test-harness.mjs` runs the cloud locally on libSQL files for tests.

## Mobile Money (MTN MoMo, Airtel Money) and SMS

Payments and SMS go through the cloud so your API keys never sit on the shop PCs. Add these as **Secrets** in
Cloudflare → Workers & Pages → `pharmapos` (the Worker's internal name) → Settings → Variables and Secrets (or `npx wrangler secret put NAME`):

| Service | Get keys from | Secrets |
| --- | --- | --- |
| MTN MoMo (Collections) | momodeveloper.mtn.com → subscribe to *Collections*; for live use apply for MTN Uganda MoMo API go-live | `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, `MTN_ENV` = `sandbox` or `production`, optional `MTN_TARGET` (default `mtnuganda`) |
| Airtel Money (Collections) | developers.airtel.africa → create an app with *Collection* product | `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_ENV` = `uat` or `production`, optional `AIRTEL_COUNTRY` (UG), `AIRTEL_CURRENCY` (UGX) |
| SMS | africastalking.com → API key (username `sandbox` for testing) | `AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID` |

Settings → Online & payments shows a green tick for each service once its keys work. Until then the POS records Mobile Money
by transaction ID, and reminders go out by WhatsApp (free, no keys needed).

### Airtel Money needs a fixed server IP (the relay)

Airtel only accepts API calls from server IP addresses whitelisted on its developer portal. Cloudflare Workers have no fixed
outgoing IP, so Airtel calls go through a tiny relay (`relay/airtel-relay.mjs`) on a VM with a static IP. Oracle Cloud's
*Always Free* tier is enough. The relay only accepts requests carrying its secret key and only forwards to Airtel's own API hosts.

1. Create an Ubuntu VM with a public IP (Oracle Cloud → Compute → Create instance, Always Free shape) using `Documents\rxpos-oracle-ssh-key.pub`.
2. Copy the relay and run the installer (sets up Node.js, Caddy HTTPS on `<ip>.sslip.io`, a systemd service and the firewall):
   ```bash
   scp -i ~/.ssh/rxpos_oracle relay/airtel-relay.mjs ubuntu@<ip>:/tmp/
   ssh -i ~/.ssh/rxpos_oracle ubuntu@<ip> "sudo mkdir -p /opt/rxpos-relay && sudo cp /tmp/airtel-relay.mjs /opt/rxpos-relay/ && sudo RELAY_SOURCE=file:///opt/rxpos-relay/airtel-relay.mjs bash -s" < relay/setup-relay.sh
   ```
3. Add the printed values as Cloudflare secrets `AIRTEL_RELAY_URL` and `AIRTEL_RELAY_KEY`, and whitelist the printed `PUBLIC_IP` on
   developers.airtel.ug → your app → Settings → Server IP Allowed List. Then add the Collection-APIs product and run
   `deploy\setup-mobile-money.ps1` → option 3.

## App signing & stores

* **Android:** every build is signed with the RxPOS release key (GitHub secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`). Keep an offline copy of the keystore somewhere safe: it's needed for every Google Play update.
  Releases contain `RxPOS-Android.apk` (install directly) and `RxPOS-GooglePlay.aab` (upload to Google Play Console:
  one-time US$25 developer account → Create app → Production → upload the .aab).
* **Windows:** to remove the "unknown publisher" warning, buy a code-signing certificate (or use Azure Trusted Signing) and add it as
  secrets `WINDOWS_CERT_B64` (the .pfx, base64) and `WINDOWS_CERT_PASSWORD`. The build signs automatically when they exist.

## Development

**Running, changing, testing, releasing, backing up and restoring RxPOS: see [MAINTENANCE.md](MAINTENANCE.md).** `npm test` runs every automated check against a throw-away local cloud.

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run electron:dev # desktop app
npm run dist:win     # Windows installer → release/
npm run hub          # sync hub (set RXPOS_SYNC_KEY first)
```

GitHub Actions (`.github/workflows/build.yml`) builds the Windows installer and the hub package on every push to `main`.
Pushing a tag such as `v1.0.0` publishes them as a GitHub Release.
