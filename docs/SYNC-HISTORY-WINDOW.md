# Recent history on devices (stage 4, recommendation G): design for the owner's approval

Part of `docs/SYNC-SPEED-PLAN.md`. **Approved by the owner on 11 Nov 2026: the full design, first shipped with the window off by default ("everything"), then turned on.**

## What changes for the pharmacy

- The **Windows and Android apps keep the last 12 months** of sales, stock movements, payments, expenses and logs
  (This device → "History kept on this device": 6, 12 or 24 months, or everything). The **websites keep 1 month**
  each time they open.
- **Older history stays in the cloud.** It is never deleted, and every device can still see it with the internet:
  Sales history, Reports, a client's statement, a medicine's stock card and the audit log fetch the older part when
  the dates asked for go back further. Offline, they show what the device has and say the older part needs the
  internet.
- **Stock, debts and cash stay exact.** Every balance is the same figure as today, to the shilling and the tablet:
  stock per branch and batch, what each client, supplier and insurer owes, each cash drawer and bank account, loans
  and salary advances.
- **Open items are always on the device, whatever their age:**
  - unpaid credit sales and unpaid purchases;
  - insurer claims not yet paid and salary advances not yet deducted;
  - open prescriptions, purchase orders and transfers;
  - stock counts in progress.
- **Unchanged:** selling, receiving stock, returns of sales within the window, day close and document numbers.
- **Returns of a sale older than the window** need the internet once, to fetch that sale.

## How balances stay exact: "brought forward"

Every balance in RxPOS is a sum of dated entries:
- stock is the sum of movements;
- a client's debt is credit sales minus payments;
- a cash account is the money ledger (`src/finance.js`): sales paid, refunds, expenses, payments, transfers…

The cloud adds up, for each balance, the entries dated **before the window start W**: the *brought-forward* figure.
The device adds the entries dated **from W** in the records it holds:

> balance = brought forward (entries before W) + entries from W on this device

Splitting by the date of each **entry**, not of each record, is what keeps it exact. Two examples:

- **An old sale refunded today.** Its sale entry is dated long ago, so it is in the brought-forward figure. The refund
  entry is dated today, so the device counts it.
- **An old unpaid sale kept as an open item.** It is on the device for the Debtors page, but its debt entry is
  before W, so only the brought-forward figure counts it, never twice.

**One rule module, used everywhere.** `src/balances.js` (new) lists every entry a record makes: kind, key, date,
amount. It is the same functions the screens use today (stock index, `customerBalance`, `supplierBalance`, the
money ledger, insurer and loan balances, salary advances). The cloud uses it to compute brought-forward figures, the
classic app to add its entries, and the Flutter app has the same rules in Dart. Shared case files
(`tests/balance-cases.json`) are checked by both apps, as with insurance and GS1.

**Keeping brought-forward figures right.** They are computed at a known cloud sequence number. Later, an entry dated
before W changes only when an old record itself changes, for example an old sale edited, or a deletion. When such a
record reaches the device, the device asks for fresh brought-forward figures (one small request). Stock movements
are never edited (append-only), so stock figures only change this way through a new movement, which is dated now and
is counted on the device.

## What the device holds

| Kept whatever their age | Kept from W (window) |
|---|---|
| Medicines, batches, clients, suppliers, staff, roles, branches, banks, insurers and schemes, settings, licence, employees, day closes, catalogue choices | Sales, stock movements, payments, purchases, expenses, bank transfers, supplier returns, transfers, audit log, messages, chat, events, temperature logs, quiz results, sale checks, attendance, payroll runs, proformas, shifts, stock counts |
| Open items (above) | |

Per kind of balance, the brought-forward figures add one small record each:
- per branch and batch for stock;
- per client, supplier, insurer, account, loan or employee for the others.

A pharmacy with 2,000 medicines adds a few thousand small records, against hundreds of thousands of old movements
and sales left in the cloud.

## Cloud

- **Full and core downloads take `window` (a date).** They send the records dated from W, the open items, every
  record of the tables kept whatever their age, and the brought-forward figures at W. Normal sync is unchanged: every
  change is sent whatever its date.
