import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, uid, now, daysUntil, put, move } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal } from '../ui.jsx';
import { Receipt } from './Sales.jsx';

const PAYMENTS = ['Cash', 'Mobile Money', 'Card', 'Bank Transfer', 'Insurance', 'Credit'];
// Receipt numbers must be unique across synced devices, so they are time-based rather than sequential
export const docNumber = (prefix) => prefix + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

export default function POS({ mode = 'retail' }) {
  const { db, products, update, user, fmt } = useStore();
  const location = useLocation();
  const wholesale = mode === 'wholesale';
  const priceOf = (p) => (wholesale ? p.wholesale || p.price : p.price);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('walk-in');
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('Cash');
  const [tendered, setTendered] = useState('');
  const [done, setDone] = useState(null);
  const searchRef = useRef();

  useEffect(() => searchRef.current?.focus(), []);

  // Load a proforma into the cart (from Proformas → "Sell")
  useEffect(() => {
    const pf = location.state?.proforma;
    if (!pf) return;
    setCart(pf.items.map((i) => ({ ...i, max: products.find((p) => p.id === i.id)?.stock ?? 0 })));
    setCustomerId(pf.customerId || 'walk-in');
    setDiscount(pf.discount || 0);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = products
    .filter((p) => !q || [p.name, p.generic, p.barcode, p.category].join(' ').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);

  const add = (p) => {
    if (p.stock <= 0) return alert(`${p.name} is out of stock.`);
    if (p.expiry && daysUntil(p.expiry) < 0 && !confirm(`${p.name} (batch ${p.batch}) has EXPIRED. Add anyway?`)) return;
    setCart((c) => {
      const line = c.find((l) => l.id === p.id);
      if (line) return c.map((l) => (l.id === p.id ? { ...l, qty: Math.min(l.qty + 1, p.stock) } : l));
      return [...c, { id: p.id, name: p.name, price: priceOf(p), cost: p.cost, qty: 1, max: p.stock, rx: p.rx }];
    });
    setQ('');
    searchRef.current?.focus();
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

  const checkout = () => {
    if (!cart.length) return;
    const credit = payment === 'Credit';
    if (credit && customerId === 'walk-in') return alert('Select a registered customer for a credit sale.');
    if (payment === 'Cash' && tendered !== '' && change < 0) return alert('Amount tendered is less than the total.');
    if (cart.some((l) => l.rx) && !confirm('This sale contains prescription-only medicine. Confirm a valid prescription was verified.')) return;
    const paid = credit ? Math.min(Number(tendered) || 0, total) : total;
    const sale = {
      id: uid(), number: docNumber('R'), date: now(), type: mode,
      items: cart.map(({ id, name, price, cost, qty }) => ({ id, name, price: Number(price), cost, qty })),
      subtotal, discount: disc, tax, total, payment, paid,
      tendered: payment === 'Cash' ? Number(tendered) || total : paid,
      bankId: payment === 'Cash' || credit ? CASH : db.settings.nonCashBankId || CASH,
      customerId, customerName: customer?.name || 'Walk-in Customer', cashier: user.name, status: 'completed',
    };
    update((d) => {
      put(d, 'sales', sale);
      sale.items.forEach((i) => move(d, { productId: i.id, qty: -i.qty, type: 'Sale', ref: sale.number, user: user.name }));
      const pf = location.state?.proforma;
      if (pf) put(d, 'proformas', { ...d.proformas.find((x) => x.id === pf.id), status: 'Converted', saleNumber: sale.number });
    });
    window.history.replaceState({}, '');
    setDone(sale);
    setCart([]); setDiscount(0); setTendered(''); setCustomerId('walk-in'); setPayment('Cash');
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
      if (e.key === 'F8') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); checkout(); }
      else if (e.key === 'F10') { e.preventDefault(); saveProforma(); }
      else if ((e.key === '+' || e.key === '-') && document.activeElement === searchRef.current && !q && cart.length) {
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
        <div className="row between">
          <h2 className="pos-title">{wholesale ? 'POS – Wholesale' : 'POS – Retail'}</h2>
          <span className="muted small">F8 search · F9 complete · F10 proforma · +/− quantity</span>
        </div>
        <input ref={searchRef} className="search big" placeholder="Search by name, generic, category or scan barcode…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
        <div className="product-grid">
          {results.map((p) => {
            const d = p.expiry ? daysUntil(p.expiry) : 999;
            return (
              <button key={p.id} className={'product' + (p.stock <= 0 ? ' disabled' : '')} onClick={() => add(p)}>
                <strong>{p.name}</strong>
                <small className="muted">{p.generic} · {p.form}</small>
                <div className="row between">
                  <span className="price">{fmt(priceOf(p))}</span>
                  <span className={p.stock <= (p.reorder || 0) ? 'text-warn' : 'muted'}>{p.stock} in stock</span>
                </div>
                <div className="tags">
                  {p.rx && <span className="badge">Rx</span>}
                  {d < 0 && <span className="badge danger">Expired</span>}
                  {d >= 0 && d <= (db.settings.expiryWarnDays || 90) && <span className="badge warn">Exp {d}d</span>}
                </div>
              </button>
            );
          })}
          {!results.length && <p className="empty">No medicines match “{q}”</p>}
        </div>
      </section>

      <section className="pos-cart card">
        <label className="field"><span>Customer</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {customer?.allergies && <div className="error">Allergies: {customer.allergies}</div>}
        <div className="cart-lines">
          {cart.map((l) => (
            <div key={l.id} className="cart-line">
              <div className="grow"><strong>{l.name}</strong>{l.rx && <span className="badge">Rx</span>}
                <small className="muted">@ <input className="price-input" type="number" step="any" value={l.price} onChange={(e) => setLine(l.id, { price: e.target.value })} /></small>
              </div>
              <input type="number" min="1" max={l.max} value={l.qty} onChange={(e) => setQty(l.id, e.target.value)} />
              <span className="num line-total">{fmt(l.price * l.qty)}</span>
              <button className="icon-btn" onClick={() => setCart(cart.filter((x) => x.id !== l.id))} aria-label="Remove">×</button>
            </div>
          ))}
          {!cart.length && <p className="empty">Click a medicine or scan a barcode to add it</p>}
        </div>
        <div className="totals">
          <div className="row between"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          <div className="row between"><span>Discount</span><input type="number" min="0" step="any" className="small-input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          {tax > 0 && <div className="row between"><span>Tax ({db.settings.taxRate}%)</span><span>{fmt(tax)}</span></div>}
          <div className="row between grand"><span>Total</span><span>{fmt(total)}</span></div>
        </div>
        <div className="pay-methods">
          {PAYMENTS.map((p) => <button key={p} className={'chip' + (payment === p ? ' active' : '')} onClick={() => setPayment(p)}>{p}</button>)}
        </div>
        {(payment === 'Cash' || payment === 'Credit') && (
          <div className="row between">
            <label className="field grow"><span>{payment === 'Credit' ? 'Amount paid now (rest on credit)' : 'Amount tendered'}</span>
              <input type="number" step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} /></label>
            {payment === 'Cash'
              ? <div className="change">Change<br /><strong>{fmt(Math.max(change, 0))}</strong></div>
              : <div className="change">On credit<br /><strong className="text-warn">{fmt(Math.max(total - (Number(tendered) || 0), 0))}</strong></div>}
          </div>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={() => setCart([])} disabled={!cart.length}>Clear</button>
          <button className="btn ghost" onClick={saveProforma} disabled={!cart.length} title="F10">Proforma</button>
          <button className="btn primary grow big" onClick={checkout} disabled={!cart.length} title="F9">Charge {fmt(total)}</button>
        </div>
      </section>

      {done && (
        <Modal title={done.proforma ? 'Proforma saved' : 'Sale complete'} onClose={() => setDone(null)}>
          <Receipt sale={done} />
          <div className="form-actions no-print">
            <button className="btn ghost" onClick={() => setDone(null)}>New sale</button>
            <button className="btn primary" onClick={() => window.print()}>Print</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
