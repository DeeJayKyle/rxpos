import { useState, useMemo, useRef, useEffect } from 'react';
import { ClipboardCheck, Plus, Minus, ArrowLeft, Check, EyeOff, Eye, Search, ScanLine, Trash2, PackagePlus, Download, CheckCircle2, AlertTriangle, Play, Ban } from 'lucide-react';
import { useStore, uid, now, today, put, del, move, addBatch, audit, downloadFile, toCSV, daysUntil } from '../store.jsx';
import { Modal, Tabs, Empty, PdfButton } from '../ui.jsx';
import { ask, toast } from '../feedback.jsx';

/*
 * Stock take: count what is physically on the shelves and make RxPOS match it.
 *
 * A count is a `stockCounts` record (what is being counted, at which branch) plus one `countItems` record per medicine
 * counted, so several people can count different shelves at the same time on different devices without overwriting
 * each other. Each counted batch keeps the system quantity at the moment it was counted; posting books the difference
 * (counted − system then) as a "Stock count" movement. Sales made while the count is going on are therefore not lost.
 */

const LEGACY = 'lb-'; // stock recorded before batches existed (see store.batchesOf)
const itemId = (countId, productId) => countId + ':' + productId;
const numOr = (v, d = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));

/** System batches of a medicine at this branch that hold (or once held) stock, earliest expiry first */
const systemBatches = (batchesOf, pid) => batchesOf(pid).filter((b) => b.qty !== 0);

/** Differences of one counted medicine: [{ ...line, diff, value }] */
function linesWithDiff(item, p) {
  return (item?.lines || []).map((l) => {
    const diff = numOr(l.qty) - numOr(l.sys);
    return { ...l, diff, value: diff * (numOr(l.cost) || p?.cost || 0) };
  });
}

function summarise(count, items, productById) {
  let counted = 0, matched = 0, short = 0, over = 0, shortValue = 0, overValue = 0;
  for (const it of items) {
    counted++;
    const ls = linesWithDiff(it, productById.get(it.productId));
    const d = ls.reduce((a, l) => a + l.diff, 0);
    const v = ls.reduce((a, l) => a + l.value, 0);
    if (ls.every((l) => l.diff === 0)) matched++;
    else if (d < 0 || v < 0) { short++; } else over++;
    for (const l of ls) { if (l.value < 0) shortValue += -l.value; else overValue += l.value; }
  }
  const scope = (count.productIds || []).length;
  return { counted, matched, short, over, shortValue, overValue, net: overValue - shortValue, scope };
}

export default function StockCount() {
  const { db } = useStore();
  const [openId, setOpenId] = useState(null);
  const count = openId && db.stockCounts.find((c) => c.id === openId);
  return count ? <CountSheet count={count} onBack={() => setOpenId(null)} /> : <CountList onOpen={setOpenId} />;
}

