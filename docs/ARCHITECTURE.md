# RxPOS 1.6 — storage, sync and offline work

How RxPOS keeps a pharmacy's work safe on the device and in the cloud. This covers the 1.6 changes (branch
`ccr-54387795-ifu3p1`): what changed, the contracts between the pieces, the rules for conflicts and offline access,
how to recover, what was measured and tested, and what is still unverified.

## 1. Architecture (unchanged stack)

| Part | Where | Role |
|---|---|---|
| App | `src/` (React 18 + Vite 5) | One code base for the browser, Windows (Electron, `electron/`) and Android (Capacitor, `android/`) |
| Device storage | `src/storage.js`, `src/idb.js` | IndexedDB database `pharmapos` v2: `kv`, `records` (records in hashed buckets), `outbox` |
| State | `src/store.jsx` | Holds the pharmacy in memory; every change is diffed, committed to the device, then shown |
| Sync client | `src/sync.js` | Sends the outbox, pulls by server cursor, reports a status |
| Cloud | `worker/index.js` (Cloudflare Worker, D1 or Turso/libSQL) | Authorises and applies each change, keeps an op ledger, serves changes by sequence number |
| Browser policy | `src/webpolicy.js` | The web version is online only and keeps nothing on the computer |

No framework, database engine or state library was replaced. **SQLite was evaluated and not adopted**: the measured
costs (section 6) are dominated by the first download and rendering, not by IndexedDB; a native SQLite plugin would
need separate Electron and Capacitor code paths that cannot be exercised in this environment, and record-level
IndexedDB fixed the actual risks (whole-table rewrites, sale shown before it was stored).
A memory back end with the same contract serves the web version, which keeps nothing.

## 2. Device storage contract (`src/contracts.d.ts`, `src/storage.js`)

- Records are written individually but stored in buckets: record `id` of table `t` lives in `t|#<FNV-1a(id) mod 64>`,
  value `{ t, rs: [records] }`. A commit rewrites only the buckets it touches. Measured on 51,000 records: one value
  per record read in 590 ms at start-up, id-keyed buckets 320 ms, array buckets 230 ms, whole-table arrays (1.5)
  140 ms — but 1.5 rewrote the whole table (e.g. all 15,000 sales) on every sale. Settings (`s2:settings`), tombstones (`s2:_tomb`) and the storage
  version (`storage-version` = 2) live in `kv`.
- **`commit(c)` is one IndexedDB transaction**: record puts and deletes, settings, tombstones, kv items and the outbox
  entries for the same change. Either all of it is on the device or none of it is.
- `store.update()` returns a promise. It computes the change (`diff`), commits it, and only then keeps the new state.
  If the commit fails the screen reverts and the caller is told. **The till awaits it**: "Sale complete" appears only
  after the sale, its lines, stock movements, payment and outbox entries are stored; on failure the basket stays and
  the cashier sees "The sale was NOT recorded".
- Payments: a Mobile Money payment confirmed by the network carries `confirmed: true`; one typed in by staff is
  `manual: true`. The receipt says which ("Payment confirmed by the mobile network" vs "recorded by staff").
- Quota and write errors are turned into a plain message (`storageError`) and shown on This device → Sync & storage.

## 3. Sync protocol 2 (`src/sync.js`, `worker/index.js`)

Client → `POST /api/sync` `{ v: 2, since, changes: [{ op, t, id, rec | deleted, at }] }`

1. **Durable outbox.** Every local change adds outbox entries `{ op (uuid), txn, t, id, deleted?, at }` in the same
   transaction as the record. Entries of one transaction (`txn`, e.g. a sale and its movements) are never split
   across requests (`groupOutbox`, ≤ 400 per request; server max 500).
2. **Applied once.** The server looks up `op`s in `sync_ops (tenant, op)`; ones already applied are skipped (`dupes`).
   New ops are written to the ledger **in the same batch** as the records (D1/libSQL batches are atomic), so
   "applied" and "remembered" cannot come apart. A lost reply → the client resends → the server skips it.
3. **Crash-safe acknowledgement.** The client removes outbox entries only after a valid reply, and saves the pull
   cursor only after the pulled records are committed on the device. A crash in between means a resend (deduped) or
   a re-pull (idempotent).
4. **Refusals are kept, never dropped.** The reply lists `refusedKeys` (no permission, oversized record, tenant quota,
   deleting an append-only row). The client moves those entries to `sync-rejected` (last 500) and shows them on This
   device → Sync & storage until someone reviews and clears them.
5. **Server cursors.** Pulls use the server's sequence number, not device time. A database restore changes the epoch;
   the client then re-downloads.
   A device is normally not sent the records that carry its own device id. A **full download** (`all: true`) includes
   them: every app does one after an update that raises `FULL_PULL` (src/sync.js), and This device → Sync & storage
   has "Download everything again". It merges by last writer and never deletes; a record this device deleted (its
   tombstone is at least as new) is not brought back. Added after a Windows app was found without 6 deliveries,
   their batches and stock movements and one medicine that the cloud had, while it had every sale (27 Oct 2026;
   tests/v44-full-pull.mjs).
