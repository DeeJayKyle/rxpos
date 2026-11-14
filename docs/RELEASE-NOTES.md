# RxPOS release notes

## React (classic) app 1.8.6 · Flutter app 2.1 (next build) · November 2026

- **Shop window (idle screen) with AI:** once a day the AI picks the medicines worth showing from those the screen
  may already show customers (never prescription-only or controlled), writes a short headline and a plain line for
  each, and adds a few seasonal health tips, marked as written with AI. No cure claims, prices or doses. Each card
  gets an illustration of its health topic: never a product, packaging or brand. The pictures are kept on the
  device, so each topic is fetched once.
- **3D carousel:** on wide screens the cards before and after lean back on either side of the one in front.
- Offline, without the cloud or with AI switched off, the screen shows its own picks, the WHO tips and the drawn
  pictures, as before.

## React (classic) app 1.8.5 · Flutter app 2.1 (next build) · November 2026

- **Dashboard:** today's figures (sales, gross profit, expenses and transactions, each against yesterday) are back at
  the top, with the new bento row (period sales, daily bars, latest receipts, the next step) just below them.

## React (classic) app 1.8.4 · Flutter app 2.1 (next build) · November 2026

A faster app, new navigation and a dashboard from the owner's design references, and Notion-like pages. Data,
figures, permissions, offline work and backups are unchanged; a theme already chosen on a device is kept.

- **Faster:** sync runs in the background and waits for a quiet moment, so typing, tapping and moving between
  pages stay quick while it works. The till, Inventory and Add Stock open several times faster, and large lists
  draw in steps. The Flutter app re-reads only the records that changed.
- **Navigation:** on phones the bottom bar floats as a pill and More opens every page as a sheet, each with a line
  on what it is for and the pharmacy's next step on top (expiring stock, low stock, the cash-up). On wide screens
  This device → Navigation offers the sidebar (with that next-step card) or a top bar of pills with dropdowns.
- **Gold Night:** a new dark theme in black, ivory and gold.
- **Dashboard:** a new top row with Today / 7 days / 30 days, the sales against the period before, daily bars (tap
  a day for its sales), the latest receipts marked Paid, Owing or Refunded, and the next step.
- **Notes & SOPs** (under People): pages for procedures, checklists, handovers and meeting notes, on every device.
  Type "/" for headings, to-dos, lists, toggles, callouts and more; drag blocks to reorder; put pages inside pages;
  star and search them; start from templates (opening checklist, cold chain SOP, shift handover, dispensing SOP,
  staff meeting). A device on an older version sees notes once it updates.
- **Views:** Medicines, Customers, Suppliers and Sales History (web) and the Medicine List (Flutter) can be shown as
  a table, a board (by stock status, customer type or paid / owing) or a gallery of cards, kept on each device.
  Rows and cards have a ⋯ menu with their actions.
- **"/" commands:** in Ctrl+K "/" lists only commands (now with a new note page); in the till's search box "/"
  runs the till's commands, such as /pay, /hold, /disc 10 and /void 2.

## React (classic) app 1.8.3 · Flutter app 2.1 (next build) · November 2026

