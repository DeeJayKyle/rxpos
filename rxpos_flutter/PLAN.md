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
- [x] Schema v1: `records`, `tombstones`, `outbox`, `rejected_ops`, `kv`.
- [x] Schema v2: lookup indexes (records by table; partial expression indexes on the JSON for a medicine by barcode,
      and a medicine's movements and batches). Name search stays in memory with the ported search rules, as in React.
- [x] Migration tests with Drift's schema verifier (`drift_schemas/`, `test/database/`): v1 → v2 gives exactly the v2
      schema, keeps records, unsent changes and settings; the lookups are checked to use the indexes.
- [x] First download and keeping up (`core/sync/downloader.dart`): pages by server cursor with progress; each page and
      its position saved in one transaction; an interrupted first download resumes instead of starting again; the
      React merge rules (last writer wins, deleted here stays deleted, pharmacy details from the cloud); cloud restore
      (epoch) and "Download everything again". Tested against a fake cloud that behaves like worker/index.js.

## 3. Sync (protocol 2, same cloud)
- [x] Sign in (`features/auth`): same accounts as the React app; choose a pharmacy; two-step code; owner accounts sent
      to the owner console; session kept on the device (the till opens offline); switching pharmacy clears the old
      one's data, never while changes are waiting.
- [x] Sync engine (`core/sync/sync_engine.dart`): each request sends one group of outbox entries (whole actions,
      ≤ 400) and pulls; refused changes kept for review; accepted ones, pulled records and the position saved in one
      transaction; lost replies resent and deduplicated by op id; epoch restore; resumable full download.
- [x] Sync controller (`features/sync_status`): status (On this device · Syncing · Synced · N waiting · Offline ·
      Needs attention · Sign in again); every 5 s in use, 60 s in the background, straight after each change and on
      returning to the app; backoff after failures; "Download everything again".
- [x] Tests against a fake cloud that behaves like worker/index.js: two devices selling offline, lost replies,
      refused changes, expired sign-in, deletes, grouping.
- [x] Against the real cloud code (`test/cloud`, worker/index.js run locally with wrangler, fictional data): sign-in,
      first download, a sale here reaching the cloud as the React app writes it, a React-style device's sale arriving
      here (both count), resends applied once, deleting a stock movement refused and kept for review.

## 4. Feature UI: the till and stock
- [x] Shell: side rail (Windows, tablets) / bottom bar (phones), sync status chip, user, Premium UI switch; F2 retail,
      F3 wholesale, F4 Add Stock; screens shown by permission.
- [x] Sign-in screen: email / password, choose a pharmacy, two-step code, plain errors.
- [x] POS: search (ported rules) and grid, in-stock first; barcode scanners (Enter adds the exact barcode, else the top
      match); Android camera scanning; the sale (± per unit or pack, pack/unit switch, price edits by permission,
      below-cost warning), client (+ new client, allergy warning), discount by permission, tax, payment methods, cash
      tendered with change, credit, Mobile Money by transaction ID, prescription check, controlled-drugs register,
      hold and resume (drafts, shared with the React app); F8 / F9 / Ctrl+Enter / Alt+H; "Sale complete" only after
      the sale, its first-expiry-first-out stock movements and audit are saved together.
- [x] Receipt: on screen; print (Windows printer, Android print service; 80 mm roll PDF), PDF to save or share,
      WhatsApp.
- [x] Add Stock: supplier, invoice no., date; lines with medicine search or a new medicine, packs (largest pack by
      default) or units, cost per pack or unit, retail price, batch, expiry; amount paid; receive (ported checks).
- [x] Sync & storage: status, waiting changes, refused changes (review and clear), sync now, download everything
      again, sign out.
- [x] Themes: the teal standard and Premium UI (Midnight Pro, #0B0F19) switch.
- [x] Widget tests drive the real screens (desktop and phone sizes): sign-in, scan → charge → receipt → stock, hold and
      resume, F4, Sync & storage. They found and fixed: card text overflow (and taller cards for large accessibility
      text), a crash with fewer than two screens in the phone bar, narrow-screen overflows.
- [ ] Later: delivery drafts and invoice scanning, Classic / Advanced till layouts, the live connection (sync is every
      5 s instead), Mobile Money requests to the customer's phone, Bluetooth receipt printers.

## 5. Packaging
- [x] GitHub Actions (`.github/workflows/flutter-apps.yml`): analyze, all tests, the real-cloud tests, then the Android
      APK (signed with the current app's key when the secrets are set) and the Windows installer (Inno Setup, per user,
      no administrator) plus a portable zip, as downloadable artifacts.
- [x] Installs next to the current apps ("RxPOS New", Android id io.github.rxpos.rxpos), not replacing them.
- [ ] App updates for the new apps (store / installer channel to decide before replacing the current apps).
- [ ] Pilot on one device per platform next to the React app (needs a pharmacy device: not possible from here).

## 6. The whole app (after milestone 1)
- [x] Group 1: Dashboard, Sales History (refunds, receipts), Inventory (count / adjust, add and edit medicines),
      Customers, Suppliers (balances, payments); grouped sidebar like the React app, a drawer on phones.
- [x] Group 2: Shifts & cash-up, Stock take, Purchase history, Reorder (levels from sales), Expiry, Returns to suppliers.
- [x] Group 3: Finance (ledger and balances, expenses, banking, loans), Reports (profit, by medicine / day / payment /
      cashier, PDF), Prescriptions & refills, Proformas (sold from the till); built-in defaults with the React ids.
- [x] Group 4: Users & roles (passwords as the cloud expects), Branches & transfers, Settings, This device (branch),
      Audit log.
- [x] Group 5: Storage temperature, Reminders (WhatsApp), Calendar, Team chat, Controlled drugs register, Barcode labels,
      Import medicines, Drug information, Drug quiz (cloud AI).
- [ ] Not yet: voice and video calls, invoice scanning (AI), delivery drafts, the owner console (stays on the web),
      Mobile Money requests to the customer's phone, the live connection (sync runs every 5 s instead), Classic /
      Advanced till layouts and the command bar.
