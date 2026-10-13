import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ShoppingCart, Trash2, FileText, Printer, AlertTriangle, ScanBarcode } from 'lucide-react';
import { useStore, uid, now, daysUntil, put, move } from '../store.jsx';
import { CASH } from '../finance.js';
import { Modal, SearchBox } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
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
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('walk-in');
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('Cash');
  const [tendered, setTendered] = useState('');
  const [done, setDone] = useState(null);
  const searchRef = useRef();
  const warn = db.settings.expiryWarnDays || 90;

  useEffect(() => { searchRef.current?.querySelector('input')?.focus(); }, []);
  const focusSearch = () => searchRef.current?.querySelector('input')?.focus();

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
    if (p.stock <= 0) return toast(`${p.name} is out of stock`, 'error');
    if (p.expiry && daysUntil(p.expiry) < 0 && !(await ask({ title: 'Expired medicine', message: `${p.name} (batch ${p.batch || '—'}) expired on ${p.expiry}. Add it anyway?`, confirmText: 'Add anyway', danger: true }))) return;
    const inCart = cart.find((l) => l.id === p.id);
    if (inCart && inCart.qty >= p.stock) return toast(`Only ${p.stock} ${p.name} in stock`, 'warn');
    setCart((c) => {
      const line = c.find((l) => l.id === p.id);
      if (line) return c.map((l) => (l.id === p.id ? { ...l, qty: Math.min(l.qty + 1, p.stock) } : l));
      return [...c, { id: p.id, name: p.name, price: priceOf(p), cost: p.cost, qty: 1, max: p.stock, rx: p.rx }];
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

  const checkout = async () => {
    if (!cart.length) return;
    const credit = payment === 'Credit';
    if (credit && customerId === 'walk-in') return toast('Select a registered customer for a credit sale', 'warn');
    if (payment === 'Cash' && tendered !== '' && change < 0) return toast('Amount tendered is less than the total', 'error');
    if (cart.some((l) => l.rx) && !(await ask({ title: 'Prescription-only medicine', message: 'Confirm that a valid prescription has been checked for the Rx items in this sale.', confirmText: 'Prescription verified' }))) return;
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

      <section className="pos-cart card">
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
          <button className="btn primary grow big" onClick={checkout} disabled={!cart.length} title="F9">Charge {fmt(total)}</button>
        </div>
      </section>

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
