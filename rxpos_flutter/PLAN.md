# Implementation plan

Milestone 1 is the till and sync on Windows and Android. Each step ends with tests and is reviewed before the next.

## 1. Core data layer and entities (Freezed + json_serializable)
- [x] Record helpers (`core/data/json_fields.dart`, `record_merge.dart`): loose values read as the React app reads
      them; unknown fields, including inside sale lines, are kept, so a record edited here loses nothing.
- [x] Entities (`core/entities/`): `Product` (+ `Pack`), `Batch`, `Movement`, `Sale` (+ `SaleItem`, `Allocation`,
      `SalePack`), `Customer`, `Supplier`, `Purchase` (+ lines, packs), `AppUser`, `Role`, `Branch`, `Shift`, `Draft`,
      `PaymentMethod`, `PharmacySettings`.
- [x] Business rules (`core/rules/`), with the React unit tests ported case for case: money and tax, dates,
      first-expiry-first-out and removal, stock from movements per branch and batch, stock value, expiry, low stock,
      packs, markup prices, search, permissions and features, ids and document numbers.
- [x] `RecordStore.update()` (`core/data/record_store.dart`): one action = one transaction of records, tombstones,
      settings and outbox entries sharing a txn; movements and audit append-only; nothing saved on failure.
- [x] Built-in catalogue (`core/data/catalog.dart`, `assets/catalog.json`): same ids, barcodes and costs as the React app.

## 2. Local database and migrations
- [ ] Schema v1 (done): `records`, `tombstones`, `outbox`, `rejected_ops`, `kv`.
- [ ] Indexes the till needs: products by barcode and by name; movements and batches by product.
- [ ] Migration tests: every later schema version upgrades a saved v1 database file in a test.
- [ ] First start: download the pharmacy (full pull) with progress, then keep up by server cursor.

## 3. Sync (protocol 2, same cloud)
- [ ] Sign in (`/api/login`, two-step), session in `kv`, token in Dio; "Sign in again" when it expires.
- [ ] Push: outbox in order, whole transactions together, ≤ 400 per request; remove only after a valid reply.
- [ ] Pull: by server cursor; merge by last writer with the same clock clamp; tombstones respected; `epoch` change and
      `FULL_PULL` trigger a full download.
- [ ] Refused changes kept for review; status (On this device · Offline · N waiting · Syncing · Synced · Needs
      attention · Sign in again); backoff; sync when the network returns.
- [ ] Tests against a local cloud (the repo's wrangler test harness): two devices selling offline, lost replies,
      refused changes, restore epoch, and the React app and this app on the same pharmacy.

## 4. Feature UI: the till and stock
- [ ] Shell: sidebar (Windows) / bottom bar (Android), sync status, branch, user; F2 / F3 / F8 / F9 keys on Windows.
- [ ] POS: medicine search and grid (in-stock first), barcode scanners (keyboard wedge) and the camera on Android,
      the sale ledger (± quantity, packs, price edits by permission), client, discount, tax, payment methods, cash
      tendered / credit, hold and resume sales, retail and wholesale; "Sale complete" only after the commit.
- [ ] Receipt: on screen, printing (Windows printer, Android share or Bluetooth printer), PDF, WhatsApp.
- [ ] Add Stock: supplier, invoice no., lines with batch, expiry, packs, costs and prices; receive; drafts.
- [ ] Sync & storage screen.
- [ ] Layouts and themes from the React app (Standard, Advanced, Midnight Pro) where they help on each platform.

## 5. Packaging
- [ ] Windows installer (MSIX or Inno Setup) and Android APK / app bundle, built by GitHub Actions; app updates.
- [ ] Pilot on one device per platform next to the React app before replacing it.
