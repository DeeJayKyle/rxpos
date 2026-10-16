# Copying a pharmacy from Rxtera into RxPOS

Rxtera has no export or API, so the data is read from the pharmacy's own signed-in Rxtera pages in Chrome,
saved on this PC, and then written into an RxPOS pharmacy. Only do this for a pharmacy that has asked for it.
Running it again later updates RxPOS with whatever changed in Rxtera ("refresh").

**Never commit the copied data**: it is customer and patient data. Keep the data folder outside the repository.

## 1. Start the receiver on this PC

```bash
node tools/rxtera/receiver.cjs <random-token> https://<pharmacy>.rxtera.com <data-folder>
# e.g. node tools/rxtera/receiver.cjs 3f9a1c77e0b24d56 https://pharmcare.rxtera.com %LOCALAPPDATA%\Temp\rxm\mcb
```

It listens on 127.0.0.1:8799 and saves each page it is sent as `<data-folder>/<name>.json`.
Make up the token (any long random text); only requests with it are accepted.

## 2. Read the pages in Chrome

Sign in to Rxtera, press F12 → Console, and paste from `browser-snippets.js`:

| Open this Rxtera page | Paste | Saves |
|---|---|---|
| any page | section 0 (setup, with your token) then section 1 | `other`, `extra` (Rxtera's logo is never copied) |
| `/quickedit` | 0, section 2, then `rxPaged('quickedit')` | stock batches (qty, cost, batch, expiry) |
| `/costhistory` | 0, 2, then `rxPaged('costhistory')` | every delivery line |
| `/medicine-list` | 0, section 3, then `rxMedicines()` | every medicine with prices |
| `/salesreport` | 0, section 4, then `rxSalesReport()` | `sales-YYYY-MM` (keep the tab in front) |
| `/stock/sale/history` | 0, section 5, then `rxTable('saleheads')` | payment method, phone, notes per sale |
| `/stock/history` | 0, 5, then `rxTable('purchaseheads')` | invoice numbers, payment type |
| `/stock/debit-notes` | 0, section 6, then `rxNotes('debitnotes')` | purchase corrections |
| `/stock/credit-notes` | 0, 6, then `rxNotes('creditnotes')` | sale corrections |
| `/purchasereport` | 0, section 7, then `rxPurchaseReport()` | purchase lines with invoice numbers |
| `/stock/counting/N/checkVariance` (each N) | 0, section 8, then `rxStockCount(N)` | stock count results |

Chrome may ask to allow access to devices on the local network: click **Allow**.

## 3. Write it into RxPOS

```bash
node tools/rxtera/sync.mjs <rxpos-pharmacy-id> <data-folder> --dry      # shows what would change
node tools/rxtera/sync.mjs <rxpos-pharmacy-id> <data-folder>            # stocked/sold medicines + history
node tools/rxtera/sync.mjs <rxpos-pharmacy-id> <data-folder> --mirror   # exact copy: also removes what Rxtera doesn't have
node tools/rxtera/sync.mjs <rxpos-pharmacy-id> <data-folder> --new-only # only entries RxPOS doesn't have yet; never edits or removes
```

- The owner key is taken from `OWNER_KEY`, or from `Documents/RxPOS-Data/RxPOS-OWNER-KEY.txt`.
- Stock is set to exactly Rxtera's quantities. Past sales and purchases are history only (`imported: 'Rxtera'`):
  they count in reports but not in today's cash, and correcting them doesn't move stock.
- `--new-only` (JBM's scheduled sync, 12 am / 10 am / 2 pm / 6 pm / 10 pm) adds new sales, purchases, expenses, customers, suppliers,
  medicines and batches (with opening stock for new batches). Existing records and existing stock are never touched.
- `--mirror` keeps staff accounts, roles, settings, branches, chat and the audit trail; everything else that
  isn't in Rxtera is removed, and the built-in medicine catalog is switched off for that pharmacy.
- `<data-folder>/sent.json` remembers what was already sent, so a refresh only writes changes. Don't delete it.
- Staff accounts are not created automatically: add them in the owner console (Staff), with
  "choose their own password at first sign-in" ticked.
