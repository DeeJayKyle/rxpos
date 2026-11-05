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
- ✗ Close-of-day report (print), by payment method table

## Proformas (Proformas.jsx)
- ✅ List, sell, cancel
- ✗ View, print, delete

## Prescriptions (Prescriptions.jsx, Scan.jsx)
- ✅ Add / edit, refill, next due
- ✗ Dispense (to the till)
- ✗ Scan a prescription (photo → AI reading → add to a sale / save as prescription)

## Controlled drugs (Controlled.jsx)
- ✅ Register
- ✗ Batch recall lookup

## People (People.jsx, Users.jsx, Messages.jsx, Reminders.jsx, Chat.jsx)
- ✅ Customers, suppliers, balances, payments; users, roles, reset password; reminders by WhatsApp; team chat (text)
- ✗ Users: delete, reset two-step, copy a role, edit permissions by group, reset a role to default
- ✗ Messages & SMS: templates (new / edit), send by WhatsApp or SMS, today's health tip
- ✗ Reminders by SMS
- ✗ Chat: client conversations, attachments (photo, PDF, video, audio, spreadsheet), voice notes, reply, forward,
  edit, delete, star, pin, search, message info, read marks, WhatsApp from chat

## Inventory (Inventory.jsx)
- ✅ List with filters, batches, count / add / remove, add / edit medicine
- ✗ Expiring / Expired tab with Return and Write off
- ✗ Quick Edit (prices and stock in a grid)
- ✗ Stock Card (every movement of a medicine)
- ✗ Batches at this branch
- ✗ Medicine List: records with missing or inconsistent details; generate missing barcodes
- ✗ Packs editor ("Sell or receive by strip, box…")
- ✗ Formulations list
- ✗ Export CSV / PDF

## Add Stock and Purchases (Purchases.jsx)
- ✅ Receive a delivery (packs, batches, costs, prices, new medicines), purchase history
- ✗ Delivery as an invoice layout: movable columns, date format choice, markup, recalculate price from cost
- ✗ Save as draft / carry on / start again (also from another device)
- ✗ New supplier and rename medicine from Add Stock
- ✗ Scan medicines into the delivery (camera)
- ✗ Scan supplier invoices (AI reading, pages, review before receiving)
- ✗ Edit a past delivery (add, remove, change lines; stock adjusted; audit)
- ✗ Supplier prices tab
- ✗ Export CSV

## Stock take (StockCount.jsx)
- ✅ Start, count per batch, found batch, review, post
- ✗ Scan & count (each scan counts one pack), blind count options, by shelf / category / random scopes
- ✗ History with each count's report; clear a count; keep counting

## Reorder (Reorder.jsx)
- ✅ Reorder suggestions, levels from sales
- ✗ Dead stock
- ✗ Purchase orders (create, open, receive, delete, print); cheapest / last supplier

## Returns (Returns.jsx)
- ✅ Return a batch, list
- ✗ New return with several lines from any medicine; view a return

## Branches (Branches.jsx)
- ✅ Branches, send, receive
- ✗ Cancel a transfer; "Use on this device" from the list

## Finance (Finance.jsx)
- ✅ Account balances and statements, expenses, deposits / withdrawals / transfers, loans and repayments
- ✗ Payment history; Cash Book; Expense categories (add / edit); Banks (add / edit / delete)
- ✗ Debtors and Creditors pages; Export CSV

## Reports (Reports.jsx, Weekly.jsx, charts.jsx)
- ✅ Summary, by medicine / day / payment / cashier, print
- ✗ Sales lines; Sales report; Sales by product; Consumption (ABC); Purchase report; Expenses report; Profit &
  margins; Stock valuation; Income statement; by supplier, by formulation, retail vs wholesale; "Reading your figures"
- ✗ Weekly summary
- ✗ Dashboard charts (daily sales 7 / 30 / 90 days; money in & out month by month); top 10 by amount / qty / profit;
  share on WhatsApp
- ✗ Export CSV everywhere

## Settings (Settings.jsx, Device.jsx)
- ✅ Receipts & stock, payment methods (add), this device (branch, theme, storage)
- ✗ Pharmacy tab (owner defaults), Messages & recovery, Alerts & storage, Online & Mobile Money, Data & backup
  (download a backup, restore defaults), daily stock sheet link, calendar link
- ✗ Payment methods: edit, delete, reorder
- ✗ This device: screen orientation, alarm sound test, restore the copy from before the upgrade

## Other screens
- ✗ Labels: show price / expiry / pharmacy name, add all in-stock, preview (✅ print)
- ✗ Import: standard catalogue tab, Excel / CSV file, preview, template download (✅ paste)
- ✗ Drug information: online lookup saved for offline, counselling sheet (✅ local)
- ✗ Quiz: quick quiz offline (✅ AI quiz)
- ✗ Storage: weather, trend chart, delete a reading (✅ log)
- ✗ Calendar: copy, delete, add to Google Calendar, today view (✅ add / edit)
- ✗ Audit log: date filter (✅ search)

## Owner console (OwnerConsole.jsx)
- Stays on the website (rxposug.com): it manages every pharmacy, not one.
