import { useEffect, useMemo, useState } from 'react';
import { BookMarked, ExternalLink, Printer, WifiOff, Search, AlertTriangle } from 'lucide-react';
import { useStore } from '../store.jsx';
import { idbGet, idbSet } from '../idb.js';
import { Empty } from '../ui.jsx';

// Dispensing information: live from the U.S. FDA drug label database (openFDA, public domain), cached for offline use,
// plus links to clinical references (Medscape, BNF, Drugs.com, …) that can't be copied into the app.
const SECTIONS = [
  ['indications_and_usage', 'Uses'],
  ['dosage_and_administration', 'Dosage & administration'],
  ['contraindications', 'Do not use when'],
  ['warnings_and_cautions', 'Warnings & precautions'],
  ['warnings', 'Warnings'],
  ['boxed_warning', 'Boxed warning'],
  ['adverse_reactions', 'Side effects'],
  ['drug_interactions', 'Interactions'],
  ['pregnancy', 'Pregnancy'],
  ['pediatric_use', 'Children'],
  ['geriatric_use', 'Elderly'],
  ['overdosage', 'Overdose'],
  ['storage_and_handling', 'Storage'],
  ['how_supplied', 'How supplied'],
];

/** "Amoxicillin 500mg Capsules" → "amoxicillin" (first ingredient words, no strengths or forms) */
export function genericKey(text) {
  return String(text || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)\b/g, ' ')
    .replace(/\b(tabs?|tablets?|caps?|capsules?|syrup|suspension|susp|inj|injection|cream|ointment|gel|drops?|eye|ear|sachet|vial|amp|ampoule|bottle|pack|strip|x\d+|forte|ds|plus)\b/g, ' ')
    .split(/[\/+,&]| and /)[0]
    .replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const REFERENCES = (q) => [
  ['Medscape', `https://search.medscape.com/reference-search?queryText=${encodeURIComponent(q)}`],
  ['Drugs.com', `https://www.drugs.com/search.php?searchterm=${encodeURIComponent(q)}`],
  ['BNF (NICE)', `https://bnf.nice.org.uk/search/?q=${encodeURIComponent(q)}`],
  ['DailyMed (US labels)', `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(q)}`],
  ['MedlinePlus (patients)', `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=${encodeURIComponent(q)}`],
  ['WHO Essential Medicines', `https://list.essentialmeds.org/?query=${encodeURIComponent(q)}`],
  ['Uganda Clinical Guidelines', 'https://www.health.go.ug/cause/uganda-clinical-guidelines-2023/'],
];

const clip = (s, n = 900) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + ' …' : t; };

async function fetchLabel(key) {
  const fields = ['openfda.generic_name', 'openfda.substance_name', 'openfda.brand_name'];
  for (const f of fields) {
    const url = `https://api.fda.gov/drug/label.json?search=${f}:"${encodeURIComponent(key)}"&limit=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error('The drug database answered ' + r.status);
    const j = await r.json();
    const doc = j.results?.[0];
    if (!doc) continue;
    return {
      key, fetchedAt: new Date().toISOString(),
      title: [doc.openfda?.generic_name?.[0], doc.openfda?.brand_name?.[0] && `(${doc.openfda.brand_name[0]})`].filter(Boolean).join(' '),
      route: doc.openfda?.route?.join(', ') || '', form: doc.openfda?.dosage_form?.[0] || '',
      sections: SECTIONS.map(([k, label]) => [label, doc[k]?.[0] ? clip(doc[k][0]) : '']).filter(([, v]) => v),
      source: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(key)}`,
    };
  }
  return null;
}

