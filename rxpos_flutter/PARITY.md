# Parity with the React app (the version before Flutter)

Every feature of the React app (`src/pages/*.jsx`, `src/*.jsx`), screen by screen, and where the Flutter app stands.
✅ done · ◐ partly · ✗ not yet. Items are ticked only when built and covered by a test.

## Sign-in and the app frame (Auth.jsx, App.jsx, main.jsx, engage.jsx, notify.jsx, refresh.jsx, twostep.jsx)
- ✅ Sign in by email / username and password; choose a pharmacy; two-step code
- ✗ Forgot password: email me a code, send a code by SMS, reset with Google
- ✗ PIN for this device (quick sign-in), "Use password instead"
- ✗ Change my password, log out from the menu
- ✗ Two-step sign-in setup (switch on / off) for the signed-in person
- ✗ Notifications centre (urgent / needs attention / for information) and the badge
- ✗ "No internet connection" banner; "Setting up" first-run screen
- ✗ Error screen: "Something went wrong · Reload RxPOS · Download my data"; crash reports to the cloud
- ✗ Global search (Ctrl+K): pages, medicines, customers, receipts
- ✗ Branch switch from the top bar; switches by itself when nothing is in progress
- ✗ Theme menu: light / dark / system, accent colours, 28 colour themes, colour level, surface style
- ✗ Idle-screen promotions and health tips; hourly time reminders
- ✗ Live connection (instant sync and notifications); calls (voice / video between staff)
- ✗ App updates (Windows installer, Android) and F5 refresh

## POS (POS.jsx)
- ✅ Search / scan, grid, in-stock filter, packs per line, price edit by permission, client, discount, tax, payment
  methods, cash tendered and change, credit, prescription check, controlled register, Mobile Money by transaction ID,
  hold and resume, proforma, F2 / F3 / F8 / F9 / Alt+H
- ✅ Filters: Recent, Favourites (star a medicine), categories
- ✅ Held sales as tabs above the sale; discard a held sale; Alt+← / Alt+→ to switch
- ✅ Tick lines ("Tick every line", remove ticked); swipe to remove on a phone
- ✅ Mobile Money request to the customer's phone (MTN / Airtel) and waiting for approval
- ✅ Directions / drug label for a line (print label); drug info from the line
- ✅ Camera "Scan items into the sale", continuous (Android); on Windows a USB / Bluetooth barcode scanner types into the search box
- ✅ Layouts: Classic / Standard (client strip, Alt+C) / Advanced UI (three columns, numbered lines, command bar Ctrl+K); keyboard shortcuts help (? / F1)
- ✅ Selling expired stock with a recorded reason
- ✅ Receipt: WhatsApp / SMS to the client from the receipt; auto print; receipt PDF button
- ✅ Sale kept on the device across a restart

## Sales History (Sales.jsx, SalesLines.jsx, Drafts.jsx)
- ✅ List, search, receipt, print / PDF / WhatsApp / SMS, refund
- ✅ Date range from / to (calendar), branch filter, cashier / payment / customer / status filter (completed / refunded / edited)
- ✅ Edit a past sale (items, quantities, prices, client, payment, discount, reason) with the change history ("Edited" badge)
- ✅ Full-page (A4) invoice print
- ✅ Export CSV and PDF
- ✅ Held sales tab (mine / everyone at this branch, view, continue or take over, discard)
- ✅ Sales lines report (every medicine sold, filters, profit, CSV / PDF) opening each sale

## Shifts (Shifts.jsx)
- ✅ Start, live figures, close with note count, history (mine / all)
- ✅ Close-of-day (Z) report (print, 80 mm), by payment method

## Proformas (Proformas.jsx)
- ✅ List, sell, cancel
- ✅ Search, view, print / PDF as a proforma invoice, delete

## Prescriptions (Prescriptions.jsx, Scan.jsx)
- ✅ Add / edit, refill, next due
- ✅ Dispense (Pending → Dispensed, as in the React app); medications kept as text like the React app
- ✅ Scan a prescription (photo → AI reading → matched to stock / alternatives → add to a sale / save as prescription)

