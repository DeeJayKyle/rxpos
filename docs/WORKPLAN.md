# RxPOS improvement workplan

Source: `docs/REVIEW.md`. Each step is done only after the owner approves it. Each step ends with:
code + tests → the relevant test suites run → commit and push to `claude/practical-davinci-74bo3e` → a short report → ask for the next step.

Status: ⏳ waiting for approval · 🔧 in progress · ✅ done · ⏸ blocked (needs something from the owner)

Server-side steps (Worker, `worker/`) protect **both** apps at once. Client-side steps change the app(s) chosen in step 0.

## Phase 0 — Decisions
| # | Step | Status |
|---|---|---|
| 0 | Choose which client(s) get client-side changes (React, Flutter, or both) and how the Hub is handled | ✅ both apps; Hub rebuilt on the shared core |

## Phase 1 — Safety net and critical security (weeks 1–2)
| # | Step | Review ref | Touches | Status |
|---|---|---|---|---|
| 1 | CI runs the full suite on every PR/push to main and before any release or deploy | 3 | `.github/workflows` | ✅ |
| 2 | Server write policy per table and operation (cashiers can't change prices, delete sales, …) | 1.1 | Worker + tests | ✅ |
| 3 | Server checks sale totals/discounts; mismatches recorded as anomalies for the owner | 1.2 | Worker + tests | ✅ |
| 4 | F9 is the only charge key on every theme (F5 never charges) | 4.6 | client | ✅ |
| 5 | Passwords: rounds as a setting (PBKDF2_ITER), rehash on sign-in (including legacy SHA-256), constant-time compare | 1.5 | Worker + tests | ✅ (raising rounds in production is the owner's call) |
| 6 | Sign-in slowdown per account (not only per IP), prune `login_fail` (Turnstile not chosen) | 1.5 | Worker + tests | ✅ |

## Phase 2 — Money correctness (weeks 3–4)
| # | Step | Review ref | Touches | Status |
|---|---|---|---|---|
| 7 | Receipt numbers: branch–device–counter, unique offline, sequential | 2.1 | client + tests | ✅ |
| 8 | Credit limit checked at the till (reason required) and in the cloud (flagged) | 2.2 | client + Worker check | ✅ |
| 9 | Mobile Money: server-side pending payments, provider callbacks, "payments without a sale" screen | 1.3 | Worker + client | ⏸ skipped by the owner for now (sandbox keys needed to test live) |
| 10 | Tokens: short access + rotating refresh token, device list with "sign out this device", secure storage | 1.5 | Worker + client | ⏸ skipped by the owner for now |

## Phase 3 — Scale and structure (month 2)
| # | Step | Review ref | Status |
|---|---|---|---|
| 11 | Split payments on one sale (`payments[]`) | 2.3 | ⏸ skipped by the owner for now |
| 12 | Tax per product (exempt / zero / standard), inclusive or exclusive pricing, tax per line | 2.3 | ⏸ skipped by the owner for now |
| 13 | Incremental stock balances (no full rescan of movements per change) | 2.4 | ✅ |
| 14 | Per-field merge for master data (products, customers, suppliers) | 2.5 | ✅ (batches too) |
| 15 | Per-tenant sequence and record counters on the server | 2.6 | ✅ (record count only; sequence was already indexed) |
| 16 | Hub: shared sync/permission core over SQLite, or retire (per step 0) | 1.4 | ✅ (runs the cloud's own code) |
| 17 | ESLint + Prettier; split `worker/index.js` into route modules; split `POS.jsx`; widen typecheck | 3 | ✅ ESLint only (owner's choice); the rest not done |

## Phase 4 — Product upgrades (month 3+)
| # | Step | Review ref | Status |
|---|---|---|---|
| 18 | Owner: anomaly dashboard, day close / lock, accounting export | 4.5 | ✅ Close the day (owner's choice); export and overview not done |
| 19 | Clinical: structured allergies that block, interaction and duplicate-therapy checks | 4.2 | ⏸ skipped by the owner until a licensed interaction database is chosen |
| 20 | Selling: loyalty points, promotions engine, customer display, cash-up with blind counts, per-role discount ceiling | 4.3 | ✅ discount ceiling + blind cash-up (owner's choice); the rest not done |
| 21 | Stock: GS1 DataMatrix scan, scheduled draft POs, expiry markdowns, branch rebalancing | 4.4 | ✅ GS1 pack scanning (the recommended part; the owner said continue without picking); the rest not done |
| 22 | Insurance: insurers/schemes, member check, co-pay at the till, monthly claim batches | 4.1 | ✅ insurers, schemes and the co-pay at the till (the recommended part; the owner had no preference); pre-authorisation, claim batches and member checks not done |
| 23 | URA EFRIS e-invoicing (fiscal number + QR on receipts, offline queue) | 4.1 | ⏸ skipped until URA EFRIS sandbox credentials are available |
| 24 | Interface: one till layout with density setting, 4 themes, single payment panel, accessibility audit (axe), translations | 4.6 | ✅ accessibility audit (the recommended part); then the owner's controls request (keyboard map, mouse, selection, navigation) |
| 25 | React → Flutter cut-over plan and retirement of the React client (if chosen in step 0) | 3 | ⏳ (not chosen yet: both apps are kept) |

## Phase 5 — Release (requested by the owner, 2026-11-09)
| # | Step | Status |
|---|---|---|
| 26 | Copy the features that exist only in the Flutter app into the React classic app (list them first, owner picks) | ⏳ |
| 27 | Publish both apps: release build (Windows, Android, Hub) and deploy cloud + website, after the full suite passes in CI | ⏳ (confirm version and timing with the owner first; a new Windows installer is needed for the hub from step 16) |

## Log
(Each finished step adds a line here: date, step, commit, tests run, anything left open.)

- 2026-11-09 · Step 1 · `5cec6ab`, `feb1f20`, `b4c6838` · New `full-tests.yml` (reusable). `build.yml` runs it on
  push/PR and `release` + `deploy` need it; `deploy-cloud.yml` needs it. With `RXPOS_CI=1`, `run-all.mjs` reports 5 named
  checks that need Workers AI or Open-Meteo as skipped (any other failure still fails). Fixed `idle-fit.mjs` (never
  created its screenshot folder). Baseline here: 1,596 passed, 7 failed (the 7 documented environment failures).
  Verified: v15 → 26 passed, 4 skipped; idle-fit → 9 passed. Open: the Windows self-update suite could not run here (no
  Electron binary in this container); it runs on GitHub (xvfb present). If it fails there it will block deploys, and
  the cause should be looked at, not skipped. The first real proof is the first CI run on GitHub.
- 2026-11-09 · Step 2 · `ca7e03a` · `worker/policy.js` decides every staff change by table, operation and movement
  type (rules in the file; sales: create = sell, edit = sales.edit, refund-only = sales.refund, delete = admins only,
  per the owner). Stored sales/purchases/payments are read in one query per push. Screens that offered actions the
  role lacks were fixed: React Refund now needs sales.refund (a dispenser could refund); React and Flutter Write off
  now need stock.adjust (a dispenser could write off); React Medicine List is read-only without medicines.manage.
  Tests: unit-policy 46/46, v55-write-policy 17/17, v55-staff-ui 10/10 (shown to fail when the Refund fix is undone).
  Full suite: 1,668 passed, 6 failed (5 outside-service checks + Windows self-update, no Electron binary here);
  v35-layout 253, v41 40, v17 40 re-run after the screen fixes. Open: the one-line Flutter change (write-off gate)
  was not compiled here (no Flutter SDK); the flutter-apps workflow will analyse and test it. Records a device already
  holds that the cloud now refuses stay on that device and are listed under This device → Sync & storage.
- 2026-11-09 · Step 3 · `73b57ea` + this commit · `worker/anomalies.js` re-checks every staff sale (totals, paid >
  total, negative amounts, discount without "Give discounts", price below the medicine's without "Change prices";
  proforma sales exempt). Sales are never refused; findings are `anomalies` records in the same transaction, sent only
  to roles with the audit log. "Sales to check" card with Checked (audited) on both dashboards; owner console count.
  React till discount now needs "Give discounts" like Flutter (owner's choice). Flutter SDK 3.47.9 installed in this
  session: analyze clean, 368 tests passed (366 before + 2 new). JS: unit-anomalies 20, v56 19; full suite 1,716
  passed, 7 failed = the 6 known + one intermittent v37 check (passed 3/3 re-runs). Hardened its likely cause, which
  predates this work: switching pharmacy now makes one fresh send attempt if the first `run()` was the tail of an
  already-failing sync; v37 then passed 2/2. Known limit: findings use the role of whoever is signed in when the sale
  reaches the cloud.
- 2026-11-09 · Step 4 · this commit · React till: the Midnight Pro F5-charges handler is gone, Charge always shows
  [F9], shortcut help updated. Flutter already behaved this way (F5 = sync, [F9]), so no Flutter change. v53 now checks
  that F5 leaves the sale open and F9 charges it: 22/22, and 3 failures against the old code, as expected.
  v52 19, v51 21, v37 27, v56 19.
- 2026-11-09 · Step 5 · this commit · Owner's choice: "safe now, rounds as a setting" (600,000 could break every
  sign-in if Cloudflare refuses >100,000 rounds or the free plan's CPU limit cuts the request; not testable from here;
  local workerd accepted 600,000 at ~90 ms vs ~15 ms for 100,000). `worker/passwords.js`: constant-time checks; new
  hashes at PBKDF2_ITER (default/min 100,000), falling back to 100,000 if refused; a right sign-in upgrades weaker
  hashes, legacy unsalted SHA-256 included, never failing the sign-in. Staff and owner passwords both use it; Hub got
  the constant-time compare (rebuild is step 16). Documented in MAINTENANCE.md. Test cloud runs with 150,000.
  unit-passwords 18 (incl. a simulated refusal), v57 9; full suite 1,745 passed, 6 failed (the known 6).
- 2026-11-09 · Step 6 · this commit · Owner's choice: slow down, don't lock. `worker/throttle.js` + `login_throttle`
  table: per account across all addresses, 10 wrong passwords (or two-step codes) within an hour → one try a minute,
  20 → one every 5 minutes; checked before hashing; same answer whether the account exists; cleared by a right
  sign-in, a password reset or an hour's quiet. The per-address lock stays. Daily cron prunes `login_fail` (finished
  locks and part-counts) and old slowdowns. unit-throttle 8; v58 10 (guesses from 10 addresses, a real minute's wait);
  v26 3, v42 12, v48 6; full suite 1,763 passed, 6 failed (the known 6). Not covered by a test: the slowdown on the
  "same email at several pharmacies" sign-in path (same helpers, key `*:<email>`).
- 2026-11-09 · Step 7 · `ebd624a` + this commit · Owner's choice: all documents. `<kind>-<branch code>-<till>-<count>`
  (R, PF, GRN, PO, TR, SC, RT) in both apps: `/api/till` gives each device a stable till number per pharmacy; each kind
  is counted in a per-till `counters` record saved in the same commit/transaction as the document and synced; branch
  code from the owner console (default: first three letters of the name); old style until a device has a till
  (older install, hub). Web tabs get a new till at each fresh start (the web keeps nothing). Old documents keep their
  numbers. unit-docnumbers 12, v59 9; Flutter analyze clean, 371 tests passed (+3); full JS suite 1,784 passed,
  6 failed (the known 6).
- 2026-11-09 · Step 8 · `60e4e0f` + this commit · Owner's choice: allow with a reason, flag it. Both apps: a credit
  sale taking a client over their limit (owed as on the Debtors page + what this sale puts on credit) asks a role
  without Finance for a reason; the sale keeps `creditOver`, the audit log records it; Finance roles go on freely.
  The cloud re-computes what is owed from its own records and adds an "Over credit limit" finding (reason quoted,
  or "No reason given" from an older app). Found while testing: a sale paid in full is never questioned. Tests:
  unit-anomalies +8, v60 10, Flutter +2 (373 passed, analyze clean); full JS suite 1,802 passed, 6 failed (the
  known 6). Not covered by a test: Flutter's reason dialog on screen (rule and saving are tested).
- 2026-11-09 · Step 13 · `7221fb5` + this commit · React: running balances (`src/stockindex.js`), only new movements
  added when the previous list is intact at both ends, full re-count otherwise, self-check every 300 steps. Flutter:
  SQLite adds movements up (`RecordStore.watchStock`) instead of decoding all of them. Measured (single machine,
  two runs each): React large pharmacy F9 → "Sale complete" 247/262 → 179/173 ms, the rest within noise; Flutter
  100k movements ~700 → ~180–270 ms per re-count. Benchmark repaired (it waited for a chart class removed earlier).
  unit-stockindex 11, Flutter stock_totals 2; Flutter 375 passed, analyze clean; full JS suite 1,813 passed,
  6 failed (the known 6).
- 2026-11-10 · Step 14 · `868a734` + this commit · Medicines, clients, suppliers and batches carry `_f` (field change
  times, compact) and merge field by field in the cloud's sync, React (put / mergeRemote) and Flutter (update /
  applyRemote); the cloud marks a merged result as its own so the sender downloads it; field times capped; unknown
  fields never erased; deletes stay record-level; other tables unchanged. Shared cases tests/field-merge-cases.json
  run by JS (14) and Dart (13); v61 8, v61-field-merge-app 5 (React offline edit vs another device). Flutter 388
  passed, analyze clean; full JS suite 1,840 passed, 6 failed (the known 6). Hub still whole-record (step 16).
- 2026-11-10 · Step 15 · `33a8680` + this commit · Measured first: MAX(seq) is an index lookup (records_gseq, ~0.007 ms
  at 300k rows), so the review's sequence concern was wrong and sequences are unchanged. The real cost was COUNT(*)
  over the pharmacy's rows on every push (~1.7 ms per 100k rows, and billed rows read): now a cached `tenant_counts`
  row, updated in the push's transaction, recounted hourly and always exactly before refusing. Deleting a pharmacy
  also removes its count and tills. v62 6 (concurrent pushes + a downloader: 1,000 records, none lost or doubled;
  cached count checked in the local DB); full JS suite 1,846 passed, 6 failed (the known 6).
- 2026-11-10 · Step 16 · `b7652aa` + this commit · The hub runs worker/index.js itself on Node's SQLite
  (server/d1-sqlite.js as D1); worker/main.js is the Cloudflare-only entry. hub.json moved once into hub.db (kept as a
  backup); daily DB copies; RXPOS_OWNER_KEY / RXPOS_TRUST_PROXY; bundled into server/hub-core.mjs by npm run build;
  Dockerfile on Node 22 shipping the bundle. Needs Node 22.13+; devices sign in to a hub again once; Windows
  `--hub` PCs need the new installer (noted for step 27). RXPOS_TEST_HUB=1: 18 suites / 274 checks pass on the hub (in
  CI too); hub-move 12; full JS suite on the Cloudflare cloud 1,858 passed, 6 failed (the known 6). Not checked here:
  the Docker image build (no Docker in this environment).
- 2026-11-10 · Step 17 · `e352df0`, `77beb90`, `bd26a07` · Owner's choice: ESLint only (no Prettier reformat, no
  file splits, typecheck unchanged). ESLint 10 flat config over app, cloud, hub, Windows shell, tests, tools; `npm run
  lint` (--max-warnings 0) in the build workflow's quick job. Fixed what it found: unused code (incl. a never-used
  useMemo over every product in Purchases), a test (v36) that fetched but never checked the cloud's sales, a crash in a
  tools/rxtera snippet, a hook false alarm (Scan.jsx), an error without its cause; four intentional hook dependencies
  marked with reasons. Lint 0 problems; unit tests pass; full JS suite 1,859 passed, 6 failed (the known 6); hub suites
  274/274.
- 2026-11-10 · Step 18 · `3d6925e` + this commit · Close the day per branch (new permission `day.close`; managers have
  it). The cloud refuses edits/deletes of a closed day's sales, expenses, payments, bank transactions, deliveries and
  supplier returns, and moving records into it; refunds of its sales and anything new dated in it are kept and flagged
  (owner's choice: no lost offline sales); reopening needs an admin and a reason; the close keeps frozen totals. Both
  apps: panel on Shifts & Cash-up, Edit hidden for closed-day sales, expense / bank rows locked. Days are Uganda days
  in the cloud and the device's own local day in the apps. v63 22; Flutter 392 passed (+4; the React parity snapshot
  regenerated with tool/parity/react_cases.mjs: only the new permission changed); lint 0; full JS suite 1,881 passed,
  6 failed (the known 6); hub suites 296/296.
- 2026-11-10 · Step 20 · `2ea42c5` + this commit · Owner's choice: 1 and 2. Discount limit per role (Users & roles;
  empty = no limit; admins never limited): the till refuses more before any prompt (proforma discounts exempt), the
  cloud flags "Discount above the role's limit". Blind cash-up (Settings switch): open-shift money figures hidden from
  staff without shifts.all; React's close shows the expected cash only after the count is locked; the shift is saved
  as blind and audited. The full Flutter run caught a bug in the first version: the till read the roles through a
  provider nothing watched, which was disposed before it loaded, so charging stopped (7 till tests failed); fixed by
  reading roles from the device store. v64 12; unit-anomalies +6; Flutter 394 passed, analyze clean; lint 0; full JS
  suite 1,899 passed, 6 failed (the known 6); hub suites 308/308.
- 2026-11-10 · Step 21 · `32fd351` · The owner said "Continue" without picking parts, so only the recommended one:
  GS1 pack codes (src/gs1.js, rxpos_flutter/lib/core/rules/gs1.dart, both checked against tests/gs1-cases.json):
  product number (AI 01), expiry (17), batch (10), serial (21); with or without the GS separator, a scanner prefix
  such as ]d2, or the printed "(01)…(17)…(10)…" text. Till (both apps, search box and camera): the medicine is found
  by its product number (an EAN-13 barcode matches the GTIN-14), that pack's batch is sold from first, an expired pack
  is refused. Add Stock (both apps): the line gets the batch and expiry; an unknown product number starts a new
  medicine with them filled. Flutter's "New / choose existing" row on a new-medicine line now wraps (it overflowed
  in the test font). Scheduled draft POs, expiry markdowns and branch rebalancing wait for the owner. unit-gs1 15
  (now in run-all), v65 6; Flutter gs1 13 + 2 new tests, 409 passed, analyze clean; lint 0; full JS suite 1,920 passed, 6 failed (the known 6);
  hub suites 314/314.
