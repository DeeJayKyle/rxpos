# Faster sync from the cloud: plan

The owner chose recommendations **A to H** (November 2026). Everything ships as **build updates** that installed apps
take by themselves: the classic app stays **1.8.0** (new build number), the Flutter apps stay **2.1** (build
2.1.&lt;run&gt;). No new version numbers, no new installers.

## The owner's decisions (11 Nov 2026)

- Windows and Android apps keep **12 months** of history on the device by default (G); the setting can change it.
- The web versions load **1 month** of history each time they open (H); older history comes from the cloud on request.
- Stages 1, 2, 3 and 5 are built, tested, merged and published as build updates without asking first; **stage 4 (G)
  waits for the owner's OK on its written design (S4.1)**.

## Where the time goes today (measured 11 Nov 2026)

Large pharmacy: 2,000 medicines, 15,000 sales, 51,000 records in all. Local cloud, so no network delay.

| | Total | Waiting on the cloud | Working on the device |
|---|---|---|---|
| Classic app, Windows/Android | 7.6 s | 1.7 s | 6.0 s |
| Classic web version | 2.5 s | 0.7 s | 1.8 s |
| Cloud alone (22 pages) | 1.1 s | | |

The data: 20 MB as JSON, 1.2 MB with gzip, 0.64 MB with brotli.

Causes:
1. Every page of 2,500 records rewrites all 64 storage buckets of its table, so each page rewrites the whole table
   received so far. The cost grows with the square of the history.
2. The app recomputes the whole database and redraws the screen after every page.
3. The steps run one after another: ask, wait, apply, save, then ask for the next page.
4. All history is downloaded, and sales, movements and audit only ever grow.
5. Both web versions keep nothing, so they download everything again on every visit.
6. The Flutter apps apply records one at a time, with 2 or 3 database queries each.

## Rules for every step

- **Old and new keep working together.** A new app talking to an older cloud or Hub, and an old app talking to the
  new cloud, keep syncing as today. The cloud announces what it supports (`features` in the sync reply). The app
  uses a new path only when the cloud announces it, and otherwise falls back to today's paging. Hub pharmacies get
  the new paths when they install a newer Hub; until then they keep today's behaviour (on a local network it is
  fast already).
- **Same rules in both apps.** React and Flutter get each step together, with shared case files where there is a
  rule to agree on (as for insurance and GS1).
- **Nothing may be lost or counted twice.** Each step is tested for:
  - a download cut off part-way and resumed;
  - a cloud restored from a backup during a download (epoch change);
  - deletions, and field-by-field merges;
  - a device that has unsent changes when a download starts.
- **Measured.** `npm run bench` gains the sizes `xlarge` (about 200,000 records) and `web`, and a Flutter timing.
  Every step reports before and after.
- Each stage ships as its own build update, once the full JS suite, the Hub suites, the Flutter suite and lint pass.

## Stage 1: quick wins (A, B, C, D)

**S1.1 First-download fast path (A), classic app.**
- When the device holds nothing of this pharmacy and its outbox is empty, pages are added straight in. There is no
  comparison with existing records.
- Pages are saved to the device in bulk, about every 10,000 records or every few seconds, each save in one
  transaction. An interrupted download still resumes from the last saved page.
- The screen redraws once a second during the download and once at the end, not after every page.
- Storage writes each bucket once per save, not once per page.

**S1.2 First-download fast path (A), Flutter apps.**
- When the device is empty, records go in through one `batch` insert per page, with none of the per-record
  look-ups.
- Merging into existing data (local edits, tombstones, field-by-field) stays exactly as it is.

**S1.3 Fetch the next page while saving this one (B), both apps.**
- Page n+1 is requested while page n is being applied.
- The cursor is still saved only after a page is stored, so resuming is unchanged.
- This applies to downloads only. Sending local changes stays one request at a time, in order.

**S1.4 Bigger pages (C), cloud, Hub and both apps.**
- The app asks for `limit` records (10,000 on a full download). The cloud caps it at 10,000 and answers with what
  it used.
- Old apps don't send `limit` and still get 2,500.

