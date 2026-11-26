# URA EFRIS fiscal receipts

RxPOS can fiscalise every sale with the Uganda Revenue Authority's EFRIS (Electronic Fiscal Receipting and Invoicing
System), system-to-system, and print the fiscal document number (FDN), verification code and QR code on the receipt.
A refund becomes a credit note application to URA. It is off until a pharmacy switches it on.

## How it works

- **The cloud talks to URA** (`worker/efris.js`), with the pharmacy's own keys kept in the cloud only (never on a till).
  It builds the invoice from the cloud's own copy of the sale (`src/efris.js`), encrypts and signs it, sends it to
  EFRIS (interface T109) and stores the answer in the synced table `fiscal` (one record per sale, written only by the
  cloud). Every device downloads it, so any till can reprint the fiscal receipt.
- **Offline:** a sale made without internet is saved and printed as usual, with "URA EFRIS fiscal receipt pending".
  The app's queue (`src/efrisqueue.jsx`) sends it once the till is back online and has synced; the receipt can then be
  reprinted from Sales with its FDN and QR. A pharmacy that must print the FDN even while offline can run the RxPOS hub
  on its own PC with URA's **Offline Mode Enabler** and point the hub at it (`EFRIS_URL`, see below).
- **Never twice:** the cloud answers a sale it has fiscalised with the receipt it already has, and sends the receipt
  number as the seller's reference with "check reference" on, so URA itself refuses a second receipt for the same sale.
  When an answer was lost on the way, the cloud finds the receipt URA already has (T106, T108) instead.
- **Refunds:** a refunded, fiscalised sale gets a credit note application (T110) for the whole receipt, all amounts
  negative, with a reason code from the refund reason (expired or damaged → 101, a wrong amount → 103, otherwise 102
  cancelled purchase). URA approves credit notes; the queue asks (T111) every 15 minutes until it is approved and then
  prints the credit note FDN on the receipt.
- **VAT:** each line is reported with its own tax category (standard `01`, zero-rated `02`, exempt `03`) and VAT, from
  the per-item VAT on the sale (`src/tax.js`). A sale from before per-item VAT reports its VAT as standard-rated, or
  exempt when it had none. Prices in EFRIS include VAT; the lines always add up to exactly what the customer paid.
- **A refusal** (for example an unregistered item code) is kept on the sale with URA's message, shown on the receipt,
  and tried again after 6 hours; a network or URA outage is tried again every minute.

## Turning it on

1. **Owner console → the pharmacy → Payments & keys → URA EFRIS:** TIN, EFRIS device number, the private key (PEM),
   environment `test` first. Optional: the legal name and BRN as registered, default unit of measure and commodity
   category codes for medicines, another address (an Offline Mode Enabler). The main pharmacy uses Worker secrets of
   the same names (`EFRIS_TIN`, `EFRIS_DEVICE_NO`, `EFRIS_PRIVATE_KEY`, `EFRIS_ENV`, …). A hub reads them from its
   environment (`EFRIS_PRIVATE_KEY_FILE` may point at the key file).
2. **The pharmacy's Settings → Receipts & stock → URA EFRIS → Test the connection.** It asks URA for the time (T101) and for
   the session key (T104), which proves the TIN, device number and key.
3. **Switch on.** Sales from that moment on are fiscalised.
4. When the test environment works, set the environment to `production`.

The private key: EFRIS issues or accepts a key pair for the system (a `.p12`/`.pfx` file with a password). Turn it
into PEM text once and paste that: `openssl pkcs12 -in key.p12 -nocerts -nodes -out key.pem`. Keep the file safe.

## What the pharmacy must get from URA

1. **TIN, VAT registration and EFRIS registration.** The pharmacy is registered on the EFRIS portal
   (efris.ura.go.ug) as a taxpayer, with its legal name, branches and VAT status as RxPOS should report them.
2. **Approval of RxPOS as its system-to-system (ERP/POS) integration**, and the **EFRIS device number** URA assigns
   to it. URA's EFRIS team approves each integration after a test in its sandbox.
3. **The key pair for that device:** the private key (`.p12` or `.pfx` plus its password) whose public key is uploaded
   to or issued by the EFRIS portal for this device.
4. **Access to the EFRIS test (sandbox) environment** (`efristest.ura.go.ug`) with a test TIN and device number, to run
   the test URA asks for before going live. Then the same for production.
5. **Goods and services registered in EFRIS** with their codes: each medicine sold needs a goods code (RxPOS sends
   the medicine's id, or its `efrisCode` when set), its **commodity category** (UNSPSC code, e.g. from URA's list for
   pharmaceuticals) and **unit of measure** code (from URA's code list, T115). URA can tell which units to use for
   tablets, strips, bottles and so on.
6. **The current interface manual** ("Interface Design for System-to-System", v23.x or newer) and, if the pharmacy
   wants fiscal numbers while offline, the **Offline Mode Enabler** and its installation guide.
7. **URA's answer on stock:** some EFRIS profiles check stock before a receipt (goods stock maintenance, T131). If
   URA requires it for the pharmacy, RxPOS must also report stock received; that is not built yet.

## To confirm in the sandbox before going live

The field names and codes follow URA's published interface (T101, T104, T106, T108, T109, T110, T111) and the open
SDKs that work with it. These are the points to check against the sandbox and URA's current manual:

- the unit of measure and commodity category codes for medicines (step 5 above);
- that "exempt" is sent with tax rate `-` and zero-rated with `0`;
- the T111 fields that carry a credit note's approval and its FDN (`approveStatus`, `invoiceNo`);
- whether URA's Offline Mode Enabler expects the same encrypted and signed messages (it is reached the same way).

Not built yet: goods registration (T130) and stock reporting (T131) from RxPOS, credit notes for part of a sale
(RxPOS refunds whole sales), cancelling a credit note application, debit notes.