6. **Backoff.** Failures retry after `min(60 s, 1 s·2ⁿ) × (0.5–1.5)` jitter; an unreachable cloud is shown as Offline,
   a server error as Needs attention with the reason; an expired token as Sign in again.
7. **Status** (top bar): On this device · Offline · N waiting · Syncing… · Synced · Needs attention · Sign in again.
8. **Older clients** (protocol 1, no `op`) are still accepted; they get last-writer-wins without dedup, as before.
   Deploy order: server first (it accepts both), then apps.

Server authorisation is per change: server-only tables, role permissions (`GUARDED`), own-profile edits, and the
tenant from the token. A device cannot write into another pharmacy (tested in v37).

## 4. Conflict, stock and offline-access policies

- **Edited records** (products, customers, settings…): last writer wins by the change's time, with the device clock
  **clamped to server time + 5 minutes**, so a wrong clock cannot win forever. The client clock is never used to decide
  *what* to send (the outbox does that), only to order edits.
- **Append-only tables** (`movements`, `audit`, `controlled`): insert only; overwrites and deletes are refused. Stock
  is always the sum of movements, so two devices selling offline both deduct, and nothing is lost or doubled.
- **Overselling** offline is allowed (a pharmacy must not be blocked from serving a patient), the stock goes negative,
  and an "oversold" alert on the dashboard sends someone to a stock count.
- **Returns and reversals** are new movements/records, never edits of the original sale.
- **Offline sign-in**: a salted PBKDF2 verifier per device and user (never the password), valid for **30 days** after
  the last online sign-in on that device (`src/offline.js`). After that the person must connect once.
- **Signing out** with changes not yet in the cloud asks first and says how many; in the web version it tries to
  send them, and nothing is deleted without that confirmation.
- **Switching pharmacy** on a device with unsent changes is refused after trying to send them.

## 5. Web version: online only

The web version stays entirely online, as in 1.5.1: nothing is kept on the computer (pharmacy data in memory, the
tab's session in `sessionStorage`, RxPOS's own leftovers cleared at start-up and sign-out), it needs the internet,
and offline work is for the Windows and Android apps. Updates never reload a tab while it holds changes not yet in
the cloud. Tested in v36. (An opt-in offline mode for browsers was prototyped on this branch and removed on request.)

Not available offline in the apps either: Mobile Money requests, SMS, AI prescription/invoice reading,
drug-information look-ups not already cached, Google sign-in. The Mobile Money dialog says so and offers recording
the transaction ID (shown on the receipt as recorded by staff, not confirmed by the network).

## 6. Migration and recovery

- **1.5 → 1.6 storage upgrade** (`migrateLegacy` in `src/store.jsx`): reads the old whole-table copy, writes every
  record plus the changes not yet sent (computed from the old `pushedAt`) in one transaction, verifies record counts,
  settings and tombstones, retries once, and records `migrated-v1-at`. **The old copy is kept for 14 days.** Tested in
  v39 (including unsent 1.5 changes being sent exactly once).
- **Recovery**: This device → Sync & storage → "Restore the copy from before the upgrade" (`restoreLegacyCopy`). It is
  refused while the outbox has entries (nothing unsent may be lost), sets the storage version back and resets the pull
  cursor so the device re-downloads.
- **Last resort**: the crash screen's "Download my data" exports what is on the device.

## 7. Benchmarks

Measured with `npm run bench` (tests/bench.mjs): headless Chromium in Windows-app mode against a local cloud
(`wrangler dev`), synthetic fictional pharmacy. Machine: Intel Xeon @ 2.10 GHz × 4, 16 GB, Linux, Chrome 153. One
run each, so differences of a few tens of ms are noise. Not measured: real Windows/Android hardware, real networks.

| ms | small 1.5.1 | small 1.6 | large 1.5.1 | large 1.6 |
|---|---|---|---|---|
| First download from the cloud | 1021 | 1021 | 11819 | 8433 |
| Start-up to the checkout | 204 | 231 | 478 | 869 |
| Product search | 9 | 19 | 41 | 25 |
| Add to basket | 16 | 26 | 24 | 15 |
| Sale: F9 to "Sale complete" | 36 | 76 | 177 | 219 |
| Sale: F9 to stored on the device* | 312 | 143 | 887 | 530 |
| Open inventory | 183 | 204 | 296 | 260 |
| Open reports | 30 | 33 | 81 | 68 |
| Open dashboard | 78 | 86 | 121 | 136 |
| 20 offline sales: reconnect to synced | 130 | 230 | 130 | 127 |

Small: 300 products, 1,000 sales (3,900 records). Large: 2,000 products, 15,000 sales, drug catalog on (51,000 records).

*In 1.5.1 the sale was shown before it was stored (the gap is the window in which a crash lost it). In 1.6 "Sale complete" appears only after the commit (asserted in v37); the 1.6 figure is the benchmark's own probe, which re-reads the whole records store to find the sale, so it overstates the real time. Start-up on the large pharmacy is ~400 ms slower than 1.5.1 in this run (230 ms vs 140 ms reading storage, plus a catalog merge render because untouched catalog entries are no longer stored); it was 1,490 ms before bucketed storage.

