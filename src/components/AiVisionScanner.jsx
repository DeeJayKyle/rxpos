// Vision AI scanner (POST /api/ai/vision): a supplier invoice for Add Stock (F4) or a prescription for the till (F2).
// Phone / tablet: the camera; desktop: choose or drop an image or PDF (each PDF page becomes an image on the device).
// What was read is matched to this pharmacy's medicines and shown for checking; nothing is saved or sold from here:
// onConfirm hands the checked lines to Add Stock's review or to the till's cart.
import { useMemo, useRef, useState } from 'react';
import { Camera, FileUp, Loader2, CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { useStore, daysUntil } from '../store.jsx';
import { aiVision } from '../cloud.js';
import { invoicePages, matchProduct } from '../invoiceScan.js';
import { matchMedicine } from '../pages/Scan.jsx';
import { expiryLevel } from '../fefo.js';
import { FefoPill } from './FefoPill.jsx';

const TITLES = { invoice: 'Scan Invoice with AI', prescription: 'Scan Prescription (Rx)' };

export default function AiVisionScanner({ mode, onClose, onConfirm }) {
  const { syncCfg, products, batchesOf, fmt } = useStore();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [read, setRead] = useState(null); // invoice: { lines } · prescription: { patient, prescriber, items }
  const camRef = useRef(), fileRef = useRef();
  const online = typeof navigator === 'undefined' || navigator.onLine;

  const scan = async (file) => {
    if (!file) return;
    setError(''); setRead(null);
    try {
      setBusy('Preparing the image…');
      const { pages } = await invoicePages(file);
      const use = mode === 'invoice' ? pages.slice(0, 6) : pages.slice(0, 1);
      const out = mode === 'invoice' ? { lines: [] } : null;
      for (let i = 0; i < use.length; i++) {
        setBusy(use.length > 1 ? `Reading page ${i + 1} of ${use.length}…` : 'Reading with AI…');
        const r = await aiVision(syncCfg, mode, use[i]);
        if (mode === 'invoice') out.lines.push(...(r.lines || []));
        else { setRead(withMatches(r)); setBusy(''); return; }
      }
      setRead(withMatches(out));
    } catch (e) { setError(e.message || String(e)); }
    setBusy('');
  };
  // each line matched to one of this pharmacy's medicines; ticked when it matched
  const withMatches = (r) => (mode === 'invoice'
    ? { lines: r.lines.map((l, i) => { const p = matchProduct(l.name, products); return { ...l, key: i, productId: p?.id || '', use: true }; }) }
    : { patient: r.patient || '', prescriber: r.prescriber || '', items: (r.items || []).map((it, i) => { const m = matchMedicine({ name: it.name }, products); const p = m.inStock[0] || m.alternatives?.[0]; return { ...it, key: i, productId: p?.id || '', use: !!p }; }) });
  const setLine = (key, patch) => setRead((r) => (mode === 'invoice' ? { ...r, lines: r.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) } : { ...r, items: r.items.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const rows = read ? (mode === 'invoice' ? read.lines : read.items) : [];
  const chosen = rows.filter((x) => x.use);
  // the earliest sellable batch of a medicine: what the till will sell first (FEFO)
  const firstBatch = useMemo(() => (id) => batchesOf(id).filter((b) => b.qty > 0 && (!b.expiry || daysUntil(b.expiry) >= 0)).sort((a, b) => String(a.expiry || '9').localeCompare(String(b.expiry || '9')))[0], [batchesOf]);

  return (
    <Modal wide title={TITLES[mode]} onClose={() => !busy && onClose()}>
      <div className="ai-scanner">
        {!online && <div className="error"><WifiOff size={14} /> Reading with AI needs the internet. Everything else keeps working offline.</div>}
        {!read && (
          <div className={'drop-zone' + (drag ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); scan(e.dataTransfer.files?.[0]); }}>
            {busy ? <p className="row gap"><Loader2 size={18} className="spin" />{busy}</p> : <>
              <p className="micro">{mode === 'invoice' ? 'Supplier invoice or delivery note' : 'Prescription (typed or handwritten)'}</p>
              <p className="muted small">Take a photo, or choose or drop an image or PDF here. A clear, flat, well-lit photo reads best.</p>
              <div className="row gap wrap center">
                <button type="button" className="btn primary" disabled={!online} onClick={() => camRef.current?.click()}><Camera size={16} />Take photo</button>
                <button type="button" className="btn ghost" disabled={!online} onClick={() => fileRef.current?.click()}><FileUp size={16} />Choose image or PDF</button>
              </div>
            </>}
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => scan(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => scan(e.target.files?.[0])} />
          </div>
        )}
        {error && <div className="error"><AlertTriangle size={14} /> {error}</div>}
        {read && mode === 'prescription' && (
          <div className="row gap wrap">
            <label className="field grow"><span>Patient</span><input value={read.patient} onChange={(e) => setRead({ ...read, patient: e.target.value })} /></label>
            <label className="field grow"><span>Prescriber</span><input value={read.prescriber} onChange={(e) => setRead({ ...read, prescriber: e.target.value })} /></label>
          </div>
        )}
        {read && (
          <div className="ai-lines">
            {!rows.length && <p className="muted">Nothing could be read. Try a clearer photo.</p>}
            {rows.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              const b = mode === 'prescription' && p ? firstBatch(p.id) : null;
              const exp = mode === 'invoice' ? l.expiry : b?.expiry;
              return (
                <div key={l.key} className={'ai-line bento-tile' + (l.use ? '' : ' off')}>
                  <label className="check"><input type="checkbox" checked={l.use} onChange={(e) => setLine(l.key, { use: e.target.checked })} aria-label={`Use ${l.name}`} /></label>
                  <div className="grow">
                    <span className="micro">Read: {l.name}</span>
                    <select value={l.productId} onChange={(e) => setLine(l.key, { productId: e.target.value })} aria-label={`Medicine for ${l.name}`}>
                      <option value="">{mode === 'invoice' ? '— new medicine (add it in Add Stock) —' : '— not matched —'}</option>
                      {p && <option value={p.id}>{p.name}</option>}
                      {products.filter((x) => x.id !== l.productId && (x.name.toLowerCase().includes(l.name.toLowerCase().split(' ')[0]) || (x.generic || '').toLowerCase().includes(l.name.toLowerCase().split(' ')[0]))).slice(0, 12).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    {mode === 'invoice' ? (
                      <div className="ai-fields">
                        <label><span className="micro">Batch</span><input value={l.batch} onChange={(e) => setLine(l.key, { batch: e.target.value })} /></label>
                        <label><span className="micro">Expiry</span><input type="date" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} /></label>
                        <label><span className="micro">Boxes</span><input type="number" min="0" className="num" value={l.boxes} onChange={(e) => setLine(l.key, { boxes: Number(e.target.value) || 0 })} /></label>
                        <label><span className="micro">Units / box</span><input type="number" min="1" className="num" value={l.unitsPerBox} onChange={(e) => setLine(l.key, { unitsPerBox: Math.max(1, Number(e.target.value) || 1) })} /></label>
                        <label><span className="micro">Unit cost (UGX)</span><input type="number" min="0" className="num" value={l.unitCostUGX} onChange={(e) => setLine(l.key, { unitCostUGX: Number(e.target.value) || 0 })} /></label>
                      </div>
                    ) : (
                      <div className="ai-fields">
                        <label><span className="micro">Quantity</span><input type="number" min="1" className="num" value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} /></label>
                        <label><span className="micro">Unit</span><select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })}><option value="tablet">Tablet</option><option value="strip">Strip</option><option value="box">Box</option></select></label>
                        {p && <span className="micro">{p.stock > 0 ? `${p.stock} in stock · ${fmt(p.price)}` : 'Out of stock'}{p.controlled ? ' · CD register' : p.rx ? ' · Rx' : ''}</span>}
                      </div>
                    )}
                  </div>
                  {exp && <FefoPill level={expiryLevel(exp)} expiry={exp} />}
                </div>
              );
            })}
          </div>
        )}
        {read && (
          <div className="row gap end modal-foot">
            <button className="btn ghost" onClick={() => setRead(null)}>Scan again</button>
            <button className="btn primary" disabled={!chosen.length} onClick={() => { onConfirm(mode === 'invoice' ? chosen : { ...read, items: chosen.filter((x) => x.productId) }); onClose(); }}>
              <CheckCircle2 size={16} />{mode === 'invoice' ? `Use ${chosen.length} line${chosen.length === 1 ? '' : 's'} in Add Stock` : `Add ${chosen.filter((x) => x.productId).length} to the sale`}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
