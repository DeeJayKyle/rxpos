import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImageUp, ScanText, ShoppingCart, ClipboardPlus, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useStore, uid, today, put, audit } from '../store.jsx';
import { Empty } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { aiPrescription } from '../cloud.js';

/** Shrink a photo to ≤1280 px JPEG so it uploads fast on mobile data */
export function shrinkPhoto(src, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('That file is not a photo'));
    img.src = src;
  });
}

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !['tablet', 'tablets', 'tabs', 'capsule', 'capsules', 'caps', 'syrup', 'suspension', 'cream', 'injection', 'drops'].includes(w));
const digits = (s) => (String(s || '').match(/\d+(\.\d+)?/g) || []).join(' ');

/** Match a prescribed medicine to the pharmacy's medicines: exact item in stock, same-generic alternatives, or not stocked */
export function matchMedicine(rx, products) {
  const ws = words(rx.name);
  if (!ws.length) return { inStock: [], alternatives: [], none: true };
  const strength = digits(rx.strength || rx.name);
  const score = (p) => {
    const hay = `${p.name} ${p.generic || ''}`.toLowerCase();
    let s = ws.filter((w) => hay.includes(w)).length / ws.length;
    if (strength && digits(p.name).includes(strength.split(' ')[0])) s += 0.5;
    return s;
  };
  const scored = products.map((p) => ({ p, s: score(p) })).filter((x) => x.s >= 0.99).sort((a, b) => b.s - a.s || b.p.stock - a.p.stock);
  const inStock = scored.filter((x) => x.p.stock > 0).map((x) => x.p).slice(0, 4);
  // alternatives: same generic name (word match on the generic), in stock
  const generics = new Set(scored.map((x) => words(x.p.generic)[0]).filter(Boolean));
  const alternatives = inStock.length ? [] : products.filter((p) => p.stock > 0 && generics.size && [...generics].some((g) => String(p.generic || '').toLowerCase().includes(g))).slice(0, 4);
  return { inStock, alternatives, none: !inStock.length && !alternatives.length, known: scored.length > 0 };
}