- 2026-11-10 · Step 22 · `c28ae27` · The owner had no preference, so the recommended part only: insurers and their
  schemes, and the co-pay split at the till, the insurer's share counted as owed like credit. Shared rules
  src/insurance.js / rxpos_flutter/lib/core/rules/insurance.dart, both checked against tests/insurance-cases.json: the
  client pays the co-pay (a percentage or a fixed amount, whichever is more), the insurer the rest up to the scheme's
  cover limit per sale. The sale keeps `insurance` {insurer, scheme, memberNo, share}; `paid` is the client's part only,
  so cash-up and the cash book are right as they were. Both apps: an Insurers page (insurers, schemes, what each owes,
  its sales, "Receive payment" as a payment of kind insurer: money in), the till's Insurance choice (registered client
  and member number needed; the member number comes from the client's record), receipts and A4 invoices name the
  insurer and member, Debtors and credit limits leave out the insurer's share, shift reports show "Billed to
  insurers". Cloud: insurers need Customers or Finance to change (Finance to delete); the insurer's share is part of a
  sale's money view (changing it is a sale edit); a new finding "Insurance split doesn't add up"; credit-limit checks
  leave out the share. The website's list of app pages gains /insurers. Not done, waiting for the owner:
  pre-authorisation numbers, monthly claim batches with rejections, member card checks. unit-insurance 18, v66 15,
  unit-anomalies +5, unit-policy +1; Flutter insurance 18 + 2 new tests, 429 passed, analyze clean, parity snapshot
  unchanged; lint 0; full JS suite 1,959 passed, 6 failed (the known 6); hub suites 330/330.