AI help, a live clinical safety check and a new look for both apps. Data, figures, permissions, offline work, sync
and backups are unchanged; AI needs the internet and the cloud (a self-hosted hub says it isn't set up), and the owner
can switch it off per pharmacy as before.

- **The till on a phone:** the open sale sits below the top bar, Charge is always in reach (pinned at the top and
  again at the bottom), the held sales are never cut off, and slimmer lines show more medicines.
- **Ctrl+K, now with AI:** the same instant search, offline. Online, it can also do it at the till ("add 2 strips
  of paracetamol"), answer stock questions (what expires soon, dead stock, a reorder draft) from the pharmacy's own
  figures, or diagnose a device problem.
- **Scan Invoice with AI** (Add Stock) and **Scan Rx** (the till): a photo, image or PDF is read, matched to your
  medicines and shown for checking first. A prescription fills the controlled-drugs register's patient and
  prescriber. The existing Scan invoice (several pages, drafts) is unchanged.
- **Clinical safety check** on every sale: the customer's recorded allergies, the same medicine twice and
  well-known serious interactions. A small "Safety" badge when clear, a pill to open when something needs a look.
  It never blocks a sale.
- **Expiry at a glance:** green (over 6 months), amber (3–6 months, days shown inside the warning period), red
  (expired: not sold). Rx and CD · NDA pills. Tablet / Strip / Box beside each line on the till.
- **AI System Doctor** (This device; Device errors in the owner console): explains sync, storage and error problems
  in plain English, with repairs that ask first and never lose unsent changes.
- **New themes:** RxPOS OLED Black (true black, saves battery on OLED phones) and RxPOS Daylight Clinical, the
  starting themes for new devices. A theme already chosen on a device is kept. Bento cards, even-width figures,
  48 px touch targets on touch screens.

## React (classic) app 1.8.2 · Flutter app 2.1 (next build) · November 2026

A mobile update for both apps with an iOS-like feel. Data, figures, permissions, settings, actions, offline work,
sync and backups are unchanged, and every theme keeps its colours and fonts.

- **Navigation on every page:** a Back button (to the page you came from, or Home) and the bottom tab bar
  (Home · Stock · Sell · Sales · More) on phones and tablets. On Android the phone's own Back button steps back
  through the pages and leaves the app only from Home (Flutter).
- **Gestures:** swipe from the left edge of the screen to go back; the page follows your finger. It never starts
  in text boxes, dialogs or sideways-scrolling tables.
- **Gliding motion:** pages slide in like iOS, Back slides the other way, the bottom tabs cross-fade and dialogs
  rise from the bottom. All motion is off when the phone asks for reduced motion.
- **iOS-like look:** frosted top and bottom bars, rounded cards, large page titles on phones, iOS-style segmented
  tabs and switches, 44 px touch targets.
- **Add Stock (both apps):** the unit cost is worked out from the line total (line total ÷ quantity, per pack when
  received by the pack) and can't be typed; you type the line total. The retail price is never set or changed by
  the app: a medicine already in the list keeps its price until you type a new one, and a new medicine needs a
  typed price before it can be received. Cost + markup is only offered ("Use UGX …"), applied when tapped.
- **Fits every screen:** every page was checked at 360 and 390 / 400 px wide (and with larger text); forms open as
  full-height sheets on phones with Save always visible, and the field you type in stays above the keyboard.

## React (classic) app 1.8.1 · Flutter app 2.1 (next build) · November 2026

A screen-layout update for both apps: compact, readable and responsive on phones and desktops. Data, figures,
permissions, settings, actions, offline work, sync and backups are unchanged. No cloud deploy is needed for it.

- **Dashboard:** a slim greeting with **New sale** beside it (on phones too); the pharmacy's full name instead of
  being cut off; today's figures two to a row on phones while the amounts still fit; stock alerts (low stock, soon
  expiring, expired, open drafts) as one easy-to-scan list on phones, the urgent ones first.
- **Phones:** the classic app's top bar no longer runs off the screen; on the till, *Charge* is always fully visible
  and the Sell button no longer covers the docked sale; inventory and expiry tables become one labelled card per
  medicine; long medicine names wrap instead of being cut.
- **Large text and narrow screens:** pages fit at 150 % zoom on a phone (classic) and with large system text
  (Flutter); headings with their search and buttons scroll away so lists keep the screen; export buttons wrap.
- **Desktop:** the same efficient layout; charts share the width evenly; tables keep figures on one line.
- **Accessibility:** a visible focus ring for keyboard users, larger touch targets, named switches.
- New checks: `tests/ui-fit.mjs` (phones, tablet, laptop, desktop, 150 % zoom, long names) and a Flutter widget
  test at phone size with 1.6× text.

## React (classic) app 1.8.0 · Flutter app 2.1.0 · cloud and Hub · November 2026

Everything in this release came from the review (`docs/REVIEW.md`) and the step-by-step plan (`docs/WORKPLAN.md`),
each step approved by the owner. The log in the workplan lists every commit and the tests run for it.

### Before you roll out

- **Deploy the cloud first** (the *Deploy cloud* workflow), then publish the apps. The apps work with the old cloud,
  but sign-in slowdown, field-by-field merging, day closing, insurance and the sale checks need the new one.
- **Hub (self-hosted) pharmacies need the new Windows installer.** The Hub now runs the cloud's own code on Node's
  SQLite (Node 22.13 or newer). On first start it moves `hub.json` into `hub.db` once and keeps the old file as a
  backup. Every device signs in to the Hub again once.
- Nothing needs to be done to existing data. Old documents keep their numbers; new ones use the till numbering below.

### Safety and correctness

- **The cloud checks every change against the person's role** (who may sell, refund, edit a past sale, change prices,
  receive stock, write off…). Screens that offered actions a role didn't have were fixed in both apps.
