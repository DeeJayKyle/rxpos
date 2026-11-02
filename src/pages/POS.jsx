import { mainPack, packPrice, sellInPacks } from '../packs.js';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ShoppingCart, Trash2, X, FileText, Printer, AlertTriangle, ScanBarcode, Smartphone, Loader2, CheckCircle2, UserPlus, Tag, BookMarked, Repeat, PauseCircle, Keyboard, Plus, ClipboardList, MessageCircle, MessageSquareText, Star, Search, Command, LayoutGrid, Users } from 'lucide-react';
import { DrugInfoPanel, genericKey } from './DrugInfo.jsx';
import { useStore, uid, now, daysUntil, put, del, move, allocate, audit, normalizePhone, customerBalance, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { draftsFor, saleDraft } from '../drafts.js';
import { keepsData } from '../webpolicy.js';
import { CASH } from '../finance.js';
import { cartSubtotal, taxOf, round, formatQty } from '../money.js';
import { searchProducts, searchKey } from '../search.js';
import { Modal, SearchBox, ReceiptPdfButton, PageTip } from '../ui.jsx';
import { toast, ask, askText } from '../feedback.jsx';
import { payRequest, payStatus, guessNetwork, cloudConfig, whatsappLink, sendSms } from '../cloud.js';
import { Receipt, receiptText } from './Sales.jsx';
import { CameraButton, CameraScanner } from '../camscan.jsx';
import { deviceSettings, setDevice, onDevice } from '../device.js';

// Receipt numbers must be unique across synced devices, so they are time-based rather than sequential
export const docNumber = (prefix) => prefix + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

// A client with this many sales is shown as a loyalty member (repeat client) on the till
const LOYAL_VISITS = 5;
// the till's layouts (each device keeps its own choice)
const POS_LAYOUTS = [['classic', 'Classic'], ['standard', 'Standard'], ['advanced', 'Advanced UI']];

export default function POS({ mode = 'retail' }) {
  const { db, products, update, user, fmt, batchesOf, branchId, syncCfg, features, can, pending } = useStore();
  const [momo, setMomo] = useState(null);
  const [newClient, setNewClient] = useState(null);   // quick 'add client' form
  const [labelFor, setLabelFor] = useState(null);     // cart line whose dispensing directions are being edited
  const [infoFor, setInfoFor] = useState(null);       // medicine whose drug information is shown
  const [subs, setSubs] = useState(null);             // { p, list } substitutes for an out-of-stock medicine
  const capture = db.settings.clientCapture || 'optional';
  const [payCfg, setPayCfg] = useState(null); // which mobile money networks the cloud has switched on
  const location = useLocation();
  const wholesale = mode === 'wholesale';
  const priceOf = (p) => (wholesale ? p.wholesale || p.price : p.price);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [view, setView] = useState(''); // '' | 'instock' | 'recent' | 'fav'
  const favKey = `rxpos-pos-favs:${syncCfg.tenant || 'device'}`;
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(favKey)) || []); } catch { return new Set(); } });
  const toggleFav = (id) => setFavs((f) => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem(favKey, JSON.stringify([...n])); } catch { /* storage blocked */ } return n; });
  const [cart, setCart] = useState([]);
  const [picked, setPicked] = useState(() => new Set()); // lines ticked on the current sale
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeLines = (ids) => { const drop = new Set(ids); setCart((c) => c.filter((l) => !drop.has(l.id))); setPicked((s) => new Set([...s].filter((id) => !drop.has(id)))); };
  useEffect(() => { if (!cart.length && picked.size) setPicked(new Set()); }, [cart.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [customerId, setCustomerId] = useState('walk-in');
  const [discount, setDiscount] = useState(0);
  // The sale being rung up is kept on this device so a reload loses nothing. Sales on hold (one per waiting customer)
  // are synced drafts (src/drafts.js): they belong to the person who held them and follow them to another device.
  const holdKey = `rxpos-pos:${syncCfg.tenant || 'device'}:${branchId}:${mode}`;
  const heldDrafts = draftsFor(db, { user, branchId, kind: 'sale', mode });
  const held = heldDrafts.map((d) => d.data);
  const custName = (id) => db.customers.find((c) => c.id === id)?.name;
  const asDraft = (snap, order) => saleDraft(snap, { user, branchId, mode, customerName: custName(snap.customerId), order });
  /** Change the held sales in one saved step: take some out, put some in (at the end, or `first` at the front) */
  const changeHeld = (out = [], add = [], first = false) => {
    const lo = Math.min(Date.now(), ...heldDrafts.map((d) => d.order || 0));
    return update((d) => {
      for (const id of out) if (d.drafts.some((x) => x.id === id)) del(d, 'drafts', id);
      add.forEach((snap, i) => put(d, 'drafts', asDraft(snap, first ? lo - add.length + i : Date.now() + i)));
    }).catch((e) => { toast('The held sales could not be saved: ' + e.message, 'error'); throw e; });
  };
  const [cursor, setCursor] = useState(-1); // cart line chosen with Alt+↑/↓ (−1 = the last one)
  const [active, setActive] = useState(0);  // highlighted medicine card (arrow keys)
  const [help, setHelp] = useState(false);
  const [cam, setCam] = useState(false); // camera barcode scanner
  // Phones and tablets: the sale is a sheet docked at the bottom (total and Charge always in reach), slid up to edit it
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches);
  useEffect(() => { const m = matchMedia('(max-width: 900px)'); const f = () => setNarrow(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f); }, []);
  const [sheet, setSheet] = useState(false);
  const [swipe, setSwipe] = useState(null); // { id, x0, y0, dx } while a cart line is being swiped
  const [cdForm, setCdForm] = useState(null); // controlled-drug details being filled in
  const cdRef = useRef(null); // the details for this sale, once given
  // Payment methods come from Settings → Payment methods; their type decides the behaviour
  const methods = (db.settings.paymentMethods?.length ? db.settings.paymentMethods : DEFAULT_PAYMENT_METHODS).filter((m) => m.type !== 'momo' || features.momo !== false);
  const [payment, setPayment] = useState(methods[0]?.name || 'Cash');
  const ptype = methods.find((m) => m.name === payment)?.type || 'other';
  const [tendered, setTendered] = useState('');
  const [done, setDone] = useState(null);
  const searchRef = useRef();
  const gridRef = useRef();
  const cartRef = useRef();
  const chargeRef = useRef();
  const [cartInView, setCartInView] = useState(true);
  const warn = db.settings.expiryWarnDays || 90;

  // Phones: know whether the cart is on screen, so a floating cart bar can appear when it isn't
  useEffect(() => {
    if (!chargeRef.current || typeof IntersectionObserver !== 'function') return;
    // The bottom 90 px are covered by the phone's bottom navigation, so they don't count as visible
    const io = new IntersectionObserver(([e]) => setCartInView(e.isIntersecting), { threshold: 0.9, rootMargin: '0px 0px -90px 0px' });
    io.observe(chargeRef.current);
    return () => io.disconnect();
  }, []);

  // Keep the cursor in the search box for barcode scanners on PCs; on touch screens that would pop up the keyboard after every tap
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const focusSearch = () => { if (!touch) searchRef.current?.querySelector('input')?.focus(); };
  useEffect(() => { focusSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring back the sale that was being rung up (unless a proforma is being loaded)
  useEffect(() => {
    if (location.state?.proforma) return;
    try {
      const saved = JSON.parse(localStorage.getItem(holdKey));
      // sales held on this device before 1.7 (or held in this tab and not yet sent when it reloaded) become drafts
      if (saved?.held?.length) changeHeld([], saved.held).then(() => localStorage.setItem(holdKey, JSON.stringify({ current: saved.current || null })), () => {});
      const resume = location.state?.resumeDraft && (db.drafts || []).find((x) => x.id === location.state.resumeDraft);
      if (resume) {
        // Sales History → Held sales → Continue / Take over: the open sale (if any) goes on hold in its place
        const cur = saved?.current?.cart?.length ? [saved.current] : [];
        changeHeld([resume.id], cur).then(() => loadSale(resume.data), () => {});
        return;
      }
      if (saved?.current?.cart?.length) loadSale(saved.current);
    } catch { /* nothing saved */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      // the web version keeps changes in memory until the cloud has them: until then the held sales are also kept in
      // this tab, so a reload before they are sent loses none (they come back as drafts, same ids)
      const backup = !keepsData() && pending > 0 && held.length ? { held } : {};
      try { localStorage.setItem(holdKey, JSON.stringify({ current: cart.length ? snapshot() : null, ...backup })); } catch { /* storage blocked */ }
    }, 250);
    return () => clearTimeout(t);
  }); // after every change

  // Tell the idle shop window (engage.jsx) not to cover a sale that is being rung up
  useEffect(() => { document.body.dataset.saleOpen = cart.length ? '1' : ''; return () => { document.body.dataset.saleOpen = ''; }; }, [cart.length]);

  // Load a proforma into the cart (from Proformas → "Sell")
  useEffect(() => {
    const pf = location.state?.proforma;
    if (!pf) return;
    setCart(pf.items.map((i) => ({ ...i, max: products.find((p) => p.id === i.id)?.stock ?? 0 })));
    setCustomerId(pf.customerId || 'walk-in');
    setDiscount(pf.discount || 0);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort().slice(0, 14), [products]);
  // one folded search string per medicine, rebuilt only when the medicine list changes (src/search.js)
  const keys = useMemo(() => new Map(products.map((p) => [p.id, searchKey(p)])), [products]);
  // medicines sold most recently at this branch (newest first), for the "Recent" filter
  const recent = useMemo(() => {
    const seen = new Map();
    for (let i = db.sales.length - 1; i >= 0 && seen.size < 40; i--) {
      const s = db.sales[i];
      if ((s.branchId || 'main') !== branchId) continue;
      for (const it of s.items) if (!seen.has(it.id)) seen.set(it.id, seen.size);
    }
    return seen;
  }, [db.sales, branchId]);
  const results = useMemo(() => {
    let list = products.filter((p) => (!category || p.category === category) && (view !== 'instock' || p.stock > 0)
      && (view !== 'fav' || favs.has(p.id)) && (view !== 'recent' || recent.has(p.id)));
    if (q) return searchProducts(list, q, (p) => keys.get(p.id) || searchKey(p)).slice(0, 80);
    if (view === 'recent') list = [...list].sort((a, b) => recent.get(a.id) - recent.get(b.id));
    else list = [...list].sort((a, b) => (b.stock > 0) - (a.stock > 0));
    return list.slice(0, 80);
  }, [products, category, q, keys, view, favs, recent]);
  useEffect(() => setActive(0), [q, category, view]);
  // how many cards fit across the grid, so ↑/↓ move by a whole row
  const gridCols = () => { const el = gridRef.current; return el ? Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').length) : 1; };
  const moveActive = (by) => setActive((a) => {
    const n = Math.max(0, Math.min(results.length - 1, a + by));
    setTimeout(() => gridRef.current?.children[n]?.scrollIntoView({ block: 'nearest' }));
    return n;
  });

  const add = async (p) => {
    if (p.stock <= 0) {
      const g = genericKey(p.generic || p.name);
      const list = g ? products.filter((x) => x.id !== p.id && x.stock > 0 && genericKey(x.generic || x.name) === g).slice(0, 8) : [];
      if (list.length) return setSubs({ p, list });
      return toast(`${p.name} is out of stock at ${branchName}`, 'error');
    }
    // FEFO: sell from the earliest-expiring batch; expired batches are only used if the pharmacist confirms
    const sellable = batchesOf(p.id).filter((b) => b.qty > 0 && (!b.expiry || daysUntil(b.expiry) >= 0)).reduce((a, b) => a + b.qty, 0);
    const inCart = cart.find((l) => l.id === p.id);
    let allowExpired = inCart?.allowExpired || false;
    let expiredReason = inCart?.expiredReason || '';
    if (!allowExpired && (inCart?.qty || 0) >= sellable) {
      if (!(await ask({ title: 'Only expired stock left', message: `All remaining ${p.name} stock has expired. Sell expired stock anyway?`, confirmText: 'Sell expired', danger: true }))) return;
      // 1.6 selling expired stock needs a recorded reason; it is audited and flags the sale at checkout
      const reason = await askText({ title: 'Why sell expired stock?', message: 'This is written to the audit log and flags the sale.', confirmText: 'Confirm', minLength: 3 });
      if (!reason) return;
      allowExpired = true;
      expiredReason = reason;
    }
    if (inCart && inCart.qty + (inCart.pack?.size || 1) > p.stock) return toast(`Only ${p.stock} ${p.unit || 'units'} of ${p.name} in stock`, 'warn');
    setCart((c) => {
      const line = c.find((l) => l.id === p.id);
      if (line) return c.map((l) => (l.id === p.id ? { ...l, allowExpired, expiredReason, qty: Math.min(l.qty + (l.pack?.size || 1), p.stock) } : l));
      const first = { id: p.id, name: p.name, price: priceOf(p), cost: p.cost, qty: 1, max: p.stock, rx: p.rx, controlled: !!p.controlled, allowExpired, expiredReason };
      // retail sells single units and wholesale whole packs by default (Settings → Receipts & stock); the line can be switched
      const k = sellInPacks(db.settings, wholesale) ? mainPack(p) : null;
      if (k && Number(k.size) <= p.stock) { const pp = packPrice(k, priceOf(p), wholesale), size = Number(k.size); return [...c, { ...first, pack: { name: k.name, size, price: pp }, price: pp / size, qty: size }]; }
      return [...c, first];
    });
    setQ('');
    focusSearch();
  };

  const onSearchKey = (e) => {
    if (e.altKey || e.ctrlKey) return;
    if (e.key === 'Escape') { setQ(''); setActive(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(gridCols()); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-gridCols()); }
    else if (e.key === 'ArrowRight' && (q === '' || e.target.selectionStart === q.length)) { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowLeft' && q === '') { e.preventDefault(); moveActive(-1); }
    if (e.key !== 'Enter') return;
    const exact = products.find((p) => p.barcode && p.barcode === q.trim());
    if (exact) add(exact);
    else if (/^\d{6,}$/.test(q.trim())) toast(`No medicine has the barcode ${q.trim()}`, 'warn'); // a scan that matched nothing: never guess
    else if (results[active] && (q || active > 0)) add(results[active]);
    else if (results.length === 1) add(results[0]);
  };

  const setLine = (id, patch) => setCart((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setQty = (id, qty) => setCart((c) => c.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(Number(qty) || 1, l.max)) } : l)));
  // Packs (strip, box…): stock and line.qty stay in the medicine's smallest unit; a pack line counts whole packs
  const packsOf = (id) => products.find((p) => p.id === id)?.packs?.filter((k) => k.name && Number(k.size) > 1) || [];
  const stepOf = (l) => l.pack?.size || 1;
  const setCount = (l, n) => {
    const size = stepOf(l), most = Math.floor(l.max / size);
    if (Number(n) > most) toast(`Only ${most} ${l.pack ? l.pack.name.toLowerCase() + (most === 1 ? '' : 's') : 'in stock'} in stock`, 'warn');
    setQty(l.id, Math.max(1, Math.min(Math.round(Number(n) || 1), Math.max(1, most))) * size);
  };
  const choosePack = (l, name) => {
    const p = products.find((x) => x.id === l.id);
    const k = packsOf(l.id).find((x) => x.name === name);
    if (!k) return setLine(l.id, { pack: null, price: priceOf(p), qty: Math.max(1, Math.min(l.qty, l.max)) });
    const size = Number(k.size);
    if (size > l.max) return toast(`Not a whole ${k.name.toLowerCase()} in stock (${l.max} left)`, 'warn');
    const pp = packPrice(k, priceOf(p), wholesale); // the pack's own retail or wholesale price, else unit price × size
    setLine(l.id, { pack: { name: k.name, size, price: pp }, price: pp / size, qty: size });
  };
  // Integer-shilling money math (1.5): each line rounds, then they sum, so a pack-split price can't leave a floating
  // tail on the stored total, and tax rounds once.
  const money = Number(db.settings.decimals ?? 0);
  const subtotal = cartSubtotal(cart, money);
  const disc = Math.min(round(Number(discount) || 0, money), subtotal);
  const tax = taxOf(subtotal - disc, db.settings.taxRate, { decimals: money });
  const total = round(subtotal - disc + tax, money);
  const change = (Number(tendered) || 0) - total;
  const customer = db.customers.find((c) => c.id === customerId);
  const items = cart.reduce((a, l) => a + l.qty, 0);

  const branchName = db.branches.find((b) => b.id === branchId)?.name || 'this branch';

  // ---- sales on hold: serve the next customer while one is still deciding, then switch back ----
  const snapshot = () => ({ id: uid(), at: now(), cart, customerId, discount, payment, tendered });
  function loadSale(x) {
    cdRef.current = null;
    // stock may have moved while the sale was on hold: each line's limit is today's stock
    setCart((x.cart || []).map((l) => { const p = products.find((y) => y.id === l.id); return p ? { ...l, max: p.stock, qty: Math.min(l.qty, Math.max(1, p.stock)) } : l; })); setCustomerId(x.customerId || 'walk-in'); setDiscount(x.discount || 0);
    setPayment(methods.some((m) => m.name === x.payment) ? x.payment : methods[0]?.name || 'Cash'); setTendered(x.tendered || ''); setPicked(new Set()); setCursor(-1);
  }
  const clearSale = () => loadSale({});
  const holdSale = async () => {
    if (!cart.length) return toast('Nothing to hold: the sale is empty', 'info');
    try { await changeHeld([], [snapshot()]); } catch { return; }
    clearSale(); focusSearch();
    toast('Sale on hold. Tap it above the sale to carry on (also in Sales History → Held sales).', 'info');
  };
  const resumeSale = async (id) => {
    const x = held.find((h) => h.id === id);
    if (!x) return;
    try { await changeHeld([id], cart.length ? [snapshot()] : []); } catch { return; }
    loadSale(x); focusSearch();
  };
  // Alt+→ / Alt+←: go round the held sales (the current one goes on hold in its place)
  const cycleSale = async (dir) => {
    if (!held.length) return;
    const x = dir > 0 ? held[0] : held[held.length - 1];
    try { await changeHeld([x.id], cart.length ? [snapshot()] : [], dir < 0); } catch { return; }
    loadSale(x); focusSearch();
  };
  const heldLabel = (h) => {
    const c = db.customers.find((x) => x.id === h.customerId);
    return c && c.id !== 'walk-in' ? c.name.split(/\s+/)[0] : h.cart[0]?.name.split(/\s+/).slice(0, 2).join(' ') || 'Sale';
  };
  const heldTotal = (h) => h.cart.reduce((a, l) => a + l.price * l.qty, 0) - (Number(h.discount) || 0);
  // Rx / controlled status comes from the medicine as it is now (a line may have been rung up before it was changed)
  const isRx = (l) => !!(products.find((p) => p.id === l.id)?.rx ?? l.rx);
  const isCd = (l) => !!(products.find((p) => p.id === l.id)?.controlled ?? l.controlled);
  const lineAt = cursor >= 0 && cursor < cart.length ? cart[cursor] : cart[cart.length - 1];
  // ---- wide screens (1280px+): the client panel on the left, with the quick actions ----
  const [custQ, setCustQ] = useState('');
  const [custFind, setCustFind] = useState('');
  useEffect(() => { const t = setTimeout(() => setCustFind(custQ.trim().toLowerCase()), 150); return () => clearTimeout(t); }, [custQ]); // 150 ms debounce
  const custRef = useRef(null), discRef = useRef(null);
  const custMatches = useMemo(() => {
    if (!custFind) return [];
    const digits = custFind.replace(/\D/g, '');
    return db.customers.filter((c) => c.id !== 'walk-in' && (String(c.name || '').toLowerCase().includes(custFind) || (digits.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(digits)))).slice(0, 8);
  }, [custFind, db.customers]);
  // badges: a loyal (regular) client, what they owe or have in credit, else a standard account
  const custBadges = useMemo(() => {
    if (!customer || customer.id === 'walk-in') return [{ k: 'std', text: 'Walk-in · standard' }];
    const visits = db.sales.filter((x) => x.customerId === customer.id && x.status !== 'refunded').length;
    const owes = customerBalance(db, customer.id);
    const out = [];
    if (visits >= LOYAL_VISITS) out.push({ k: 'loyal', text: `Loyalty member · ${visits} visits` });
    if (owes > 0.5) out.push({ k: 'credit', text: `Balance due ${fmt(owes)}` });
    else if (owes < -0.5) out.push({ k: 'credit', text: `Store credit ${fmt(-owes)}` });
    if (!out.length) out.push({ k: 'std', text: `Standard account${visits ? ` · ${visits} visit${visits === 1 ? '' : 's'}` : ''}` });
    return out;
  }, [customer, db]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSale = useMemo(() => db.sales.filter((x) => (x.branchId || 'main') === (branchId || 'main')).reduce((b, x) => (!b || String(x.date) > String(b.date) ? x : b), null), [db.sales, branchId]);
  const focusDiscount = () => { const i = discRef.current; if (i) { i.focus(); i.select(); } };
  const printLast = () => (lastSale ? setDone({ ...lastSale, reprint: true }) : toast('No sale at this branch yet', 'warn'));
  const pickCustomer = (id) => { setCustomerId(id); setCustQ(''); focusSearch(); };
  // ---- the till's layout, chosen per device (This device / the till's Layout box): classic (as it always was),
  // standard (client strip over the medicines on wide screens) or advanced (three columns, Ctrl+K commands) ----
  const [layout, setLayoutState] = useState(() => (POS_LAYOUTS.some(([k]) => k === deviceSettings().posLayout) ? deviceSettings().posLayout : 'standard'));
  useEffect(() => onDevice((d) => setLayoutState(POS_LAYOUTS.some(([k]) => k === d.posLayout) ? d.posLayout : 'standard')), []);
  const useAdvancedLayout = layout === 'advanced';
  // the theme (Premium UI changes it without reloading): watched so the key tag and F5 follow it at once
  const [palette, setPalette] = useState(() => document.documentElement.dataset.palette || '');
  useEffect(() => { const o = new MutationObserver(() => setPalette(document.documentElement.dataset.palette || '')); o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] }); return () => o.disconnect(); }, []);
  const premium = palette === 'midnight-pro';
  const setLayout = (k) => { setDevice({ posLayout: k }); setLayoutState(k); };
  const [omni, setOmni] = useState(false);
  // a line that was just added or changed pulses briefly
  const [pulse, setPulse] = useState({});
  const lastCart = useRef(new Map());
  useEffect(() => {
    const before = lastCart.current, now2 = new Map(cart.map((l) => [l.id, `${l.qty}|${l.price}|${l.pack?.name || ''}`]));
    const changed = [...now2].filter(([id, v]) => before.get(id) !== v).map(([id]) => id);
    lastCart.current = now2;
    if (!changed.length) return undefined; // (only Advanced UI and the Midnight Pro theme show the pulse)
    setPulse((p) => { const n = { ...p }; for (const id of changed) n[id] = (p[id] || 0) + 1; return n; });
    const t = setTimeout(() => setPulse((p) => { const n = { ...p }; for (const id of changed) delete n[id]; return n; }), 700);
    return () => clearTimeout(t);
  }, [cart]); // eslint-disable-line react-hooks/exhaustive-deps
  // Command bar (Advanced, Ctrl+K): "+qty 2", "-qty 2", "qty 2 5", "void 2", "disc 2 10" (10% off line 2), "disc 10" (10% off the sale), "hold", "pay"; anything else finds a medicine
  const runCommand = (text) => {
    const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const rowOf = (n) => { const i = Number(n) - 1; return Number.isInteger(i) && i >= 0 && i < cart.length ? cart[i] : null; };
    let m;
    if ((m = t.match(/^([+-])\s?qty (\d+)(?: (\d+))?$/))) {
      const l = rowOf(m[2]); if (!l) return `There is no line ${m[2]}`;
      const by = Number(m[3] || 1) * (m[1] === '+' ? 1 : -1), now1 = l.qty / stepOf(l);
      if (now1 + by <= 0) { removeLines([l.id]); return `Line ${m[2]} removed`; }
      setCount(l, now1 + by); setCursor(cart.indexOf(l)); return null;
    }
    if ((m = t.match(/^qty (\d+) (\d+)$/))) { const l = rowOf(m[1]); if (!l) return `There is no line ${m[1]}`; setCount(l, Number(m[2])); setCursor(cart.indexOf(l)); return null; }
    if ((m = t.match(/^void (\d+)$/))) { const l = rowOf(m[1]); if (!l) return `There is no line ${m[1]}`; removeLines([l.id]); setCursor(-1); return null; }
    if ((m = t.match(/^disc (\d+) (\d+(?:\.\d+)?)%?$/))) {
      const l = rowOf(m[1]), pct = Number(m[2]); if (!l) return `There is no line ${m[1]}`;
      if (!can('pos.price_edit')) return 'You are not allowed to change prices';
      if (!(pct > 0 && pct < 100)) return 'A discount is between 1 and 99%';
      const f = 1 - pct / 100;
      setLine(l.id, { price: round(l.price * f, 2), ...(l.pack ? { pack: { ...l.pack, price: round(l.pack.price * f, money) } } : {}) }); setCursor(cart.indexOf(l)); return null;
    }
    if ((m = t.match(/^disc (\d+(?:\.\d+)?)%?$/))) { const pct = Number(m[1]); if (!(pct > 0 && pct < 100)) return 'A discount is between 1 and 99%'; setDiscount(String(round(subtotal * pct / 100, money))); return null; }
    if (t === 'hold') { holdSale(); return null; }
    if (t === 'pay' || t === 'checkout' || t === 'charge') { setOmni(false); checkout(); return null; }
    return 'Not a command. Try +qty 2, -qty 2, qty 2 5, void 2, disc 2 10, disc 10, hold or pay';
  };

  const checkout = async () => {
    if (!cart.length) return;
    const credit = ptype === 'credit';
    if (credit && customerId === 'walk-in') return toast('Select a registered customer for a credit sale', 'warn');
    if (capture === 'required' && customerId === 'walk-in') return toast('Choose or add the client for this sale', 'warn');
    if (ptype === 'cash' && tendered !== '' && change < 0) return toast('Amount tendered is less than the total', 'error');
    // controlled drugs: patient, prescriber and prescription go in the register (asked once per sale)
    if (cart.some(isCd) && !cdRef.current) {
      const c = customer && customer.id !== 'walk-in' ? customer : null;
      return setCdForm({ patient: c?.name || '', idNo: c?.phone || '', prescriber: '', prescriberReg: '', rxNo: '' });
    }
    if (cart.some(isRx) && !cart.some(isCd) && !(await ask({ title: 'Prescription-only medicine', message: 'Confirm that a valid prescription has been checked for the Rx items in this sale.', confirmText: 'Prescription verified' }))) return;
    if (ptype === 'momo') {
      const phone = normalizePhone(customer?.phone || '');
      if (syncCfg.url && navigator.onLine) cloudConfig(syncCfg).then(setPayCfg).catch(() => setPayCfg({}));
      return setMomo({ phone: customer?.phone || '', network: phone ? guessNetwork(phone) : 'mtn', stage: 'enter', ref: '', manualRef: '' });
    }
    finalize();
  };

  // 1.6 a sale is only "complete" once it is saved on the device (sale, stock movements, audit and the note to send it
  // to the cloud, in one transaction); a second press while it is being saved is ignored
  const saving = useRef(false);
  const finalize = async (extra = {}) => {
    if (saving.current) return;
    const credit = ptype === 'credit';
    const paid = credit ? Math.min(Number(tendered) || 0, total) : total;
    // Split each line across batches, earliest expiry first
    const items = cart.map((l) => ({ ...l, controlled: isCd(l) })).map(({ id, name, price, cost, qty, allowExpired, directions, controlled, pack }) => ({
      id, name, price: Number(price), cost, qty, ...(directions ? { directions } : {}), ...(controlled ? { controlled: true } : {}),
      ...(pack ? { pack: { name: pack.name, size: pack.size, count: qty / pack.size, price: Number(price) * pack.size } } : {}),
      alloc: allocate(batchesOf(id), qty, { allowExpired }).map(({ batchId, qty: q, batch, expiry }) => ({ batchId, qty: q, batch, expiry })),
    }));
    const sale = {
      id: uid(), number: docNumber('R'), date: now(), type: mode, branchId,
      items, subtotal, discount: disc, tax, total, payment, paid,
      tendered: ptype === 'cash' ? Number(tendered) || total : paid,
      bankId: ptype === 'cash' || credit ? CASH : db.settings.nonCashBankId || CASH,
      customerId, customerName: customer?.name || 'Walk-in Customer', cashier: user.name, status: 'completed', ...(cart.some(isCd) && cdRef.current ? { controlled: cdRef.current } : {}), ...(cart.some((l) => l.allowExpired) ? { expiredOverride: true } : {}), ...extra,
    };
    const expiredLines = cart.filter((l) => l.allowExpired); // 1.6
    saving.current = true;
    try {
    await update((d) => {
      put(d, 'sales', sale);
      for (const i of items) for (const a of i.alloc) move(d, { productId: i.id, qty: -a.qty, type: 'Sale', ref: sale.number, user: user.name, batchId: a.batchId, branchId });
      const pf = location.state?.proforma;
      if (pf) put(d, 'proformas', { ...d.proformas.find((x) => x.id === pf.id), status: 'Converted', saleNumber: sale.number });
      if (disc > 0) audit(d, user, 'Discount given', `${sale.number}: ${fmt(disc)}`, branchId);
      // 1.6 an expired-stock sale is recorded in the audit log, with the pharmacist's reason per medicine
      if (expiredLines.length) audit(d, user, 'Expired stock sold', `${sale.number}: ${expiredLines.map((l) => `${l.name} (${l.expiredReason || 'no reason given'})`).join('; ')}`, branchId);
    });
    } catch (e) {
      // nothing was kept: the basket stays as it is so the sale can be charged again
      toast(`The sale was NOT recorded. ${e.message}`, 'error');
      return;
    } finally { saving.current = false; }
    window.history.replaceState({}, '');
    setDone(sale);
    setMomo(null);
    setSheet(false);
    clearSale();
    if (db.settings.autoPrint) setTimeout(() => window.print(), 350);
  };

  // Mobile Money: ask the customer's phone to approve the payment, then poll until approved/declined
  const pollRef = useRef(0);
  const sendMomo = async () => {
    const phone = normalizePhone(momo.phone);
    if (phone.length < 12) return toast('Enter the customer’s mobile money number', 'warn');
    setMomo((m) => ({ ...m, stage: 'waiting', error: '' }));
    const run = ++pollRef.current;
    try {
      const reference = 'PP' + Date.now().toString(36).toUpperCase();
      const { ref } = await payRequest(syncCfg, { provider: momo.network, phone, amount: total, reference, note: `${db.settings.name} payment` });
      setMomo((m) => ({ ...m, ref }));
      for (let i = 0; i < 45 && run === pollRef.current; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        if (run !== pollRef.current) return;
        const s = await payStatus(syncCfg, momo.network, ref).catch(() => ({ status: 'PENDING' }));
        if (s.status === 'SUCCESSFUL') {
          setMomo((m) => ({ ...m, stage: 'paid' }));
          toast('Mobile Money payment received');
          return finalize({ momo: { provider: momo.network, phone, ref, txid: s.txid || '', confirmed: true } }); // confirmed by the network
        }
        if (s.status === 'FAILED') return setMomo((m) => ({ ...m, stage: 'enter', error: 'The customer declined or the payment failed' + (s.reason ? `: ${s.reason}` : '') }));
      }
      if (run === pollRef.current) setMomo((m) => ({ ...m, stage: 'enter', error: 'No answer from the customer’s phone. Try again or record the payment manually.' }));
    } catch (e) {
      setMomo((m) => ({ ...m, stage: 'enter', error: e.message }));
    }
  };

  const saveProforma = () => {
    if (!cart.length) return;
    const pf = {
      id: uid(), number: docNumber('PF'), date: now(), type: mode, status: 'Open',
      items: cart.map(({ id, name, price, cost, qty }) => ({ id, name, price: Number(price), cost, qty })),
      subtotal, discount: disc, tax, total, customerId, customerName: customer?.name || 'Walk-in Customer', createdBy: user.name,
    };
    update((d) => { put(d, 'proformas', pf); });
    setDone({ ...pf, proforma: true });
    clearSale();
  };

  // POS keyboard (also listed under the ? button): F8 search, F9 / Ctrl+Enter charge, F10 proforma, Alt+H hold,
  // Alt+←/→ switch held sales, Alt+↑/↓ choose a cart line, +/− its quantity, Delete removes it, Alt+1…9 payment method
  useEffect(() => {
    const onKey = (e) => {
      if (done || momo || newClient || labelFor || infoFor || subs || cdForm || cam || help || omni) return;
      const inSearch = e.target.tagName === 'INPUT' && searchRef.current?.contains(e.target);
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !inSearch;
      if (e.key === 'F8') { e.preventDefault(); focusSearch(); }
      else if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); custRef.current?.focus(); }
      else if (e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); focusDiscount(); }
      else if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); printLast(); }
      else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); checkout(); }
      else if (e.key === 'F10') { e.preventDefault(); saveProforma(); }
      else if (e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); holdSale(); }
      else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); cycleSale(e.key === 'ArrowRight' ? 1 : -1); }
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && cart.length) {
        e.preventDefault();
        setCursor((c) => { const cur = c >= 0 && c < cart.length ? c : cart.length - 1; return Math.max(0, Math.min(cart.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))); });
      }
      else if (e.altKey && /^[1-9]$/.test(e.key) && methods[Number(e.key) - 1]) { e.preventDefault(); setPayment(methods[Number(e.key) - 1].name); }
      else if (e.key === '?' && !typing && !(inSearch && q)) { e.preventDefault(); setHelp(true); }
      else if ((e.key === '+' || e.key === '-') && inSearch && !q && lineAt) {
        e.preventDefault();
        if (e.key === '-' && lineAt.qty <= stepOf(lineAt)) removeLines([lineAt.id]); else setCount(lineAt, lineAt.qty / stepOf(lineAt) + (e.key === '+' ? 1 : -1));
      }
      else if (e.key === 'Delete' && (inSearch && !q || !typing) && lineAt) { e.preventDefault(); removeLines([lineAt.id]); setCursor(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Premium UI (Midnight Pro): F5 charges the sale while it has lines (F9 too). With an empty sale F5 refreshes as usual;
  // Shift+F5 always reloads.
  useEffect(() => {
    const onF5 = (e) => {
      if (e.key !== 'F5' || e.shiftKey || e.ctrlKey || document.documentElement.dataset.palette !== 'midnight-pro' || !cart.length || document.querySelector('.modal-bg')) return;
      e.preventDefault(); e.stopImmediatePropagation(); checkout();
    };
    window.addEventListener('keydown', onF5, true);
    return () => window.removeEventListener('keydown', onF5, true);
  });
  // Advanced: Ctrl+K / Cmd+K opens the till's command bar (instead of the app-wide search, which stays one click away)
  useEffect(() => {
    if (!useAdvancedLayout) return undefined;
    const onK = (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || document.querySelector('.modal-bg')) return;
      e.preventDefault(); e.stopImmediatePropagation(); setOmni(true);
    };
    window.addEventListener('keydown', onK, true);
    return () => window.removeEventListener('keydown', onK, true);
  }, [useAdvancedLayout]);

  return (
    <div className={'pos lay-' + (layout === 'standard' ? 'std' : layout === 'advanced' ? 'adv' : 'classic')}>
      {/* wide screens only (CSS): client & loyalty */}
      {layout !== 'classic' && (
      <aside className="pos-side" aria-label="Client">
        {capture !== 'off' && (
          <div className="card pos-client accent-teal">
            <h3><Users size={16} /> Client</h3>
            <div className="pos-client-find">
              <Search size={15} aria-hidden="true" />
              <input ref={custRef} value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Find client: name or phone" aria-label="Find client"
                onKeyDown={(e) => { if (e.key === 'Enter' && custMatches[0]) { e.preventDefault(); pickCustomer(custMatches[0].id); } else if (e.key === 'Escape') { setCustQ(''); focusSearch(); } }} />
              <kbd className="kbd-mini">Alt+C</kbd>
            </div>
            {custFind && (
              <div className="pos-client-list" role="listbox" aria-label="Clients found">
                {custMatches.map((c) => <button key={c.id} type="button" role="option" aria-selected={c.id === customerId} onClick={() => pickCustomer(c.id)}><strong>{c.name}</strong>{c.phone && <small className="muted">{c.phone}</small>}</button>)}
                {!custMatches.length && <small className="muted">No client matches “{custQ.trim()}”</small>}
              </div>
            )}
            <div className="pos-client-now">
              <strong>{customer && customer.id !== 'walk-in' ? customer.name : 'Walk-in customer'}</strong>
              {customer?.phone && customer.id !== 'walk-in' && <small className="muted">{customer.phone}</small>}
              <div className="cust-badges">{custBadges.map((b) => <span key={b.k + b.text} className={'cust-badge cust-' + b.k}>{b.text}</span>)}</div>
              {customer && customer.id !== 'walk-in' && <button type="button" className="link-btn small" onClick={() => pickCustomer('walk-in')}>Back to walk-in</button>}
            </div>
          </div>
        )}
      </aside>
      )}
      <section className="pos-products">
        <div className="row between gap">
          <h2 className="pos-title"><ShoppingCart size={22} /> Point of sale</h2>
          <div className="row gap">
            {features.wholesale !== false && can('pos.wholesale') && (
              <div className="mode-switch">
                <Link to="/pos" className={!wholesale ? 'on' : ''}>Retail <kbd>F2</kbd></Link>
                <Link to="/pos/wholesale" className={wholesale ? 'on' : ''}>Wholesale <kbd>F3</kbd></Link>
              </div>
            )}
            <label className="pos-layout" title="How the till is laid out on this device (wide screens)">
              <LayoutGrid size={15} aria-hidden="true" />
              <select value={layout} onChange={(e) => setLayout(e.target.value)} aria-label="Till layout">
                {POS_LAYOUTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            {useAdvancedLayout && <button className="icon-btn" title="Command bar (Ctrl+K)" aria-label="Command bar" onClick={() => setOmni(true)}><Command size={18} /></button>}
            <button className="icon-btn" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Keyboard size={19} /></button>
          </div>
        </div>
        <PageTip id="pos" title="Selling quickly">
          {touch ? 'Tap a medicine to add it. The sale waits at the bottom with the total and Charge; tap it to see the lines, swipe a line left to remove it. The camera button scans barcodes.'
            : 'Type or scan to add, ↑↓←→ and Enter to pick. Alt+H holds a sale while you serve the next customer, F9 charges. Press ? for every shortcut.'}
        </PageTip>
        <div className="row gap search-row">
          <div ref={searchRef} onKeyDown={onSearchKey} className="grow">
            <SearchBox big value={q} onChange={setQ} placeholder={touch ? "Search medicine or scan barcode…" : "Search medicine or scan barcode…  (F8)"} />
          </div>
          <CameraButton className="btn ghost big cam-btn" onClick={() => setCam(true)} />
        </div>
        <div className="chips-row" role="toolbar" aria-label="Filter medicines">
          {[['', 'All'], ['instock', 'In stock'], ['recent', 'Recent'], ['fav', `Favourites${favs.size ? ` · ${favs.size}` : ''}`]].map(([k, label]) => (
            <button key={k || 'all'} className={'chip view-chip' + (view === k ? ' active' : '')} aria-pressed={view === k} onClick={() => setView(k)}>{k === 'fav' && <Star size={12} />}{label}</button>
          ))}
        </div>
        {categories.length > 1 && (
          <div className="chips-row">
            <button className={'chip' + (!category ? ' active' : '')} onClick={() => setCategory('')}>All categories</button>
            {categories.map((c) => <button key={c} className={'chip' + (category === c ? ' active' : '')} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
          </div>
        )}
        <div className="product-grid" ref={gridRef}>
          {results.map((p, i) => {
            const d = p.expiry ? daysUntil(p.expiry) : 999;
            return (
              <div key={p.id} className="product-wrap">
              <button className={'product' + (p.stock <= 0 ? ' disabled' : '') + (i === active && !touch ? ' active' : '')} onClick={() => add(p)} onMouseEnter={() => setActive(i)}
                aria-label={`${p.name}${p.generic ? ', ' + p.generic : ''}${p.form ? ', ' + p.form : ''}. ${fmt(priceOf(p))} per ${(p.unit || 'unit').toLowerCase()}. ${p.stock <= 0 ? 'Out of stock' : formatQty(p.stock, (p.unit || 'unit').toLowerCase() + 's') + ' in stock'}`}>
                <strong>{p.name.replace(/\//g, '/\u200b')}</strong>
                <small className="muted">{[p.generic, p.form].filter(Boolean).join(' · ')}</small>
                <div className="row between">
                  <span className="price">{fmt(priceOf(p))}<small className="per-unit"> / {(p.unit || 'unit').toLowerCase()}</small></span>
                  <span className={'small stock-tag ' + (p.stock <= 0 ? 'text-danger out' : p.stock <= (p.reorder || 0) ? 'text-warn low' : 'muted')}>{p.stock <= 0 ? 'Out of stock' : `${formatQty(p.stock)} left`}</span>
                </div>
                <div className="tags">
                  {p.rx && <span className="badge">Rx</span>}
                  {p.controlled && <span className="badge danger">CD</span>}
                  {d < 0 && <span className="badge danger">Expired</span>}
                  {d >= 0 && d <= warn && <span className="badge warn">Exp {d}d</span>}
                  {packsOf(p.id).length > 0 && <span className="badge pack-badge">{packsOf(p.id).map((k) => `1 ${k.name.toLowerCase()} = ${k.size} ${(p.unit || 'unit').toLowerCase()}s`).join(' · ')}</span>}
                </div>
              </button>
              <button type="button" className={'fav-btn' + (favs.has(p.id) ? ' on' : '')} aria-pressed={favs.has(p.id)} aria-label={(favs.has(p.id) ? 'Remove ' : 'Add ') + p.name + (favs.has(p.id) ? ' from favourites' : ' to favourites')} title={favs.has(p.id) ? 'Favourite' : 'Add to favourites'} onClick={() => toggleFav(p.id)}><Star size={14} /></button>
              </div>
            );
          })}
          {!results.length && (
            <div className="cart-empty" style={{ gridColumn: '1/-1' }}><ScanBarcode size={36} /><span>{q ? `No medicines match “${q}”` : view === 'fav' ? 'No favourites yet: tap the star on a medicine to keep it here' : view === 'recent' ? 'Nothing sold at this branch yet' : 'No medicines here'}</span></div>
          )}
        </div>
      </section>

      {!narrow && cart.length > 0 && !cartInView && (
        <button className="cart-bar" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <ShoppingCart size={18} />
          <span className="grow">{items} item{items === 1 ? '' : 's'} · <strong>{fmt(total)}</strong></span>
          <span className="cart-bar-cta">Review & charge</span>
        </button>
      )}

      {narrow && sheet && <div className="sheet-bg" onClick={() => setSheet(false)} aria-hidden="true" />}
      <section className={'pos-cart card' + (narrow ? ' sheet' + (sheet ? ' open' : '') : '')} ref={cartRef}>
        {narrow && (
          <div className="sheet-handle" role="button" tabIndex={0} aria-expanded={sheet} aria-label={sheet ? 'Hide the sale' : 'Show the sale'} onClick={() => setSheet((x) => !x)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSheet((x) => !x)}>
            <ShoppingCart size={18} />
            <span className="grow"><strong>{items ? `${items} item${items === 1 ? '' : 's'}` : 'No items yet'}</strong>{held.length > 0 && <small className="muted"> · {held.length} on hold</small>}<br /><span className="sheet-total bump" key={total}>{fmt(total)}</span></span>
            <button className="btn primary" disabled={!cart.length} onClick={(e) => { e.stopPropagation(); if (!sheet) setSheet(true); checkout(); }}>Charge</button>
          </div>
        )}
        <div className="pos-ledger">
        <div className="cart-head">
          <h3>Current sale {items > 0 && <span className="badge bump" key={items}>{items} item{items === 1 ? '' : 's'}</span>}</h3>
          {cart.length > 0 && (
            <div className="row gap cart-tools">
              {cart.length > 1 && <label className="check small" title="Tick every line"><input type="checkbox" checked={picked.size === cart.length} onChange={(e) => setPicked(e.target.checked ? new Set(cart.map((l) => l.id)) : new Set())} /><span>All</span></label>}
              {picked.size > 0
                ? <button className="btn sm danger" onClick={() => removeLines([...picked])}><Trash2 size={14} />Remove {picked.size === 1 ? 'item' : `${picked.size} items`}</button>
                : <button className="btn sm ghost" onClick={() => { setCart([]); setPicked(new Set()); }}><Trash2 size={14} />Clear all</button>}
            </div>
          )}
        </div>
        <div className="sale-tabs" role="tablist" aria-label="Sales">
          <button role="tab" aria-selected="true" className="sale-tab on"><ShoppingCart size={13} />{cart.length ? `Now · ${fmt(total)}` : 'New sale'}</button>
          {held.map((h, i) => (
            <span key={h.id} className="sale-tab-wrap">
              <button role="tab" aria-selected="false" className="sale-tab" title={`Carry on with this sale${i === 0 ? ' (Alt+→)' : i === held.length - 1 ? ' (Alt+←)' : ''}`} onClick={() => resumeSale(h.id)}>
                <PauseCircle size={13} />{heldLabel(h)} · {fmt(heldTotal(h))}
              </button>
              <button className="sale-tab-x" aria-label={`Discard held sale ${heldLabel(h)}`} title="Discard this held sale" onClick={async () => { if (await ask({ title: 'Discard this held sale?', message: `${h.cart.length} item(s) · ${fmt(heldTotal(h))}`, confirmText: 'Discard', danger: true })) update((d) => { del(d, 'drafts', h.id); audit(d, user, 'Draft discarded', `Held sale "${heldLabel(h)}" (${h.cart.length} items, ${fmt(heldTotal(h))})`, branchId); }).catch((e) => toast(e.message, 'error')); }}><X size={11} /></button>
            </span>
          ))}
          <button className="sale-tab add" disabled={!cart.length} title="Put this sale on hold and start another (Alt+H)" onClick={holdSale}><Plus size={13} />Hold &amp; new</button>
        </div>
        {capture !== 'off' && (
          <div className="row gap">
            <select className="grow" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Client">
              {db.customers.map((c) => <option key={c.id} value={c.id}>{c.id === 'walk-in' ? (capture === 'required' ? '— choose a client —' : 'Walk-in (no client details)') : `${c.name}${c.phone ? ' · ' + c.phone : ''}`}</option>)}
            </select>
            {can('customers') && <button className="btn ghost" title="Add a new client" onClick={() => setNewClient({ name: '', phone: '', allergies: '' })}><UserPlus size={16} /></button>}
          </div>
        )}
        {customer?.allergies && <div className="error"><AlertTriangle size={14} /> Allergies: {customer.allergies}</div>}
        <div className="cart-lines">
          {cart.map((l) => (
            <div key={l.id} style={swipe?.id === l.id && swipe.dx < 0 ? { transform: `translateX(${swipe.dx}px)`, opacity: Math.max(0.35, 1 + swipe.dx / 220) } : undefined}
              onTouchStart={(e) => setSwipe({ id: l.id, x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0 })}
              onTouchMove={(e) => setSwipe((w) => { if (!w || w.id !== l.id) return w; const dx = e.touches[0].clientX - w.x0, dy = e.touches[0].clientY - w.y0; return Math.abs(dx) > Math.abs(dy) ? { ...w, dx: Math.min(0, dx) } : { ...w, dx: 0 }; })}
              onTouchEnd={() => { if (swipe?.id === l.id && swipe.dx < -90) removeLines([l.id]); setSwipe(null); }}
              className={'cart-line' + (pulse[l.id] ? (pulse[l.id] % 2 ? ' pulse-a' : ' pulse-b') : '') + (picked.has(l.id) ? ' picked' : '') + (cart.length > 1 && lineAt?.id === l.id && cursor >= 0 ? ' cursor' : '')} onClick={() => setCursor(cart.indexOf(l))}>
              {useAdvancedLayout && <span className="line-num" aria-label={`Line ${cart.indexOf(l) + 1}`}>{cart.indexOf(l) + 1}</span>}
              <input type="checkbox" className="line-check" checked={picked.has(l.id)} onChange={() => togglePick(l.id)} aria-label={`Select ${l.name}`} />
              <div className="grow"><strong>{l.name}</strong>{l.rx && <span className="badge">Rx</span>}
                {Number(l.price) < (l.cost || 0) && <small className="text-danger below-cost"> below cost{can('reports') ? ` (${fmt(l.cost)})` : ''}</small>}
                <small className="muted">
                  {packsOf(l.id).length > 0 && (
                    <select className="pack-select" value={l.pack?.name || ''} onChange={(e) => choosePack(l, e.target.value)} aria-label="Sell by">
                      <option value="">{products.find((p) => p.id === l.id)?.unit || 'Unit'}</option>
                      {packsOf(l.id).map((k) => <option key={k.name} value={k.name}>{k.name} ({k.size})</option>)}
                    </select>
                  )}
                  @ {l.pack
                    ? <input className="price-input" type="number" step="any" aria-label="Pack price" disabled={!can('pos.price_edit')} value={Math.round(l.price * l.pack.size * 100) / 100} onChange={(e) => setLine(l.id, { price: Number(e.target.value) / l.pack.size, pack: { ...l.pack, price: Number(e.target.value) } })} />
                    : <input className="price-input" type="number" step="any" aria-label="Unit price" disabled={!can('pos.price_edit')} value={l.price} onChange={(e) => setLine(l.id, { price: e.target.value })} />}
                </small>
                <div className="line-tools">
                  <button className={'link-btn small' + (l.directions ? ' text-ok' : '')} title={l.directions ? 'Directions ✓' : 'Directions / label'} onClick={() => setLabelFor(l)}><Tag size={12} />{l.directions ? 'Directions ✓' : 'Directions / label'}</button>
                  {features.drugInfo !== false && <button className="link-btn small" title="Drug info" onClick={() => setInfoFor(products.find((p) => p.id === l.id) || l)}><BookMarked size={12} />Drug info</button>}
                </div>
              </div>
              <div className="qty">
                <button onClick={() => (l.qty > stepOf(l) ? setCount(l, l.qty / stepOf(l) - 1) : removeLines([l.id]))} aria-label="Less">−</button>
                <input type="number" min="1" value={l.qty / stepOf(l)} onChange={(e) => setCount(l, e.target.value)} aria-label="Quantity" />
                <button onClick={() => setCount(l, l.qty / stepOf(l) + 1)} aria-label="More">+</button>
              </div>
              <span className="num line-total">{fmt(l.price * l.qty)}</span>
              <button className="icon-btn line-remove" title={`Remove ${l.name}`} aria-label={`Remove ${l.name}`} onClick={() => removeLines([l.id])}><X size={15} /></button>
            </div>
          ))}
          {!cart.length && <div className="cart-empty"><ShoppingCart size={40} /><span>Tap a medicine or scan a barcode to start a sale</span></div>}
        </div>
        </div>
        <div className="pos-pay">
        <div className="totals">
          <div className="row between gap"><span className="muted">Subtotal <b className="num">{fmt(subtotal)}</b></span>
            <span className="row gap"><span className="muted">Discount</span><input ref={discRef} aria-label="Discount" type="number" min="0" step="any" className="small-input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></span></div>
          {layout !== 'classic' && disc > 0 && <div className="row between promo-row"><span className="muted">Promos / member discount</span><span className="num">− {fmt(disc)}</span></div>}
          {tax > 0 && <div className="row between"><span className="muted">Tax ({db.settings.taxRate}%)</span><span className="num">{fmt(tax)}</span></div>}
          <div className="row between grand"><span>Total{layout !== 'classic' && <small className="grand-sub">Net balance due</small>}</span><span className="num bump" key={total}>{fmt(total)}</span></div>
        </div>
        <div className="pay-methods">
          {methods.map((m, i) => <button key={m.id} className={'chip pay-' + (m.type || 'other') + (payment === m.name ? ' active' : '')} onClick={() => setPayment(m.name)} title={i < 9 ? `Alt+${i + 1}` : undefined}>{m.name}{i < 9 && !touch && <kbd>{i + 1}</kbd>}</button>)}
        </div>
        {(ptype === 'cash' || ptype === 'credit') && (
          <div className="row between tender-row">
            <label className="field grow"><span>{ptype === 'credit' ? 'Paid now (rest on credit)' : 'Amount tendered'}</span>
              <input type="number" step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} /></label>
            {ptype === 'cash'
              ? <div className="change">Change<br /><strong>{fmt(Math.max(change, 0))}</strong></div>
              : <div className="change">On credit<br /><strong className="text-warn">{fmt(Math.max(total - (Number(tendered) || 0), 0))}</strong></div>}
          </div>
        )}
        <div className="row gap pay-row">
          <button className="btn ghost" onClick={saveProforma} disabled={!cart.length} title="F10"><FileText size={16} />Proforma</button>
          <button className="btn ghost" onClick={holdSale} disabled={!cart.length} title="Alt+H"><PauseCircle size={16} />Hold</button>
          <button ref={chargeRef} className={'btn primary grow big' + (narrow ? ' charge-dup' : '')} onClick={checkout} disabled={!cart.length} title="F9"><span>{useAdvancedLayout ? 'Process checkout' : 'Charge'} {fmt(total)}{!touch && (layout !== 'classic' || premium) && <small className="kbd-sub">{premium ? '[F5]' : '[F9]'}</small>}</span></button>
        </div>
        </div>
      </section>

      {momo && (
        <Modal title={<><Smartphone size={18} /> Mobile Money – {fmt(total)}</>} onClose={() => { pollRef.current++; setMomo(null); }}>
          {momo.stage === 'waiting' ? (
            <div className="cart-empty">
              <Loader2 size={40} className="spin" />
              <strong>Waiting for the customer to approve on their phone…</strong>
              <span className="muted">They should see a prompt to enter their {momo.network === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} PIN.</span>
              <button className="btn ghost" onClick={() => { pollRef.current++; setMomo((m) => ({ ...m, stage: 'enter' })); }}>Cancel</button>
            </div>
          ) : momo.stage === 'paid' ? (
            <div className="cart-empty"><CheckCircle2 size={44} className="text-ok" /><strong>Payment received</strong></div>
          ) : (
            <div className="stack">
              <div className="form-grid">
                <label className="field"><span>Customer’s mobile money number</span>
                  <input autoFocus inputMode="tel" placeholder="07XX XXX XXX" value={momo.phone}
                    onChange={(e) => setMomo({ ...momo, phone: e.target.value, network: guessNetwork(normalizePhone(e.target.value)) })} /></label>
                <label className="field"><span>Network</span>
                  <select value={momo.network} onChange={(e) => setMomo({ ...momo, network: e.target.value })}>
                    <option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option>
                  </select></label>
              </div>
              {momo.error && <div className="error">{momo.error}</div>}
              {payCfg && !payCfg[momo.network] ? (
                // This network isn't connected on the cloud (e.g. Airtel): go straight to recording the customer's transaction ID
                <div className="notice info-notice">
                  {momo.network === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} isn't connected for automatic requests. Ask the customer to pay to your merchant number, then enter the transaction ID from their SMS below.
                </div>
              ) : (
                <button className="btn primary big" onClick={sendMomo} disabled={!syncCfg.url || !navigator.onLine}><Smartphone size={18} />Send payment request to phone</button>
              )}
              {!syncCfg.url && <small className="muted">Connect this device to the RxPOS cloud (Settings → Online sync) to send payment requests.</small>}
              {syncCfg.url && !navigator.onLine && <small className="muted">No internet: payment requests to the phone need it. If the customer pays to your merchant number, enter the transaction ID below; the receipt shows it as recorded by staff, not confirmed by the network.</small>}
              <div className="divider"><span>or the customer already paid</span></div>
              <div className="row gap">
                <input className="grow" placeholder="Transaction ID from the SMS" value={momo.manualRef} onChange={(e) => setMomo({ ...momo, manualRef: e.target.value })} />
                <button className="btn ghost" disabled={momo.manualRef.trim().length < 4}
                  onClick={() => finalize({ momo: { provider: momo.network, phone: normalizePhone(momo.phone), txid: momo.manualRef.trim(), manual: true } })}>Record payment</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {newClient && (
        <Modal title={<><UserPlus size={18} /> New client</>} onClose={() => setNewClient(null)}>
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            const c = { id: uid(), name: newClient.name.trim(), phone: newClient.phone.trim(), whatsapp: newClient.phone.trim(), allergies: newClient.allergies.trim() };
            update((d) => { put(d, 'customers', c); });
            setCustomerId(c.id); setNewClient(null); toast(`${c.name} added`);
          }}>
            <label className="field"><span>Name</span><input autoFocus required value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} /></label>
            <label className="field"><span>Phone / WhatsApp (optional)</span><input inputMode="tel" placeholder="07XX XXX XXX" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></label>
            <label className="field"><span>Allergies (optional)</span><input value={newClient.allergies} onChange={(e) => setNewClient({ ...newClient, allergies: e.target.value })} /></label>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setNewClient(null)}>Cancel</button><button className="btn primary">Add & select</button></div>
          </form>
        </Modal>
      )}

      {subs && (
        <Modal title={<><Repeat size={18} /> {subs.p.name} is out of stock</>} onClose={() => setSubs(null)}>
          <p className="muted">In-stock alternatives with the same active ingredient:</p>
          <div className="stack">
            {subs.list.map((x) => (
              <button key={x.id} className="product" onClick={() => { setSubs(null); add(x); }}>
                <strong>{x.name}</strong>
                <div className="row between"><span className="price">{fmt(priceOf(x))}</span><span className="muted small">{x.stock} in stock</span></div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {labelFor && (() => {
        const line = cart.find((l) => l.id === labelFor.id) || labelFor;
        const d = line.directions || { dose: '', freq: '', days: '', notes: [], patient: customer && customer.id !== 'walk-in' ? customer.name : '' };
        const setD = (patch) => setLine(line.id, { directions: { ...d, ...patch } });
        const WARN = ['Take after meals', 'Take before meals', 'May cause drowsiness. Do not drive', 'Complete the full course', 'Shake well before use', 'Keep in a fridge (2–8 °C)', 'Avoid alcohol', 'For external use only'];
        const text = [d.dose, d.freq, d.days && `for ${d.days} days`].filter(Boolean).join(' ');
        return (
          <Modal title={<><Tag size={18} /> Directions – {line.name}</>} onClose={() => setLabelFor(null)} wide>
            <div className="form-grid">
              <label className="field"><span>Dose</span><input list="dose-list" placeholder="e.g. 1 tablet" value={d.dose} onChange={(e) => setD({ dose: e.target.value })} /></label>
              <label className="field"><span>How often</span><input list="freq-list" placeholder="e.g. 3 times a day" value={d.freq} onChange={(e) => setD({ freq: e.target.value })} /></label>
              <label className="field"><span>For how many days</span><input type="number" min="0" value={d.days} onChange={(e) => setD({ days: e.target.value })} /></label>
              <label className="field"><span>Patient name</span><input value={d.patient} onChange={(e) => setD({ patient: e.target.value })} /></label>
            </div>
            <datalist id="dose-list">{['1 tablet', '2 tablets', '½ tablet', '1 capsule', '5 ml', '10 ml', '2.5 ml', '1 sachet', '2 drops', 'Apply thinly'].map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="freq-list">{['once a day', 'twice a day', '3 times a day', '4 times a day', 'every 8 hours', 'at night', 'when needed (max 4 times a day)'].map((x) => <option key={x} value={x} />)}</datalist>
            <div className="ref-links">{WARN.map((w) => <button key={w} type="button" className={'chip' + (d.notes.includes(w) ? ' active' : '')} onClick={() => setD({ notes: d.notes.includes(w) ? d.notes.filter((x) => x !== w) : [...d.notes, w] })}>{w}</button>)}</div>
            <div className="dispense-label print-area">
              <strong>{db.settings.name}</strong>{db.settings.phone && <span> · {db.settings.phone}</span>}
              <div className="dl-drug">{line.name} <span>× {line.qty}</span></div>
              <div className="dl-dir">{text || 'Directions…'}</div>
              {d.notes.length > 0 && <div className="dl-notes">{d.notes.join(' · ')}</div>}
              <div className="dl-foot"><span>{d.patient || 'Patient'}</span><span>{new Date().toLocaleDateString()}</span></div>
            </div>
            <div className="form-actions">
              <button className="btn ghost" onClick={() => { setLine(line.id, { directions: undefined }); setLabelFor(null); }}>Clear</button>
              <button className="btn ghost" onClick={() => window.print()}><Printer size={16} />Print label</button>
              <button className="btn primary" onClick={() => setLabelFor(null)}>Done</button>
            </div>
          </Modal>
        );
      })()}

      {infoFor && (
        <Modal title={<><BookMarked size={18} /> {infoFor.name}</>} onClose={() => setInfoFor(null)} wide>
          <DrugInfoPanel name={infoFor.name} generic={infoFor.generic} compact />
        </Modal>
      )}

      {cam && (
        <CameraScanner title="Scan items into the sale" onClose={() => { setCam(false); focusSearch(); }} onCode={(code) => {
          const p = products.find((x) => x.barcode && x.barcode === code);
          if (!p) return false;
          add(p);
          return `${p.name} added`;
        }} />
      )}

      {cdForm && (
        <Modal title={<><ClipboardList size={18} /> Controlled drug: register details</>} onClose={() => setCdForm(null)}>
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            cdRef.current = { patient: cdForm.patient.trim(), idNo: cdForm.idNo.trim(), prescriber: cdForm.prescriber.trim(), prescriberReg: cdForm.prescriberReg.trim(), rxNo: cdForm.rxNo.trim() };
            setCdForm(null); checkout();
          }}>
            <p className="muted small">{cart.filter(isCd).map((l) => `${l.name} × ${l.qty}`).join(', ')}: recorded in the controlled drugs register.</p>
            <div className="form-grid">
              <label className="field"><span>Patient's name</span><input autoFocus required value={cdForm.patient} onChange={(e) => setCdForm({ ...cdForm, patient: e.target.value })} /></label>
              <label className="field"><span>Patient's ID no. or phone</span><input required value={cdForm.idNo} onChange={(e) => setCdForm({ ...cdForm, idNo: e.target.value })} /></label>
              <label className="field"><span>Prescriber</span><input required value={cdForm.prescriber} onChange={(e) => setCdForm({ ...cdForm, prescriber: e.target.value })} placeholder="Dr …" /></label>
              <label className="field"><span>Prescriber's registration no.</span><input value={cdForm.prescriberReg} onChange={(e) => setCdForm({ ...cdForm, prescriberReg: e.target.value })} /></label>
              <label className="field"><span>Prescription no.</span><input required value={cdForm.rxNo} onChange={(e) => setCdForm({ ...cdForm, rxNo: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setCdForm(null)}>Cancel</button><button className="btn primary">Record &amp; continue</button></div>
          </form>
        </Modal>
      )}

      {help && (
        <Modal title={<><Keyboard size={18} /> POS shortcuts</>} onClose={() => { setHelp(false); focusSearch(); }}>
          <table className="keys">
            <tbody>
              {[['Type or scan', 'Find a medicine (barcode adds it straight away)'], ['↑ ↓ ← →', 'Move through the medicines'], ['Enter', 'Add the highlighted medicine'], ['Esc', 'Clear the search'],
                ['+ / −', 'More / fewer of the chosen cart line'], ['Alt+↑ / Alt+↓', 'Choose a cart line'], ['Delete', 'Remove the chosen cart line'],
                ['Alt+1 … Alt+9', 'Payment method (number shown on each)'], ['F9 or Ctrl+Enter', 'Charge (F5 too with Premium UI)'], ['F10', 'Save as proforma'],
                ['Alt+H', 'Put the sale on hold and serve the next customer'], ['Alt+← / Alt+→', 'Switch between held sales'],
                ['F2 / F3', 'Retail / wholesale'], ['Alt+C', 'Find a client (wide screens)'], ['Alt+D', 'Discount'], ['Alt+R', 'Last receipt again'], ['Ctrl+K', 'Advanced UI: command bar (+qty 2, void 2, disc 2 10, hold, pay)'], ['F8', 'Back to the search box'], ['Ctrl+K', 'Search everything'], ['?', 'This list']].map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}
            </tbody>
          </table>
        </Modal>
      )}

      {omni && <Omnibar cart={cart} products={products} onAdd={(p) => add(p)} run={runCommand} onClose={() => { setOmni(false); focusSearch(); }} fmt={fmt} />}
      {done && (
        <Modal title={done.proforma ? 'Proforma saved' : done.reprint ? 'Last receipt' : 'Sale complete ✓'} onClose={() => { setDone(null); focusSearch(); }}>
          {/* shown only here, after finalize() has recorded the sale */}
          {!done.proforma && (
            <div className="sale-success" aria-hidden="true">
              <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" /><path d="M15 27l7 7 15-16" /></svg>
              <strong className="num">{fmt(done.total)}</strong>
            </div>
          )}
          <Receipt sale={done} />
          {!done.proforma && <SendReceipt sale={done} />}
          <div className="form-actions no-print">
            <button className="btn ghost" onClick={() => { setDone(null); focusSearch(); }}>New sale</button>
            <ReceiptPdfButton sale={done} />
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}


/** Advanced UI command bar: type a command for a numbered line, or a medicine's name to add it. Keeps the keyboard inside. */
function Omnibar({ cart, products, onAdd, run, onClose, fmt }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef(null), box = useRef(null);
  useEffect(() => {
    input.current?.focus();
    // keep the keyboard inside the bar while it is open (adding a medicine elsewhere moves the cursor away)
    const keep = (e) => { if (box.current && !box.current.contains(e.target)) setTimeout(() => input.current?.focus(), 0); };
    document.addEventListener('focusin', keep);
    return () => document.removeEventListener('focusin', keep);
  }, []);
  const isCmd = /^([+-]\s?qty|qty|void|disc|hold|pay|checkout|charge)\b/i.test(text.trim());
  const found = useMemo(() => (!isCmd && text.trim().length >= 2 ? searchProducts(products, text).filter((p) => p.stock > 0).slice(0, 6) : []), [text, isCmd, products]);
  useEffect(() => setHi(0), [text]);
  const go = () => {
    if (!isCmd && found[hi]) { onAdd(found[hi]); setText(''); setMsg(`Added ${found[hi].name}`); return; }
    const err = run(text);
    if (err) setMsg(err); else { setMsg('Done'); setText(''); }
  };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(found.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Tab') { // trap the keyboard inside the bar
      const f = [...box.current.querySelectorAll('input, button')]; const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  };
  return (
    <div className="modal-bg omni-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="omni" role="dialog" aria-modal="true" aria-label="Command bar" ref={box} onKeyDown={key}>
        <div className="omni-input"><Command size={18} aria-hidden="true" />
          <input ref={input} value={text} onChange={(e) => { setText(e.target.value); setMsg(''); }} placeholder="+qty 2 · void 2 · disc 2 10 · disc 10 · hold · pay · or a medicine" aria-label="Command" />
          <kbd>Esc</kbd>
        </div>
        {found.length > 0 && (
          <div className="omni-list" role="listbox" aria-label="Medicines">
            {found.map((p, i) => <button key={p.id} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); setHi(i); onAdd(p); setText(''); setMsg(`Added ${p.name}`); }}><span>{p.name}</span><small className="muted">{fmt(p.price)} · {p.stock} in stock</small></button>)}
          </div>
        )}
        {msg && <div className={'omni-msg' + (/^(Done|Added)/.test(msg) ? ' ok' : ' warn')} role="status">{msg}</div>}
        <div className="omni-lines">
          {cart.length ? cart.map((l, i) => <span key={l.id}><b>{i + 1}</b> {l.name} × {l.pack ? `${l.qty / l.pack.size} ${l.pack.name.toLowerCase()}` : l.qty}</span>) : <span className="muted">No lines yet: type a medicine's name to add one.</span>}
        </div>
      </div>
    </div>
  );
}

/** After a sale: send the receipt to the customer by WhatsApp (free) or SMS (if set up). */
function SendReceipt({ sale }) {
  const { db, fmt, syncCfg } = useStore();
  const saved = db.customers.find((c) => c.id === sale.customerId);
  const [phone, setPhone] = useState(saved?.whatsapp || saved?.phone || '');
  const [smsReady, setSmsReady] = useState(false);
  const [sent, setSent] = useState('');
  useEffect(() => { if (syncCfg?.url && navigator.onLine) cloudConfig(syncCfg).then((c) => setSmsReady(!!c.sms)).catch(() => {}); }, [syncCfg]);
  const text = receiptText(sale, db.settings, fmt);
  const wa = normalizePhone(phone);
  const sms = async () => {
    try { await sendSms(syncCfg, [wa], text); setSent('sms'); toast('Receipt sent by SMS'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="send-receipt no-print">
      <span className="muted small">Send the receipt to the customer</span>
      <div className="row gap wrap">
        <input className="grow" inputMode="tel" placeholder="Customer phone e.g. 0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ minWidth: 180 }} />
        <a className={'btn sm ' + (wa.length >= 12 ? 'primary' : 'ghost disabled-link')} target="_blank" rel="noreferrer"
          href={wa.length >= 12 ? whatsappLink(wa, text) : undefined} onClick={() => wa.length >= 12 && setSent('wa')}><MessageCircle size={15} />WhatsApp</a>
        <button type="button" className="btn sm ghost" disabled={!smsReady || wa.length < 12} title={smsReady ? '' : 'SMS is not set up yet (Settings → Online & Mobile Money)'} onClick={sms}><MessageSquareText size={15} />SMS</button>
      </div>
      {sent && <span className="text-ok small">{sent === 'sms' ? '✓ Sent by SMS' : '✓ Opened WhatsApp with the receipt'}</span>}
    </div>
  );
}
