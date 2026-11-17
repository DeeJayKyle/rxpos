# RxPOS release notes

## React (classic) app 1.11.0 · Flutter app (next build) · November 2026 (15 two-colour themes, the new menu, the account drop-down)

Nothing to do on the tills: they update by themselves.

- **15 two-colour themes in five sets** (both apps), from the owner's references and review. Every page of a theme
  keeps to its two colours: colour 1 is strong (the menu's pill, buttons, the open tab, headings), colour 2 is the soft
  tint of the page, cards and table headings. Warnings, table stripes, charts, payment chips, the till's actions and
  the logo are all shades of the same two colours, and always carry their words and icons ("Out of stock", "Expired",
  "Balance due"), so nothing relies on colour alone. Every theme is checked for readability (WCAG AA) on its pages,
  rows, headings, pills and menu.
  - **Blues:** Electric Blue, Sky Blue, Ocean Cyan
  - **Greens:** Forest Green, Emerald Mint, Mint Teal (the light theme new devices start on)
  - **Purples:** Royal Purple, Lavender, Midnight Indigo
  - **Warm & Lime:** Amber Gold, Charcoal Lime, Lime Charcoal
  - **Dark & Calm:** RxPOS Navy Teal (the dark theme, and Premium UI), Steel Blue, Sage

  A device or a pharmacy on an older theme moves to the closest new one by itself.
- **The menu, as Charcoal Lime:** a deep menu in the theme's own colour, its pages as light soft-glass buttons and the
  open page a solid bright pill.
- **Your account is top right**, beside the theme button: a drop-down with Change my password, quick PIN, two-step
  sign-in, Sync now and Log out. It used to be at the foot of the menu.
- **The logo follows the theme**, in the menu, on the sign-in page and on the browser tab.
- **Lighter table stripes** on every theme; the column headings keep their colour.
- **No sync button while all is well.** The sync pill shows only when the device is offline or something needs you
  (changes the cloud refused, sign in again). F5 and the account menu's Sync now still sync.
- **No pin on the Dashboard** (it is always at the top of the menu).

## React (classic) app 1.10.5 · Flutter app 2.1 (next build) · November 2026 (refund sheet, landing pages, F-keys, top 10 themes, new sign-in)

Nothing to do on the tills: they update by themselves.

- **A proper refund sheet** (both apps). Before a refund, one sheet shows each line and the batch its stock goes back
  to (a kit: each of its medicines), the money going back and how ("Give UGX 3,000 back from the cash drawer",
  "Send it back by Mobile Money: RxPOS does not send the money"), any unpaid balance cancelled or insurer share no
  longer billed, and a warning when the sale is in a closed day. A reason is required (Customer returned it, Wrong
  medicine or strength, Wrong price or quantity, Side effect or reaction, Sold twice by mistake, Other). It is kept
  on the sale, shown on its receipt in Sales History, and written in the audit log.
- **Each role lands on its own page.** After signing in, pharmacists, dispensers and cashiers (and any custom role
  that sells but doesn't see reports) open on the till; administrators and managers on the dashboard. A page
  opened from a link still opens that page.
- **The phone's bottom bar only offers pages the role may open.** A cashier used to see "Stock", which sent them
  back home. Now they get Home, Clients, Sell and Sales; the manager's bar is unchanged.
- **Function keys under the till** (computers). A thin bar shows what F2–F10 do there (Retail or Wholesale, Add
  stock, Sales, Inventory, Search, Charge, Proforma, all keys). Each key can be clicked and follows this device's own
  key map. × hides it on this device; the shortcuts sheet (?) shows it again.
- **Flutter till:** medicine tiles are a little taller, so a long price row no longer overflows.
- **The top 10 themes** (both apps). 36 themes are now 10, chosen for working speed, clear colour coding on every
  page, readability and smooth transitions, each with three colours at most (a neutral base, the menu colour and one
  brand colour). They are grouped in the theme menu: **Light** (RxPOS Daylight Clinical, Cobalt Blue, Royal Violet,
  Sunrise), **Dashboard looks** from the owner's references (Charcoal & Sky for the dashboard and Finance, Lime Studio
  for Calendar, Drug Quiz and the weekly summary, Aqua Navy for Reports and Sales History, Forest Green for Purchases,
  Expenses and Banks) and **Dark** (RxPOS OLED Black, Midnight Pro). A device or a pharmacy on a retired theme moves
  to the closest kept one by itself.
- **Security (audit P2-7):** a device keeps the cloud sign-in of the last person who signed in with their password.
  Someone who then unlocks it with a quick PIN, fingerprint or offline password keeps selling and syncing as before,
  but is asked for their own password before acting as themselves in the cloud (two-step sign-in, signing out other
  devices, calendar and daily-stock links, sending reports). The device then holds their own sign-in.
- **A new sign-in page** (both apps): one rounded frame, a pale brand panel in the theme's colour with soft shapes and
  a short headline, and a clean "Welcome back" form with a large Sign in button.

## React (classic) app 1.10.4 · Flutter app 2.1 (next build) · Cloud · November 2026 (audit, second pass)

Fixes from the second audit pass of 17 November (docs/AUDIT-2026-11-17-PASS2.md). Nothing to do on the tills.

- **Owner alerts:** a device error reported within 30 minutes of the last error email is now in the next email
  (before, it was never emailed); the first "RxPOS problem" email is tried again when it fails to send (before, the
  owner heard nothing for the whole outage).
- **Privacy of error reports:** the cloud removes emails, phone numbers and long numbers from error reports itself,
  whatever device sent them; the Flutter app no longer sends the screen's search or record id.
- **Restore:** the restore tool asks which cloud to write to (`RXPOS_API`) and never assumes the live one.

## React (classic) app 1.10.3 · Cloud · November 2026 (refunds on the day they happen)

Nothing to do on the tills. **Past figures in the cloud reports change** (read this before comparing with old emails).

- **Refunds count on the day they happen.** The evening summary email, the scheduled Excel reports and the daily
  stock sheet used to leave a refunded sale out of its own day. Now the sale stays on the day it was made and the
  refund takes its money, profit and medicines off the day it was refunded, the way Finance and Shifts already
  count it. A sale on Monday refunded on Wednesday: Monday's sales go **up** by that sale, Wednesday's go **down** by
  it, and a day with more refunds than sales can show a negative figure. Totals over a whole week or month are the
  same unless the sale and its refund fall in different periods.
- **What the reports show:** "Sales made", "Refunds made" and "Sales after refunds"; takings by payment and by
  branch after refunds; a new **Refunds** sheet (refund date, receipt, sale date, who refunded it); "Sales by medicine"
  net of refunds; a "refunded on" column in the Sales sheet.
- **Old refunds** recorded before the app kept the refund date stay on their sale's day.

## React (classic) app 1.10.2 · Flutter app 2.1 (next build) · Cloud · November 2026 (security and safety release)

Fixes from the 17 November 2026 audit. Tills update by themselves. **Hub users sign in once more** after the update
(the Hub now signs sign-ins with its own random secret).

- **Safer sales:** a serious allergy or interaction warning now needs "Sell anyway" and a reason, kept in the audit
  log; walk-in customers show "Allergies unknown"; the prescription check no longer confirms on a stray Enter.
- **Nothing lost or counted twice:** Receive stock, Charge (Flutter), refunds, sale edits and stock-count posts can't
  run twice or overwrite a newer copy; a failed save says so; a Mobile Money payment whose sale didn't save offers
  "Retry saving this sale"; a sync problem never stops the Flutter app syncing for good.
- **Stock and money:** stock can't be taken out with no sale behind it; a sale's takings can't be moved to another
  account by a seller; reopening a closed day needs an administrator.
- **Sign-in:** reset codes, sign-in locks and the owner lock hold even against many tries at once; signing someone
  out, disabling them or resetting their password also ends their live connection (calls, instant updates).
- **Privacy:** private chats reach only the two people in them; cashiers no longer receive bank and supplier balances;
  a deleted pharmacy's figures are removed everywhere.
- **Limits:** SMS counts every phone and message part; files being sent count towards a pharmacy's storage.
- **Reports:** times on the sales sheet in East Africa time; the daily stock sheet no longer fails on an undated record;
  out-of-stock medicines appear as low stock; one pharmacy's bad record no longer stops everyone's daily email.
- **Exports:** CSV files can no longer carry spreadsheet formulas.
- **Accessibility:** dialogs keep the keyboard inside them; the sale total is read out; larger cart inputs; warning
  colours readable in the Flutter app.

## Flutter app 2.1 (next build) · November 2026

The Flutter app now does everything the classic app does. Nothing changes in the classic app.

- **Kits in the Flutter app.** The Kits screen (Medicine inventory → Kits): build and edit kits, ready-made kits, kit
  sales by period, labels, switch off, delete. At the till: kit tiles in their own colour with a KIT badge, what they
  hold and how many can be made; the warning before adding and the tick before charging; swap a medicine for one sale;
  scanning a kit's label adds it. A kit sale is saved exactly as the classic till saves it, so either app can refund or
  correct it. Receipts list a kit's contents; the dashboard warns when kits run low; reorder levels count the medicines
  kits used.
- **Sign-ins:** Sign out everywhere else (account card), and an administrator can sign a staff member out on every
  device (Users).
- **Calendar link:** refills with initials only, and Replace link (the old one stops working), in the link's ⋮ menu.

## React (classic) app 1.10.1 · Flutter app 2.1 (next build) · November 2026

Every page in colour, the way Add Stock is. Nothing to do on the tills: they update by themselves.

- **Every list and table** (classic app): each row has its own colour, a stripe down its left edge and a light tint
  across it; each column heading has its own colour band; grid lines separate rows and columns. On phones, where a list
  turns into cards, the whole card takes the colour. Receipts, labels and printed pages stay plain. Every colour theme,
  dark ones included, stays readable (checked in all 36 themes).
- **The till:** each line of the sale has its own colour; kit lines keep their kit colour.
- **Flutter app:** Add Stock in colour (each line its own colour with a numbered badge, a colour band per column, grid
  lines, tinted supplier and invoice panels, highlighted total), and the same row colours on its lists: inventory,
  medicines, sales history, the till's sale lines, purchases, stock count, customers and suppliers, proformas,
  prescriptions, returns, shelves, finance, payroll and the audit log.

## React (classic) app 1.10.0 · Flutter app 2.1 (next build) · November 2026

A colourful Add Stock and **kits**: medicines sold together as one item. Nothing to do on the tills: they update by
themselves. Deploy the cloud first (its sale checks understand kits), then the apps.

- **Add Stock in colour.** Every line has its own colour (a stripe, a numbered badge and a light tint across the row)
  that stays with it when other lines are removed; every column heading has its own colour band that moves with the
  column; grid lines between rows and columns; tinted supplier and invoice panels and a highlighted total. Edit
  purchase and the phone cards look the same. Readable in all 36 themes, dark ones included.
- **Kits** (Medicine Inventory → Kits): build a kit from medicines in stock, e.g. an HIV Test Kit = test strip +
  lancets + alcohol swabs + water for injection, plus service lines such as a testing fee. A kit has no stock of its
  own: the till shows how many can be made, and each sale takes every medicine from its own batches (earliest expiry
  first). Its cost is what its medicines cost now; its price is their retail prices added up, unless you set a price.
  Earliest expiry, Rx and controlled flags come from its medicines.
- **Kits at the till** look different from other stock: their colour, icon, a KIT badge, what they hold, "Can make N"
  and their warning. A warning can be one the cashier must tick before charging (written to the audit log).
- **Swap at the till:** when a medicine in a kit runs short, swap it for a similar one for that sale only; the receipt
  and the audit log say so.
- **Ready-made kits:** HIV test, malaria RDT, pregnancy test, injection set, wound dressing and mama kit, matched to
  your own medicines by name.
- **Kit labels** with a barcode from the Kits page; scanning one at the till adds the kit.
- **Kits running low:** the dashboard and the menu say when a kit can be made 3 times or fewer, and which medicine
  holds it back.
- Receipts and invoices list a kit's contents. A refund puts each medicine back in the batches it came from. Kit
  sales and their profit are on the Kits page; reorder levels and consumption count the medicines kits use. Kits stay
  out of Inventory, Add Stock, stock counts, reorder and stock value.
- The till: the Enter of a barcode scanner no longer confirms a dialog the scan opens; "Only 3 in stock in stock"
  now reads "Only 3 in stock".
- **Flutter app:** kits are kept out of its lists, a kit sale is refunded correctly, and kit sales are corrected in the
  React app. Building and selling kits and the colourful Add Stock come to the Flutter app later (PARITY.md).

## React (classic) app 1.9.3 · Flutter app 2.1 (next build) · November 2026

Security release from the November 2026 audit (docs/AUDIT-2026-11-16.md). Nothing to do on the tills: they update by
themselves. What staff and owners will notice:

- **Each role receives only what its screens use.** A cashier's device no longer downloads expenses, bank transactions,
  loans, deliveries or the audit log. A shared till keeps what its manager needs offline, and devices that existed
  before keep the old view for 30 days.
- **Safer sales:** moving a sale to another day or cashier needs *Edit sales*; stock taken or returned must match its
  sale; a proforma must be the real, matching quotation; prices cut at the till count towards the role's discount
  limit. Anything unusual is shown to the owner under sale checks, never refused at the counter.
- **No silent losses:** a change older than the cloud's copy (a device clock that is behind) is listed on This
  device, the cloud's copy is put on the device, and the classic app warns when the clock is wrong.
- **Sign-ins:** a new or reset password signs the person out on their other devices; new **Sign out everywhere else**
  (account card) and **Sign out on every device** (Users & roles). The web version's sign-out ends that sign-in.
- **Two-step sign-in:** **recovery codes** for a lost phone (both apps), and only an administrator, or your RxPOS
  provider, can switch off an administrator's two-step sign-in.
- **Files in chat** can no longer be replaced by someone else, and are checked when they arrive.
- **Calendar:** the link is for staff who handle prescriptions or reminders, can be replaced by an administrator, and
  can show refills with initials only.
- **Hub:** optional HTTPS; plain http only on the pharmacy's own network. The apps won't send a password over plain
  http to the internet.
- Updated PDF reader (invoice scanning), page navigation library and the Windows app's Electron.

## React (classic) app 1.9.2 · Flutter app 2.1 (next build) · November 2026

Browser or app, a clearer sign-in, your account on This device, quick reports and status pills.

- **Web sign-in: Browser or app?** Both web versions explain when to stay in the browser (nothing to install, online
  only, nothing kept on the computer) and when to install the app (keeps selling offline, scanners and printers, PIN or
  fingerprint sign-in, updates itself), with **Download for Windows** and **Download for Android** buttons that always
  fetch the newest released apps. The visitor's own device comes first; iPhone and Mac are told there is no app yet.
- **Sign-in:** an icon inside the email and password boxes and a larger Sign in button.
- **This device: your account.** Your name, email and role at the top, with Change password, Quick PIN, Fingerprint /
  Windows Hello (where the device has it) and Two-step sign-in, and a red **Log out** row. Each still asks for your
  current password where it changes how you sign in.
- **Reports: quick report cards.** Today's sales, Expiring stock, Purchases this month and Expenses this month, one tap
  each (the dates and the report are set for you; the date boxes still change them).
- **Status pills:** purchase orders show Draft / Sent / Received as a pill with a mark and the word, not colour alone.
- **Phone till at large text (Flutter):** the payment options fold behind one row so the sale's lines keep their room;
  the total and Charge always stay in view.

## React (classic) app 1.9.1 · Flutter app 2.1 (next build) · November 2026

Safer ordering, complete inventory figures, clearer screens and quicker, secure sign-in.

- **Purchase orders (both apps):** a review before any order is saved, one group per supplier actually chosen
  (cheapest, last or picked by hand), with estimated totals, lines without a known price flagged and a note to
  confirm prices. Order quantities can be typed (whole numbers of 1 or more) and rounded up to whole packs.
  **Print and WhatsApp no longer mark an order Sent**: a separate **Mark as sent** asks first and is audited.
- **Inventory (Windows / Android):** every match is counted, totalled and exported (the list used to stop at 300);
  rows load 300 at a time with "Showing X of Y" and Show more. Expiring / Expired look at every batch, so a medicine
  with an expired batch and one expiring soon is in both. The batch list marks the batch that sells next (never an
  expired one) and says EXPIRED in words.
- **Reports and dashboard:** a scope line on every report (branch, dates, what it counts) that also goes on the PDF;
  the dashboard says the branch, period and what sales and gross profit count. Expenses have no branch: the
  expense card and the Expenses / Income reports now say so plainly (the figures themselves are unchanged).
- **Till:** a finished sale says whether it is only saved on this device or saved and synced (other devices see it
  once it syncs). Cart lines say Rx only, CD · register or expired stock (with the recorded reason) in words.
- **Add Stock (web):** the help, markup field and empty price box say what really happens: the unit cost is the line
  total ÷ quantity, and the retail price stays as it is unless you type one or tap "Use".
- **Sign-in:** optional **fingerprint / face unlock on Android and Windows Hello on Windows** through the system's own
  check (RxPOS never sees biometric data; a random unlock key lives in the system's secure storage). One person per
  device; set up only after a password sign-in and the password again. Setting or removing a PIN, turning unlock on
  or off and changing your password now ask for your current password, and are audited. PINs and unlock of disabled
  or removed staff are deleted at the next sign-in on the device. Details: docs/SIGN-IN-AND-UNLOCK.md.

## React (classic) app 1.9.0 · Flutter app 2.1 (next build) · November 2026

A clean, compact look across the whole app, from the owner's dashboard and settings references.

- **Dashboard:** period chips (Today, 1M, 6M, 12M, YTD) with each figure's ↑ / ↓ against the period before; one sales
  chart (Daily or Monthly) with a tooltip and Export (figures as CSV, or a picture); **Stock health**, a gauge with
  what drives it (expiring, expired, out of stock, low) and the biggest problem in one sentence; the top medicines of
  the period and the latest sales with Paid / Owing pills. Everything else is a widget you can switch back on:
  **Edit widgets** shows, hides and orders the cards on each device.
- **Settings and This device:** settings in labelled groups, each with an icon and a line on what it is for; a search
  that takes you to any setting; quick switches that save at once; rarely changed reordering options under
  Advanced; and a red **Danger zone** whose actions show a warning screen and then ask once more.
- **Sidebar:** no Recent list; every group folds (Pinned too) and shows how many pages it holds; a + beside Sales,
  People, Medicine Inventory and Finance for the most common "new …".
- **Fewer tabs:** Reports' nine tabs are three groups (Sales, Money, Stock); Inventory and Expiry filter with chips
  beside the search; held sales, drafts and supplier prices open from a button with "‹ back".
- **Compact everywhere:** one type and spacing scale, smaller controls and tables, quieter top bar, small "Tip" chips
  instead of banners, smaller empty states; one action per table row with the rest on hover; on phones every list
  is one card per row and toolbars fit one line.
- **Motion:** cards rise in one after another, numbers count up, chart lines draw in, the gauge fills, tooltips pop,
  menu groups slide open. Off when the device asks for reduced motion.
- **Five new themes** from the references: Royal Violet, Cobalt Blue, Soft Grey, Sage Garden and Ember Forge.

## React (classic) app 1.8.8 · Flutter app 2.1 (next build) · November 2026

- **Correcting a delivery works like Add stock:** in Purchase history, Edit purchase no longer lets you type the
  unit cost. Type the line total from the invoice and the unit cost is worked out as line total ÷ quantity. Change
  the quantity afterwards and the typed total stays, with the unit cost following it. A line with no typed total
  stays at cost × quantity.

## React (classic) app 1.8.7 · November 2026

- **No pause for the daily backup copy:** the Windows and Android apps keep a copy of the pharmacy each day to undo
  mistakes. It is now made in the background, straight from what is saved on the device, so the till never stops
  for it, however big the pharmacy. The newest seven copies are kept, as before. The web version keeps nothing on
  the computer, so nothing changes there.

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