**S1.5 Compressed replies (D), cloud.**
- Check what the live cloud sends (`Content-Encoding`) from CI after each deploy.
- If it is not compressed, the Worker compresses sync replies itself (gzip, or brotli where the client accepts it).
- The Hub compresses with Node's `zlib`.

Ship stage 1 (build update), measure on the live cloud with a test pharmacy, then continue.

## Stage 2: the till opens before the download ends (E)

**S2.1 Cloud: download the core first.**
- With `phase: "core"`, a full download first sends only the core: medicines, batches, stock movements needed for
  stock, clients, suppliers, users, roles, branches, banks, settings, licence, insurers, and open debts.
- The phase has its own cursor. History (old sales, audit, messages…) follows in phase 2.
- The reply says which phase it is in.

**S2.2 Both apps: open once the core is in.**
- After the core, the sign-in screen gives way to the till. A "Downloading history… n of m" note shows in the sync
  pill.
- Reports, Sales history and the audit log show "Still downloading older records" until phase 2 ends.
- Selling, stock and debts are correct from the start, because they only need the core.

## Stage 3: one ready-made download for new devices (F)

**S3.1 Cloud: cached compressed chunks.**
- A full download is served as compressed chunks of about 20,000 records, by sequence-number range. Each chunk is
  built the first time it is asked for, then kept in R2 (the existing `rxpos-apps` bucket, under `snapshots/`) and
  in Cloudflare's cache.
- A chunk is correct whenever it was built:
  - a record that changed after the chunk was built has moved to a higher sequence number, so the normal sync
    after the chunks delivers it;
  - a record that changed before the build is simply in the chunk with its new value.
- Chunks are thrown away when the pharmacy's epoch changes (restore) or after 7 days.
- The Hub (no R2) does not announce this feature, so apps use paging there.

**S3.2 Both apps: use the chunks.**
- A new device or "Download everything again" fetches the chunk list, then the chunks (two or three at a time),
  then syncs normally from the last chunk's cursor.
- Stage 1's fast path applies the chunks.

## Stage 4: recent history on devices (G)