- **Sale checks:** the cloud re-checks every sale (totals, discounts without permission, prices below the medicine's,
  over a credit limit, over a role's discount limit, an insurance split that doesn't add up) and lists findings under
  *Sales to check* on the dashboard. Sales are never refused.
- **Passwords:** constant-time checks and stronger hashing, upgraded at the next sign-in; repeated wrong passwords slow
  down an account (it is never locked).
- **Document numbers per till and branch** for receipts, proformas, deliveries, purchase orders, transfers, stock
  counts and returns: no two devices can make the same number, even offline.
- **Credit limits** ask for a reason (recorded and flagged) instead of selling silently over the limit.
- **Close the day** per branch: a closed day's sales, expenses and stock can't be changed; anything recorded for it
  later is kept and shown to the owner; reopening needs an administrator and a reason.
- **Field-by-field merge:** two devices changing different details of the same medicine, client, supplier or batch
  no longer overwrite each other.
- **Faster large pharmacies:** stock totals are kept up to date instead of recounted (the till charges about 30%
  faster on a large pharmacy); the cloud no longer counts every record on every sync.

### New in both apps

- **Insurance:** insurers and schemes (co-pay %, fixed co-pay, cover limit). At the till the client pays the co-pay
  and the insurer owes the rest; the insurer's share is not the client's debt and not cash in the drawer. An
  *Insurers* page shows what each owes and records its payments.
- **GS1 pack barcodes:** scanning the 2D code on a box fills the medicine, batch and expiry at Add Stock; at the till
  it sells from that pack's batch and refuses an expired pack.
- **Discount limit per role** and **blind cash-up** (the drawer is counted before the expected cash is shown).
- **Add Stock:** an invoice no longer changes a medicine's retail price (cost + markup is offered with *Use*); the
  expiry is read whatever its format (06/2028, JUN 2028, 30/06/2028…); any line, a new medicine too, can be received
  by a pack size typed on the line and is sold by the tablet or capsule.
- **Keyboard, mouse and navigation:** shortcuts on every page (F2–F7, G then a letter, Ctrl+K with commands, ? for
  help, Alt+←/→ back and forward), changeable per device; lists move with the arrow keys, open with Enter or a
  double-click, have a right-click menu and tick boxes with Shift+click ranges and actions for all ticked rows;
  pinned and recent pages in the menu; where you are shown in the top bar.
- **Accessibility:** both apps checked automatically (axe in the browser, Flutter's own guidelines) in light and dark;
  everything found was fixed, including Add Stock being unreadable in the dark theme.

### New in the React (classic) app, from the Flutter app

- Scheduled report emails (Excel, daily / weekly / monthly) under Settings → Alerts.
- A Shelves page, and Inventory and Stock Count grouped by class, therapeutic area, form or shelf.
- Payroll & HR: staff, attendance and leave, salary advances, monthly payroll with Uganda PAYE and NSSF, paid as
  Salaries expenses.
- The till's panels sized by dragging (Classic and Standard layouts), remembered per device.

### Not in this release (waiting for the owner)

- URA EFRIS e-invoicing (needs URA sandbox credentials).
- Insurance pre-authorisation, claim batches and member checks; scheduled draft purchase orders, expiry markdowns and
  branch rebalancing; loyalty points, promotions and a customer display; split tender, translations and a single till
  layout; clinical interaction checks (needs a licensed interaction database).

### Tests

Full JS suite against the Cloudflare cloud, the same suites against the Hub, the Flutter suite (unit, widget and the
parity checks against the React rules), and lint. Six checks fail in this test environment only, as before every
release: five need outside services (Workers AI, the weather service) and one needs the Windows Electron binary;
they run in CI.
