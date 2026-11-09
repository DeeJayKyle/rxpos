# RxPOS review: shortcomings, fixes and upgrade roadmap (Nov 2026)

What I examined: the React app (`src/`), the cloud Worker (`worker/`), the self-hosted Hub (`server/hub.mjs`), the Electron shell,
CI workflows, `docs/ARCHITECTURE.md`, `MAINTENANCE.md` and `rxpos_flutter/PARITY.md`. Pure unit suites (money, FEFO, ids, Rx
rules, dates, diff, secrets, safe URLs) were run: all pass. The full browser + local-cloud suite and the apps on real hardware
were **not** run. Each finding below cites the code it comes from.

## What is already strong

- **Stock as a ledger.** Stock is the sum of append-only movements (`movements`, `audit`, `controlled` are insert-only on the
  server). Offline sales on several devices merge without losing or doubling stock. This is the right foundation.
- **Durable sync.** Outbox in the same IndexedDB transaction as the record, op-id dedup on the server, cursor saved only after
  commit, refusals kept for review, clock clamping (`worker/index.js` `sync()`, `src/sync.js`).
- **"Sale complete" only after the commit.** The till waits for the device write and keeps the basket on failure (`POS.jsx` `finalize`).
- **Integer money math** with one explicit rounding per step (`src/money.js`, 22 unit checks).
- **Sensible security basics.** Password hashes never leave the server, HMAC tokens with purpose-separated keys, TOTP two-step,
  a strict CSP and HSTS (`public/_headers`), and a sandboxed Electron renderer with context isolation (`electron/main.cjs`).
- **Operations.** Nightly encrypted backups, a weekly restore drill, self-updating apps with rollback, and a maintenance handbook.

## 1. Critical: security and money integrity

### 1.1 Most tables have no server-side permission check
`GUARDED` (`worker/index.js:41`) only covers `users`, `roles`, `settings` and the payroll tables. Every other table (`products`,
`sales`, `purchases`, `expenses`, `bankTx`, `loans`, `payments`, `customers`, `transfers`, `batches`…) accepts any create, edit
or **delete** from any signed-in staff token. A cashier (permissions: `pos.sell`, `sales.view`…) can call `/api/sync`
directly to change a medicine's price or cost, delete or rewrite past sales, or add bank transactions. The UI hides these actions,
but the README's "roles & permissions enforced on the server" holds only for those few tables.

**Fix.** Add a server-side write policy per table and operation, reusing the permission keys in `src/access.js`:

| Table | create | update | delete |
|---|---|---|---|
| `sales` | `pos.sell` | `sales.edit` (or a refund/void status change with `sales.refund`) | refuse (void via status) |
| `products`, `batches`, `formulations` | `medicines.manage` / `stock.receive` | `medicines.manage` | `medicines.manage` |
| `purchases`, `supplierReturns` | `stock.receive` | `purchases.edit` | refuse |
| `expenses`, `bankTx`, `loans`, `payments` | `finance` | `finance` | `finance`, and audited |
| `customers`, `suppliers` | `customers` / `suppliers` | same | same |

Unit-test it the way v38 already tests a cashier writing `users`.

### 1.2 The server trusts client-computed totals
A sale arrives with `subtotal`, `discount`, `tax`, `total` and line prices computed on the device (`POS.jsx:243-248`, `finalize`).
Nothing on the server checks that the total equals the lines minus the discount plus tax, that a discount was allowed, or that prices
match the product. Combined with 1.1, the books can be falsified from a device.

**Fix.** Validate sale invariants on the server with the same `src/money.js` functions. To stay offline-first, don't reject the sale:
record it, then flag a mismatch in an `anomalies` table shown on the owner dashboard. Flag discounts above the role's limit the same way.

