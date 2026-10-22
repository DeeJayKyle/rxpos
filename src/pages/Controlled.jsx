import { useState, useMemo, useRef } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { useStore, MAIN_BRANCH, downloadFile, toCSV } from '../store.jsx';
import { Tabs, Empty, PdfButton, SearchBox } from '../ui.jsx';

/**
 * Controlled drugs register: every movement of each controlled medicine at this branch with a running balance, and
 * for each sale the patient, prescriber and prescription recorded at the POS. Plus a batch recall lookup (any
 * medicine): which sales took stock from a batch, so the patients can be contacted.
 */
export default function Controlled() {
  const [tab, setTab] = useState('register');
  return (
    <div className="page">
      <div className="page-head"><div><h1>Controlled Drugs &amp; Recalls</h1><div className="sub">Every dose in and out with a running balance, plus a quick batch look-up for recalls</div></div></div>
      <Tabs tabs={[['register', 'Controlled drugs register'], ['recall', 'Batch recall lookup']]} value={tab} onChange={setTab} />
      {tab === 'register' ? <Register /> : <Recall />}
    </div>
  );
}

function Register() {
  const { db, products, branchId, branch } = useStore();
  const list = useMemo(() => products.filter((p) => p.controlled).sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const [id, setId] = useState(list[0]?.id || '');
  const ref = useRef(null);
  const p = list.find((x) => x.id === id);
  const saleBy = useMemo(() => new Map(db.sales.map((s) => [s.number, s])), [db.sales]);
  const batchName = useMemo(() => new Map(db.batches.map((b) => [b.id, b.batch])), [db.batches]);
  const lines = useMemo(() => {
    let bal = 0;
    return db.movements.filter((m) => m.productId === id && (m.branchId || MAIN_BRANCH) === branchId)
      .sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ ...m, bal: (bal += m.qty), sale: m.type === 'Sale' ? saleBy.get(m.ref) : null }));
  }, [db.movements, id, branchId, saleBy]);
  if (!list.length) return <div className="card"><Empty>No medicine is marked as a controlled drug. Tick "Controlled drug" on a medicine in the Medicine List.</Empty></div>;
  const rows = lines.slice().reverse();
  const csv = () => downloadFile(`register-${(p?.name || '').replace(/\W+/g, '-')}.csv`, toCSV(lines.map((m) => ({ date: m.date, type: m.type, reference: m.ref, batch: batchName.get(m.batchId) || '', in: m.qty > 0 ? m.qty : '', out: m.qty < 0 ? -m.qty : '', balance: m.bal,
    patient: m.sale?.controlled?.patient || '', patientId: m.sale?.controlled?.idNo || '', prescriber: m.sale?.controlled?.prescriber || '', prescriberReg: m.sale?.controlled?.prescriberReg || '', prescriptionNo: m.sale?.controlled?.rxNo || '', by: m.user }))), 'text/csv');
  return (
    <>
      <div className="row gap">
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Controlled medicine">{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <span className="muted small">{branch?.name} · balance now <strong>{p?.stock ?? 0}</strong></span>
        <span className="grow" />
        <button className="btn ghost" onClick={csv}>CSV</button>
        <PdfButton target={ref} title={`Controlled drugs register – ${p?.name || ''}`} subtitle={`${branch?.name || ''} · balance ${p?.stock ?? 0}`} />
      </div>
      <div className="card table-wrap" ref={ref}>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Batch</th><th>Patient · ID</th><th>Prescriber · prescription</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th><th>By</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((m) => {
              const c = m.sale?.controlled;
              return (
                <tr key={m.id}>
                  <td>{new Date(m.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{m.type}</td><td>{m.ref}{m.note ? ` (${m.note})` : ''}</td><td>{batchName.get(m.batchId) || '—'}</td>
                  <td>{c ? <>{c.patient}<br /><small className="muted">{c.idNo}</small></> : m.type === 'Sale' ? <span className="text-warn small">not recorded</span> : ''}</td>
                  <td>{c ? <>{c.prescriber}{c.prescriberReg ? ` (${c.prescriberReg})` : ''}<br /><small className="muted">Rx {c.rxNo}</small></> : ''}</td>
                  <td className="num text-ok">{m.qty > 0 ? m.qty : ''}</td><td className="num text-danger">{m.qty < 0 ? -m.qty : ''}</td><td className="num"><strong>{m.bal}</strong></td><td>{m.user}</td>
                </tr>
              );
            })}
            {!rows.length && <Empty colSpan={10}>No movements of this medicine at this branch yet</Empty>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Recall() {
  const { db, products, batchesOf, fmt } = useStore();
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const code = q.trim().toLowerCase();
  const name = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const batches = useMemo(() => (code.length < 2 ? [] : db.batches.filter((b) => String(b.batch || '').toLowerCase() === code)), [db.batches, code]);
  const ids = new Set(batches.map((b) => b.id));
  const sold = useMemo(() => db.sales.filter((s) => s.status !== 'refunded').flatMap((s) => s.items.flatMap((i) => (i.alloc || []).filter((a) => ids.has(a.batchId))
    .map((a) => ({ s, i, qty: a.qty, phone: db.customers.find((c) => c.id === s.customerId)?.phone || s.controlled?.idNo || '' })))), [db.sales, db.customers, code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="row gap"><SearchBox value={q} onChange={setQ} placeholder="Batch number, exactly as on the recall notice" big /><PdfButton target={ref} title={`Batch recall – ${q}`} subtitle={`${sold.length} sales`} /></div>
      <div ref={ref} className="stack">
        {code.length >= 2 && !batches.length && <div className="card"><Empty>No batch numbered “{q}”</Empty></div>}
        {batches.map((b) => (
          <div key={b.id} className="card">
            <h3><ShieldAlert size={17} /> {name.get(b.productId) || '—'} · batch {b.batch} · expiry {b.expiry || '—'}</h3>
            <p className="small muted">Still in stock here: <strong>{batchesOf(b.productId).find((x) => x.id === b.id)?.qty || 0}</strong> (take it off the shelf: Expiring / Expired → Return, or Returns to Supplier) · received {b.received || '—'}</p>
          </div>
        ))}
        {batches.length > 0 && (
          <div className="card table-wrap">
            <h3><Search size={16} /> Sold from this batch: {sold.length} sale{sold.length === 1 ? '' : 's'}</h3>
            <table>
              <thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Phone / ID</th><th>Medicine</th><th className="num">Qty</th><th className="num">Value</th></tr></thead>
              <tbody>
                {sold.map((r, n) => <tr key={n}><td>{new Date(r.s.date).toLocaleDateString()}</td><td>{r.s.number}</td><td>{r.s.controlled?.patient || r.s.customerName}</td><td>{r.phone}</td><td>{r.i.name}</td><td className="num">{r.qty}</td><td className="num">{fmt(r.qty * r.i.price)}</td></tr>)}
                {!sold.length && <Empty colSpan={7}>Nothing sold from this batch</Empty>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