## 8. Tests

`node tests/run-all.mjs` builds the app, starts a local cloud and runs every suite. New in 1.6:

| Suite | Checks |
|---|---|
| v37 sales & sync reliability (27) | sale stored before "Sale complete", offline sale survives a restart, reconnect sends it exactly once (with one movement), lost replies (applied but unacknowledged) retried without duplicates, two devices selling the last unit offline (both kept, stock −1, alert), clock 3 days behind still syncs, failed write not shown as complete and basket kept, tenant isolation when switching pharmacy |
| v38 sync protocol 2 (13) | repeated op skipped, last writer wins for new ops, sale + movement applied together, append-only movements, a cashier's forbidden change refused by key while the rest applies, protocol-1 client, malformed request, expired/forged token → 401, server cursor |
| v39 storage upgrade (12) | every 1.5 record moved, version 2, 1.5 copy kept, counts recorded, unsent 1.5 sale queued (sent one not re-queued), sent exactly once, restart opens from the new store |

Full run on this branch (2026-10-26, same machine as the benchmarks): **1,204 passed, 7 failed**. The 7 failures
are the same as on 1.5.1 and come from this environment, not the code: weather (Open-Meteo unreachable), AI drug quiz
and AI prescription reading (no Workers AI binding locally), weather from GPS, outside-temperature log, idle-screen fit
(missing screenshot folder) and Windows self-update (no display). Everything else passed, including layout (253),
web online-only (19), sales & sync reliability (27), sync protocol 2 (13) and the storage upgrade (12).

## 9. Known limitations

- The sync token is stored in IndexedDB, not OS secure storage (Electron `safeStorage` / Android Keystore were not
  added: they cannot be exercised here). Passwords are never stored; offline sign-in uses a salted PBKDF2 verifier.
- Windows and Android builds, printers, barcode scanners and cash drawers were not run on real hardware in this
  work; the Electron and Android shells are unchanged.
- Not covered by automated tests: the "restore the copy from before the upgrade" button, a failed write *during* the
  storage upgrade, returns/reversals syncing (unchanged code paths, exercised by the older v17/v18 suites), and signing out of
  the web version while changes wait (it asks first; checked by reading the code).
- `v14-ui` fails when run on its own (it expects an earlier suite to have created the owner account); it passes in a
  full run. This predates 1.6.

## 10. Rollout and rollback

1. Deploy the Worker first. It creates `sync_ops` on first use (`migrations/0003_sync_ops.sql`) and accepts protocol
   1 and 2, so existing 1.5 apps keep syncing.
2. Release the apps/web build. Devices upgrade their storage on first start and keep the 1.5 copy for 14 days.

Rollback: the Worker can be rolled back to 1.5.1 (it ignores the `sync_ops` table; protocol-2 clients then get
last-writer-wins without dedup). An app rolled back to 1.5.1 reads its kept 1.5 copy (still present for 14 days), so
before rolling back an app make sure its changes are synced (top bar shows Synced), or use "Restore the copy from
before the upgrade" first.

## 11. 1.7 additions: reports, colour and drafts

- **Drafts** (`src/drafts.js`, `src/pages/Drafts.jsx`): held sales and unfinished deliveries are records in the synced
  `drafts` table, `{ id, kind: 'sale' | 'delivery', branchId, mode?, userId, userName, order, startedAt, title, count,
  total, data }`. They belong to a person and a branch, sync like any record (so they follow the person to another
  device; the web version keeps them in the cloud, nothing on the computer) and **never touch stock or the books**:
  only completing one does, through the normal sale or delivery commit. Continuing a held sale removes the draft in
  the same commit that puts any open sale on hold; receiving a delivery draft deletes it in the same commit as the
  stock, so a delivery cannot be received twice from a draft. Supervisors (any role but cashier) can see everyone's
  drafts at the branch and take them over or discard them; a discard asks first and is written to the audit log.
  Sales held on a device before 1.7 move into drafts once. Scanned invoice photos stay on the device (not synced).
  Receiving stock now waits for the device commit before saying it was received, like a sale.
- **Reports → Sales lines** (`src/pages/SalesLines.jsx`): one row per sold line, amount after the line's share of the
  sale discount, profit against the cost saved with the sale; filters by dispenser, sales type, payment, customer and
  medicine; loss lines flagged.
- **Lists**: Sales and Purchase History page through long lists (`usePages`/`Pager`, `useSort`/`SortTh` in
  `src/ui.jsx`), print a receipt or an A4 invoice straight from a row, and show payment as a labelled chip.
- **Colour level** (`src/vivid.js`): Calm (standard) or Vivid, chosen per device in the appearance menu; one meaning
  per colour; tile colours are checked for white-text contrast in `tests/contrast-test.mjs`.
- **Tests**: `tests/v41-reports-drafts.mjs` (38 checks) and `tests/unit-diff.mjs` (7). Full run for 1.7.0: **1,267 passed, 7 failed**, the same 7 environment failures as 1.6.0 (weather, AI ×2, GPS, outside temperature, idle-screen folder, Windows self-update without a display).