### 1.3 Mobile Money: the customer can pay with no sale recorded
`sendMomo` (`POS.jsx`) polls payment status from the device for up to 3 minutes and calls `finalize` only on the device. If the app
closes, crashes or loses power during that time, the customer is charged and no sale exists. There is no provider callback handler
and no reconciliation.

**Fix.** Create a server-side `pendingPayments` row when the request is sent. Handle the MTN and Airtel callbacks on the Worker.
On approval, either finish the sale server-side from the stored basket or mark it "paid, sale missing". Add an owner/supervisor
screen for **payments without a sale** and **sales marked MoMo without a confirmed payment**.

### 1.4 The self-hosted Hub is a weaker, divergent copy of the cloud
`server/hub.mjs` does not enforce any of the following:

- append-only tables: `movements`, `audit` and `controlled` can be overwritten or deleted;
- role permissions: only admin-vs-not, through `ADMIN_ONLY`;
- an op ledger;
- login rate limiting.

It also accepts unsalted legacy SHA-256 passwords, compares hashes with `===`, and stores the whole database in one JSON file in
memory. Every sync filters and sorts **all rows** (`Object.values(state.rows).filter(...).sort(...)`), so the cost of each 10-second
pull grows with the pharmacy's lifetime. On a LAN it runs over plain HTTP, sending the sync key in clear text.

**Fix.** Extract the Worker's sync and authorisation core into one shared module, and run it in the Hub over SQLite
(`node:sqlite` / better-sqlite3). Alternatively, retire the Hub. Two implementations of the security rules will keep drifting apart.

### 1.5 Passwords and sign-in
- PBKDF2-SHA256 at **100,000** iterations (`worker/index.js:211`, `:766`). OWASP's current guidance is 600,000. The `iter` field
  already exists, so this is a rehash on next successful sign-in.
- Legacy unsalted `sha256('pharmapos:' + pw)` is still accepted (`verifyPassword`, `:218`), and the server doesn't rehash on sign-in.
- Hash comparison with `===` instead of the `safeEqual` already defined in the file.
- The lockout key is `ip|tenant|email` (`:372`). An attacker who rotates IPs gets 5 guesses per IP indefinitely. Add a per-account
  limit with exponential backoff (plus Cloudflare Turnstile after N failures), and prune `login_fail`, which grows by one row per IP.
- Tokens are 30-day bearer tokens with no per-device revocation. They are stored in IndexedDB, not OS secure storage (noted in
  ARCHITECTURE §9). **Fix:** short access token plus rotating refresh token, a device registry with "sign out this device",
  Electron `safeStorage`, and Android Keystore.

## 2. High: correctness and data

### 2.1 Receipt numbers repeat and are not sequential
`docNumber` (`POS.jsx:20`) is `prefix + last 6 base-36 digits of Date.now() + 1 random char`. 36⁶ ms ≈ **25.2 days**, so the
timestamp part wraps monthly, and only 1 random character (1 in 36) separates two receipts that land on the same wrapped
millisecond. Numbers are also not sequential or per branch, which fiscal rules and auditors expect.
**Fix.** Use `<branch code>-<device code>-<monotonic counter>` (e.g. `NTD-2-004231`), assigned locally. That is unique offline by
construction. Keep `id` (UUID) as the key, and add a server-assigned fiscal number for EFRIS (see 4.1).

### 2.2 Credit limits are recorded but never enforced
`creditLimit` is a customer field (`People.jsx:20`) but nothing reads it at the till. A credit sale can push any customer
past their limit. **Fix:** at checkout, check outstanding balance plus this sale against the limit, and require a supervisor override (audited).

### 2.3 One payment method per sale; tax is single-rate and exclusive only
- No split tender (cash + MoMo, or insurance co-pay + cash), which is common at pharmacies.
- `taxOf(...)` is called with one pharmacy-wide `taxRate`, added on top (`POS.jsx:247`). In Uganda most medicines are VAT-exempt,
  while cosmetics and supplements are standard-rated, and shelf prices are usually VAT-inclusive.
