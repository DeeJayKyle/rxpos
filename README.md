# PharmaPOS

Pharmacy point of sale and management system that works **offline** and **online**.
Runs as a Windows desktop app or in any browser, and keeps all your PCs and branches in sync through a PharmaPOS Hub.

## Features

| Area | What you get |
| --- | --- |
| Sales | POS – Retail (F2), POS – Wholesale (F3), barcode scanning, cash / mobile money / card / bank / insurance / **credit** sales, discounts, VAT, printable receipts, proformas (F10) with one-click conversion to a sale, refunds, sales history (F6) |
| Medicine inventory | Medicine list (retail + wholesale prices, auto-pricing by markup), formulations, inventory levels (F7), add stock / goods received (F4), purchase history, soon expiring & expired (with write-off), quick edit (spreadsheet-style price editing), stock card with running balance, stock counts and adjustments |
| People | Customers (allergies, insurance, credit limit), suppliers, prescriptions (record & dispense) |
| Finance | Expenses & categories, banks & accounts with live balances, deposits / withdrawals / transfers, loans & repayments, debtors (customers owe), creditors (we owe suppliers), cash book |
| Reports | Dashboard (today's sales & expenses, monthly sales, sales vs expenses, 30-day trend, top 10), sales report, sales by product, purchase report, expenses report, stock valuation, income statement, CSV export everywhere |
| System | Users & roles (admin / pharmacist / cashier), backup & restore, offline-first sync |

## How offline + online works

* Every device (desktop app or browser) keeps its **full database locally** (IndexedDB) and works with no network.
* Stock is never stored as a single number: every sale, purchase, refund and adjustment is a **stock movement**, and stock is the sum of movements. That lets devices that sold offline merge without losing sales.
* When a device is linked to a **PharmaPOS Hub** (Settings → Online sync), it pushes its changes and pulls everyone else's every 30 seconds, and as soon as the connection comes back. Conflicting edits to the same record: the latest edit wins.
* The browser version installs a service worker, so it opens even without internet.

## Installing the desktop app (Windows)

Download the latest `PharmaPOS Setup x.y.z.exe` (installer) or `PharmaPOS-Portable-x.y.z.exe` from this repository's **Releases** page (or from the latest **Actions** run → *PharmaPOS-Windows* artifact).
If Windows SmartScreen warns about an unknown publisher, choose *More info → Run anyway* (the app isn't code-signed).

## Running the Hub (for sync and online browser access)

Pick a strong secret (12+ characters) as the **sync key**. Everyone who has it can read and change the data, so keep it private.

**On the main Windows PC (same building / LAN), no extra software needed:**

```bat
"%LOCALAPPDATA%\Programs\PharmaPOS\PharmaPOS.exe" --hub --key=YOUR-SECRET-KEY
```

Other devices then link to `http://<main-PC-IP>:8686`. Allow port 8686 through Windows Firewall.

**On a server (online access from anywhere), needs Node.js 18+:**

```bash
PHARMAPOS_SYNC_KEY=YOUR-SECRET-KEY node server/hub.mjs --port 8686 --data ./hub-data
```

Put it behind HTTPS (e.g. Caddy, nginx, or a host such as Render/Railway/Fly.io). Open `https://your-hub-address` in any browser to use PharmaPOS online. The hub serves the web app too.
The `PharmaPOS-Hub.zip` artifact from GitHub Actions contains everything needed. The hub keeps daily backups in `hub-data/backups`.

## Putting PharmaPOS online (recommended: Cloudflare, free, no card, no server)

The repo is ready for **Cloudflare Workers + D1** (free plan: 100,000 requests/day, 5 GB database, no credit card).
One deployment serves the web app *and* the sync hub on a free `https://pharmapos.<your-name>.workers.dev` address,
on Cloudflare's global network (with servers in Africa), redeploying automatically on every push to GitHub.

1. Create a free account at **dash.cloudflare.com/sign-up**.
2. **Workers & Pages → Create → Import a repository** → connect GitHub → choose `pharmapos`.
   * Build command: `npm ci && npm run build`  ·  Deploy command: `npx wrangler deploy`
   * The D1 database is created automatically on the first deploy.
3. After it deploys: **your Worker → Settings → Variables and Secrets → Add** → type *Secret*, name `SYNC_KEY`, value = a long secret (12+ characters). Save and redeploy.
4. Open `https://pharmapos.<your-name>.workers.dev`. That is PharmaPOS online. On Android/desktop browsers use *Install app / Add to Home screen*.
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
   * open `https://<your-hub-address>` in any browser (phone, laptop, branch) to use PharmaPOS online. It keeps working offline once opened;
   * in each desktop app: *Settings → Online sync* → `https://<your-hub-address>` + the sync key.

Health check: `https://<your-hub-address>/api/health`. Backups: `/data/backups` inside the volume (daily, 30 kept). Coolify can also back up volumes.

The same image runs on any Docker host: `docker compose up -d` (put `PHARMAPOS_SYNC_KEY=...` in a `.env` file).

### Alternative: keep the hub on the main PC, reachable online (Cloudflare Tunnel)

If you'd rather not run a server, [cloudflared](https://github.com/cloudflare/cloudflared) (open source, free tier) publishes the main PC's hub on an HTTPS address without opening router ports:

```bat
"%LOCALAPPDATA%\Programs\PharmaPOS\PharmaPOS.exe" --hub --key=YOUR-SECRET-KEY
cloudflared tunnel --url http://localhost:8686
```

The quick tunnel prints a random `https://….trycloudflare.com` address that changes on every restart. For a permanent address, add a domain to a free Cloudflare account and create a named tunnel.
Downside: online access only works while that PC is on and connected, so prefer Coolify for branches in other towns.

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