// ---------------------------------------------------------------------------------------------------------------
function CountList({ onOpen }) {
  const { db, fmt, branchId, branch, can } = useStore();
  const [starting, setStarting] = useState(false);
  const mine = db.stockCounts.filter((c) => c.branchId === branchId);
  const open = mine.filter((c) => c.status === 'open');
  const done = mine.filter((c) => c.status !== 'open');
  const counts = useMemo(() => { const m = {}; for (const i of db.countItems) m[i.countId] = (m[i.countId] || 0) + 1; return m; }, [db.countItems]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Stock Count</h1><div className="sub">{branch?.name} · count the shelves, then post: RxPOS stock is corrected to what you counted</div></div>
        {can('stock.count') || can('stock.adjust') ? <button className="btn primary" onClick={() => setStarting(true)}><Plus size={16} />New stock count</button> : null}
      </div>
      <div className="count-steps">
        <div><b>1</b><span><strong>Start a count</strong><small>Whole pharmacy, one shelf, a formulation, or a quick spot check</small></span></div>
        <div><b>2</b><span><strong>Count &amp; scan</strong><small>Type or scan what is on the shelf. Several people can count at once</small></span></div>
        <div><b>3</b><span><strong>Review &amp; post</strong><small>See shortages and extras, then post to make stock match</small></span></div>
      </div>
      <h3>In progress</h3>
      {!open.length && <div className="card"><Empty>No count in progress. Start one with “New stock count”.</Empty></div>}
      <div className="count-cards">
        {open.map((c) => {
          const n = counts[c.id] || 0, of = (c.productIds || []).length;
          const pct = of ? Math.min(100, Math.round((n / of) * 100)) : 0;
          return (
            <button key={c.id} className="card count-card" onClick={() => onOpen(c.id)}>
              <div className="row between"><strong>{c.name}</strong>{c.blind && <span className="badge"><EyeOff size={11} />Blind</span>}</div>
              <small className="muted">{c.scopeLabel} · started by {c.startedBy} {new Date(c.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>
              <div className="progress"><i style={{ width: pct + '%' }} /></div>
              <div className="row between small"><span>{n} of {of} counted</span><span className="row gap"><Play size={13} />Continue</span></div>
            </button>
          );
        })}
      </div>
      <h3>History</h3>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Count</th><th>Status</th><th>Posted</th><th className="num">Counted</th><th className="num">Matched</th><th className="num">Short</th><th className="num">Extra</th><th className="num">Net value</th><th /></tr></thead>
          <tbody>
            {done.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong><br /><small className="muted">{c.scopeLabel}</small></td>
                <td>{c.status === 'posted' ? <span className="badge ok">Posted</span> : <span className="badge warn">Cancelled</span>}</td>
                <td>{c.postedAt ? <>{new Date(c.postedAt).toLocaleDateString()}<br /><small className="muted">{c.postedBy}</small></> : '—'}</td>
                <td className="num">{c.summary?.counted ?? '—'}</td><td className="num">{c.summary?.matched ?? '—'}</td>
                <td className="num">{c.summary ? <span className={c.summary.short ? 'text-danger' : ''}>{c.summary.short}</span> : '—'}</td>
                <td className="num">{c.summary?.over ?? '—'}</td>
                <td className="num">{c.summary ? <span className={c.summary.net < 0 ? 'text-danger' : c.summary.net > 0 ? 'text-ok' : ''}>{fmt(c.summary.net)}</span> : '—'}</td>
                <td className="actions"><button className="btn sm ghost" onClick={() => onOpen(c.id)}>View</button></td>
              </tr>
            ))}
            {!done.length && <Empty colSpan={9}>No finished counts yet</Empty>}
          </tbody>
        </table>
      </div>
      {starting && <NewCount onClose={() => setStarting(false)} onStarted={(id) => { setStarting(false); onOpen(id); }} />}
    </div>
  );
}