**Fix:** a `payments: [{method, amount, ref}]` array on the sale; a per-product tax class (exempt / zero / standard),
inclusive or exclusive pricing per pharmacy, and tax per line.

### 2.4 Memory and start-up grow without limit
The whole pharmacy is held in memory, including every sale, movement, audit row and chat message. `stockIndex` (`store.jsx:600`)
rescans **every movement ever recorded** after each change, and `products` is rebuilt as well. The benchmarks already show a
large pharmacy at 869 ms to the till with 51k records. A busy pharmacy adds 150k–250k movements a year.
**Fix (fastest win):** keep running balances per `branch|batch` and update them incrementally from the diff instead of recomputing.
**Fix (structural):** periodic stock checkpoints (closing balances per period), archive closed periods out of memory, and query
history from storage on demand. SQLite on the device (the Flutter app already uses drift) makes this natural.

### 2.5 Last-writer-wins on whole records
Two devices editing different fields of the same product (one the price, one the reorder level) lose one edit. **Fix:** per-field
timestamps for master data (products, customers, suppliers, settings), merged field by field. Ledgers stay append-only.

### 2.6 Server hot spots
Every write computes `(SELECT COALESCE(MAX(seq),0)+1 FROM records)` over **all pharmacies**, and every push runs
`COUNT(*)` over the tenant's records for the quota check. That is fine today but will serialise all tenants as you grow.
**Fix:** a per-tenant `counters` row (`seq`, `record_count`), updated in the same batch.

## 3. Engineering process

- **CI does not run the tests.** `build.yml` and `deploy-cloud.yml` run only `npm run typecheck`, and `tsconfig.json` checks only two
  files (`contracts.d.ts`, `storage.js`). The 1,200+ check suite (`tests/run-all.mjs`) never gates a deploy to production.
  **Fix:** run the unit suites on every PR (seconds), and run the full suite (local Wrangler plus headless Chromium, already in
  the harness) before the deploy job.
- **No linter or formatter.** Several `eslint-disable` comments exist with no ESLint config. Add ESLint
  (`react-hooks/exhaustive-deps` especially) and Prettier.
- **Very large files.** `worker/index.js` (1,474 lines, every route in one `if` chain), `POS.jsx` (999), `Purchases.jsx` (913),
  `styles.css` (2,538). Split the Worker into route modules (sync, auth, owner, pay, files, ai) behind a small router, and split
  POS into cart, payment and receipt components plus a `usePosCart` hook. That also makes these pieces unit-testable.
- **Widen TypeScript progressively.** Add `sync.js`, `money.js`, `fefo.js`, `access.js` and the Worker's `sync()` to `checkJs` next.
- **Two clients.** The React app ("classic") and the Flutter rewrite (≈40k Dart lines, PARITY.md shows 106/106 ✅) ship side by
  side with a per-pharmacy switch. Every feature and every fix is paid for twice. **Recommendation:** set a cut-over date. Move
  pharmacies to the Flutter app in waves, freeze the React client to security fixes only, then retire it. Flutter's SQLite store
  also solves 2.4. Before cut-over, port the React browser suites that cover sync and sale safety (v37, v38, v44) to the Flutter app.

## 4. Upgrade roadmap: the best pharmacy POS it can be

### 4.1 Compliance (table stakes in Uganda and East Africa)
- **URA EFRIS e-invoicing:** fiscalise each sale, print the fiscal document number and QR code on the receipt, and queue offline
  fiscalisation for later.
- **NDA and controlled drugs:** register exports in the regulator's format, a batch recall workflow (find every customer who
  received batch X and message them), and expired-stock destruction certificates.
- **Insurance:** insurer and scheme master data, member verification, co-pay split at the till, pre-authorisation numbers, and
  monthly claim batches with rejection tracking. This is high-value revenue for the pharmacy.

