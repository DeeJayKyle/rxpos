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
| 2 | Server write policy per table and operation (cashiers can't change prices, delete sales, …) | 1.1 | Worker + tests | ⏳ |
| 3 | Server checks sale totals/discounts; mismatches recorded as anomalies for the owner | 1.2 | Worker + tests | ⏳ |
| 4 | F9 is the only charge key on every theme (F5 never charges) | 4.6 | client | ⏳ |
| 5 | Passwords: 600k rounds, rehash on sign-in (including legacy SHA-256), constant-time compare | 1.5 | Worker + tests | ⏳ |
| 6 | Sign-in throttling per account (not only per IP), Turnstile after repeated failures, prune `login_fail` | 1.5 | Worker + tests | ⏳ |

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

## Log
(Each finished step adds a line here: date, step, commit, tests run, anything left open.)

- 2026-11-09 · Step 1 · `5cec6ab`, `feb1f20`, `b4c6838` · New `full-tests.yml` (reusable). `build.yml` runs it on
  push/PR and `release` + `deploy` need it; `deploy-cloud.yml` needs it. With `RXPOS_CI=1`, `run-all.mjs` reports 5 named
  checks that need Workers AI or Open-Meteo as skipped (any other failure still fails). Fixed `idle-fit.mjs` (never
  created its screenshot folder). Baseline here: 1,596 passed, 7 failed (the 7 documented environment failures).
  Verified: v15 → 26 passed, 4 skipped; idle-fit → 9 passed. Open: the Windows self-update suite could not run here (no
  Electron binary in this container); it runs on GitHub (xvfb present). If it fails there it will block deploys, and
  the cause should be looked at, not skipped. The first real proof is the first CI run on GitHub.
