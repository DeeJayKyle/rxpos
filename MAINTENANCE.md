# RxPOS maintenance handbook

Everything needed to keep RxPOS running, change it and recover it, without depending on any one person or tool.
RxPOS itself needs nothing but the accounts below: apps, sync and the cloud keep working on their own.

## 1. What runs where

| Part | Where | Account |
|---|---|---|
| Code, history, app builds, nightly backups | GitHub `DeeJayKyle/rxpos` (private) | GitHub |
| Website + pharmacy addresses (`rxpos.pages.dev/<pharmacy>`) | Cloudflare Pages project **rxpos** | Cloudflare |
| Cloud API, sync, live connection, AI | Cloudflare Worker **pharmapos** (`pharmapos.pharmapos.workers.dev`) | Cloudflare |
| Database | Turso database **rxpos** (Ireland). Old Cloudflare D1 `pharmapos-db` kept as a fallback | Turso / Cloudflare |
| Windows / Android / Hub downloads | GitHub Releases → `v1.0.0` | GitHub |

Keep every login in a password manager (e.g. Bitwarden, free and open source): GitHub, Cloudflare, Turso, Google
(sign-in settings), the domain, Africa's Talking, MTN / Airtel developer accounts.

### Secrets: what they are and where they live

| Secret | Used for | Stored in |
|---|---|---|
| Owner key | Owner console master key, backups, admin scripts | `Documents/RxPOS-Data/RxPOS-OWNER-KEY.txt`, Worker secret `OWNER_KEY`, GitHub secret `OWNER_KEY` |
| Backup passphrase | Opening the nightly backups | `Documents/RxPOS-Data/RxPOS-BACKUP-PASSPHRASE.txt`, GitHub secret `BACKUP_PASSPHRASE` |
| `TURSO_URL`, `TURSO_AUTH_TOKEN` | The Worker reaching the database | Worker secrets only (make a new token at app.turso.tech if needed) |
| `SYNC_KEY` | Legacy key of the first pharmacy | Worker secret |
| Android keystore (`ANDROID_KEYSTORE_B64`, password, alias) | Signing every Android build, **required for every Google Play update** | GitHub secrets. **Keep an offline copy**: losing it means the Play app can never be updated |
| `WINDOWS_CERT_B64`, `WINDOWS_CERT_PASSWORD` | Optional Windows code signing | GitHub secrets (not set yet) |
| Owner password, Google client ID, GitHub OAuth app | Owner console sign-in | Owner console → Account (stored in the database) |
| MoMo / Airtel / Africa's Talking keys | Payments and SMS per pharmacy | Owner console → pharmacy → Payments & SMS |

Never put a secret in the code, a commit, a chat or a screenshot.

## 2. The code

```
src/            the app (React): pages/, store.jsx (data + sync), sync.js, live.js, pdf.js, invoiceScan.js …
worker/         the cloud (Cloudflare Worker): index.js (API), live.js (live connection), owner-auth.js, backup.js
functions/      Cloudflare Pages proxy: /api on rxpos.pages.dev → the Worker
electron/       the Windows app shell          server/  the self-hosted Hub
tests/          automated tests (npm test)     tools/   backup.mjs, restore.mjs, rxtera/ (copying from Rxtera)
.github/workflows/  build.yml (apps + releases), backup.yml (nightly backup)
```

Plain JavaScript: React + Vite for the app, Cloudflare Workers for the cloud. Any JavaScript developer can work on it,
as can open-source AI coding tools (Aider, Cline, OpenCode) or Claude.

## 3. Setting up a PC to work on it

1. Install **Node.js 22+**, **Git** and **Chrome** (tests use it). Optional: GitHub CLI (`gh`).
2. `git clone https://github.com/DeeJayKyle/rxpos.git pharmapos && cd pharmapos && npm ci`
3. `npx wrangler login` (Cloudflare) once, to deploy.
4. On Windows set `git config core.autocrlf input` **before** cloning (or after: `git rm --cached -r . && git reset --hard`).

## 4. Making a change safely