### 4.2 Clinical safety at the till
- Allergies are free text that is only displayed (`POS.jsx:674`). Store them as structured ingredients or classes, and **block**
  when a cart line matches.
- Drug–drug interaction and duplicate-therapy checks against the cart and the customer's recent purchases.
- Paediatric and weight-based dose helper on the label; pregnancy and lactation flags.
- Generic substitution: offer in-stock equivalents with the same active ingredient when an item is out of stock, with the margin difference shown to staff.

### 4.3 Selling
- Split tender, layaway/deposits, and store credit from returns.
- Loyalty points and member pricing (today a "loyalty member" is only a count of sales), plus a promotions engine (buy X get Y, bundle price, time-limited).
- Customer-facing second display (total, items, MoMo QR); cash drawer kick and cash-up variance with blind cash counts.
- Price overrides with a reason and a per-role discount ceiling enforced on the server (1.2).

### 4.4 Stock and purchasing
- Supplier EDI/price-list imports and invoice reading (already started with AI) that **auto-matches** lines to purchase orders, flagging price changes.
- Auto-reorder that creates draft POs per supplier on a schedule; min/max per branch; inter-branch balancing suggestions (move slow stock to where it sells).
- Expiry management: auto-markdown suggestions N days before expiry, returns-to-supplier windows, and the value-at-risk shown on the dashboard.
- GS1 DataMatrix scanning (GTIN + batch + expiry + serial in one scan) so receiving and selling capture the batch automatically.

### 4.5 Owners and multi-branch
- A real-time owner dashboard: sales, margin, cash position, stock value and anomalies (1.2, 1.3) across branches.
- Period close / day lock: once a day is closed, its sales and cash cannot change without a reversing entry.
- Accounting export (QuickBooks, Xero, Tally) or a proper general ledger behind the existing finance pages.
- Public API and webhooks for integrations.

### 4.6 User interface
- **Never tie a key to a colour theme.** In the Midnight Pro theme, F5 charges the sale when the basket is not empty
  (`POS.jsx:506`, hint at `:737`), but everywhere else F5 is "sync now" (`refresh.jsx:39`). A cashier moving between devices can
  charge a sale by accident. Make F9 the only charge key on every theme.
- **Fewer, better options.** Three POS layouts, 28 colour themes, colour levels, surface styles and font packs multiply the test
  matrix and confuse staff. Ship one excellent responsive till with a compact/comfortable density setting, plus light, dark,
  high-contrast and the pharmacy's brand accent.
- **Speed is the UI at a till.** Target under 100 ms from scan to line on low-end Android. Keep search results virtualised. Stock maths moves off the render path (2.4).
- **Payment as one panel:** tender buttons with quick cash amounts, split rows, MoMo QR, and change due in large type.
- **Accessibility:** about 190 `aria-` attributes across the whole app is low for 40+ screens. Audit with axe in the test suite,
  add focus-visible styles, full keyboard reachability for modals, and announced live regions for "Sale complete" and errors.
- **Localisation:** all text is hard-coded English. Extract strings (Luganda, Swahili, and French for neighbouring markets), and format dates and numbers per locale.
- **Core over extras.** Chat, voice calls, weather, quizzes and the idle-screen shop window are well made but compete with the
  items above for effort. Put them behind features, measure use, and drop what isn't used.

## 5. Suggested order

1. **Week 1–2:** server write policy (1.1), sale invariant flags (1.2), F5 fix (4.6), CI running the unit suites, then the full suite before deploy (3).
2. **Week 3–4:** MoMo callbacks and reconciliation (1.3), password rehash and lockout (1.5), receipt numbering (2.1), credit limits (2.2).
3. **Month 2:** split tender and per-product tax (2.3), incremental stock balances (2.4), Hub on the shared core or retired (1.4).
4. **Month 3+:** EFRIS, insurance claims, clinical checks, React → Flutter cut-over, then the rest of section 4.
