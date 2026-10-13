import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ShoppingCart, Trash2, FileText, Printer, AlertTriangle, ScanBarcode, Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { useStore, uid, now, daysUntil, put, move, allocate, audit, normalizePhone } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, SearchBox } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { payRequest, payStatus, guessNetwork, cloudConfig } from '../cloud.js';
import { Receipt } from './Sales.jsx';

const PAYMENTS = ['Cash', 'Mobile Money', 'Card', 'Bank Transfer', 'Insurance', 'Credit'];
// Receipt numbers must be unique across synced devices, so they are time-based rather than sequential
export const docNumber = (prefix) => prefix + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

export default function POS({ mode = 'retail' }) {
  const { db, products, update, user, fmt, batchesOf, branchId, syncCfg } = useStore();
  const [momo, setMomo] = useState(null);
  const [payCfg, setPayCfg] = useState(null); // which mobile money networks the cloud has switched on
  const location = useLocation();
  const wholesale = mode === 'wholesale';
  const priceOf = (p) => (wholesale ? p.wholesale || p.price : p.price);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('walk-in');
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('Cash');
  const [tendered, setTendered] = useState('');
  const [done, setDone] = useState(null);
  const searchRef = useRef();
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

  const add = async (p) => {
    if (p.stock <= 0) return toast(`${p.name} is out of stock at ${branchName}`, 'error');
    // FEFO: sell from the earliest-expiring batch; expired batches are only used if the pharmacist confirms
    const sellable = batchesOf(p.id).filter((b) => b.qty > 0 && (!b.expiry || daysUntil(b.expiry) >= 0)).reduce((a, b) => a + b.qty, 0);
    const inCart = cart.find((l) => l.id === p.id);
    let allowExpired = inCart?.allowExpired || false;
    if (!allowExpired && (inCart?.qty || 0) >= sellable) {
      if (!(await ask({ title: 'Only expired stock left', message: `All remaining ${p.name} stock has expired. Sell expired stock anyway?`, confirmText: 'Sell expired', danger: true }))) return;
      allowExpired = true;
    }
    if (inCart && inCart.qty >= p.stock) return toast(`Only ${p.stock} ${p.name} in stock`, 'warn');
    setCart((c) => {
      const line = c.find((l) => l.id === p.id);
      if (line) return c.map((l) => (l.id === p.id ? { ...l, allowExpired, qty: Math.min(l.qty + 1, p.stock) } : l));
      return [...c, { id: p.id, name: p.name, price: priceOf(p), cost: p.cost, qty: 1, max: p.stock, rx: p.rx, allowExpired }];
    });
    setQ('');
    focusSearch();
  };

  const onSearchKey = (e) => {
    if (e.key === 'Escape') setQ('');
    if (e.key !== 'Enter') return;
    const exact = products.find((p) => p.barcode && p.barcode === q.trim());
    if (exact) add(exact);
    else if (results.length === 1) add(results[0]);
  };

  const setLine = (id, patch) => setCart((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setQty = (id, qty) => setCart((c) => c.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(Number(qty) || 1, l.max)) } : l)));
  const subtotal = cart.reduce((a, l) => a + l.price * l.qty, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const tax = ((subtotal - disc) * (Number(db.settings.taxRate) || 0)) / 100;
  const total = subtotal - disc + tax;
  const change = (Number(tendered) || 0) - total;
  const customer = db.customers.find((c) => c.id === customerId);
  const items = cart.reduce((a, l) => a + l.qty, 0);

  const branchName = db.branches.find((b) => b.id === branchId)?.name || 'this branch';

  const checkout = async () => {
    if (!cart.length) return;
    const credit = payment === 'Credit';
    if (credit && customerId === 'walk-in') return toast('Select a registered customer for a credit sale', 'warn');
    if (payment === 'Cash' && tendered !== '' && change < 0) return toast('Amount tendered is less than the total', 'error');
    if (cart.some((l) => l.rx) && !(await ask({ title: 'Prescription-only medicine', message: 'Confirm that a valid prescription has been checked for the Rx items in this sale.', confirmText: 'Prescription verified' }))) return;
    if (payment === 'Mobile Money') {
      const phone = normalizePhone(customer?.phone || '');
      if (syncCfg.url && navigator.onLine) cloudConfig(syncCfg).then(setPayCfg).catch(() => setPayCfg({}));
      return setMomo({ phone: customer?.phone || '', network: phone ? guessNetwork(phone) : 'mtn', stage: 'enter', ref: '', manualRef: '' });
    }
    finalize();
  };

  const finalize = (extra = {}) => {
    const credit = payment === 'Credit';
    const paid = credit ? Math.min(Number(tendered) || 0, total) : total;
    // Split each line across batches, earliest expiry first
    const items = cart.map(({ id, name, price, cost, qty, allowExpired }) => ({
      id, name, price: Number(price), cost, qty,
      alloc: allocate(batchesOf(id), qty, { allowExpired }).map(({ batchId, qty: q, batch, expiry }) => ({ batchId, qty: q, batch, expiry })),
    }));
    const sale = {
      id: uid(), number: docNumber('R'), date: now(), type: mode, branchId,
      items, subtotal, discount: disc, tax, total, payment, paid,
      tendered: payment === 'Cash' ? Number(tendered) || total : paid,
      bankId: payment === 'Cash' || credit ? CASH : db.settings.nonCashBankId || CASH,
      customerId, customerName: customer?.name || 'Walk-in Customer', cashier: user.name, status: 'completed', ...extra,
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
    setCart([]); setDiscount(0); setTendered(''); setCustomerId('walk-in'); setPayment('Cash');
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
    setCart([]); setDiscount(0);
  };

  // POS keyboard: F8 search, F9 / Ctrl+Enter complete, F10 proforma, +/- last item qty
  useEffect(() => {
    const onKey = (e) => {
      if (done) return;
      if (e.key === 'F8') { e.preventDefault(); focusSearch(); }
      else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); checkout(); }
      else if (e.key === 'F10') { e.preventDefault(); saveProforma(); }
      else if ((e.key === '+' || e.key === '-') && e.target.tagName === 'INPUT' && searchRef.current?.contains(e.target) && !q && cart.length) {
        e.preventDefault();
        const last = cart[cart.length - 1];
        setQty(last.id, last.qty + (e.key === '+' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pos">
      <section className="pos-products">
        <div className="row between gap">
          <h2 className="pos-title"><ShoppingCart size={22} /> Point of sale</h2>
          <div className="mode-switch">
            <Link to="/pos" className={!wholesale ? 'on' : ''}>Retail</Link>
            <Link to="/pos/wholesale" className={wholesale ? 'on' : ''}>Wholesale</Link>
          </div>
        </div>
        <div ref={searchRef} onKeyDown={onSearchKey}>
          <SearchBox big value={q} onChange={setQ} placeholder="Search medicine or scan barcode…  (F8)" />
        </div>
        {categories.length > 1 && (
          <div className="chips-row">
            <button className={'chip' + (!category ? ' active' : '')} onClick={() => setCategory('')}>All</button>
            {categories.map((c) => <button key={c} className={'chip' + (category === c ? ' active' : '')} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
          </div>
        )}
        <div className="product-grid">
          {results.map((p) => {
            const d = p.expiry ? daysUntil(p.expiry) : 999;
            return (
              <button key={p.id} className={'product' + (p.stock <= 0 ? ' disabled' : '')} onClick={() => add(p)}>
                <strong>{p.name}</strong>
                <small className="muted">{[p.generic, p.form].filter(Boolean).join(' · ')}</small>
                <div className="row between">
                  <span className="price">{fmt(priceOf(p))}</span>
                  <span className={'small ' + (p.stock <= 0 ? 'text-danger' : p.stock <= (p.reorder || 0) ? 'text-warn' : 'muted')}>{p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}</span>
                </div>
                <div className="tags">
                  {p.rx && <span className="badge">Rx</span>}
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

      {cart.length > 0 && !cartInView && (
        <button className="cart-bar" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <ShoppingCart size={18} />
          <span className="grow">{items} item{items === 1 ? '' : 's'} · <strong>{fmt(total)}</strong></span>
          <span className="cart-bar-cta">Review & charge</span>
        </button>
      )}

      <section className="pos-cart card" ref={cartRef}>
        <div className="cart-head">
          <h3>Current sale {items > 0 && <span className="badge">{items} item{items === 1 ? '' : 's'}</span>}</h3>
          {cart.length > 0 && <button className="btn sm ghost" onClick={() => setCart([])}><Trash2 size={14} />Clear</button>}
        </div>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
          {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {customer?.allergies && <div className="error"><AlertTriangle size={14} /> Allergies: {customer.allergies}</div>}
        <div className="cart-lines">
          {cart.map((l) => (
            <div key={l.id} className="cart-line">
              <div className="grow"><strong>{l.name}</strong>{l.rx && <span className="badge">Rx</span>}
                <small className="muted">@ <input className="price-input" type="number" step="any" aria-label="Unit price" value={l.price} onChange={(e) => setLine(l.id, { price: e.target.value })} /></small>
              </div>
              <div className="qty">
                <button onClick={() => (l.qty > 1 ? setQty(l.id, l.qty - 1) : setCart(cart.filter((x) => x.id !== l.id)))} aria-label="Less">−</button>
                <input type="number" min="1" max={l.max} value={l.qty} onChange={(e) => setQty(l.id, e.target.value)} aria-label="Quantity" />
                <button onClick={() => setQty(l.id, l.qty + 1)} aria-label="More">+</button>
              </div>
              <span className="num line-total">{fmt(l.price * l.qty)}</span>
            </div>
          ))}
          {!cart.length && <div className="cart-empty"><ShoppingCart size={40} /><span>Tap a medicine or scan a barcode to start a sale</span></div>}
        </div>
        <div className="totals">
          <div className="row between"><span className="muted">Subtotal</span><span className="num">{fmt(subtotal)}</span></div>
          <div className="row between"><span className="muted">Discount</span><input type="number" min="0" step="any" className="small-input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          {tax > 0 && <div className="row between"><span className="muted">Tax ({db.settings.taxRate}%)</span><span className="num">{fmt(tax)}</span></div>}
          <div className="row between grand"><span>Total</span><span className="num">{fmt(total)}</span></div>
        </div>
        <div className="pay-methods">
          {PAYMENTS.map((p) => <button key={p} className={'chip' + (payment === p ? ' active' : '')} onClick={() => setPayment(p)}>{p}</button>)}
        </div>
        {(payment === 'Cash' || payment === 'Credit') && (
          <div className="row between">
            <label className="field grow"><span>{payment === 'Credit' ? 'Paid now (rest on credit)' : 'Amount tendered'}</span>
              <input type="number" step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} /></label>
            {payment === 'Cash'
              ? <div className="change">Change<br /><strong>{fmt(Math.max(change, 0))}</strong></div>
              : <div className="change">On credit<br /><strong className="text-warn">{fmt(Math.max(total - (Number(tendered) || 0), 0))}</strong></div>}
          </div>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={saveProforma} disabled={!cart.length} title="F10"><FileText size={16} />Proforma</button>
          <button ref={chargeRef} className="btn primary grow big" onClick={checkout} disabled={!cart.length} title="F9">Charge {fmt(total)}</button>
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

      {done && (
        <Modal title={done.proforma ? 'Proforma saved' : 'Sale complete ✓'} onClose={() => { setDone(null); focusSearch(); }}>
          <Receipt sale={done} />
          <div className="form-actions no-print">
            <button className="btn ghost" onClick={() => { setDone(null); focusSearch(); }}>New sale</button>
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
