# RxPOS

Pharmacy point of sale and management system that works **offline** and **online**: on Windows PCs, Android phones and in any browser,
across all your branches.

**Live:** https://rxpos.pages.dev (Cloudflare, free plan). The older address https://pharmapos.pharmapos.workers.dev also keeps working.

## Features

| Area | What you get |
| --- | --- |
| Sales | POS – Retail (F2) & Wholesale (F3), barcode scanning, **MTN MoMo & Airtel Money payment requests** (customer approves on their phone), cash / card / bank / insurance / credit, discounts, VAT, 58/80 mm thermal receipts with barcode (auto-print option), proformas (F10), refunds back into the same batches, sales history (F6) |
| Batches & expiry | Every delivery is a **batch** with its own expiry; sales use **first-expiry-first-out** automatically; expired stock is blocked unless the pharmacist confirms; per-batch stock card, counts, adjustments and write-offs |
| Medicine inventory | 9,700-item **standard catalog** in one click, **Excel/CSV import** with column matching, medicine list, formulations, inventory (F7), add stock (F4), purchase history, quick edit, **barcode label printing** (Code 128, any label size / A4 sheets) |
| Reorder | **Smart reorder suggestions** from real sales velocity, lead time and target cover; **dead-stock report**; purchase orders (print / WhatsApp to supplier) that receive straight into Add Stock |
| Branches | Unlimited branches, stock per branch, **stock transfers** (in transit → received, shortages recorded), owner overview of every branch, branch filters in sales & reports |
| People | Customers (allergies, insurance, credit limit), suppliers, prescriptions with refill intervals, **refill & debt reminders by WhatsApp or SMS** |
| Finance | Expenses & categories, banks with live balances, deposits / withdrawals / transfers, loans, debtors, creditors, cash book |
| Reports | Dashboard (today vs yesterday, 30-day trend, sales vs expenses, top 10), sales, sales by product, purchases, expenses, stock valuation, income statement, CSV export everywhere |
| Security | Individual staff accounts (salted PBKDF2 passwords), roles (admin / pharmacist / cashier) enforced on the server, **audit log** of sign-ins, refunds, discounts, price changes, adjustments, write-offs, transfers and user changes |
| Reliability | Works fully offline, syncs every 30 s, per-table storage, 7 daily on-device snapshots, crash-recovery screen, dark mode, Ctrl+K search |

## How offline + online works

* Every device (desktop app or browser) keeps its **full database locally** (IndexedDB) and works with no network.
* Stock is never stored as a single number: every sale, purchase, refund and adjustment is a **stock movement**, and stock is the sum of movements. That lets devices that sold offline merge without losing sales.
* When a device is linked to a **RxPOS Hub** (Settings → Online sync), it pushes its changes and pulls everyone else's every 30 seconds, and as soon as the connection comes back. Conflicting edits to the same record: the latest edit wins.
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
PHARMAPOS_SYNC_KEY=YOUR-SECRET-KEY node server/hub.mjs --port 8686 --data ./hub-data
```

Put it behind HTTPS (e.g. Caddy, nginx, or a host such as Render/Railway/Fly.io). Open `https://your-hub-address` in any browser to use RxPOS online. The hub serves the web app too.
The `RxPOS-Hub.zip` artifact from GitHub Actions contains everything needed. The hub keeps daily backups in `hub-data/backups`.

## Putting RxPOS online (recommended: Cloudflare, free, no card, no server)

The repo is ready for **Cloudflare Workers + D1** (free plan: 100,000 requests/day, 5 GB database, no credit card).
One deployment serves the web app *and* the sync hub on a free `https://pharmapos.<your-name>.workers.dev` address,
on Cloudflare's global network (with servers in Africa), redeploying automatically on every push to GitHub.

1. Create a free account at **dash.cloudflare.com/sign-up**.
2. **Workers & Pages → Create → Import a repository** → connect GitHub → choose `pharmapos`.
   * Build command: `npm ci && npm run build`  ·  Deploy command: `npx wrangler deploy`
   * The D1 database is created automatically on the first deploy.
3. After it deploys: **your Worker → Settings → Variables and Secrets → Add** → type *Secret*, name `SYNC_KEY`, value = a long secret (12+ characters). Save and redeploy.
4. Open `https://pharmapos.<your-name>.workers.dev`. That is RxPOS online. On Android/desktop browsers use *Install app / Add to Home screen*.
5. On every PC and phone: **Settings → Online sync** → that address + the same `SYNC_KEY`.

Check it: `https://pharmapos.<your-name>.workers.dev/api/health` → `"configured": true`.

## Alternative: your own server with Coolify

