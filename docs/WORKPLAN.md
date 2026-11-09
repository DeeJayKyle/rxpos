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
| 7 | Receipt numbers: branch–device–counter, unique offline, sequential | 2.1 | client + tests | ⏳ |
| 8 | Credit limit enforced at the till with an audited supervisor override | 2.2 | client + Worker check | ⏳ |
| 9 | Mobile Money: server-side pending payments, provider callbacks, "payments without a sale" screen | 1.3 | Worker + client | ⏳ (sandbox keys needed to test live) |
| 10 | Tokens: short access + rotating refresh token, device list with "sign out this device", secure storage | 1.5 | Worker + client | ⏳ |

## Phase 3 — Scale and structure (month 2)
| # | Step | Review ref | Status |
|---|---|---|---|
| 11 | Split payments on one sale (`payments[]`) | 2.3 | ⏳ |
| 12 | Tax per product (exempt / zero / standard), inclusive or exclusive pricing, tax per line | 2.3 | ⏳ |
| 13 | Incremental stock balances (no full rescan of movements per change) | 2.4 | ⏳ |
| 14 | Per-field merge for master data (products, customers, suppliers) | 2.5 | ⏳ |
| 15 | Per-tenant sequence and record counters on the server | 2.6 | ⏳ |
| 16 | Hub: shared sync/permission core over SQLite, or retire (per step 0) | 1.4 | ⏳ |
| 17 | ESLint + Prettier; split `worker/index.js` into route modules; split `POS.jsx`; widen typecheck | 3 | ⏳ |

## Phase 4 — Product upgrades (month 3+)
| # | Step | Review ref | Status |
|---|---|---|---|
| 18 | Owner: anomaly dashboard, day close / lock, accounting export | 4.5 | ⏳ |
| 19 | Clinical: structured allergies that block, interaction and duplicate-therapy checks | 4.2 | ⏳ (needs an interaction data source you are licensed to use) |
| 20 | Selling: loyalty points, promotions engine, customer display, cash-up with blind counts, per-role discount ceiling | 4.3 | ⏳ |
| 21 | Stock: GS1 DataMatrix scan, scheduled draft POs, expiry markdowns, branch rebalancing | 4.4 | ⏳ |
| 22 | Insurance: insurers/schemes, member check, co-pay at the till, monthly claim batches | 4.1 | ⏳ |
| 23 | URA EFRIS e-invoicing (fiscal number + QR on receipts, offline queue) | 4.1 | ⏳ (needs URA EFRIS credentials / sandbox) |
| 24 | Interface: one till layout with density setting, 4 themes, single payment panel, accessibility audit (axe), translations | 4.6 | ⏳ |
| 25 | React → Flutter cut-over plan and retirement of the React client (if chosen in step 0) | 3 | ⏳ |

## Phase 5 — Release (requested by the owner, 2026-11-09)
| # | Step | Status |
|---|---|---|
| 26 | Copy the features that exist only in the Flutter app into the React classic app (list them first, owner picks) | ⏳ |
| 27 | Publish both apps: release build (Windows, Android, Hub) and deploy cloud + website, after the full suite passes in CI | ⏳ (confirm version and timing with the owner first) |

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
