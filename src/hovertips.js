// Hover tips (1.25.x): every button, link, tab, list and field says what it does when the mouse rests on it.
// A control that already has its own title keeps it. Any other control gets one the first time the pointer is over
// it, from the guide below (the words people see most), or from its accessible name and what kind of control it is.
// Nothing is written to any data: it only sets the title that the browser shows as its tooltip.

/** Guide words for the controls seen on most pages, by their visible words (lower case, numbers dropped). */
export const GUIDE = {
  edit: 'Edit: open this record to change it',
  view: 'View: open the full details',
  'view all': 'View all: open the whole list',
  export: 'Export: save these rows as a CSV or PDF file, or print them',
  'export csv': 'Export: save these rows as a CSV file for Excel',
  csv: 'CSV: save these rows as a file for Excel or Google Sheets',
  pdf: 'PDF: save these rows as a PDF to print or share',
  print: 'Print this',
  columns: 'Columns: choose which columns show. You can also drag a heading to move it, or its right edge to resize it',
  close: 'Close',
  cancel: 'Cancel: close without saving',
  save: 'Save your changes',
  'save changes': 'Save your changes',
  delete: 'Delete this (you are asked first)',
  remove: 'Remove this',
  back: 'Go back to the page before',
  next: 'Next step',
  skip: 'Skip this',
  'skip the tour': 'Skip the guided tour (Help in the top bar shows it again)',
  more: 'More actions',
  'what is this?': 'What is this? A short explanation of this page',
  today: 'Show today only',
  yesterday: 'Show yesterday only',
  m: 'Show this many months up to today',
  ytd: 'Year to date: from 1 January until today',
  daily: 'Show one bar for each day',
  weekly: 'Show one bar for each week',
  monthly: 'Show one bar for each month',
  'edit widgets': 'Choose, move and resize the cards on this dashboard',
  fewer: 'Show fewer steps',
  hide: 'Hide this card (it can be turned back on in This device)',
  'new sale': 'Start a new sale at the till',
  'hold & new': 'Park this sale and start a new one; the held sale can be picked up later',
  hold: 'Park this sale to finish it later',
  proforma: 'Make a proforma (a price quotation) from this sale: no stock is taken',
  'split pay': 'Pay this sale with more than one method, e.g. part cash, part Mobile Money',
  favourites: 'Show only the medicines you starred',
  'in stock': 'Show only medicines that have stock',
  'low stock': 'Show only medicines at or below their reorder level',
  'out of stock': 'Show only medicines with no stock',
  all: 'Show everything',
  expired: 'Show expired stock',
  'expiring within days': 'Show stock that expires within 90 days',
  list: 'Show as a list',
  calendar: 'Show on a calendar',
  table: 'Show as a table',
  board: 'Show as cards in columns',
  gallery: 'Show as cards',
  drafts: 'Deliveries you started but have not received yet',
  'supplier prices': 'The last price each supplier charged for each medicine',
  'add stock': 'Receive a delivery from a supplier into stock',
  'receive stock': 'Put these lines into stock and save the delivery',
  'scan invoice': 'Take a photo or choose a PDF of the supplier\'s invoice: the lines are read for you to check',
  'scan invoice with ai': 'Take a photo or choose a PDF of the supplier\'s invoice: the lines are read for you to check',
  'scan with ai': 'Read the invoice from a photo; you check every line before anything is saved',
  'add line': 'Add another medicine line',
  'new medicine': 'Add a medicine that is not in your list yet',
  'new return': 'Send stock back to a supplier for a credit or refund',
  'new stock count': 'Start counting what is on the shelves; RxPOS shows what is short or extra',
  count: 'Open this count',
  'set reorder levels from sales': 'Work out each medicine\'s reorder level from how fast it sells (you approve the list)',
  'review orders': 'Check the suggested purchase orders before they are made',
  'ready-made kit': 'Start a kit from a ready-made list',
  'new kit': 'Make a kit: several medicines sold as one item',
  'no shelf': 'Medicines that have no shelf yet',
  'tick all': 'Tick every medicine in this group',
  'add all in-stock items': 'Add every medicine that has stock to the labels',
  'add standard catalog': 'Add the standard list of medicines and sundries (medicines you already have are skipped)',
  'record reading': 'Write down a temperature and humidity reading',
  'try again': 'Try again',
  room: 'Readings from the shop room',
  fridge: 'Readings from the medicine fridge',
  store: 'Readings from the store room',
  outside: 'The weather outside',
  'add customer': 'Add a new client',
  'add supplier': 'Add a new supplier',
  'add insurer': 'Add an insurance company and its schemes',
  'add prescription': 'Record a new prescription',
  'add expense': 'Record money spent',
  'add loan': 'Record a loan the pharmacy took',
  'add bank / account': 'Add a bank, mobile money or cash account',
  'add staff member': 'Add a person on the payroll',
  'add user': 'Give someone their own sign-in',
  'receive payment': 'Record money this client paid towards what they owe',
  'start my shift': 'Open your shift with the cash float in the drawer',
  'review and turn into shifts': 'See the sales made outside a shift and turn them into shifts (you approve first)',
  'new page': 'Write a new note or procedure',
  templates: 'Start from a ready-made checklist or procedure',
  'opening checklist': 'The checklist for opening the pharmacy',
  'full weekly report': 'Open this week\'s full report',
};