function NewCount({ onClose, onStarted }) {
  const { db, products, batchesOf, update, user, branchId, fmt } = useStore();
  const stocked = useMemo(() => products.filter((p) => p.stock !== 0), [products]);
  const shelves = useMemo(() => [...new Set(stocked.map((p) => (p.shelf || '').trim()).filter(Boolean))].sort(), [stocked]);
  const forms = useMemo(() => [...new Set(stocked.map((p) => p.form).filter(Boolean))].sort(), [stocked]);
  const warn = db.settings.expiryWarnDays || 90;
  const [f, setF] = useState({ name: `Stock count ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`, scope: 'all', shelf: shelves[0] || '', form: forms[0] || '', size: 20, blind: true });
  const value = (p) => batchesOf(p.id).reduce((a, b) => a + Math.max(0, b.qty) * (b.cost || p.cost || 0), 0);
  const pickList = () => {
    switch (f.scope) {
      case 'shelf': return stocked.filter((p) => (p.shelf || '').trim() === f.shelf);
      case 'form': return stocked.filter((p) => p.form === f.form);
      case 'expiring': return stocked.filter((p) => batchesOf(p.id).some((b) => b.qty > 0 && b.expiry && daysUntil(b.expiry) <= warn));
      case 'value': return stocked.slice().sort((a, b) => value(b) - value(a)).slice(0, Math.max(1, numOr(f.size, 20)));
      case 'random': return stocked.slice().sort(() => Math.random() - 0.5).slice(0, Math.max(1, numOr(f.size, 20)));
      case 'empty': return [];
      default: return stocked;
    }
  };
  const list = pickList();
  const label = { all: 'All medicines in stock', shelf: `Shelf ${f.shelf}`, form: f.form, expiring: `Expiring within ${warn} days`, value: `Top ${f.size} by value`, random: `Spot check of ${f.size}`, empty: 'Scan as you go' }[f.scope];
  const start = (e) => {
    e.preventDefault();
    if (f.scope !== 'empty' && !list.length) return toast('Nothing to count in that choice', 'warn');
    const byShelf = (a, b) => (a.shelf || '~').localeCompare(b.shelf || '~') || a.name.localeCompare(b.name);
    const rec = { id: uid(), number: 'SC' + Date.now().toString(36).toUpperCase().slice(-6), name: f.name.trim() || 'Stock count', date: now(), branchId, scope: f.scope, scopeLabel: label,
      productIds: (f.scope === 'random' ? list : list.slice().sort(byShelf)).map((p) => p.id), blind: !!f.blind, status: 'open', startedBy: user.name, startedAt: now() };
    update((d) => { put(d, 'stockCounts', rec); audit(d, user, 'Stock count started', `${rec.name} (${label}, ${rec.productIds.length} items)`, branchId); });
    onStarted(rec.id);
  };
  const opt = (k, title, sub, extra) => (
    <label className={'scope-opt' + (f.scope === k ? ' on' : '')}>
      <input type="radio" name="scope" checked={f.scope === k} onChange={() => setF({ ...f, scope: k })} />
      <span className="grow"><strong>{title}</strong><small className="muted">{sub}</small>{f.scope === k && extra}</span>
    </label>
  );
  return (
    <Modal title="New stock count" onClose={onClose} wide>
      <form onSubmit={start} className="stack">
        <label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="scope-grid">
          {opt('all', 'Full stock take', `${stocked.length} medicines in stock here, in shelf order`)}
          {opt('shelf', 'One shelf / location', shelves.length ? `${shelves.length} shelves set on medicines` : 'Set shelves in Quick Edit to use this',
            shelves.length > 0 && <select value={f.shelf} onChange={(e) => setF({ ...f, shelf: e.target.value })}>{shelves.map((x) => <option key={x}>{x}</option>)}</select>)}
          {opt('form', 'One formulation', 'e.g. all syrups or all injectables',
            <select value={f.form} onChange={(e) => setF({ ...f, form: e.target.value })}>{forms.map((x) => <option key={x}>{x}</option>)}</select>)}
          {opt('expiring', 'Expiring stock', `Batches expiring within ${warn} days or expired`)}
          {opt('value', 'Highest value items', 'Count the expensive items more often',
            <input type="number" min="1" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} aria-label="How many" />)}
          {opt('random', 'Random spot check', 'A quick daily check of a few items',
            <input type="number" min="1" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} aria-label="How many" />)}
          {opt('empty', 'Scan as you go', 'Start with an empty list; every item you scan or search is added')}
        </div>
        <label className="field check"><input type="checkbox" checked={f.blind} onChange={(e) => setF({ ...f, blind: e.target.checked })} /><span>Blind count: hide the system quantities while counting (gives honest counts; differences show at review)</span></label>
        <div className="form-actions">
          <span className="grow muted small">{f.scope === 'empty' ? 'Items are added as you count them.' : `${list.length} items · ${fmt(list.reduce((a, p) => a + value(p), 0))} at cost`}</span>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><ClipboardCheck size={16} />Start counting</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function CountSheet({ count, onBack }) {
  const { db, products, batchesOf, update, user, branchId, fmt, can } = useStore();
  const readOnly = count.status !== 'open';
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(readOnly ? 'diff' : 'todo');
  const [shelf, setShelf] = useState('');
  const [reveal, setReveal] = useState(false);
  const [review, setReview] = useState(false);
  const [limit, setLimit] = useState(150);
  const searchRef = useRef(null);
  const sheetRef = useRef(null);
  const blind = count.blind && !reveal && !readOnly;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const items = useMemo(() => db.countItems.filter((i) => i.countId === count.id), [db.countItems, count.id]);
  const itemBy = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);
  const ids = useMemo(() => { const s = new Set(count.productIds || []); const extra = items.map((i) => i.productId).filter((id) => !s.has(id)); return [...(count.productIds || []), ...extra]; }, [count.productIds, items]);
  const all = useMemo(() => ids.map((id) => productById.get(id)).filter(Boolean), [ids, productById]);
  const shelves = useMemo(() => [...new Set(all.map((p) => (p.shelf || '').trim()).filter(Boolean))].sort(), [all]);
  const hasDiff = (p) => linesWithDiff(itemBy.get(p.id), p).some((l) => l.diff !== 0);
  const ql = q.trim().toLowerCase();
  const rows = all.filter((p) => (!shelf || (p.shelf || '').trim() === shelf) && (!ql || `${p.name} ${p.generic || ''} ${p.barcode || ''}`.toLowerCase().includes(ql)) &&
    (tab === 'all' || (tab === 'todo' ? !itemBy.has(p.id) : tab === 'done' ? itemBy.has(p.id) : itemBy.has(p.id) && hasDiff(p))));
  const sum = useMemo(() => summarise(count, items, productById), [count, items, productById]);
  const pct = all.length ? Math.round((items.length / all.length) * 100) : 0;
  // medicines not on this count's list yet that match the search: add them by tapping (or scanning their barcode)
  const outside = !readOnly && ql.length > 1 ? products.filter((p) => !ids.includes(p.id) && `${p.name} ${p.barcode || ''}`.toLowerCase().includes(ql)).slice(0, 6) : [];

  const saveItem = (p, lines) => {
    update((d) => {
      if (!lines) { if (d.countItems.some((x) => x.id === itemId(count.id, p.id))) del(d, 'countItems', itemId(count.id, p.id)); return; }
      put(d, 'countItems', { id: itemId(count.id, p.id), countId: count.id, productId: p.id, name: p.name, branchId, lines, total: lines.reduce((a, l) => a + numOr(l.qty), 0), by: user.name, at: now() });
    });
  };
  const focusNext = (el) => {
    const all = [...document.querySelectorAll('[data-count-input]')];
    const i = all.indexOf(el);
    const next = all[i + 1];
    if (next) { next.focus(); next.select?.(); } else searchRef.current?.focus();
  };
  const onSearchKey = (e) => {
    if (e.key !== 'Enter' || !ql) return;
    e.preventDefault();
    const code = products.find((p) => p.barcode && p.barcode.toLowerCase() === ql) || (rows.length === 1 ? rows[0] : null) || (rows.length ? null : outside[0]);
    if (!code) return;
    if (!ids.includes(code.id)) addToCount(code);
    setTab('all'); setQ(code.barcode && code.barcode.toLowerCase() === ql ? code.name : q);
    setTimeout(() => { const el = document.querySelector(`[data-count-row="${code.id}"] [data-count-input]`); el?.focus(); el?.select?.(); el?.scrollIntoView({ block: 'center' }); }, 60);
  };
  const addToCount = (p) => {
    update((d) => { const c = d.stockCounts.find((x) => x.id === count.id); if (c && !c.productIds.includes(p.id)) put(d, 'stockCounts', { ...c, productIds: [...c.productIds, p.id] }); });
  };
  const cancel = async () => {
    if (!(await ask({ title: 'Cancel this count?', message: 'Nothing is changed in stock. The counts entered so far are kept in the history.', confirmText: 'Cancel count', danger: true }))) return;
    update((d) => { put(d, 'stockCounts', { ...count, status: 'cancelled', postedBy: user.name, postedAt: now(), summary: sum }); audit(d, user, 'Stock count cancelled', count.name, branchId); });
    onBack();
  };
  const exportCsv = () => downloadFile(`${count.name.replace(/[^\w-]+/g, '-')}.csv`, toCSV(all.flatMap((p) => {
    const it = itemBy.get(p.id);
    if (!it) return [{ medicine: p.name, shelf: p.shelf || '', batch: '', expiry: '', system: readOnly || !count.blind ? p.stock : '', counted: '', difference: '', value: '' }];
    return linesWithDiff(it, p).map((l) => ({ medicine: p.name, shelf: p.shelf || '', batch: l.batch, expiry: l.expiry, system: l.sys, counted: l.qty, difference: l.diff, value: l.value, countedBy: it.by }));
  })), 'text/csv');
  const sheetData = () => [{ heading: `${count.name} – count sheet`, head: ['Medicine', 'Shelf', 'Batch', 'Expiry', ...(count.blind ? [] : ['System']), 'Counted'],
    body: all.flatMap((p) => { const bs = systemBatches(batchesOf, p.id); return (bs.length ? bs : [{ batch: '', expiry: '', qty: 0 }]).map((b, n) => [n ? '' : p.name, n ? '' : p.shelf || '', b.batch || '', b.expiry || '', ...(count.blind ? [] : [String(b.qty)]), '']); }) }];

  return (
    <div className="page count-page">
      <div className="page-head">
        <div>
          <button className="link-btn small" onClick={onBack}><ArrowLeft size={13} />All counts</button>
          <h1>{count.name}</h1>
          <div className="sub">{count.scopeLabel} · {readOnly ? (count.status === 'posted' ? `posted by ${count.postedBy} ${new Date(count.postedAt).toLocaleString()}` : 'cancelled') : `started by ${count.startedBy}`}</div>
        </div>
        <div className="row gap">
          {count.blind && !readOnly && can('stock.adjust') && <button className="btn ghost" onClick={() => setReveal((r) => !r)}>{reveal ? <><EyeOff size={16} />Hide system qty</> : <><Eye size={16} />Show system qty</>}</button>}
          <PdfButton data={sheetData} title={count.name} subtitle={`${count.scopeLabel} · ${all.length} items`} label="Count sheet" />
          <button className="btn ghost" onClick={exportCsv}><Download size={16} />CSV</button>
          {!readOnly && <button className="btn ghost" onClick={cancel}><Ban size={16} />Cancel</button>}
          {!readOnly && <button className="btn primary" disabled={!items.length} onClick={() => setReview(true)}><CheckCircle2 size={16} />Review &amp; post</button>}
        </div>
      </div>

      <div className="card count-progress">
        <div className="row between gap wrap">
          <strong>{items.length} of {all.length} counted ({pct}%)</strong>
          <span className="small muted">{sum.matched} match{blind ? '' : <> · <span className="text-danger">{sum.short} short ({fmt(sum.shortValue)})</span> · <span className="text-ok">{sum.over} extra ({fmt(sum.overValue)})</span></>}</span>
        </div>
        <div className="progress big"><i style={{ width: pct + '%' }} /></div>
      </div>

      {!readOnly && (
        <div className="count-search">
          <ScanLine size={20} />
          <input ref={searchRef} autoFocus className="search big" placeholder="Scan a barcode or type a medicine name, then Enter" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          {q && <button className="icon-btn" aria-label="Clear search" onClick={() => { setQ(''); searchRef.current?.focus(); }}>×</button>}
        </div>
      )}
      {outside.length > 0 && (
        <div className="card outside">
          <small className="muted">Not on this count's list. Tap to add and count it:</small>
          <div className="row gap">{outside.map((p) => <button key={p.id} className="chip" onClick={() => { addToCount(p); setTab('all'); setQ(p.name); }}><PackagePlus size={13} />{p.name}</button>)}</div>
        </div>
      )}

      <div className="row between gap wrap">
        <Tabs value={tab} onChange={(t) => { setTab(t); setLimit(150); }} tabs={[['todo', `To count (${all.length - items.length})`], ['done', `Counted (${items.length})`], ...(blind ? [] : [['diff', `Differences (${sum.short + sum.over})`]]), ['all', 'All']]} />
        {shelves.length > 1 && <select value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Shelf"><option value="">All shelves</option>{shelves.map((x) => <option key={x}>{x}</option>)}</select>}
      </div>

      <div className="count-list" ref={sheetRef}>
        {rows.slice(0, limit).map((p) => <CountRow key={p.id} p={p} item={itemBy.get(p.id)} blind={blind} readOnly={readOnly} onSave={saveItem} focusNext={focusNext} />)}
        {rows.length > limit && <button className="btn ghost block" onClick={() => setLimit((l) => l + 150)}>Show more ({rows.length - limit} left)</button>}
        {!rows.length && <div className="card"><Empty>{tab === 'todo' && all.length ? 'Everything here is counted 🎉 Review & post when ready.' : ql ? 'Nothing matches. Scan or type another name.' : 'Nothing here'}</Empty></div>}
      </div>

      {review && <ReviewPost count={count} items={items} all={all} sum={sum} onClose={() => setReview(false)} onPosted={onBack} />}
    </div>
  );
}