export default function Scan() {
  const { db, products, fmt, update, user, branchId, syncCfg } = useStore();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState({});
  const [camera, setCamera] = useState(false);
  const videoRef = useRef(null), streamRef = useRef(null);

  const stopCamera = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamera(false); };
  useEffect(() => stopCamera, []);
  const openCamera = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      setCamera(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play(); } }, 50);
    } catch { toast('Camera not available. Choose a photo instead.', 'warn'); }
  };
  const snap = async () => {
    const v = videoRef.current, c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    stopCamera();
    use(c.toDataURL('image/jpeg', 0.92));
  };
  const use = async (src) => { setResult(null); setPick({}); setPhoto(await shrinkPhoto(src)); };
  const fromFile = (f) => { const r = new FileReader(); r.onload = () => use(r.result).catch((e) => toast(e.message, 'error')); r.readAsDataURL(f); };

  const read = async () => {
    if (!navigator.onLine) return toast('Reading a prescription needs the internet.', 'warn');
    setBusy(true);
    try { setResult(await aiPrescription(syncCfg, photo)); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const matches = useMemo(() => (result?.medicines || []).map((m) => ({ rx: m, ...matchMedicine(m, products) })), [result, products]);
  useEffect(() => { const p = {}; matches.forEach((m, i) => { const first = m.inStock[0] || m.alternatives[0]; if (first) p[i] = first.id; }); setPick(p); }, [matches]);

  const toSale = () => {
    const items = Object.values(pick).filter(Boolean).map((id) => { const p = products.find((x) => x.id === id); return { id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1 }; });
    if (!items.length) return toast('Choose at least one medicine', 'warn');
    navigate('/pos', { state: { proforma: { items, customerId: 'walk-in', discount: 0 } } });
  };
  const saveRx = () => {
    const meds = (result.medicines || []).map((m) => [m.name, m.strength, m.form, m.dose, m.frequency, m.duration && `for ${m.duration}`].filter(Boolean).join(' ')).join('\n');
    update((d) => { put(d, 'prescriptions', { id: uid(), date: today(), status: 'Pending', doctor: result.prescriber || '', facility: result.facility || '', diagnosis: result.diagnosis || '', medications: meds, notes: `Read from a photo by AI and checked by ${user.name}. ${result.notes || ''}`.trim(), customerId: 'walk-in', refillsAllowed: 0, refillsUsed: 0 }); audit(d, user, 'Prescription scanned', `${result.medicines.length} medicines`, branchId); });
    toast('Saved in Prescriptions. Attach the patient there.');
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Scan a prescription</h1><div className="sub">Snap the prescription. RxPOS reads it, typed or handwritten, and shows what you have on the shelf or what could replace it</div></div></div>
      <div className="grid2">
        <div className="card stack">
          {camera ? (
            <>
              <video ref={videoRef} className="scan-video" playsInline muted />
              <div className="row gap"><button className="btn primary big" onClick={snap}><Camera size={18} />Take photo</button><button className="btn ghost" onClick={stopCamera}>Cancel</button></div>
            </>
          ) : photo ? (
            <>
              <img className="scan-photo" src={photo} alt="Prescription" />
              <div className="row gap wrap">
                <button className="btn primary" disabled={busy} onClick={read}>{busy ? <><Loader2 size={16} className="spin" />Reading…</> : <><ScanText size={16} />Read prescription</>}</button>
                <button className="btn ghost" onClick={() => { setPhoto(''); setResult(null); }}><RefreshCw size={16} />New photo</button>
              </div>
            </>
          ) : (
            <div className="scan-start">
              <ScanText size={48} />
              <p className="muted">Lay the prescription flat in good light and fill the frame.</p>
              <div className="row gap wrap">
                <label className="btn primary big"><Camera size={18} />Take a photo<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files[0] && fromFile(e.target.files[0])} /></label>
                {navigator.mediaDevices?.getUserMedia && <button className="btn ghost" onClick={openCamera}><Camera size={16} />Use this computer's camera</button>}
                <label className="btn ghost"><ImageUp size={16} />Choose a picture<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && fromFile(e.target.files[0])} /></label>
              </div>
            </div>
          )}
          <p className="muted small"><AlertTriangle size={12} /> AI can misread handwriting. A pharmacist must always check the prescription before dispensing.</p>
        </div>
        <div className="card stack">
          <h3>What it says</h3>
          {!result ? <Empty>{busy ? 'Reading the prescription…' : 'Take or choose a photo, then press “Read prescription”.'}</Empty> : (
            <>
              <div className="kv-list small">
                {result.patient && <span><b>Patient</b> {result.patient}</span>}
                {result.prescriber && <span><b>Prescriber</b> {result.prescriber}</span>}
                {result.facility && <span><b>Facility</b> {result.facility}</span>}
                {result.date && <span><b>Date</b> {result.date}</span>}
                {result.diagnosis && <span><b>Diagnosis</b> {result.diagnosis}</span>}
              </div>
              {matches.map((m, i) => (
                <div key={i} className={'rx-line ' + (m.inStock.length ? 'ok' : m.alternatives.length ? 'warn' : 'danger')}>
                  <div className="row gap">
                    {m.inStock.length ? <CheckCircle2 size={16} /> : m.alternatives.length ? <AlertTriangle size={16} /> : <XCircle size={16} />}
                    <strong className="grow">{m.rx.name} {m.rx.strength}{m.rx.unclear && <span className="badge warn">check</span>}</strong>
                  </div>
                  <small className="muted">{[m.rx.form, m.rx.dose, m.rx.frequency, m.rx.duration && `for ${m.rx.duration}`, m.rx.quantity && `qty ${m.rx.quantity}`].filter(Boolean).join(' · ')}</small>
                  {(m.inStock.length > 0 || m.alternatives.length > 0) ? (
                    <select value={pick[i] || ''} onChange={(e) => setPick({ ...pick, [i]: e.target.value })}>
                      <option value="">Don't add</option>
                      {m.inStock.length > 0 && <optgroup label="In stock">{m.inStock.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock} left · {fmt(p.price)}</option>)}</optgroup>}
                      {m.alternatives.length > 0 && <optgroup label="Alternatives in stock (same medicine)">{m.alternatives.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock} left · {fmt(p.price)}</option>)}</optgroup>}
                    </select>
                  ) : <small className="text-danger">{m.known ? 'Out of stock: no alternative in stock. Add it to the reorder list.' : 'Not in your medicine list.'}</small>}
                </div>
              ))}
              {!matches.length && <Empty>No medicines could be read. Try a clearer photo.</Empty>}
              <div className="row gap wrap">
                <button className="btn primary" onClick={toSale}><ShoppingCart size={16} />Add to a sale</button>
                <button className="btn ghost" onClick={saveRx}><ClipboardPlus size={16} />Save as prescription</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
