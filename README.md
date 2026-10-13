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

**Branches in other towns without a server:** install [Tailscale](https://tailscale.com) on the main PC and branch devices and link to the main PC's `100.x.x.x:8686` address.

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
