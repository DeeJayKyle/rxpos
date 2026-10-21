import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ShoppingCart, Trash2, X, FileText, Printer, AlertTriangle, ScanBarcode, Smartphone, Loader2, CheckCircle2, UserPlus, Tag, BookMarked, Repeat, PauseCircle, Keyboard, Plus, ClipboardList } from 'lucide-react';
import { DrugInfoPanel, genericKey } from './DrugInfo.jsx';
import { useStore, uid, now, daysUntil, put, move, allocate, audit, normalizePhone, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, SearchBox, ReceiptPdfButton, PageTip } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { payRequest, payStatus, guessNetwork, cloudConfig } from '../cloud.js';
import { Receipt } from './Sales.jsx';
import { CameraButton, CameraScanner } from '../camscan.jsx';

// Receipt numbers must be unique across synced devices, so they are time-based rather than sequential
export const docNumber = (prefix) => prefix + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

export default function POS({ mode = 'retail' }) {
  const { db, products, update, user, fmt, batchesOf, branchId, syncCfg, features, can } = useStore();
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
  const [cart, setCart] = useState([]);
  const [picked, setPicked] = useState(() => new Set()); // lines ticked on the current sale
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeLines = (ids) => { const drop = new Set(ids); setCart((c) => c.filter((l) => !drop.has(l.id))); setPicked((s) => new Set([...s].filter((id) => !drop.has(id)))); };
  useEffect(() => { if (!cart.length && picked.size) setPicked(new Set()); }, [cart.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [customerId, setCustomerId] = useState('walk-in');
  const [discount, setDiscount] = useState(0);
  // Sales on hold (one per waiting customer) and the sale being rung up, kept on this device so a reload loses nothing
  const holdKey = `rxpos-pos:${syncCfg.tenant || 'device'}:${branchId}:${mode}`;
  const [held, setHeld] = useState(() => { try { return JSON.parse(localStorage.getItem(holdKey))?.held || []; } catch { return []; } });
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
      const cur = JSON.parse(localStorage.getItem(holdKey))?.current;
      if (cur?.cart?.length) loadSale(cur);
    } catch { /* nothing saved */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(holdKey, JSON.stringify({ held, current: cart.length ? snapshot() : null })); } catch { /* storage blocked */ }
    }, 250);
    return () => clearTimeout(t);
  }); // after every change

  // Load a proforma into the cart (from Proformas → "Sell")
  useEffect(() => {
    const pf = location.state?.proforma;
    if (!pf) return;
    setCart(pf.items.map((i) => ({ ...i, max: products.find((p) => p.id === i.id)?.stock ?? 0 })));
    setCustomerId(pf.customerId || 'walk-in');
    setDiscount(pf.discount || 0);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort().slice(0, 14), [products]);
  const ql = q.toLowerCase();
  const results = useMemo(() => products
    .filter((p) => (!category || p.category === category) && (!q || `${p.name} ${p.generic} ${p.barcode} ${p.category}`.toLowerCase().includes(ql)))
    .sort((a, b) => (b.stock > 0) - (a.stock > 0))
    .slice(0, 80), [products, category, q, ql]);
  useEffect(() => setActive(0), [q, category]);
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
    if (!allowExpired && (inCart?.qty || 0) >= sellable) {
      if (!(await ask({ title: 'Only expired stock left', message: `All remaining ${p.name} stock has expired. Sell expired stock anyway?`, confirmText: 'Sell expired', danger: true }))) return;
      allowExpired = true;
    }
    if (inCart && inCart.qty + (inCart.pack?.size || 1) > p.stock) return toast(`Only ${p.stock} ${p.unit || 'units'} of ${p.name} in stock`, 'warn');
    setCart((c) => {
      const line = c.find((l) => l.id === p.id);
      if (line) return c.map((l) => (l.id === p.id ? { ...l, allowExpired, qty: Math.min(l.qty + (l.pack?.size || 1), p.stock) } : l));
      return [...c, { id: p.id, name: p.name, price: priceOf(p), cost: p.cost, qty: 1, max: p.stock, rx: p.rx, controlled: !!p.controlled, allowExpired }];
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
    const packPrice = Number(k.price) || priceOf(p) * size;
    setLine(l.id, { pack: { name: k.name, size, price: packPrice }, price: packPrice / size, qty: size });
  };
  const subtotal = cart.reduce((a, l) => a + l.price * l.qty, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const tax = ((subtotal - disc) * (Number(db.settings.taxRate) || 0)) / 100;
  const total = subtotal - disc + tax;
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
  const holdSale = () => {
    if (!cart.length) return toast('Nothing to hold: the sale is empty', 'info');
    setHeld((h) => [...h, snapshot()]);
    clearSale(); focusSearch();
    toast('Sale on hold. Tap it above the sale to carry on.', 'info');
  };
  const resumeSale = (id) => {
    const x = held.find((h) => h.id === id);
    if (!x) return;
    setHeld((h) => [...h.filter((y) => y.id !== id), ...(cart.length ? [snapshot()] : [])]);
    loadSale(x); focusSearch();
  };
  // Alt+→ / Alt+←: go round the held sales (the current one goes on hold in its place)
  const cycleSale = (dir) => {
    if (!held.length) return;
    const x = dir > 0 ? held[0] : held[held.length - 1];
    const rest = dir > 0 ? held.slice(1) : held.slice(0, -1);
    const cur = cart.length ? [snapshot()] : [];
    setHeld(dir > 0 ? [...rest, ...cur] : [...cur, ...rest]);
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

  const finalize = (extra = {}) => {
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
      customerId, customerName: customer?.name || 'Walk-in Customer', cashier: user.name, status: 'completed', ...(cart.some(isCd) && cdRef.current ? { controlled: cdRef.current } : {}), ...extra,
    };
    update((d) => {
      put(d, 'sales', sale);
      for (const i of items) for (const a of i.alloc) move(d, { productId: i.id, qty: -a.qty, type: 'Sale', ref: sale.number, user: user.name, batchId: a.batchId, branchId });
      const pf = location.state?.proforma;
      if (pf) put(d, 'proformas', { ...d.proformas.find((x) => x.id === pf.id), status: 'Converted', saleNumber: sale.number });
      if (disc > 0) audit(d, user, 'Discount given', `${sale.number}: ${fmt(disc)}`, branchId);
    });
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
          return finalize({ momo: { provider: momo.network, phone, ref, txid: s.txid || '' } });
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
      if (done || momo || newClient || labelFor || infoFor || subs || cdForm || cam || help) return;
      const inSearch = e.target.tagName === 'INPUT' && searchRef.current?.contains(e.target);
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !inSearch;
      if (e.key === 'F8') { e.preventDefault(); focusSearch(); }
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

  return (
    <div className="pos">
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
        {categories.length > 1 && (
          <div className="chips-row">
            <button className={'chip' + (!category ? ' active' : '')} onClick={() => setCategory('')}>All</button>
            {categories.map((c) => <button key={c} className={'chip' + (category === c ? ' active' : '')} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
          </div>
        )}
        <div className="product-grid" ref={gridRef}>
          {results.map((p, i) => {
            const d = p.expiry ? daysUntil(p.expiry) : 999;
            return (
              <button key={p.id} className={'product' + (p.stock <= 0 ? ' disabled' : '') + (i === active && !touch ? ' active' : '')} onClick={() => add(p)} onMouseEnter={() => setActive(i)}>
                <strong>{p.name}</strong>
                <small className="muted">{[p.generic, p.form].filter(Boolean).join(' · ')}</small>
                <div className="row between">
                  <span className="price">{fmt(priceOf(p))}</span>
                  <span className={'small ' + (p.stock <= 0 ? 'text-danger' : p.stock <= (p.reorder || 0) ? 'text-warn' : 'muted')}>{p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}</span>
                </div>
                <div className="tags">
                  {p.rx && <span className="badge">Rx</span>}
                  {p.controlled && <span className="badge danger">CD</span>}
                  {d < 0 && <span className="badge danger">Expired</span>}
                  {d >= 0 && d <= warn && <span className="badge warn">Exp {d}d</span>}
                </div>
              </button>
            );
          })}
          {!results.length && (
            <div className="cart-empty" style={{ gridColumn: '1/-1' }}><ScanBarcode size={36} /><span>No medicines match “{q}”</span></div>
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
            <span className="grow"><strong>{items ? `${items} item${items === 1 ? '' : 's'}` : 'No items yet'}</strong>{held.length > 0 && <small className="muted"> · {held.length} on hold</small>}<br /><span className="sheet-total">{fmt(total)}</span></span>
            <button className="btn primary" disabled={!cart.length} onClick={(e) => { e.stopPropagation(); if (!sheet) setSheet(true); checkout(); }}>Charge</button>
          </div>
        )}
        <div className="cart-head">
          <h3>Current sale {items > 0 && <span className="badge">{items} item{items === 1 ? '' : 's'}</span>}</h3>
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
              <button className="sale-tab-x" aria-label={`Discard held sale ${heldLabel(h)}`} title="Discard this held sale" onClick={async () => { if (await ask({ title: 'Discard this held sale?', message: `${h.cart.length} item(s) · ${fmt(heldTotal(h))}`, confirmText: 'Discard', danger: true })) setHeld((x) => x.filter((y) => y.id !== h.id)); }}><X size={11} /></button>
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
              className={'cart-line' + (picked.has(l.id) ? ' picked' : '') + (cart.length > 1 && lineAt?.id === l.id && cursor >= 0 ? ' cursor' : '')} onClick={() => setCursor(cart.indexOf(l))}>
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
                  <button className={'link-btn small' + (l.directions ? ' text-ok' : '')} onClick={() => setLabelFor(l)}><Tag size={12} />{l.directions ? 'Directions ✓' : 'Directions / label'}</button>
                  {features.drugInfo !== false && <button className="link-btn small" onClick={() => setInfoFor(products.find((p) => p.id === l.id) || l)}><BookMarked size={12} />Drug info</button>}
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
        <div className="totals">
          <div className="row between gap"><span className="muted">Subtotal <b className="num">{fmt(subtotal)}</b></span>
            <span className="row gap"><span className="muted">Discount</span><input type="number" min="0" step="any" className="small-input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></span></div>
          {tax > 0 && <div className="row between"><span className="muted">Tax ({db.settings.taxRate}%)</span><span className="num">{fmt(tax)}</span></div>}
          <div className="row between grand"><span>Total</span><span className="num">{fmt(total)}</span></div>
        </div>
        <div className="pay-methods">
          {methods.map((m, i) => <button key={m.id} className={'chip' + (payment === m.name ? ' active' : '')} onClick={() => setPayment(m.name)} title={i < 9 ? `Alt+${i + 1}` : undefined}>{m.name}{i < 9 && !touch && <kbd>{i + 1}</kbd>}</button>)}
        </div>
        {(ptype === 'cash' || ptype === 'credit') && (
          <div className="row between">
            <label className="field grow"><span>{ptype === 'credit' ? 'Paid now (rest on credit)' : 'Amount tendered'}</span>
              <input type="number" step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} /></label>
            {ptype === 'cash'
              ? <div className="change">Change<br /><strong>{fmt(Math.max(change, 0))}</strong></div>
              : <div className="change">On credit<br /><strong className="text-warn">{fmt(Math.max(total - (Number(tendered) || 0), 0))}</strong></div>}
          </div>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={saveProforma} disabled={!cart.length} title="F10"><FileText size={16} />Proforma</button>
          <button className="btn ghost" onClick={holdSale} disabled={!cart.length} title="Alt+H"><PauseCircle size={16} />Hold</button>
          <button ref={chargeRef} className={'btn primary grow big' + (narrow ? ' charge-dup' : '')} onClick={checkout} disabled={!cart.length} title="F9">Charge {fmt(total)}</button>
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
                ['Alt+1 … Alt+9', 'Payment method (number shown on each)'], ['F9 or Ctrl+Enter', 'Charge'], ['F10', 'Save as proforma'],
                ['Alt+H', 'Put the sale on hold and serve the next customer'], ['Alt+← / Alt+→', 'Switch between held sales'],
                ['F2 / F3', 'Retail / wholesale'], ['F8', 'Back to the search box'], ['Ctrl+K', 'Search everything'], ['?', 'This list']].map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}
            </tbody>
          </table>
        </Modal>
      )}

      {done && (
        <Modal title={done.proforma ? 'Proforma saved' : 'Sale complete ✓'} onClose={() => { setDone(null); focusSearch(); }}>
          <Receipt sale={done} />
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
