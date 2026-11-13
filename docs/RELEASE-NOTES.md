# RxPOS release notes

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