- 2026-11-10 · Step 23 · skipped: it needs URA EFRIS sandbox credentials, which we don't have (the owner had no
  preference between skipping and building the groundwork against a stand-in).
- 2026-11-10 · Step 24 · `84161f0` · The owner had no preference: the recommended part, an accessibility audit.
  React: axe-core 4.14.0 (pinned) checks sign-in and 18 main pages in light and dark (v67). Flutter: its own
  guidelines (labelled tap targets, text contrast) on 11 screens in the standard and dark look. Found and fixed: Add
  Stock's invoice paper was white behind light text in the dark theme (unreadable: the CSS used a variable that
  doesn't exist); the status pill's spoken name; medicine tiles named by their text; held-sale tabs; unnamed date,
  month and account boxes; chart bars; faded rows and shortcut keys below AA contrast; Flutter's unnamed favourite
  star. v67 38/38.
- 2026-11-10 · Owner's requests (Add Stock) · `c0b6734`, `a8f7ae1` · Receiving an invoice no longer changes a
  medicine's retail price (cost + markup is offered with "Use"; a new medicine still gets it, per unit). The expiry is
  read whatever its format (06/2028, JUN 2028, 30/06/2028 or 06/30/2028, 062028, 20280630, "EXP: 06/28"; shared
  rules, tests/expiry-cases.json, 33 cases). Any line, a new medicine too, can be received by a pack size typed on
  the line (Box of 100) and is sold by the unit; a new pack size is added to the medicine (audited); a new
  medicine is sold by the unit of its formulation. Fixed on the way: a medicine with no price received by the box
  was priced from the box cost; a new medicine received by the box took the box cost as its unit cost. v68 12, v18
  70, Flutter delivery and add-stock tests.
