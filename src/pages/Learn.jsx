// The website's other public pages (27 Nov 2026, from the SmarterPOS review), shown inside the front page's frame
// (src/pages/Welcome.jsx) at #/learn/…: every feature grouped by job, a help guide for counter staff, pharmacy
// articles, and moving to RxPOS from books, Excel or another system. RxPOS's own words, checked against the README.
// Nothing here reads or sends pharmacy data.

export const LEARN_PAGES = [['features', 'All features'], ['guide', 'Help guide'], ['articles', 'Articles'], ['moving', 'Moving to RxPOS']];

const FEATURE_GROUPS = [
  ['At the counter', ['Retail (F2) and wholesale (F3) tills with barcode and phone-camera scanning, and full keyboard control', 'MTN MoMo and Airtel Money requests the customer approves on their phone; cash, card, bank, insurance with co-pay, credit and split payments', 'Sales on hold (Alt+H), and a printed slip with a code that any counter of the branch can open and charge', 'Sell by the tablet, strip or box, with stock kept in single units', 'Directions labels, clinical safety checks, allergies on the customer, in-stock alternatives with the same active ingredient', '58 or 80 mm receipts with a barcode, A4 invoices, proformas (F10), refunds back into the same batches', '"Customer asked: note it" when a medicine is out of stock or not stocked']],
  ['Stock and expiry', ['Every delivery is a batch with its own expiry; sales take the earliest expiry first', 'Expired stock is blocked unless the pharmacist gives a reason', 'Stock counts: full, by shelf, by formulation, expiring, highest value, random spot checks, blind counts, several people at once', 'Losses need a reason, and above your limit a manager\'s approval; shrinkage on the dashboard', 'Batch recall lookup, a stock card per batch, write-offs and returns to the supplier', 'A batch sold below zero by two devices offline is flagged for a count']],
  ['Buying', ['Reorder suggestions from real sales and from customers turned away', 'Supplier price comparison: order from the cheapest or the last supplier', 'Requests from branch staff that a manager approves before they become orders', 'Purchase orders printed or sent by WhatsApp, received straight into Add Stock', 'Read a supplier invoice from a photo; you check and approve each line', 'A 9,700-item Ugandan medicine catalog, and Excel or CSV import']],
  ['Compliance', ['Controlled drugs register filled at the counter: patient, prescriber, prescription, running balances', 'Prescriptions with refill intervals and reminders by WhatsApp or SMS', 'Fridge and room temperature log with safe ranges', 'An audit log of who did what, and a close of day that locks the books']],
  ['Money and people', ['Shifts with cash-up (blind if you like), expected against counted cash', 'Expenses, banks, deposits and transfers, loans, debtors and creditors, a cash book', 'Payroll with PAYE and NSSF, attendance and salary advances', 'Sales and commission per staff member', 'Roles and permissions checked by the cloud, two-step sign-in, a quick PIN or fingerprint on the apps']],
  ['Owners and branches', ['Unlimited branches with transfers that are received and checked', 'A dashboard per branch and an owner\'s view of all of them', 'A summary email every evening at 9, and the list of what to order every morning at 7', 'Reports for any dates, exported to Excel or CSV; your data downloadable at any time']],
  ['Devices', ['Windows and Android apps that keep the whole pharmacy on the device and work offline', 'A web version for any browser that keeps nothing on the computer', 'Changes go up within seconds; the sync status is always in sight', 'Automatic updates that go back by themselves if a new version fails to start']],
];