/** Reusable panel: dispensing information for one medicine (online → cached offline). */
export function DrugInfoPanel({ name, generic, compact }) {
  const key = genericKey(generic || name);
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    (async () => {
      const cached = await idbGet('drug:' + key).catch(() => null);
      if (cached && live) setState({ info: cached, cached: true, loading: navigator.onLine });
      if (!navigator.onLine) { if (live && !cached) setState({ offline: true }); return; }
      try {
        const info = await fetchLabel(key);
        if (!live) return;
        if (info) { idbSet('drug:' + key, info).catch(() => {}); setState({ info }); }
        else setState(cached ? { info: cached, cached: true } : { notFound: true });
      } catch (e) {
        if (live) setState(cached ? { info: cached, cached: true } : { error: e.message });
      }
    })();
    return () => { live = false; };
  }, [key]);

  const { info } = state;
  return (
    <div className="druginfo">
      {state.loading && !info && <div className="cart-empty"><div className="spinner" />Looking up {key}…</div>}
      {state.offline && <div className="notice info-notice"><WifiOff size={16} /> Offline, and this medicine hasn't been looked up before. Connect to the internet once to save its information on this device.</div>}
      {state.notFound && <div className="notice info-notice">No label found for “{key}” in the FDA database (common for local brands and sundries). Use the references below.</div>}
      {state.error && <div className="error">{state.error}</div>}
      {info && (
        <>
          <div className="row between">
            <div><strong className="druginfo-title">{info.title || key}</strong><div className="muted small">{[info.form, info.route].filter(Boolean).join(' · ')}</div></div>
            {state.cached && <span className="badge">saved {new Date(info.fetchedAt).toLocaleDateString()}</span>}
          </div>
          <div className="druginfo-sections">
            {(compact ? info.sections.filter(([l]) => ['Uses', 'Dosage & administration', 'Do not use when', 'Warnings & precautions', 'Warnings', 'Side effects', 'Interactions'].includes(l)) : info.sections).map(([label, text]) => (
              <details key={label} open={label === 'Dosage & administration' || label === 'Uses'}>
                <summary>{label}</summary>
                <p>{text}</p>
              </details>
            ))}
          </div>
          <p className="muted small"><AlertTriangle size={12} /> Summary of the U.S. FDA product label (openFDA, public domain). Always check local guidelines and the prescriber's instructions. <a href={info.source} target="_blank" rel="noreferrer">Full label</a></p>
        </>
      )}
      <div className="ref-links">
        {REFERENCES(key || name).map(([label, url]) => <a key={label} className="btn sm ghost" href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={12} /></a>)}
      </div>
    </div>
  );
}

export default function DrugInfo() {
  const { products } = useStore();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return products.filter((p) => `${p.name} ${p.generic}`.toLowerCase().includes(s)).slice(0, 12);
  }, [q, products]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Drug Information</h1><div className="sub"><BookMarked size={14} /> Dispensing information and clinical references, available offline once looked up</div></div>
        {picked && <button className="btn ghost" onClick={() => window.print()}><Printer size={16} />Print counselling sheet</button>}
      </div>
      <div className="card">
        <div className="search-wrap"><Search size={16} /><input className="search big" placeholder="Medicine or generic name, e.g. amoxicillin" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q.trim() && setPicked({ name: q.trim(), generic: q.trim() })} /></div>
        {matches.length > 0 && !picked && (
          <div className="ref-links" style={{ marginTop: 10 }}>
            {matches.map((p) => <button key={p.id} className="chip" onClick={() => { setPicked(p); setQ(p.name); }}>{p.name}</button>)}
            <button className="chip" onClick={() => setPicked({ name: q.trim(), generic: q.trim() })}>Search “{q.trim()}”</button>
          </div>
        )}
      </div>
      {picked ? (
        <div className="card print-area druginfo-print">
          <div className="row between no-print"><h3>{picked.name}</h3><button className="btn sm ghost" onClick={() => { setPicked(null); setQ(''); }}>New search</button></div>
          <DrugInfoPanel name={picked.name} generic={picked.generic} />
        </div>
      ) : <Empty>Type a medicine name above. The first lookup needs internet; after that it is saved on this device.</Empty>}
    </div>
  );
}
