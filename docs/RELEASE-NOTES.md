# RxPOS release notes

## Next release (not released yet): safer sign-ins, the pharmacy encrypted on the device

- **Sign-ins renew themselves every 15 minutes** instead of lasting 30 days; a sign-out, a new password or "Sign out
  everywhere" ends them in the cloud at once (docs/SIGN-IN-AND-UNLOCK.md).
- **The till locks after 5 idle minutes** and opens with the quick PIN; "Remember me" is 7 days and reopens locked.
- **Patients' data is encrypted on Windows and Android devices** (each device its own key; Windows keeps it with
  DPAPI). Existing data is encrypted in place at the first start, nothing lost, offline sync unchanged.
- **17 themes in four groups**: the theme menu lists themes by how alike they look: **Light** (Light, Pharmacy Blue,
  Pharmacy Green, Royal Purple, Sandstone & Terracotta), **Dark** (Dark, Midnight Blue, Pharmacy Night, Twilight
  Violet, Graphite Amber), **High contrast** (High contrast, Monochrome & Scarlet, Graphite & Lime) and **Colourful**
  (Brand colour, Cool & Crisp, Royal Iris & Butter, Vibrant Neon). Look-alikes stay retired and open as the closest
  theme in their group. The owner still chooses which themes each pharmacy may use.

## RxPOS 1.22.0 · November 2026 (selling units; a tidier app)

- **Selling units**: each medicine can be sold by the tablet, pair, half strip, strip or box (Medicine List → Selling
  units), each with its own retail and wholesale price and the unit the till starts on. A medicine marked "not sold
  loose" never sells single tablets at the till.
- **Change unit of issue** (needs Adjust stock and Medicines): e.g. 1 box = 100 tablets multiplies every batch in
  every branch, divides prices and costs, keeps the old unit as a pack at its old price and records the change.
  Reports, refunds and the daily stock report count earlier sales in the new unit. Audited.
- **Six menu headings**: Sell, Stock, People, Money, Reports and Settings. Pages that overlapped share one menu entry
  and open with tabs at the top: **Medicines** (Inventory, Medicine List, Quick Edit, Stock Card, Formulations),
  **Messages** (Chat, Messages & SMS, Reminders), **Expenses** (with Expense Categories), **Banks** (with Deposits &
  Withdrawals), **Reports** (with Sales History and Weekly Summary), and Prescriptions, Drug Information, Notes &
  Calendar and Branches. Every page keeps its address, F-keys and Ctrl+K entry. Each role sees only what it can use;
  This device is in the account menu for staff who can't change settings.
- **Extras off by default**: Control Centre, the App Library and the home screen are switched on in This device →
  Extras; the idle shop window in Settings → Alerts & storage (minutes; it never covers the till).
- **A quieter till**: search, the sale, the total and pay. Scan Rx moved to Sell → Prescriptions → Scan Prescription
  (open to anyone who sells); weather alerts wait until you leave the till.
- **Four themes**: Light, Dark, High contrast and Brand colour (the pharmacy's colour, set in Settings → Receipts &
  stock). A retired theme opens as Light or Dark. Colour level, gradient and surface style moved to This device → Look.
- **One style** for buttons, spacing and tables (styles/system.css).
- **Updates arrive whole**: a file missing from the website is now a plain "not found" that Cloudflare never keeps,
  and each deploy clears Cloudflare's old copies, so a Windows till is never handed a wrong update file (1.21.0's
  deploy check caught one Cloudflare location keeping 9 of its files wrong).

## RxPOS 1.21.0 · November 2026 (one app: React; sharper reading of invoices and prescriptions)

- **One app.** RxPOS is the React app from now on. The Flutter app is retired (kept read-only in `archive/`): the
  cloud sends every pharmacy to the React app, a browser still on the Flutter web app moves to it at sign-in, and the
  owner console's "New RxPOS app on the web" switch is gone. Installed Flutter apps keep working but get no updates:
  install the RxPOS app from the sign-in page instead.
