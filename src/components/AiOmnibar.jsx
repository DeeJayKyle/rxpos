// Ctrl+K / Cmd+K: the AI command and action omnibar, a floating bar over the top shell. Offline and instant: pages,
// commands, medicines (the pharmacy's own and the 9,700+ catalog, merged on the device by store.jsx), customers and
// receipts, from what is already on this device (IndexedDB). Online, three AI rows join them (POST /api/ai/copilot): do it at the till ("add 2
// strips of paracetamol"), ask about the stock ("what expires before March?"), or diagnose this device ("sync stuck").
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Pill, User, ReceiptText, CornerDownLeft, Sparkles, Wand2, Stethoscope, LineChart, WifiOff, Loader2} from 'lucide-react';
import { useStore, useSyncState } from '../store.jsx';
import { aiCopilot } from '../cloud.js';
import { searchProducts } from '../search.js';
import { stageForTill } from './aiStage.js';
import { ownerFacts } from './aiFacts.js';
import { deviceTelemetry } from './AiSystemDoctor.jsx';

export default function AiOmnibar({ open, onClose, pages, commands = [] }) {
  const { db, products, fmt, syncCfg, can, batchesOf } = useStore();
  const { pending, syncStatus } = useSyncState();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [ai, setAi] = useState(null); // { busy, kind, answer, reorder, error }
  const [online, setOnline] = useState(() => navigator.onLine);
  const inputRef = useRef();
  useEffect(() => { if (open) { setQ(''); setActive(0); setAi(null); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  const linked = !!syncCfg?.url && !!syncCfg?.key;

  const run = async (kind, text) => {
    setAi({ busy: true, kind });
    try {
      if (kind === 'command') {
        const r = await aiCopilot(syncCfg, { mode: 'command', text });
        if (r.action === 'ADD_ITEMS') { stageForTill(r.items); navigate('/pos'); onClose(); return; }
        if (r.action === 'NAVIGATE') { navigate(r.to); onClose(); return; }
        setAi({ kind, answer: r.reply });
      } else if (kind === 'ask') {
        const r = await aiCopilot(syncCfg, { mode: 'ask', text, facts: ownerFacts({ db, products, batchesOf }) });
        setAi({ kind, answer: r.answer, reorder: r.reorder });
      } else {
        const r = await aiCopilot(syncCfg, { mode: 'diagnose', text, telemetry: await deviceTelemetry({ pending, syncStatus, syncCfg, products }) });
        setAi({ kind, answer: [r.summary, ...r.causes.map((c) => '• ' + c)].join('\n'), repairs: r.actions });
      }
    } catch (e) { setAi({ kind, error: e.message || String(e) }); }
  };

  const results = useMemo(() => {
    // "/" first: commands only (Notion's slash menu), then the pages
    const slash = q.startsWith('/');
    const s = (slash ? q.slice(1) : q).trim().toLowerCase();
    const has = (...v) => v.join(' ').toLowerCase().includes(s);
    if (slash) return [
      ...commands.filter((c) => !s || has(c.label, c.words || '')).map((c) => ({ section: 'Commands', ...c })),
      ...pages.filter((p) => s && has(p.label)).slice(0, 6).map((p) => ({ section: 'Pages', label: p.label, Icon: p.Icon, hint: p.key, go: () => navigate(p.to) })),
    ];
    // the owner's request: Ctrl+K also runs commands ("new sale", "receive stock", "add customer"…)
    const out = commands.filter((c) => (s ? has(c.label, c.words || '') : true)).slice(0, s ? 5 : 4).map((c) => ({ section: 'Commands', ...c }));
    out.push(...pages.filter((p) => !s || has(p.label)).slice(0, s ? 6 : 8).map((p) => ({ section: 'Pages', label: p.label, Icon: p.Icon, hint: p.key, go: () => navigate(p.to) })));
    if (s) {
      searchProducts(products, q).slice(0, 6).forEach((p) =>
        out.push({ section: 'Medicines', label: p.name, Icon: Pill, hint: `${p.stock} in stock · ${fmt(p.price)}`, go: () => navigate('/stock-card', { state: { productId: p.id } }) }));
      db.customers.filter((c) => has(c.name, c.phone)).slice(0, 4).forEach((c) =>
        out.push({ section: 'Customers', label: c.name, Icon: User, hint: c.phone, go: () => navigate('/customers', { state: { q: c.name } }) }));
      db.sales.filter((x) => has(x.number)).slice(0, 4).forEach((x) =>
        out.push({ section: 'Receipts', label: x.number, Icon: ReceiptText, hint: fmt(x.total), go: () => navigate('/sales', { state: { q: x.number } }) }));
      if (s.length >= 3) {
        if (!online || !linked) out.push({ section: 'AI', label: !linked ? 'AI needs this device linked to the cloud' : 'AI needs the internet: the results above are from this device', Icon: WifiOff, disabled: true, go: () => {} });
        else {
          if (can('pos.sell')) out.push({ section: 'AI', label: `Do it: “${q.trim()}”`, Icon: Wand2, hint: 'till or page', keep: true, go: () => run('command', q.trim()) });
          if (can('reports') || can('inventory.view')) out.push({ section: 'AI', label: `Ask: “${q.trim()}”`, Icon: LineChart, hint: 'expiry, dead stock, reorder', keep: true, go: () => run('ask', q.trim()) });
          out.push({ section: 'AI', label: `Diagnose this device: “${q.trim()}”`, Icon: Stethoscope, hint: 'sync, storage, errors', keep: true, go: () => run('diagnose', q.trim()) });
        }
      }
    }
    return out;
    // run is recreated every render; the rows only need the latest q
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pages, commands, products, db.customers, db.sales, fmt, navigate, online, linked, can]);

  if (!open) return null;
  const pick = (r) => { if (r.disabled) return; r.go(); if (!r.keep) onClose(); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) pick(results[active]);
  };
  let lastSection = null;
  return (
    <div className="modal-bg palette-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette ai-omnibar" onKeyDown={onKey} role="dialog" aria-modal="true" aria-label="Search and AI commands">
        <div className="palette-input"><Search size={18} /><input ref={inputRef} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); setAi(null); }} placeholder="Search, / for commands, or tell the AI: “add 2 strips of paracetamol”…" aria-label="Search or command" /><Sparkles size={16} className="ai-mark" aria-hidden="true" /><kbd>Esc</kbd></div>
        {ai && (
          <div className="ai-answer" role="status" aria-live="polite">
            {ai.busy ? <p className="row gap"><Loader2 size={16} className="spin" />Thinking…</p> : ai.error ? <p className="text-danger">{ai.error}</p> : <>
              <p className="ai-text">{ai.answer}</p>
              {ai.reorder?.length > 0 && (
                <div className="ai-reorder">
                  <span className="micro">Reorder draft</span>
                  <ul>{ai.reorder.map((r) => <li key={r.name}><span>{r.name}</span><span className="num">{r.qty}</span></li>)}</ul>
                  <button className="btn sm primary" onClick={() => { navigate('/reorder', { state: { draft: ai.reorder } }); onClose(); }}>Open Reorder</button>
                </div>
              )}
              {ai.repairs?.length > 0 && <button className="btn sm ghost" onClick={() => { navigate('/device', { state: { doctor: true } }); onClose(); }}>Open the System Doctor ({ai.repairs.length} fix{ai.repairs.length === 1 ? '' : 'es'})</button>}
            </>}
          </div>
        )}
        <div className="palette-list">
          {results.map((r, i) => {
            const head = r.section !== lastSection ? <div className="palette-section">{(lastSection = r.section)}</div> : null;
            return (
              <div key={r.section + r.label + i}>
                {head}
                <button className={'palette-item' + (i === active ? ' active' : '') + (r.section === 'AI' ? ' ai-row' : '')} disabled={r.disabled} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
                  <r.Icon size={17} /><span>{r.label}</span>{r.hint && <small>{r.hint}</small>}{i === active && !r.disabled && <CornerDownLeft size={14} />}
                </button>
              </div>
            );
          })}
          {!results.length && <div className="empty">Nothing found for “{q}”</div>}
        </div>
      </div>
    </div>
  );
}
