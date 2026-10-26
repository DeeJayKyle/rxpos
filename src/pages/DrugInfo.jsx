import { useEffect, useMemo, useState } from 'react';
import { BookMarked, ExternalLink, Printer, WifiOff, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { useStore } from '../store.jsx';
import { idbGet, idbSet } from '../idb.js';
import { Empty } from '../ui.jsx';
import { createDrugLookup, genericKey, lookupKeys } from '../druglabel.js';
import { searchProducts } from '../search.js';

// Dispensing information: from the U.S. FDA drug label database (openFDA, public domain), kept on the device for
// offline use (src/druglabel.js does the fast, cached, retried lookup), plus links to clinical references (Medscape,
// BNF, Drugs.com, …) that can't be copied into the app.
export { genericKey }; // used by the POS for substitutes
const lookup = createDrugLookup({ get: idbGet, set: idbSet });

const REFERENCES = (q) => [
  ['Medscape', `https://search.medscape.com/reference-search?queryText=${encodeURIComponent(q)}`],
  ['Drugs.com', `https://www.drugs.com/search.php?searchterm=${encodeURIComponent(q)}`],
  ['BNF (NICE)', `https://bnf.nice.org.uk/search/?q=${encodeURIComponent(q)}`],
  ['DailyMed (US labels)', `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(q)}`],
  ['MedlinePlus (patients)', `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=${encodeURIComponent(q)}`],
  ['WHO Essential Medicines', `https://list.essentialmeds.org/?query=${encodeURIComponent(q)}`],
  ['Uganda Clinical Guidelines', 'https://www.health.go.ug/cause/uganda-clinical-guidelines-2023/'],
];

/** Reusable panel: dispensing information for one medicine (online → cached offline). */
export function DrugInfoPanel({ name, generic, compact }) {
  // names to try, best first (generic, then brand); a name RxPOS can't simplify is tried as typed
  const keys = useMemo(() => { const k = lookupKeys(name, generic); const raw = String(generic || name || '').trim().toLowerCase(); return k.length ? k : raw.length >= 2 ? [raw] : []; }, [name, generic]);
  const key = keys[0] || '';
  const [state, setState] = useState(() => { const info = keys.map(lookup.peek).find(Boolean); return info ? { info } : { loading: true }; });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const show = (st) => live && setState(st);
    (async () => {
      if (!keys.length) return show({ notFound: true });
      // 1. what this device already knows: shown at once
      let known = null;
      for (const k of keys) { const s = await lookup.saved(k); if (s?.info) { known = s; break; } }
      if (known) show({ info: known.info, cached: true, refreshing: !known.fresh && navigator.onLine });
      if (known?.fresh && !retry) return; // recent enough: no network needed
      if (!navigator.onLine) return show(known ? { info: known.info, cached: true } : { offline: true });
      if (!known) show({ loading: true });
      // 2. the network (a lookup already on its way is shared; names known to be missing are skipped unless retrying)
      try {
        let info = null;
        for (const k of keys) {
          if (!retry && (await lookup.saved(k))?.miss) continue;
          info = await lookup.refresh(k);
          if (info) break;
        }
        show(info ? { info } : known ? { info: known.info, cached: true } : { notFound: true });
      } catch (e) {
        show(known ? { info: known.info, cached: true, warning: e.message } : { error: e.message });
      }
    })();
    return () => { live = false; }; // a late answer is ignored here but still saved for next time
  }, [keys.join('|'), retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const { info } = state;
  return (
    <div className="druginfo">
      {state.loading && !info && <div className="druginfo-skeleton" role="status" aria-label={`Looking up ${key}`}><i /><i /><i /><span className="muted small">Looking up {key}…</span></div>}
      {state.offline && <div className="notice info-notice"><WifiOff size={16} /> Offline, and this medicine hasn't been looked up before. Connect to the internet once to save its information on this device.</div>}
      {state.notFound && <div className="notice info-notice row gap"><span className="grow">No label found for “{key || name}” in the FDA database (common for local brands and sundries). Use the references below.</span>{key && <button className="btn sm ghost" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} />Look again</button>}</div>}
      {state.error && <div className="error row gap"><span className="grow">{state.error}</span><button className="btn sm ghost" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} />Try again</button></div>}
      {state.warning && <div className="notice info-notice row gap"><WifiOff size={16} /><span className="grow">Showing the copy saved on this device. {state.warning}</span><button className="btn sm ghost" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} />Try again</button></div>}
      {info && (
        <>
          <div className="row between">
            <div><strong className="druginfo-title">{info.title || key}</strong><div className="muted small">{[info.form, info.route].filter(Boolean).join(' · ')}</div></div>
            {state.cached && <span className="badge" title="Saved on this device, works offline">{state.refreshing ? 'updating…' : `saved ${new Date(info.fetchedAt).toLocaleDateString()}`}</span>}
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
    if (q.trim().length < 2) return [];
    return searchProducts(products, q).slice(0, 12); // same spelling-tolerant matching as the POS
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