- 2026-11-10 · Owner's request (controls, all four parts chosen) · `d12714c` (React), `b6db3d6` (Flutter) · A
  keyboard map for the whole app, the same in both apps (src/keymap.js, keymap.dart, checked against each other):
  F2–F7 and two-key page shortcuts (G then C…), Ctrl+K, ?, Alt+←/→, G then G to pin; every key changeable per
  device (This device → Keyboard). Every list: arrow keys, Enter, E, N, /, Space, Ctrl+A, Esc, double-click,
  right-click menu, Shift+click ranges, bulk export/delete, and on the Medicine List bulk price / category /
  reorder level; columns per device and the search kept (React). Pinned and recent pages, breadcrumbs, Ctrl+K
  commands, scroll kept per page (React), a stock-and-batches hover (React). v69 35/35; Flutter keymap 3 + 1 widget
  test; Flutter 471 passed, analyze clean; lint 0; full JS suite 2,060 passed, 7 failed: the known 6, and the Advanced
  till's Ctrl+K (the app's map took it first), fixed in `062e2b5` (v52 19/19 again); hub suites 330/330.
- 2026-11-10 · Step 26 · `12d258b`, `c6fc407`, `27f5647` · The owner chose all four Flutter-only features for the
  React app: scheduled report emails (Settings → Alerts); a Shelves page and Inventory / Stock Count grouped by class,
  therapeutic area, form or shelf (src/drugclass.js, generated from the Dart rules and checked by tool/parity);
  Payroll & HR (src/payroll.js; both apps run tests/payroll-cases.json: PAYE bands, NSSF, absence, overtime,
  advances); the till's sale width and payment height dragged per device (Classic and Standard). The full suite
  caught two regressions from the handles (a sale line lost at 1440 × 900; the width saved one move behind), both
  fixed. v70 14, unit-payroll 12, parity 580 cases; Flutter 482 passed, analyze clean; lint 0; full JS suite 2,103
  passed, 8 failed (the known 6 + the two fixed since: v51 21/21, v70 14/14 again); hub suites 330/330.
- 2026-11-10 · Step 27 · `5c38a71` · Owner's choices: React 1.1.0, Flutter 2.1.0+2; a pull request the owner merges;
  then the version tags, the app builds and the cloud deploy. Release notes: docs/RELEASE-NOTES.md (deploy the cloud
  first; Hub PCs need the new Windows installer).
- 2026-11-10 · Release numbers · Found before tagging: the classic app's last release is v1.7.0 (main's package.json
  still said 1.0.0), so 1.1.0 would have looked older than what pharmacies run. The classic app is 1.8.0 instead. The
  Flutter apps take their version from the build workflow (2.0.<run>), now 2.1.<run>; the Flutter release workflow
  publishes flutter-v2.1 from a "Flutter apps" run number given when it is started.
