// Tidy names (the owner's request, 2026-11-20): consistent medicine names, suggested by the house style (src/medname.js)
// and, on request, by AI (POST /api/ai/names). NOTHING is renamed until a person ticks the suggestions they agree
// with (none is ticked at first), may correct them, and approves; every rename is audited.
import { useMemo, useState } from 'react';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { useStore, put, audit } from '../store.jsx';
import { ask, toast } from '../feedback.jsx';
import { aiNames } from '../cloud.js';
import { nameSuggestions, safeRename, lookAlikes } from '../medname.js';

export default function NameCheck({ onClose }) {
  const { db, update, user, branchId, syncCfg, features } = useStore();
  const products = db.products;
  const [rows, setRows] = useState(() => nameSuggestions(products).map((x) => ({ ...x, by: 'style', on: false })));
  const [busy, setBusy] = useState('');
  const [aiFrom, setAiFrom] = useState(0); // the next medicines the AI looks at (60 at a time)
  const twins = useMemo(() => lookAlikes(products).slice(0, 20), [products]);
  const set = (id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const ticked = rows.filter((x) => x.on && safeRename(x.from, x.to));
  const askAi = async () => {
    if (!navigator.onLine) return toast('The AI needs the internet.', 'warn');
    const done = new Set(rows.map((x) => x.id));
    const next = products.slice(aiFrom).filter((p) => !done.has(p.id)).slice(0, 60);
    if (!next.length) return toast('The AI has looked at every medicine.');
    setBusy(`The AI is reading ${next.length} names…`);
    try {
      const r = await aiNames(syncCfg, next.map((p) => ({ id: p.id, name: p.name, generic: p.generic, form: p.form })));
      const byId = new Map(products.map((p) => [p.id, p]));
      const add = (r.suggestions || []).filter((x) => byId.has(x.id) && !done.has(x.id)).map((x) => ({ id: x.id, from: byId.get(x.id).name, to: x.name, why: x.why || 'AI suggestion', by: 'ai', on: false }));
      setRows((list) => [...list, ...add]);
      setAiFrom(products.indexOf(next.at(-1)) + 1);
      toast(add.length ? `${add.length} suggestion${add.length === 1 ? '' : 's'} from the AI: tick the ones you agree with` : 'The AI found nothing to change in these names');
    } catch (e) { toast(e.message || 'The AI could not be reached', 'error'); }
    finally { setBusy(''); }
  };
  const apply = async () => {
    if (!ticked.length) return;
    if (!(await ask({ title: `Rename ${ticked.length} medicine${ticked.length === 1 ? '' : 's'}?`, message: 'The new names are used everywhere (the till, reports, every device). Stock, prices and history stay as they are.', effects: ticked.slice(0, 6).map((x) => `${x.from} → ${x.to}`).concat(ticked.length > 6 ? [`and ${ticked.length - 6} more`] : []), confirmText: 'Approve and rename' }))) return;
    try {
      await update((d) => {
        for (const x of ticked) {
          const rec = d.products.find((p) => p.id === x.id);
          if (!rec || rec.name !== x.from) continue; // changed meanwhile: left alone
          put(d, 'products', { ...rec, name: x.to.trim() });
          audit(d, user, 'Medicine renamed (approved suggestion)', `${x.from} → ${x.to.trim()} (${x.by === 'ai' ? 'AI' : 'house style'})`, branchId);
        }
      });
      toast(`${ticked.length} name${ticked.length === 1 ? '' : 's'} changed`, 'success');
      setRows((r) => r.filter((x) => !ticked.includes(x)));
    } catch (e) { toast('Nothing was renamed: ' + e.message, 'error'); }
  };
  return (
    <Modal wide title="Tidy medicine names" onClose={busy ? () => {} : onClose}>
      <p className="muted small">Suggestions for one consistent style (“Paracetamol 500mg Tablets”). Nothing changes until you tick the ones you agree with and approve. You can correct a suggestion before approving. Strengths and pack numbers are never changed.</p>
      <div className="row gap wrap">
        {features.ai !== false && <button type="button" className="btn ghost" disabled={!!busy} onClick={askAi}>{busy ? <><Loader2 size={16} className="spin" />{busy}</> : <><Sparkles size={16} />Ask the AI ({aiFrom ? 'next 60 names' : 'first 60 names'})</>}</button>}
        {rows.length > 0 && <button type="button" className="btn ghost" onClick={() => setRows((r) => r.map((x) => ({ ...x, on: true })))}>Tick all</button>}
        {rows.some((x) => x.on) && <button type="button" className="btn ghost" onClick={() => setRows((r) => r.map((x) => ({ ...x, on: false })))}>Untick all</button>}
      </div>
      <div className="table-wrap" style={{ maxHeight: '55vh', overflow: 'auto', marginTop: 10 }}>
        <table className="name-check">
          <thead><tr><th /><th>Now</th><th>Suggested</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className={x.on ? 'on' : ''}>
                <td><input type="checkbox" checked={x.on} onChange={(e) => set(x.id, { on: e.target.checked })} aria-label={`Approve renaming ${x.from}`} /></td>
                <td>{x.from}</td>
                <td><input value={x.to} onChange={(e) => set(x.id, { to: e.target.value })} aria-label={`New name for ${x.from}`} className={safeRename(x.from, x.to) ? '' : 'field-error'} title={safeRename(x.from, x.to) ? '' : 'Keep every number (strength, pack) of the name'} /></td>
                <td className="muted small">{x.by === 'ai' ? <><Sparkles size={11} /> </> : <><Wand2 size={11} /> </>}{x.why}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted">The names already follow the house style.{features.ai !== false ? ' Ask the AI for spelling and other suggestions.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>
      {twins.length > 0 && (
        <details className="small" style={{ marginTop: 10 }}>
          <summary>{twins.length} name{twins.length === 1 ? '' : 's'} appear more than once (the same item twice?)</summary>
          <ul>{twins.map((g) => <li key={g[0].id}>{g.map((p) => p.name).join(' · ')}</li>)}</ul>
          <p className="muted">Check them in the list; nothing is merged automatically.</p>
        </details>
      )}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={!!busy}>Close</button>
        <button type="button" className="btn primary" disabled={!ticked.length || !!busy} onClick={apply}>Approve and rename {ticked.length || ''}</button>
      </div>
    </Modal>
  );
}