- **Downloads** on the web sign-in page are the RxPOS Windows installer (now always `RxPOS-Setup.exe`) and Android
  app from the newest release.
- **High-accuracy reading** of invoices and prescriptions, printed, scanned or handwritten: when the cloud has an
  Anthropic key, Claude reads each page first and the open models check it or take over (owner console → Features →
  "High-accuracy reading (Claude)" switches it off per pharmacy). Nothing is saved until a person checks it.
- **Digital PDFs**: each page's own text goes with its picture, so names, numbers and batch codes are copied exactly.

## React (classic) app 1.20.0 · Flutter app (next build) · November 2026 (fewer mistakes in Add Stock)

- **The review before receiving** (both apps): Receive stock first sums the delivery up (supplier, invoice, date,
  lines, units, total, new medicines, price changes) and lists what is worth a second look: a date more than 3 days
  ago (often read off a scanned invoice), the same supplier's invoice number already received, an invoice total that
  doesn't match the lines, a unit cost twice or half the last one, a quantity 5 times the most received before, stock
  expiring within 6 months, a retail price below cost. Nothing is refused by it: "Receive anyway" or "Go back and fix".
- **Invoice total** box on the delivery (filled in from a scan), compared with the lines as you type; a date that is
  not today says so ("Read from the invoice: check it" after a scan), with **Use today**.
- **The website** (rxposug.com and each pharmacy's address) opens the classic (React) app again, the owner's choice;
  the Flutter web app stays at rxposug.com/app/ so work left unsent in it can still go up.

## React (classic) app 1.19.1 · November 2026

- The owner's law is readable at `/ai-policy.txt` (and `/.well-known/ai-policy.txt`) on rxposug.com and
  api.rxposug.com: a file now, as both sites serve files before the Worker. The approval guard (428) was unchanged.

## React (classic) app 1.19.0 · Flutter app (next build) · November 2026 (the owner's rules)

**The owner's law:** no AI agent or script changes a pharmacy's data in the cloud without the owner's approval
(CLAUDE.md, AGENTS.md). The cloud refuses direct record writes, restores and database moves without
`X-Owner-Approved: yes` (HTTP 428) and publishes the law at `/ai-policy.txt`. In the apps, AI only suggests.

- **Scanning invoices**: photos are evened out and sharpened before reading; pages read side by side; handwriting
  conventions ("/=", ditto marks) in the instructions. Lines are matched allowing misread letters, abbreviations
  (PCM, Amox), generic names, barcodes and names learned from earlier deliveries; a different strength is never chosen
  by itself, only offered ("Is it …?"). A month-only expiry is the 30th (28th in February). A batch or expiry not read
  well is taken from the medicine's last delivery, marked to check.
- **Add Stock**: start with the scan; the invoice details fold to one line; lines to check come first and are each
  ticked "Checked" before Receive; on a phone each line is a card; the supplier's last markup and each medicine's pack
  are offered again; the next box to fill is outlined; the search drops down from its own line (fixed in glass themes).
- **Medicines**: Tidy names (house style and AI suggestions, approved one by one); the same item under different names
  merged on approval (stock moved by "Merge" stock moves, the old name kept as an alias, nothing rewritten).
- **Shifts**: "Start your shift?" on signing in, "End your shift?" on signing out (count the cash, then sign out);
  past sales outside any shift become rebuilt shifts (no float, no cash count) once the owner approves the list.
- **The till** opens on In stock, A–Z; no Recent filter; a typed search still finds everything.
- **Dashboard**: cards moved by dragging their grip, resized by their right edge, and a card menu; no trend line or
  change line on the figure cards; Edit widgets in This device (Flutter).
- **Everywhere**: a right-click or long press opens the page's options; menu counts and the bell highlight only what
  is new; the theme panel's sections fold; no "Online" card; the pharmacy's name bigger; the phone till's payment
  details start folded; the "All pages" sheet removed (Flutter).

## React (classic) app 1.18.0 · Flutter app (next build) · November 2026 (behaviour)

The owner's choices (20 Nov 2026), the iPhone and Linux way, each switched on per device:
- **Control Centre** (the sliders button in the top bar): dark mode, the gradient, Sheets & gestures, Dynamic Island,
  Home screen, Tiling, the compact menu, Sync now, the App Library, Lock the till, and auto-lock (Never, 2, 5 or 15
  idle minutes).
- **Till lock screen**: the time, the date and what is waiting (messages, expiring and low stock) over a screen that
  hides the page. It opens with the person's quick PIN or password: checked on the device, else by the cloud's own
  sign-in (with its limit on wrong tries), which is closed again at once. Ctrl+Shift+L locks; a reload or restart keeps
  it locked; page keys and the scanner do nothing behind it; someone else can sign out instead.
- **Home screen**: the dashboard's widgets in three sizes, plus a clock and small figures (today's sales, low stock,
  expiring), and a dock of the main pages. Press and hold (or Edit home screen) to remove, resize, move and add
  widgets; kept on the device.