- **`POST /api/balances {window}`:** fresh brought-forward figures. The result is cached per pharmacy, window and
  sequence number, so many devices cost one computation.
- **`POST /api/history {t, from, to, cursor}`:** older records of one table for a date range, paged. Role rules
  apply, exactly as for sync (payroll, audit…).
- The Hub gets the same code.

## Moving the window forward

On a device, W stays put as the months pass, so the history grows. Once a month (and when the setting changes):
1. The device asks for brought-forward figures at the new W.
2. In one transaction, it swaps them in and removes records now entirely before W that are not open items.

Lengthening the window fetches the extra months.

The web versions start fresh each time with W one month back.

## Tests (each step, both apps)

- **Exact equality, the main test.** On generated pharmacies (sales, refunds of old sales, edits of old sales,
  credit, insurers, transfers, payroll, deletions), every balance computed with a window equals the one computed from
  full history:
  - after a first download;
  - after more changes from another device;
  - after the window moves.
- Shared case files for the entry rules (`tests/balance-cases.json`), checked in React, the cloud and Dart.
- Reports and lists across W show the same figures as with full history (cloud fetch).
- Offline with a window: selling, stock and debts work; the older part of a report says it needs the internet.
- Old apps and old clouds: a cloud without `window` sends everything, as today; an app without it never sends one.

## Effort and risk

- **Size.** This is the largest stage: about two to three times stage 2's code, across the cloud, the Hub and both
  apps. Every screen that shows history or balances is checked.
- **Main risk.** A balance rule missing from `src/balances.js` would make that figure wrong only on windowed devices.
  The exact-equality tests above are the guard: they compare every balance kind against full history on every run.
- **How to ship it.**
  1. Ship with the window **off by default ("everything")** for one build update.
  2. Then turn on 12 months (apps) and 1 month (web), once the equality checks on real pharmacies pass. The owner
     console can compare a device's balances with the cloud's for any pharmacy.
- **A smaller alternative, if preferred.** Window only the stock movements and the logs (audit, messages, chat,
  events). Stock brought forward is simple because movements are never edited, and these are most of the records in
  a typical pharmacy. All money records stay on every device. This gets most of the size reduction with a fraction
  of the risk, but sales history still grows forever.

## Built so far (11 Nov 2026)

**Shared rules**
- `src/balances.js` lists the entries each record makes. On 40 generated pharmacies they give exactly the figures of
  `stockindex.js`, `customerBalance`, `supplierBalance`, `insurerBalance`, `accountBalances` and `loanBalance`.
- `tests/balance-cases.json` holds 145 records. The Flutter app's `core/rules/balances.dart` gives the same entries
  for all of them.
- `src/historywindow.js` decides which records a device keeps. The cloud uses the same rule when it sends a windowed
  download.

**Classic app**
- With a window, stock and every money balance are brought forward plus the entries from W. On 60 generated
  devices, every balance equals the whole-history figure (`unit-balances`).
- A shorter window removes older records from the device only (no outbox entries, no deletion markers). A longer one
  downloads again. A cloud without brought-forward figures sends the device back to keeping everything.
  (`unit-sync-phases`)
- Reports and Sales history fetch dates before W from the cloud (`src/history.js`).
- The setting is on This device, off by default.

**Cloud** (`worker/window.js`)
- `/api/balances`.
- `/api/history`, with role rules as in sync.
- The window filter on full downloads and chunks (`v73`).

**Found while building, now part of the design**
- A device must also hold every record that makes an entry from W, such as an old sale refunded since. The cloud
  sends these.
- Stock is brought forward per branch, batch **and** medicine.
- Prescriptions, purchase orders, stock counts and drafts stay on devices whole.

**Not yet**
- The Flutter apps never send a window yet, so they keep everything as today. Their balance screens will take the
  brought-forward figures next.
- The audit log, client statements and stock cards show what the device holds, with older entries in the cloud.
  They will fetch them like Reports do.