const GUIDE = [
  ['Signing in', ['Open the RxPOS app, or your pharmacy\'s own address on the web (rxposug.com/your-pharmacy).', 'Type your email or username and password. On the apps, tap your name and use your quick PIN next time.', 'The first sign-in on a device needs the internet: it downloads the pharmacy. After that the apps work offline.']],
  ['Making a sale', ['Press F2 for the retail till (F3 for wholesale). Scan a barcode or type part of a name and press Enter.', 'Pick the client with Alt+C if the sale is for someone you know; their allergies and insurance come with them.', 'Choose how they pay (Alt+1 to 9), type what was handed over for cash, and press F9 to charge. The receipt prints if Settings says so.', 'For MTN MoMo or Airtel Money, confirm the phone number: the customer approves on their phone and the till waits.']],
  ['Holding a sale, and sales slips', ['Serving someone else? Alt+H puts the sale on hold; tap its tab above the sale to carry on.', 'Choose "Print a slip" to give the customer a slip with a code like S-7K3Q9P. At any counter of the branch, type or scan that code in the search box: the sale opens there to charge.']],
  ['Out of stock?', ['If a medicine has run out, the till offers alternatives with the same active ingredient.', 'If the customer leaves without it, tap "Customer asked: note it". For something you don\'t stock at all, search for it and tap "Customer asked for it? Note it". Reorder counts these.']],
  ['Receiving a delivery', ['Press F4 (Add Stock). Pick the supplier, then scan or search each medicine.', 'Type the batch number, expiry date and quantity; the cost or the line total (the other is worked out).', 'A medicine you don\'t have yet can be added on the spot. Check the review, then save.']],
  ['Counting stock', ['Open Stock Count, choose what to count (a shelf, expiring stock, a random check…) and count, scanning if you like.', 'With blind counts on, you don\'t see what the system expects until you finish.', 'A manager reviews the shortages and extras, with their value, and posts the count.']],
  ['Ending your shift', ['Open Shift, count the cash in the drawer, and close. RxPOS shows expected against counted cash, by payment method.']],
  ['When the internet drops', ['The apps keep working. The top bar says Offline and how many changes are waiting; they go up by themselves when the connection is back.', 'The web version needs the internet: use the app at the counter.']],
  ['Getting help', ['Press ? on any page for its shortcuts. Your administrator can reset your password; you can also use "Forgot password?" on the sign-in page.', 'Errors on any device reach the RxPOS team privately, without personal data. Or use the Talk to us form on the front page.']],
];

export const ARTICLES = [
  ['nda-inspection-checklist', 'Getting ready for an NDA inspection: a pharmacy checklist', 'What an inspector usually asks to see, and a routine that keeps it ready every day rather than the night before.', [
    ['Know what your licence allows', 'A pharmacy run by a registered pharmacist and a drug shop are licensed for different ranges of medicines. Stock only what your licence covers: no record will fix a product that should not be on the shelf.'],
    ['Purchases with batch and expiry', 'For every delivery: the supplier, the invoice, each medicine with its batch number, expiry date and quantity. Record it when the delivery arrives, before the stock reaches the shelf. In RxPOS this is Add Stock, and every batch keeps its expiry from then on.'],
    ['Sales and dispensing', 'What left the pharmacy, when, and for prescription medicines against which prescription. Keep prescriptions linked to the patient so refills can be checked.'],
    ['The controlled drugs register', 'This is where gaps appear, because it is often filled "later". The fix is to write it at the moment of the sale: patient, prescriber, prescription number and the running balance. RxPOS asks for these at the counter when a controlled medicine is sold.'],
    ['Expired and returned stock', 'An expired pack on the shelf is a problem by itself. Once a month, write off what has expired or return it to the supplier, and keep the record. Selling the earliest expiry first keeps the pile small.'],
    ['A routine that holds', 'Every delivery: record batch and expiry. Every day: close the shift and check the till matches the cash. Every week: look at what expires in the next 90 days. Every month: count controlled medicines and your fastest sellers against the books.'],
    ['Where software stops', 'A system keeps the records together and makes the gaps visible. Meeting the rules remains the licence holder\'s job.'],
  ]],
  ['first-expiry-first-out', 'First expiry, first out: stop losing money on expired stock', 'Why expiry losses stay hidden, and four habits that bring them down.', [
    ['The loss nobody counts', 'Expired stock rarely shows up as a number. Packs quietly leave the count, and nobody can say what last quarter\'s expiry cost. Writing it off as a valued adjustment, with a reason, turns it into a figure you can bring down.'],
    ['New stock in front of old', 'Deliveries get unpacked where there is space, usually the front of the shelf. Older batches slide to the back and expire there. Selling by expiry date, not by what is nearest, is the cure, and it works best when the till picks the batch rather than the person.'],
    ['Know how old, not only how many', 'A count tells you there are 40 packs. Batches tell you that 12 of them expire in three weeks. Recording the batch at delivery is what makes that answer possible.'],
    ['Order from what sold', 'Reordering by how the shelf looks, or by what a supplier suggests, overstocks slow medicines. Order from the last 30 to 90 days of sales, and count the customers you had to turn away too.'],
    ['In RxPOS', 'Batches and expiry are recorded at Add Stock; the till sells the earliest expiry first and blocks expired stock; the dashboard lists what to sell first; the monthly expiry check reminds you to write off or return.'],
  ]],
  ['when-the-internet-drops', 'When the internet drops: what offline really has to mean at a pharmacy counter', 'Questions to ask any pharmacy system before you trust it with a busy Saturday.', [
    ['A normal day, not an edge case', 'Power cuts take the router with them, data runs out mid-shift, and a slow connection stops a counter as surely as no connection. A system that needs the cloud for every sale makes a bet against all three.'],
    ['What to ask', 'Can it sell and print a receipt with no internet at all? Does it know the prices and stock without asking a server? When the connection returns, are the sales sent without anyone pressing a button, and never twice? What happens when two counters sell the last pack while one is offline?'],
    ['Why the last question matters', 'If both sales go through and nobody is told, stock is wrong until the next count. RxPOS keeps both sales and shows the batch below zero on the dashboard so a manager counts it.'],
    ['Offline is not the same as local only', 'A system kept on one computer survives an outage but not a stolen or broken PC. The right answer is both: every device works on its own, and everything is also kept in the cloud.'],
  ]],
];