- **App Library**: every page this person may open as app icons in folders by menu group, Suggestions first, and a
  search that lists pages A to Z.
- **Dynamic Island**: messages in a black pill at the top centre that grows to show them.
- **Sheets & gestures**: pop-ups rise from the bottom with a grab handle; drag down to close.
- **Tiling** (wide screens): a second page (lists and look-ups, never the till) tiled beside the one in use.
- **Flutter apps**: Control Centre, the till lock screen (also after a restart), the App Library, Dynamic Island
  messages, sheets you drag to close, and the 1.17.0 gradient buttons and six presets for the menu and page bands
  (white words on them, AA). The home screen and tiling are in the classic (React) app for now.

## React (classic) app 1.17.0 · Flutter app (next build) · November 2026 (looks)

The owner's choices (20 Nov 2026):
- **Gradients** (theme menu → Gradient, on each device):
  - A page background of the theme's own colours: Off, Soft or Bold. Cards stay solid, so words read.
  - Gradient accents on the main buttons, the open menu item, card headings and toggles.
  - Six presets for the menu and the banner: Sunrise, Ocean, Forest, Berry, Dusk and Neon. Their words are made
    readable on both ends of each gradient.
- **A dark twin for every theme**: Dark and System keep the pharmacy's colours (Pharmacy Green stays green at night)
  instead of switching to Navy Teal. The twins are not in the list; Light and Dark move between them.
- **Styles** (theme menu → Style), each in the theme's colours, light or dark, with matching icon weights:
  - **Linux**: GNOME (Adwaita: rounded cards, centred title, pill buttons), KDE Plasma (Breeze: crisp, compact, blue
    focus), elementary OS (airy, gentle shadows) and Ubuntu (a dock of coloured icons, rounded window cards).
  - **Apple**: iOS (big titles, frosted bars, grouped lists, segmented controls, springy) and Liquid Glass (iOS 26:
    clear glass and capsule bars).
- **Themes**: Terminal (green on black, fixed-width type, a blinking caret) and Ubuntu Yaru (orange on aubergine).
- **Fewer, clearer themes**: look-alikes merged, 31 themes in seven sets: Blues, Greens & Teals, Purples, Warm,
  Neutral & Lime, Dark (every dark theme) and Multi-colour. A device or an owner's list using a merged theme opens the
  one it joined:
  - Cobalt & Warm Amber → Pharmacy Blue; Porcelain & Signal Blue → Electric Blue; Deep Ocean & Cyan → Vibrant Neon.
  - Lavender and Midnight Indigo → Royal Purple; Obsidian, Purple & Mint → Twilight Slate & Soft Violet.
  - Sage & Forest Emerald → Emerald Mint; Mint & Warm Coral → Mint Teal; Forest Green → Pharmacy Green.
  - Amber Gold → Pharmacy Amber; Charcoal & Gold → Graphite Amber; Dark Forest → Pharmacy Night.