This is the most delicate stage. It starts with a written design (S4.1), shown to the owner before any code:
**`docs/SYNC-HISTORY-WINDOW.md`** (written 11 Nov 2026, waiting for the owner's OK).

**S4.1 Design: everything that adds up history.** List every place in both apps that totals old records, and decide
how each stays exact with only recent history on the device:
- stock: the sum of movements;
- client debts, supplier balances and insurer balances;
- banks and the cash drawer;
- loans and payroll advances;
- the reports, returns of old sales, and day closes.

The planned rules:
- **Brought forward.** For stock and every balance, the cloud sends one read-only "brought forward" record per item
  (per branch and batch for stock). Each is the sum of the records older than the window, taken at a known sequence
  number. Records newer than that number arrive normally, so totals stay exactly the sum of everything, as today.
  The rule goes into shared case files checked by both apps.
- **Open items are always kept**, whatever their age: unpaid credit sales, unpaid purchases, open prescriptions,
  open purchase orders, insurer claims not yet paid.
- **Older history on request.** Sales history, reports and returns ask the cloud for older records when a date
  range goes past the window (S4.3).

**S4.2 Cloud.**
- Full and core downloads honour `window` (a start date). They send the brought-forward records and the open items,
  and leave out older history.
- Normal sync is unchanged.

**S4.3 Cloud: older history on request.**
- `POST /api/history`: one table, a date range, paged.
- It is checked against the same role rules as sync (payroll, audit…).

**S4.4 Both apps.**
- A setting on This device: "History kept on this device" (default 12 months; 6, 24 or everything).
- Shortening the window removes older records from this device only, never from the cloud. Lengthening it fetches
  them.
- Reports and lists that go past the window fetch from the cloud and say so. Offline, they say the older part needs
  the internet.

## Stage 5: the web versions open fast (H)

Both web versions keep nothing on the computer, as decided in 1.7. With stages 1 to 4 they:
- download only the core first (E);
- use the cached chunks (F);
- keep 1 month of history (G), with older history fetched on request.

The classic web version also skips the work of saving to a device it doesn't keep. Target: the till usable in about
2 seconds on a good connection, whatever the pharmacy's age.

## Publishing (each stage)

1. A pull request with the stage, plus its measurements and test results. I merge it once every check passes, as for
   PRs 28 and 29.
2. **Classic app (Windows, Android, website):** the *Deploy cloud* workflow. It runs every suite, puts the cloud
   live, then the website and the in-app update (same 1.8.0, new build number). Installed classic apps take it by
   themselves.
3. **Flutter apps:** the merge builds 2.1.&lt;run&gt; (*Flutter apps* workflow). A new manual workflow, *Offer
   Flutter build*, checks that run passed and offers its files to installed apps. It makes no GitHub release and no
   new version. Windows updates by itself; Android asks to tap Update. The Flutter web app goes live with the next
   cloud deploy (`scripts/site-with-app.sh` takes the newest tested build).
4. **Hub:** the Hub's code is in the Windows installer, so Hub PCs get stages 1 and 3 only with the next installer.
   Until then they work as today.
5. **Order:** cloud first, then apps, as in the release notes. The apps fall back when the cloud lacks a feature,
   so a deploy in either order is safe.

## Log

| Date | Step | Commit | Result |
|---|---|---|---|
| 2026-11-11 | Plan | | Baseline above |
| 2026-11-11 | Stage 1 (A–D) | PR 30 | See below; published as build updates |
| 2026-11-11 | Stage 2 (E) | (this PR) | See below |

**Stage 1 results** (this machine, local cloud, no network delay; first download):

| | Before | After |
|---|---|---|
| Classic app, large (51,000 records) | 7.5 s | 3.0 s |
| Classic web, large | 2.4 s | 1.4 s |
| Classic app, extra-large (195,000 records) | 59.4 s | 15.6 s |
| Classic web, extra-large | 14.3 s | 5.0 s |
| Flutter app, large (51,000) | 9.0 s | 2.0 s |
| Flutter app, extra-large (186,000) | not timed | 6.6 s |

Start-up, search and sales are unchanged. Notes:
- A page cut off part-way still resumes; records already received are saved before the run gives up (found by
  `unit-sync-resume`).
- Saving after 25,000 records instead of 10,000 saved only another 0.4 s and would lose more on a dropped
  connection, so it stays at 10,000 records or 3 s.
- What remains in the classic app is the storage format, which rewrites each touched bucket on every save; stages 2
  and 3 reduce it further.
- New: `BENCH_SIZES=xlarge` and the web timing in `npm run bench`; `rxpos_flutter/test/cloud/download_speed_test.dart`;
  page-size checks in v38 (cloud and Hub); the *Offer Flutter build* workflow; the compression check after each cloud
  deploy.

**Stage 2 results** (same machine; "ready" = the "Setting up" screen has gone, with stock, clients, debts and
today's sales complete; "all" = every record in):

| | Ready | All |
|---|---|---|
| Classic app, large (51,000) | 1.8 s | 3.2 s |
| Classic app, extra-large (195,000) | 6.1 s | 10.9 s (stage 1: 15.6 s) |
| Classic web, large | 0.9 s | 1.5 s |
| Classic web, extra-large | 2.1 s | 4.5 s |
| Flutter app, large (51,000) | 1.3 s | 2.0 s |
| Flutter app, extra-large (186,000) | 4.3 s | 6.9 s |

The split (worker `HISTORY_SQL`):
- **History:** the audit log, messages, chat, events, quiz results, temperature logs, sale checks, and cash sales to
  walk-in clients older than 3 days (no insurer, fully paid).
- **Core:** everything else. That includes every stock movement (stock is their sum); every sale to a named client,
  unpaid or insured (debts); and the last 3 days of sales (cash-up, returns).

Core and history together are exactly the full download, with no record twice (v71, cloud and Hub). The app resumes
in the phase it was cut off in, and falls back to one plain download with a cloud before stage 2 (`unit-sync-phases`,
Flutter `download_test`).

In this sample, stock movements are most of the core. Stage 4 (brought-forward balances) shrinks them.