const MOVING = [
  ['From books', 'Start from the 9,700-item Ugandan medicine catalog: choose what you stock, set prices (worked out from the cost and your markup if you like), and enter your opening stock with batches and expiry dates as you count the shelves.'],
  ['From Excel', 'Import your medicine list from an Excel or CSV file. RxPOS matches the columns (name, prices, cost, stock, batch, expiry, barcode) and shows what it will add before anything is saved. Customers and suppliers can come across the same way.'],
  ['From another system', 'Export what you can (medicines, stock, customers, suppliers) to Excel or CSV and import it. Sales history usually stays in the old system for reference; RxPOS starts the books from your opening stock.'],
  ['Your team', 'Add each person with their role (administrator, manager, pharmacist, dispenser, cashier, or your own). The till has a training mode so nobody practises on real sales.'],
  ['Your data stays yours', 'Every list can be downloaded as a spreadsheet at any time (Settings → Backup), and a full backup in one file.'],
];

export default function Learn({ page }) {
  const [kind, slug] = String(page || 'features').split('/');
  if (kind === 'guide') return (
    <section className="wl-section learn" aria-labelledby="ln-title">
      <h1 id="ln-title">Help guide for the counter</h1>
      <p className="wl-lead">The everyday jobs, from signing in to the end of a shift.</p>
      <nav className="learn-toc" aria-label="In this guide">{GUIDE.map(([t], i) => <a key={t} href={`#/learn/guide/${i}`} onClick={(e) => { e.preventDefault(); document.getElementById('g' + i)?.scrollIntoView({ behavior: 'smooth' }); }}>{t}</a>)}</nav>
      {GUIDE.map(([t, steps], i) => <article key={t} id={'g' + i} className="learn-block"><h2>{t}</h2><ul>{steps.map((x) => <li key={x}>{x}</li>)}</ul></article>)}
    </section>
  );
  if (kind === 'articles') {
    const a = ARTICLES.find((x) => x[0] === slug);
    if (a) return (
      <article className="wl-section learn" aria-labelledby="ln-title">
        <p><a href="#/learn/articles">All articles</a></p>
        <h1 id="ln-title">{a[1]}</h1>
        <p className="wl-lead">{a[2]}</p>
        {a[3].map(([h, p]) => <section key={h} className="learn-block"><h2>{h}</h2><p>{p}</p></section>)}
      </article>
    );
    return (
      <section className="wl-section learn" aria-labelledby="ln-title">
        <h1 id="ln-title">Articles for pharmacy owners</h1>
        <div className="wl-grid">{ARTICLES.map(([s, t, lead]) => <a key={s} className="wl-card learn-card" href={`#/learn/articles/${s}`}><h3>{t}</h3><p>{lead}</p></a>)}</div>
      </section>
    );
  }
  if (kind === 'moving') return (
    <section className="wl-section learn" aria-labelledby="ln-title">
      <h1 id="ln-title">Moving to RxPOS</h1>
      <p className="wl-lead">From exercise books, Excel or another system: most pharmacies are selling on RxPOS the same day.</p>
      {MOVING.map(([h, p]) => <section key={h} className="learn-block"><h2>{h}</h2><p>{p}</p></section>)}
      <p><a className="btn primary" href="#wl-contact" onClick={(e) => { e.preventDefault(); location.hash = ''; setTimeout(() => document.getElementById('wl-contact')?.scrollIntoView(), 50); }}>Talk to us about moving</a></p>
    </section>
  );
  return (
    <section className="wl-section learn" aria-labelledby="ln-title">
      <h1 id="ln-title">Everything RxPOS does</h1>
      <p className="wl-lead">Grouped by the job it helps with. All of it is in the apps today.</p>
      <div className="wl-grid">{FEATURE_GROUPS.map(([g, items]) => <article key={g} className="wl-card"><h3>{g}</h3><ul>{items.map((x) => <li key={x}>{x}</li>)}</ul></article>)}</div>
    </section>
  );
}