1. Work on a branch: `git checkout -b my-change`.
2. Try it: `npm run dev` (web app on http://localhost:5173; it talks to the live cloud, so use a test pharmacy).
3. **Run the tests: `npm test`** (about 6 minutes). It starts a throw-away local cloud, runs every suite (200+ checks:
   sign-in, sync rules, sales, stock, PDFs, invoice scan, backups…) and stops it. `npm test -- v17` runs one suite.
   Everything must pass before going live. Add a check for every new feature (see `tests/v17.mjs` for examples).
4. Commit, push, merge into `main`.

## 5. Going live

```bash
npx wrangler deploy                                              # the cloud (Worker)
npm run build && npx wrangler pages deploy dist --project-name rxpos --branch main   # the website
curl https://pharmapos.pharmapos.workers.dev/api/health          # → "ok": true, "database": "turso"
```

The website change reaches browsers at once. Installed apps get it with the next release (section 6).
To undo a bad Worker deploy: Cloudflare dashboard → Workers → pharmapos → Deployments → roll back
(or `npx wrangler rollback`). For the website: Pages → rxpos → Deployments → an earlier one → Rollback.

## 6. Releasing the apps (kept at version 1.0.0)

```bash
git push origin main
gh release delete v1.0.0 --cleanup-tag -y
git tag -f v1.0.0 && git push origin v1.0.0
```

GitHub Actions then builds and attaches `RxPOS.Setup.1.0.0.exe`, `RxPOS-Portable-1.0.0.exe`, `RxPOS-Android.apk`,
`RxPOS-GooglePlay.aab` and `RxPOS-Hub.zip` (about 10 minutes: GitHub → Actions). Install them on the pharmacy devices.
For a real new version instead, change `"version"` in `package.json` and tag `v1.1.0`.

## 7. Backups and restoring

**Every night at 02:00 (Uganda)** GitHub Actions (`backup.yml`) downloads the whole cloud (every pharmacy, record, staff
account and chat attachment), encrypts it with the backup passphrase and keeps it for **30 days**:
GitHub → Actions → *Nightly cloud backup* → a run → **Artifacts** → download the `.rxbak` file (inside a zip).
Run one now: Actions → Nightly cloud backup → *Run workflow*. Keep a monthly copy somewhere else too (USB / Drive).

On a PC (with the passphrase from `RxPOS-BACKUP-PASSPHRASE.txt`):

```bash
# what's inside
BACKUP_PASSPHRASE=… node tools/restore.mjs rxpos-backup-2026-10-15.rxbak
# put ONE pharmacy back (e.g. after it was deleted by mistake)
BACKUP_PASSPHRASE=… OWNER_KEY=… node tools/restore.mjs rxpos-backup-2026-10-15.rxbak --restore --tenant mcb-pharma
# put EVERYTHING back (e.g. into a new, empty database)
BACKUP_PASSPHRASE=… OWNER_KEY=… node tools/restore.mjs rxpos-backup-2026-10-15.rxbak --restore
# a manual backup now
OWNER_KEY=… BACKUP_PASSPHRASE=… npm run backup -- backups
```

(On Windows PowerShell set the values first: `$env:BACKUP_PASSPHRASE="…"; $env:OWNER_KEY="…"`.)
Restoring writes rows back exactly as they were; devices pick them up on their next sync.

Each device also keeps its own full copy of its pharmacy, plus daily snapshots: Settings → Backup.

## 8. Keys: changing them

* **Owner key:** make a new long random value; `npx wrangler secret put OWNER_KEY`; update the key file and the GitHub
  secret (`gh secret set OWNER_KEY < file`). Staff are not affected.
* **Database token:** new token at app.turso.tech → `deploy/setup-turso.ps1` (or `npx wrangler secret put TURSO_AUTH_TOKEN`).
* **Backup passphrase:** `gh secret set BACKUP_PASSPHRASE`; keep the old one to open older backups.
* **A pharmacy's sync key:** owner console → pharmacy → Rotate key. Staff sign-ins keep working.
* **Removing a staff member:** owner console or the pharmacy's Users page; they are signed out everywhere at once.

## 9. Domain

When `rxposug.com` (or another domain) is bought in the same Cloudflare account: Pages → rxpos → Custom domains → add
`rxposug.com` and `www.rxposug.com`; Worker → Settings → Domains → add `api.rxposug.com`. Then set `PUBLIC_URL` in
`wrangler.jsonc` and `DEFAULT_CLOUD` in `src/cloud.js` to the new address, add it to the Google sign-in origins and the
GitHub OAuth callback, deploy and release (keep `rxpos.pages.dev` working for devices set up earlier).
Renewal is yearly: turn on auto-renew in Cloudflare → Domain Registration.

## 10. Limits and health

* Free plans: Cloudflare Workers 100,000 requests/day (an idle device uses about 3,000/day), Turso about 10 million
  writes/month, Workers AI a daily free allowance. For several busy branches move to Workers Paid (US$5/month).
* Health: `https://pharmapos.pharmapos.workers.dev/api/health`. Live logs: `npx wrangler tail`.
  Usage: Cloudflare dashboard → Workers → pharmapos → Metrics; Turso → app.turso.tech → Usage.

## 11. Known quirks

* The owner console's *Export* is too heavy for very large pharmacies (Worker CPU limit, error 1102): use the backup instead.
* If `Documents/pharmapos` disappears, clone it again from GitHub (nothing is lost: everything is pushed).
* `package.json` must be saved without a BOM (don't edit it in Windows PowerShell; use an editor or Node).
* Switching the database back to D1: set `"DB_BACKEND": ""` in `wrangler.jsonc` and deploy (D1 holds older data only).

## 12. Copying a pharmacy from Rxtera

See `tools/rxtera/README.md`.