const GROUP_PAGES = { sell: 'the till, sales and prescriptions', stock: 'medicines, deliveries and stock checks', people: 'clients, suppliers, insurers and messages',
  money: 'expenses, banks, loans and what is owed', reports: 'reports and the audit log', settings: 'settings, users and this device' };

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** the guide key for some words: lower case, counts and punctuation at the ends dropped ("In stock7" → "in stock", "1M" → "m") */
export const guideKey = (s) => clean(s).toLowerCase().replace(/[+]/g, '').replace(/\(\d+\)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

/**
 * The tip for one control, or '' for none.
 * c: { tag, role, type, cls, text, label, heading, field } — text: its visible words; label: aria-label or the field's label;
 * heading: a table heading's name; field: the words of the label a form field sits in.
 */
export function tipFor(c) {
  const tag = (c.tag || '').toLowerCase(), cls = ' ' + (c.cls || '') + ' ';
  const text = clean(c.text), label = clean(c.label);
  const name = label || text;
  // a table heading: sort, move and resize
  if (cls.includes(' th-sort ')) return `Sort by ${text}: click again to reverse. Drag the heading to move the column, or its right edge to resize it`;
  // a menu group's title
  if (cls.includes(' nav-title ')) { const g = guideKey(text); return `Show or hide the ${text} pages${GROUP_PAGES[g] ? ` (${GROUP_PAGES[g]})` : ''}`; }
  if (tag === 'select') return name ? `Choose ${name.charAt(0).toLowerCase() + name.slice(1)}` : 'Choose from the list';
  if (tag === 'input' || tag === 'textarea') {
    if (c.type === 'checkbox' || c.type === 'radio') return !name ? '' : c.type === 'checkbox' && !/^(tick|select)\b/i.test(name) ? `Tick: ${name}` : name;
    if (c.type === 'search' || /^search\b/i.test(name)) return 'Search: type a few letters to find or filter';
    return name ? `Type ${name.charAt(0).toLowerCase() + name.slice(1).replace(/[…:.]+$/, '')}` : '';
  }
  if (tag === 'summary') return text ? `Show or hide: ${text}` : '';
  if (!name) return '';
  const g = GUIDE[guideKey(name)];
  if (g) return g;
  // a long card (a medicine on the till, a setting): its first line says enough
  const short = name.length > 60 ? name.slice(0, 57) + '…' : name;
  if (cls.includes(' pos-card ') || cls.includes(' med-card ') || cls.includes(' product-card ')) return `Add ${short} to the sale`;
  if (c.role === 'tab' || cls.includes(' hub-tab ') || c.seg) return `Show ${short}`;
  if (tag === 'a') return `Open ${short}`;
  return short;
}

const CONTROLS = 'button, a[href], [role=button], [role=tab], [role=link], [role=switch], select, input:not([type=hidden]), textarea, summary';

/** what tipFor needs about an element */
export function describe(el) {
  const own = el.getAttribute('aria-label') || '';
  let field = '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    const lab = (el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    // the label's own words, not the words of the options inside it
    if (lab) { const c = lab.cloneNode(true); c.querySelectorAll('select, input, textarea, option, .date-input, .muted, small').forEach((n) => n.remove()); field = c.textContent; }
    if (!field) field = el.getAttribute('placeholder') || '';
  }
  // a card's first line is its name; the small print under it is left out
  const words = el.tagName === 'SELECT' ? [] : String(el.innerText ?? el.textContent ?? '').split('\n').map(clean).filter(Boolean);
  const text = words.length > 1 && words.join(' ').length > 40 ? words[0] : words.join(' ');
  return { tag: el.tagName, role: el.getAttribute('role') || '', type: el.getAttribute('type') || '', cls: typeof el.className === 'string' ? el.className : '',
    text, label: own || field, seg: !!el.closest('.seg, .mode-toggle, .tabs, [role=tablist]') };
}

/** Start the hover tips for the whole app (once). */
export function startHoverTips(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.__rxposTips) return;
  doc.__rxposTips = true;
  doc.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target?.closest?.(CONTROLS);
    if (!el) return;
    const auto = el.hasAttribute('data-tip-auto');
    // a control with its own tooltip keeps it
    if (!auto && el.hasAttribute('title')) return;
    const tip = tipFor(describe(el));
    if (tip && el.getAttribute('title') !== tip) { el.setAttribute('title', tip); el.setAttribute('data-tip-auto', ''); }
  }, true);
}