/** One medicine on the count: a single box when it has one batch, a box per batch otherwise; extra batches can be added */
function CountRow({ p, item, blind, readOnly, onSave, focusNext }) {
  const { batchesOf, db } = useStore();
  const sys = systemBatches(batchesOf, p.id);
  const warn = db.settings.expiryWarnDays || 90;
  // what is shown: every system batch, plus batches found on the shelf that RxPOS didn't know about
  const lines = useMemo(() => {
    const out = sys.map((b) => {
      const saved = item?.lines.find((l) => l.batchId === b.id);
      return { key: b.id, batchId: b.id, batch: b.batch, expiry: b.expiry || '', cost: b.cost || p.cost || 0, sysNow: b.qty, sys: saved ? saved.sys : b.qty, qty: saved && !saved.skipped ? saved.qty : '' };
    });
    for (const l of item?.lines || []) if (!out.some((o) => o.batchId === l.batchId && l.batchId)) out.push({ ...l, key: l.key || l.batchId || l.batch, sysNow: 0 });
    return out;
  }, [sys, item, p.cost]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(null);
  useEffect(() => setDraft({}), [item?.at]);
  const valOf = (l) => (l.key in draft ? draft[l.key] : l.qty === '' ? '' : String(l.qty));

  /** Save the counted quantities. A batch left blank is not counted: it keeps its system quantity (no change). */
  const commit = (patch = {}, extra = []) => {
    const typed = lines.map((l) => ({ ...l, typed: l.key in patch ? patch[l.key] : valOf(l) }));
    if (!extra.length && typed.every((l) => l.typed === '')) { if (item) onSave(p, null); setDraft({}); return; }
    const out = typed.map((l) => {
      const before = item?.lines.find((x) => (x.batchId && x.batchId === l.batchId) || (!x.batchId && x.key === l.key));
      const skipped = l.typed === '';
      const qty = skipped ? l.sysNow : Math.max(0, Math.round(numOr(l.typed)));
      // a batch counted now records the system quantity now; one already counted with the same figure keeps what it had then
      const sysAt = before && !before.skipped && !skipped && Number(before.qty) === qty ? before.sys : l.sysNow;
      return { key: l.key, batchId: l.batchId || null, batch: l.batch, expiry: l.expiry, cost: l.cost, sys: sysAt, qty, ...(skipped ? { skipped: true } : {}), ...(l.found ? { found: true } : {}) };
    });
    onSave(p, [...out, ...extra]);
  };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); focusNext(e.currentTarget); } };
  const step = (l, by) => { const v = String(Math.max(0, numOr(valOf(l)) + by)); setDraft((d) => ({ ...d, [l.key]: v })); commit({ [l.key]: v }); };
  const matchAll = () => commit(Object.fromEntries(lines.map((l) => [l.key, String(Math.max(0, l.sysNow))])));
  const addFound = (e) => {
    e.preventDefault();
    if (!adding.expiry) return toast('Enter the expiry date on the pack', 'warn');
    commit({}, [{ key: 'found-' + uid(), batchId: null, batch: adding.batch.trim(), expiry: adding.expiry, cost: p.cost || 0, sys: 0, qty: Math.max(0, Math.round(numOr(adding.qty))), found: true }]);
    setAdding(null);
  };

  const counted = !!item;
  const diffs = linesWithDiff(item, p);
  const diff = diffs.reduce((a, l) => a + l.diff, 0);
  const totalSys = lines.reduce((a, l) => a + l.sysNow, 0);
  return (
    <div className={'card count-row' + (counted ? (diffs.some((l) => l.diff) && !blind ? ' off' : ' ok') : '')} data-count-row={p.id}>
      <div className="count-head">
        <div className="grow">
          <strong>{p.name}</strong>
          <small className="muted">{[p.form, p.shelf && `shelf ${p.shelf}`, p.barcode].filter(Boolean).join(' · ')}</small>
        </div>
        {!blind && <div className="count-sys"><small>System</small><b>{totalSys}</b></div>}
        {counted && (blind ? <span className="badge ok"><Check size={12} />Counted</span>
          : diff === 0 && diffs.every((l) => !l.diff) ? <span className="badge ok"><Check size={12} />Matches</span>
            : <span className={'badge ' + (diff < 0 ? 'danger' : 'warn')}>{diff > 0 ? '+' : ''}{diff}</span>)}
      </div>
      <div className="count-lines">
        {lines.map((l) => (
          <div key={l.key} className="count-line">
            <span className="grow small">
              {lines.length > 1 || l.found ? <>Batch <strong>{l.batch || '—'}</strong>{l.found && <span className="badge">found</span>}</> : <>Batch {l.batch || '—'}</>}
              {l.expiry && <span className={daysUntil(l.expiry) < 0 ? ' text-danger' : daysUntil(l.expiry) <= warn ? ' text-warn' : ' muted'}> · exp {l.expiry}</span>}
              {!blind && lines.length > 1 && <span className="muted"> · system {l.sysNow}</span>}
            </span>
            {readOnly ? <strong className="num">{l.qty === '' ? '—' : l.qty}</strong> : (
              <div className="stepper">
                <button type="button" aria-label="One less" onClick={() => step(l, -1)}><Minus size={16} /></button>
                <input data-count-input type="number" inputMode="numeric" min="0" placeholder="Count" value={valOf(l)} onChange={(e) => setDraft((d) => ({ ...d, [l.key]: e.target.value }))} onBlur={() => (l.key in draft) && commit()} onKeyDown={onKey} aria-label={`Counted quantity of ${p.name} batch ${l.batch}`} />
                <button type="button" aria-label="One more" onClick={() => step(l, 1)}><Plus size={16} /></button>
              </div>
            )}
          </div>
        ))}
        {!lines.length && !adding && <div className="small muted">No batch recorded here. If it is on the shelf, add the batch you find.</div>}
      </div>
      {!readOnly && (
        <div className="row gap count-actions">
          {!blind && lines.length > 0 && <button type="button" className="btn sm ghost" onClick={matchAll}><Check size={14} />Matches system</button>}
          {!adding && <button type="button" className="btn sm ghost" onClick={() => setAdding({ batch: '', expiry: '', qty: '' })}><PackagePlus size={14} />Found another batch</button>}
          {counted && <button type="button" className="btn sm ghost" onClick={() => onSave(p, null)}><Trash2 size={14} />Clear count</button>}
          {counted && <small className="muted grow">by {item.by}</small>}
        </div>
      )}
      {adding && (
        <form className="found-batch" onSubmit={addFound}>
          <input placeholder="Batch no." value={adding.batch} onChange={(e) => setAdding({ ...adding, batch: e.target.value })} aria-label="Batch number" />
          <input type="date" value={adding.expiry} onChange={(e) => setAdding({ ...adding, expiry: e.target.value })} aria-label="Expiry" />
          <input type="number" min="0" inputMode="numeric" placeholder="Qty" value={adding.qty} onChange={(e) => setAdding({ ...adding, qty: e.target.value })} aria-label="Quantity found" required />
          <button className="btn sm primary">Add</button>
          <button type="button" className="btn sm ghost" onClick={() => setAdding(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

/** The differences, and posting them: stock becomes what was counted */
function ReviewPost({ count, items, all, sum, onClose, onPosted }) {
  const { products, batchesOf, update, user, branchId, fmt, can } = useStore();
  const [zero, setZero] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const diffRows = items.flatMap((it) => linesWithDiff(it, byId.get(it.productId)).filter((l) => l.diff !== 0).map((l) => ({ ...l, p: byId.get(it.productId), by: it.by })))
    .filter((r) => r.p).sort((a, b) => a.value - b.value);
  const counted = new Set(items.map((i) => i.productId));
  const uncounted = all.filter((p) => !counted.has(p.id));
  const zeroable = uncounted.flatMap((p) => batchesOf(p.id).filter((b) => b.qty > 0).map((b) => ({ p, b, value: -b.qty * (b.cost || p.cost || 0) })));
  const zeroRows = zero ? zeroable : [];
  const zeroValue = zeroRows.reduce((a, r) => a + r.value, 0);
  const allowed = can('stock.adjust');

  const post = async () => {
    if (!(await ask({ title: 'Post this stock count?', message: `${diffRows.length} batch quantities${zeroRows.length ? ` and ${zeroRows.length} uncounted batches (set to 0)` : ''} will be corrected so RxPOS matches what was counted. Net change ${fmt(sum.net + zeroValue)} at cost.`, confirmText: 'Post count' }))) return;
    setBusy(true);
    update((d) => {
      const ref2 = count.number || count.name;
      for (const r of diffRows) {
        let batchId = r.batchId && !String(r.batchId).startsWith(LEGACY) ? r.batchId : null;
        if (!r.batchId && r.found) batchId = addBatch(d, { productId: r.p.id, batch: r.batch, expiry: r.expiry, cost: r.cost || r.p.cost }).id;
        move(d, { productId: r.p.id, qty: r.diff, type: 'Stock count', ref: ref2, note: count.name, user: user.name, batchId, branchId });
      }
      for (const z of zeroRows) move(d, { productId: z.p.id, qty: -z.b.qty, type: 'Stock count', ref: ref2, note: `${count.name} (not found)`, user: user.name, batchId: z.b.legacy ? null : z.b.id, branchId });
      const summary = { ...sum, zeroed: zeroRows.length, net: sum.net + zeroValue, shortValue: sum.shortValue - zeroValue };
      put(d, 'stockCounts', { ...count, status: 'posted', postedBy: user.name, postedAt: now(), postedOn: today(), summary });
      audit(d, user, 'Stock count posted', `${count.name}: ${sum.counted} counted, ${sum.matched} matched, ${sum.short} short (${fmt(summary.shortValue)}), ${sum.over} extra (${fmt(sum.overValue)})${zeroRows.length ? `, ${zeroRows.length} uncounted batches set to 0` : ''}`, branchId);
    });
    toast('Stock count posted: stock now matches what was counted');
    onPosted();
  };
  return (
    <Modal title={`Review – ${count.name}`} onClose={onClose} wide>
      <div className="stats count-stats">
        <div className="card stat"><small>Counted</small><strong>{sum.counted}</strong><span className="muted small">of {all.length}</span></div>
        <div className="card stat"><small>Match</small><strong className="text-ok">{sum.matched}</strong></div>
        <div className="card stat"><small>Short</small><strong className="text-danger">{sum.short}</strong><span className="small text-danger">{fmt(sum.shortValue)}</span></div>
        <div className="card stat"><small>Extra</small><strong>{sum.over}</strong><span className="small">{fmt(sum.overValue)}</span></div>
      </div>
      <div ref={ref}>
        <h4>Differences to post</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">System</th><th className="num">Counted</th><th className="num">Difference</th><th className="num">Value</th><th>By</th></tr></thead>
            <tbody>
              {diffRows.map((r, n) => (
                <tr key={n}><td>{r.p.name}</td><td>{r.batch || '—'}{r.found && <span className="badge">found</span>}</td><td>{r.expiry || '—'}</td><td className="num">{r.sys}</td><td className="num">{r.qty}</td>
                  <td className={'num ' + (r.diff < 0 ? 'text-danger' : 'text-ok')}>{r.diff > 0 ? '+' : ''}{r.diff}</td><td className={'num ' + (r.value < 0 ? 'text-danger' : '')}>{fmt(r.value)}</td><td>{r.by}</td></tr>
              ))}
              {!diffRows.length && <Empty colSpan={8}>Everything counted matches the system 🎉</Empty>}
            </tbody>
          </table>
        </div>
      </div>
      {uncounted.length > 0 && (
        <div className="notice warn-notice">
          <AlertTriangle size={15} /> {uncounted.length} item{uncounted.length > 1 ? 's were' : ' was'} not counted. They stay as they are
          <label className="field check"><input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /><span>…unless you tick this: not found on the shelf, set them to 0 ({fmt(-zeroable.reduce((x, r) => x + r.value, 0))} at cost)</span></label>
        </div>
      )}
      <div className="form-actions">
        <PdfButton target={ref} title={`${count.name} – differences`} subtitle={`${sum.counted} counted · ${sum.short} short (${fmt(sum.shortValue)}) · ${sum.over} extra (${fmt(sum.overValue)})`} />
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Keep counting</button>
        {allowed ? <button type="button" className="btn primary" disabled={busy} onClick={post}><CheckCircle2 size={16} />Post count</button>
          : <span className="small text-warn">A manager or pharmacist with “Stock counts, adjustments” permission posts the count.</span>}
      </div>
    </Modal>
  );
}