[Coolify](https://github.com/coollabsio/coolify) (open source, Apache-2.0) is a self-hosted Heroku/Vercel alternative.
It deploys the hub straight from this private GitHub repo, gives it HTTPS automatically, keeps the data on a persistent disk,
and redeploys on every push. The hub then runs 24/7 on a server, not depending on the pharmacy PC or its power and internet.

1. **Get a small Linux server** (1 vCPU / 1–2 GB RAM is plenty). Free option: Oracle Cloud *Always Free* ARM VM. Cheap options: Hetzner, Contabo, DigitalOcean (about US$4–6/month).
2. **Install Coolify** on it (one command, from the Coolify docs):
   `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`, then open `http://<server-ip>:8000` and create the admin account.
3. **Connect GitHub:** *Sources → + Add → GitHub App*, and give it access to the private `pharmapos` repository.
4. **Create the app:** *Projects → + New → Private Repository (GitHub App)* → `pharmapos`, branch `main`, **Build Pack: Dockerfile**, port **8686**.
5. **Environment variable:** `PHARMAPOS_SYNC_KEY` = a long secret (mark it *secret*).
6. **Persistent storage:** *Storages → + Add → Volume*, destination path **`/data`**. Without this, data is lost on redeploy.
7. **Domain:** keep Coolify's free generated `*.sslip.io` address, or enter your own domain. Coolify gets a Let's Encrypt HTTPS certificate automatically.
8. **Deploy.** Then:
   * open `https://<your-hub-address>` in any browser (phone, laptop, branch) to use RxPOS online. It keeps working offline once opened;
   * in each desktop app: *Settings → Online sync* → `https://<your-hub-address>` + the sync key.

Health check: `https://<your-hub-address>/api/health`. Backups: `/data/backups` inside the volume (daily, 30 kept). Coolify can also back up volumes.

The same image runs on any Docker host: `docker compose up -d` (put `PHARMAPOS_SYNC_KEY=...` in a `.env` file).

### Alternative: keep the hub on the main PC, reachable online (Cloudflare Tunnel)

If you'd rather not run a server, [cloudflared](https://github.com/cloudflare/cloudflared) (open source, free tier) publishes the main PC's hub on an HTTPS address without opening router ports:

```bat
"%LOCALAPPDATA%\Programs\RxPOS\RxPOS.exe" --hub --key=YOUR-SECRET-KEY
cloudflared tunnel --url http://localhost:8686
```

The quick tunnel prints a random `https://….trycloudflare.com` address that changes on every restart. For a permanent address, add a domain to a free Cloudflare account and create a named tunnel.
Downside: online access only works while that PC is on and connected, so prefer Coolify for branches in other towns.

## Staff accounts & connecting devices

1. On the **owner's first device**: Settings → Online & payments → *With the sync key*: enter the cloud address and the sync key
   (stored in `Documents\PharmaPOS-SYNC-KEY.txt` on the PC that set up the cloud). This uploads your data, including staff accounts.
2. Add staff in Settings → Users (each person gets their own email + password and role).
3. On any other PC, phone or browser: **Join with my account** using their own email and password. No shared key needed.
   Cashiers can't change users, settings or branches, even if they tamper with their device; the cloud refuses it.

## Mobile Money (MTN MoMo, Airtel Money) and SMS

Payments and SMS go through the cloud so your API keys never sit on the shop PCs. Add these as **Secrets** in
Cloudflare → Workers & Pages → `pharmapos` → Settings → Variables and Secrets (or `npx wrangler secret put NAME`):

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

1. Create an Ubuntu VM with a public IP (Oracle Cloud → Compute → Create instance, Always Free shape) using `Documents\pharmapos-oracle-ssh-key.pub`.
2. Copy the relay and run the installer (sets up Node.js, Caddy HTTPS on `<ip>.sslip.io`, a systemd service and the firewall):
   ```bash
   scp -i ~/.ssh/pharmapos_oracle relay/airtel-relay.mjs ubuntu@<ip>:/tmp/
   ssh -i ~/.ssh/pharmapos_oracle ubuntu@<ip> "sudo mkdir -p /opt/rxpos-relay && sudo cp /tmp/airtel-relay.mjs /opt/rxpos-relay/ && sudo RELAY_SOURCE=file:///opt/rxpos-relay/airtel-relay.mjs bash -s" < relay/setup-relay.sh
   ```
3. Add the printed values as Cloudflare secrets `AIRTEL_RELAY_URL` and `AIRTEL_RELAY_KEY`, and whitelist the printed `PUBLIC_IP` on
   developers.airtel.ug → your app → Settings → Server IP Allowed List. Then add the Collection-APIs product and run
   `deploy\setup-mobile-money.ps1` → option 3.

## App signing & stores

* **Android:** every build is signed with the RxPOS release key (GitHub secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`; a backup is in `Documents\PharmaPOS-Android-Signing` on the setup PC. **Keep that folder safe**: it's needed for every update).
  Releases contain `RxPOS-Android.apk` (install directly) and `RxPOS-GooglePlay.aab` (upload to Google Play Console:
  one-time US$25 developer account → Create app → Production → upload the .aab).
* **Windows:** to remove the "unknown publisher" warning, buy a code-signing certificate (or use Azure Trusted Signing) and add it as
  secrets `WINDOWS_CERT_B64` (the .pfx, base64) and `WINDOWS_CERT_PASSWORD`. The build signs automatically when they exist.

## Development

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run electron:dev # desktop app
npm run dist:win     # Windows installer → release/
npm run hub          # sync hub (set PHARMAPOS_SYNC_KEY first)
```

GitHub Actions (`.github/workflows/build.yml`) builds the Windows installer and the hub package on every push to `main`.
Pushing a tag such as `v1.0.0` publishes them as a GitHub Release.