## Controlled drugs (Controlled.jsx)
- ✅ Register
- ✅ Register per medicine with the running balance, patient and prescriber (CSV / PDF); batch recall lookup (where it is, every sale from it)

## People (People.jsx, Users.jsx, Messages.jsx, Reminders.jsx, Chat.jsx)
- ✅ Customers, suppliers, balances, payments; users, roles, reset password; reminders by WhatsApp; team chat (text)
- ✅ Users: add / edit (WhatsApp, home branch), password, disable (the React app's flag), delete, reset two-step; roles: permissions by group (All / None), copy, delete a custom role, reset a built-in one
- ✅ Messages & SMS: templates (new / edit / delete), audiences (all / chronic / debtors / chosen), WhatsApp one by one or SMS, today's health tip (the same tip as the React app), messages logged
- ✅ Reminders: refills from prescriptions and chronic medicines, debtors, WhatsApp or SMS (one or selected), last reminded
- ✅ Chat & Messages: General, private chats and client conversations (WhatsApp, SMS, record their reply); attachments
  (photo, PDF, video, audio, spreadsheet, up to 15 MB) and voice notes (up to 3 min); reply, forward, edit (24 h), delete for
  everyone (48 h) or for me, react, star, pin, search, message info, read ticks, unread counts, new messages every 8 s
- ✗ Voice calls from chat (part of the live connection, see App frame)

## Inventory (Inventory.jsx)
- ✅ List with filters (in stock / low / out / all, expiring, expired), value at cost and retail, batches ("Sells next"), count / add / remove, add / edit medicine
- ✅ Expiring / Expired tabs with Return and Write off; PDF
- ✅ Quick Edit (prices, reorder, shelf, barcode in a grid; margin; save many; generate missing barcodes)
- ✅ Stock Card (every movement of a medicine with the running balance; count / adjust)
- ✅ Inventory editor: a medicine's details and its batches here (number, expiry, actual quantity with a reason)
- ✅ Medicine List: full form (markup prices, generated barcode, opening stock), "Needs review" (missing or inconsistent details)
- ✅ Packs editor ("Sell or receive by strip, box…")
- ✅ Formulations list (add / edit, medicines using each)
- ✅ Export CSV / PDF

## Add Stock and Purchases (Purchases.jsx)
- ✅ Receive a delivery (packs, batches, costs, prices, new medicines), purchase history
- ✅ Delivery as an invoice layout: movable columns (kept on the device), date format choice, markup, unit cost / line total in step, price from cost (never lower on its own), cheaper-supplier hint
- ✅ Save as draft / carry on / start again (also from another device: same draft records as the React app); the unfinished delivery kept on the device
- ✅ New supplier and rename medicine from Add Stock
- ✅ Scan medicines into the delivery (Android camera, continuous)
- ✅ Scan supplier invoices (photos / PDFs, pages kept in the pharmacy's cloud, two AI readings, fill in now or drafts for review, lines to check, "I have checked" before receiving)
- ✅ Receive a purchase order (marked received)
- ✅ Edit a past delivery (add, remove, change lines; stock adjusted; sold stock protected; audit)
- ✅ Supplier prices tab; Drafts tab
- ✅ Filters (dates, supplier), payment type, unpaid, Export CSV / PDF

## Stock take (StockCount.jsx)
- ✅ Start, count per batch, found batch, review, post (same records as the React app: system quantity kept when counted)
- ✅ Scan & count (each scan counts one pack), blind count with show / hide, scopes: all, shelf, formulation, expiring, top by value, random, scan as you go
- ✅ History with each count's figures; view a count; clear a count; keep counting; cancel; count sheet PDF; CSV

## Reorder (Reorder.jsx)
- ✅ Reorder suggestions from sales velocity (window, lead time, cover), levels from sales (preview, apply), CSV
- ✅ Dead stock (not sold for N days, value tied up)
- ✅ Purchase orders (create per supplier, open, print, WhatsApp to the supplier, receive, delete); cheapest / last / chosen supplier

## Returns (Returns.jsx)
- ✅ Return a batch, list, search, CSV
- ✅ New return with several lines from any medicine (supplier from the batch's delivery, refund into a bank / credit note); view a return; return note PDF

## Branches (Branches.jsx)
- ✅ Branches at a glance (today, month, stock value, low / out), send, receive, transfers with status
- ✅ "Use on this device" from the list (branches are added by the RxPOS owner, as in the React app; the React app has no transfer cancel)

## Finance (Finance.jsx)
- ✅ Banks (add / edit; balances; no delete, as in the React app), Cash Book (account, dates, opening, running balance, totals, CSV / PDF)
- ✅ Expenses (by month, add / edit / delete, method, payee, CSV); Expense categories (add / edit, total spent)
- ✅ Deposits / withdrawals / transfers (add / edit / delete, reference); loans and repayments
- ✅ Debtors and Creditors (balances, receive / pay, payment history, CSV); Payment history

## Reports (Reports.jsx, Weekly.jsx, charts.jsx)
- ✅ Sales Report (daily bars, payment donut and shares, by cashier, retail vs wholesale), Sales lines, Sales by Product,
  Consumption (ABC, running out, not sold), Purchase Report (by supplier), Expenses Report, Profit & margins (price check
  against the target margin, by medicine / category), Stock Valuation (by formulation), Income Statement; branch; print
  / PDF every tab; CSV; "Reading your figures"
- ✅ Weekly summary (earlier / later weeks, against the week before, top sellers, stood out / slowed down, team, payments, PDF)
- ✅ Dashboard charts (daily sales 7 / 30 / 90 days, tap a day for its sales; money in & out month by month, 6 / 12);
  top 10 by amount / qty / profit; open drafts; promote today with share on WhatsApp; products and customers

## Settings (Settings.jsx, Device.jsx)
- ✅ Pharmacy: this device's own pharmacy details over the Owner's (kept on the device, never synced), Use Owner
  defaults, non-cash sales account, this device's branch
- ✅ Payment methods: rename, type, reorder, delete, add, defaults
- ✅ Receipts & stock (paper, footer, packs, expiry, lead time, cover, dead stock, automatic reorder levels)
- ✅ Messages & recovery (refill / payment reminder texts, administrator's WhatsApp, client details at the POS)
- ✅ Alerts & storage (owner's daily summary: emails, preview, email now, WhatsApp; idle promotions, hourly reminder,
  greetings, quiet hours; weather location with town search; storage limits)
- ✅ Online & Mobile Money (sync status, sync now; MTN / Airtel / SMS set-up status)
- ✅ Data & backup (download a backup, daily stock sheet link for Google Sheets, restore default settings)
- ✅ This device: branch, theme, sync & storage (waiting / refused changes, ready to work offline, download everything
  again), text size, rotation (Android), date format, notification sounds (the same tones, volume, own file, test)
- n/a Restore the copy from before the 1.6 upgrade (a browser storage upgrade the Flutter app never had)
- ✗ App version and updates (see App frame), notifications in the background (see App frame)

## Other screens
- ✅ Labels: four sizes (thermal 38×25 / 50×30 / 60×40, A4 sheet of 21), show price / expiry / pharmacy name, add all in-stock, a barcode made for a medicine without one, preview, print
- ✅ Import: standard catalogue tab, Excel (.xlsx) / CSV file or pasted rows, column matching, preview, update or skip existing, opening stock, template
- ✗ Drug information: online lookup saved for offline, counselling sheet (✅ local)
- ✗ Quiz: quick quiz offline (✅ AI quiz)
- ✗ Storage: weather, trend chart, delete a reading (✅ log)
- ✗ Calendar: copy, delete, add to Google Calendar, today view (✅ add / edit)
- ✅ Audit log: person, action, from date, search, branch, CSV

## Owner console (OwnerConsole.jsx)
- Stays on the website (rxposug.com): it manages every pharmacy, not one.