- **Flutter apps**: the dark twins, the six styles and the gradient background. The gradient accents and presets
  follow with 1.18.0.

## React (classic) app 1.16.0 · Flutter app (next build) · November 2026 (the clean-up)

The owner's clean-up list (19 Nov 2026): fewer things competing on each page.
- **Menu and top bar**:
  - One menu group open at a time, and pages used now and then (Kits, Formulations, Shelves, Scan Prescription, Drug
    Quiz) sit under **More**.
  - No page counts on the group titles (alert counts stay), a short "Online · RxPOS 1.16.0" chip, and no Premium UI
    switch (Navy Teal is in the theme menu).
  - Pin this page and Keyboard & mouse are in the account menu.
  - Where a page has its own search, the top bar's search shrinks to its icon.
- **Notices**: "Needs attention", the weekly summary and the reminders show on the dashboard only, and never on a
  phone; the bell keeps them. Messages and calls still show everywhere.
- **Tips**: a small "?" on the page opens its tip; nothing opens on its own (the till's tour still runs once).
- **Dashboard**:
  - One period picker for the whole page, which the daily chart follows.
  - The bento row keeps the week at a glance and the next step, with no copies of the chart or the latest sales.
  - A shorter banner with the date in it.
  - The setup checklist folds to one line once half is done.
  - The figure cards' labels fit on one line.
- **Lists**:
  - One date button everywhere: Today, Yesterday, 7 days, This month, Last month or your own dates.
  - CSV and PDF are under **Export**, and Sales History's filters are behind a **Filters** button.
  - A click on a row opens it. At rest only the ⋯ shows; the actions appear as icons when you point at the row.
  - Columns empty on every row are left out (Medicine List: Strength, Category, Wholesale).
  - Inventory tags only what needs a look, and the Walk-in Customer is not in Customers.
  - Money columns carry the currency in their heading.
- **Till**: the layout, the customer display, Training and the keys are in one ⚙ menu.
- **Reports**: the groups and their reports sit on one row, with no shortcut cards.
- **This device**: Log out is a normal button, and the app version and the AI doctor are at the end.
- **Forms**: help sits under each field, the buttons stay in view, and dialogs use two columns on a PC.
- **Everywhere**:
  - One spacing scale, three heading sizes and three kinds of button.
  - Light themes sit on a near-white page, and tables have quieter tints.
  - Numbers roll up once per session, and pages no longer rise in.
  - The theme menu shows six recommended themes, with every theme under "All themes".
  - Icon-only buttons are labelled.

## React (classic) app 1.15.0 · Flutter app (next build) · November 2026 (themes)

- **41 themes in six sets** (both apps). Every set has new palettes: Blues (Porcelain & Signal Blue, Midnight Navy &
  Sky, Cobalt & Warm Amber, Deep Ocean & Cyan), Greens (Mist Gray, Teal & Lilac, Sage & Forest Emerald, Graphite & Lime
  Spark, Mint & Warm Coral), Purples (Obsidian, Purple & Mint, Alabaster, Indigo & Coral, Royal Iris & Butter Yellow,
  Twilight Slate & Soft Violet), and Warm & Neutral, renamed from Warm & Lime (Sandstone & Terracotta, Pure Monochrome &
  Scarlet, Charcoal & Gold). The dark ones stay in their own set. A palette's second colour is the second chart line.
- **The glossy Pharmacy themes**: Pharmacy Blue, Green, Purple, Amber and Night. They have a gradient menu with an
  online chip, a welcome banner, and the four figure cards each in its own colour.
- **A Multi-colour set**: Cool & Crisp, Vibrant Neon and Neon Indigo (a neon indigo dashboard). Charts and tables use
  five colours.
- Every colour is checked for readability (WCAG AA) in both apps. Warnings keep their meaning: OK is green, low stock
  amber, expired red.

## Flutter app (next build) · November 2026 (speed)

- **A faster till after each sale**: a sale changes stock, not medicines, so the app keeps its medicine list (the
  pharmacy's medicines with the 9,710-medicine catalogue, sorted) and its lookups, and only the stock figures update.
  The list is built again only when a medicine, batch, client or supplier changes.

## React (classic) app 1.14.1 · Flutter app (next build) · November 2026

- **Whole amounts on the dashboard** (the owner's choice): the figure cards show UGX 152,000 rather than UGX 152K.
  Short amounts are a setting: This device → Amounts → Short (UGX 152K). Both apps; receipts, reports and lists always
  show the whole amount.

## React (classic) app 1.14.0 · Flutter app (next build) · November 2026 (look and clarity review)

Nothing to do on the tills: they update by themselves. Every change is in both apps unless it says otherwise.

- **Dates** (classic app): every date is shown and typed in the format chosen in This device → Date format (DD/MM/YYYY
  by default). A computer set to US English no longer shows 2 November as 11/2/2026, the date boxes no longer show
  mm/dd/yyyy, and Expenses, Deposits, Debtors and Prescriptions show their dates instead of a raw time stamp.
- **Nothing cut off**: the till's title, medicine names (three lines on a tile) and "No items yet" on phones; the menu's
  headings and page names (shortcut keys show when you point at an item); the line under each figure card (two lines);
  the Audit Log's filter chips.
- **Readable colours**: on the light-coloured themes (Sky Blue, Ocean Cyan, Emerald Mint, Amber Gold, Lime on
  Charcoal) links, totals and names on the Flutter app's screens use the theme's readable shade, not the pale button
  colour.
- **Status colours**: OK is green, warnings amber, and danger (expired, out of stock, errors) red in every theme, each
  readable on its own pill. The rest of each theme keeps its two colours.
- **Themes**: four dark themes (RxPOS Navy Teal plus Midnight Blue, Dark Forest and Graphite Amber) in a Dark set;
  Steel Blue moved to Blues and Sage to Greens; "Charcoal Lime" and "Lime Charcoal" are now "Lime on Charcoal" and
  "Charcoal on Lime". Both apps' themes come from one list (tools/flutter-palettes.mjs).
- **Nothing in the way**: the raised Sell button no longer covers the end of a page on phones; one place to choose the
  client on the Flutter till (with New client on it); no keyboard hints such as (F8) on phones.
- **Shorter menu**: the 17 medicine pages are in two groups, Stock and Medicines.
- **Empty pages**: a clear picture and words, and the next step as a button (Open the till, Add client, Receive stock).

## React (classic) app 1.13.0 · Flutter app (next build) · November 2026 (UI batch 3: 61 improvements, both apps)

Nothing to do on the tills: they update by themselves. Every change is in both apps.

- **The till**
  - Undo instead of "Are you sure?" when removing a line, clearing the sale or a held sale (money and stock that are
    already saved still ask first).
  - Phones: the total and Charge always in view; the sale opens as a pull-up sheet.
  - Bigger − / + on each line; Enter in a quantity goes back to the search; a short pulse and a light tap on add.
  - Medicine photos on the tiles (camera or file in the medicine form), the first letter when there is none.
  - A customer display for a second screen; training mode that saves nothing; a short tour on the first visit.
  - Refunds over a set amount need a manager's PIN or password; the approver is kept with the refund.
- **The dashboard**
  - Daily bars with their amounts and an average line; tighter figure cards with short amounts (UGX 1.2M);
    the best day and busiest hour; a busy-hours chart; a setup checklist for a new pharmacy; "What's new" after an update.
- **Tables and lists**
  - Sticky headings and totals, columns to choose, a bar for ticked rows, editing price and reorder level in the table
    (audited), arrow keys, "load more", details beside the list on wide screens, stock bars, swipe actions and pull to
    refresh on phones, and empty lists that say what goes there.
- **Forms**
  - Checks as you leave a field, "Draft saved" times, (?) help on tricky fields, instant saves with a cloud tick, amounts
    with commas, phone numbers that format, the first field ready, phone-sized pop-ups, clear "this will delete…" dialogs.
- **Look**
  - One text scale, text-size presets, patterned chart lines, 44 px touch targets, one date control with presets,
    the pharmacy's own logo everywhere (Settings → Pharmacy), a branded sign-in with a PIN pad and recent staff,
    an opening screen and a friendly error page.
- **Pages**
  - Expiry calendar, shelf map, Ctrl+K suggestions, a clear offline banner, "Edited by" on records, the audit log in
    sentences, chat typing and read ticks, the phone's bottom bar chosen on the device, a summary line on each report.
- **Buying stock**
  - The supplier's invoice beside the Add Stock form; checking an order by scanning each pack (missing and extra said
    before receiving); each supplier's last price on an order line; stock in the other branches.

## React (classic) app 1.12.0 · Flutter app (next build) · November 2026 (a cleaner, calmer look; safer till)

Nothing to do on the tills: they update by themselves. Every change is in both apps.

- **Cleaner**
  - The dashboard greeting no longer repeats the search box and the bell: they are in the top bar.
  - Ordinary sales carry no "Paid" or "completed" pill (Sales History, Latest sales); only Owing and Refunded stand out.
  - A page tip shows once: the next visit it is gone, even without "Got it".
  - Equal medicine tiles at the till: names on up to two lines, the stock pill beside the expiry pill.
- **Polish**
  - Three corner sizes everywhere (8 chips and pills, 12 buttons and fields, 18 cards) and one spacing scale.
  - Dark themes: cards a clearer step above the page, under a hairline.
  - **Compact tables** on This device: 36 px rows, more lines on the screen.
  - Payment methods on one line, the F-key bar fits, menu labels on one line, full-strength sales bars, one strong
    button per area at the till (Charge), rises and falls as ▲ + / ▼ −.
- **Safety**
  - One real red, only for what blocks a sale: "Expired · blocked" and "Out of stock". Everything else keeps the
    theme's two colours.
  - A bigger total at the till; the total and the change grow while cash is typed, and short of the total it says
    what is still due.
  - A clear "Sale complete · Receipt R…" banner with Print and New sale at the top.
  - A clear keyboard focus ring in the theme's colour.
- **More**
  - Small 7-day trend lines in the dashboard's figure cards.
  - The theme menu previews a theme while the pointer is on it.
  - Pages show their shape while they load instead of a spinner.

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
- **Only these 15 themes.** The accent presets (both apps) and the Flutter design systems are gone, so nothing can put
  other colours on a page; a device that used one keeps its theme, or moves to Mint Teal.
- **The menu, as Charcoal Lime:** a deep menu in the theme's own colour, its pages as light soft-glass buttons and the
  open page a solid bright pill.
- **Your account is top right**, beside the theme button: a drop-down with Change my password, quick PIN, two-step
  sign-in, Sync now and Log out. It used to be at the foot of the menu.
- **The logo follows the theme**, in the menu, on the sign-in page and on the browser tab.
- **Lighter table stripes** on every theme; the column headings keep their colour.
- **No sync button while all is well.** The sync pill shows only when the device is offline or something needs you
  (changes the cloud refused, sign in again). F5 and the account menu's Sync now still sync.
- **No pin on the Dashboard** (it is always at the top of the menu).
## React (classic) app 1.10.6 · Flutter app 2.1 (next build) · November 2026 (tablets, scanners, Device errors)

- **Tablets (Flutter):** on a tablet held upright (600–900 dp wide) the app now shows a slim menu down the side, in place
  of the phone's bottom bar; phones and computers look as before.
- **Barcode scanners on the Flutter till (computers):** a scan is caught even when the search box doesn't have the
  cursor (after a click on a button, say), and goes to the sale as if typed in the search box. Typing in other boxes is
  never taken over.
- **Device errors (owner console):** "devices" now counts the different devices that reported an error, not the number
  of reports (audit P2-10).

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
