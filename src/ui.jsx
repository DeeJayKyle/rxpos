import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useId, startTransition } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Search, Download, Plus, Pencil, Trash2, Inbox, Lightbulb, TrendingUp, TrendingDown, FileDown, Loader2, Copy, CheckSquare, Columns3, Ellipsis } from 'lucide-react';
import { ViewSwitch, BoardView, GalleryView, savedView, saveView } from './components/DataViews.jsx';
import { pagePdf, receiptPdf } from './pdf.js';
import { useStore, uid, downloadFile, toCSV, del as del1 } from './store.jsx';
import { useListControls, useContextMenu } from './listcontrols.jsx';
import { keyOf, showKey } from './keymap.js';
import { deviceSettings, setDevice } from './device.js';
import { ask, toast } from './feedback.jsx';

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ f, value, onChange }) {
  // A unique id per field instance (1.10): f.key alone collides when two forms on a page share a key, which breaks
  // the label-to-input link and aria wiring.
  const id = useId();
  const common = { id, required: f.required, value: value ?? '', onChange: (e) => onChange(e.target.value), placeholder: f.placeholder, autoFocus: f.autoFocus };
  let input;
  if (f.type === 'checkbox')
    input = <input id={id} type="checkbox" autoFocus={f.autoFocus} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  else if (f.type === 'select')
    input = (
      <select {...common}>
        <option value="">—</option>
        {f.options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    );
  else if (f.type === 'textarea') input = <textarea rows={3} {...common} />;
  else input = <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min ?? 0 : undefined} {...common} />;
  return (
    <label className={'field' + (f.type === 'checkbox' ? ' check' : '') + (f.full ? ' full' : '')} htmlFor={id}>
      <span>{f.label}{f.required && <b className="text-danger"> *</b>}</span>
      {input}
    </label>
  );
}

export function RecordForm({ fields, initial, onSave, onCancel, saveLabel = 'Save' }) {
  const [rec, setRec] = useState(initial);
  const submit = (e) => {
    e.preventDefault();
    const out = { ...rec };
    fields.forEach((f) => { if (f.type === 'number') out[f.key] = Number(out[f.key] || 0); });
    onSave(out);
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {fields.filter((f) => !f.hidden?.(rec)).map((f, i) => (
          <Field key={f.key} f={i === 0 ? { ...f, autoFocus: true } : f} value={rec[f.key]} onChange={(v) => setRec({ ...rec, [f.key]: v })} />
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary">{saveLabel}</button>
      </div>
    </form>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', big, inputRef, hint }) {
  return (
    <div className="search-wrap">
      <Search size={16} />
      <input ref={inputRef} className={'search' + (big ? ' big' : '')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder.replace(/…$/, '')} title={hint} />
    </div>
  );
}

/** An empty page or table: what belongs here and, when given, the one thing to do next */
export function Empty({ children = 'Nothing here yet', colSpan, action, icon: Icon = Inbox }) {
  const navigate = useNavigate();
  const body = (
    <div className="cart-empty">
      <span className="empty-art" aria-hidden="true"><i /><i /><Icon size={30} /></span><span>{children}</span>
      {action && <button type="button" className="btn sm primary" onClick={() => (action.to ? navigate(action.to) : action.onClick?.())}>{action.label}</button>}
    </div>
  );
  return colSpan ? <tr><td colSpan={colSpan} className="empty">{body}</td></tr> : body;
}

/** Generic searchable list + add/edit/delete for a db table. */
/**
 * A list of records with add / edit / delete, search and CSV export. The owner's request (2026-11-10): the same
 * keyboard, mouse and selection everywhere (src/listcontrols.jsx): arrow keys, Enter, E, Delete, N, /, Space; double-
 * click to edit; right-click for a menu; tick boxes with Shift+click ranges, and the ticked rows exported or deleted
 * together; the columns shown chosen per device; the search kept while the app is open. `bulk(rows)` adds page actions
 * for the ticked rows ([{ label, run }]); `rowMenu(r)` adds items to a row's menu.
 */
export function CrudPage({ title, subtitle, singular, table, fields, columns, blank = {}, extraActions, rowClass, rows: rowsProp, onSave, headExtra, canDelete = true, filter, readOnly = false, rowLocked, bulk, rowMenu, card, board }) {
  const { db, upsert, remove, update } = useStore();
  const location = useLocation();
  const qKey = 'rxpos-q:' + table + ':' + location.pathname;
  const [q, setQState] = useState(() => { if (location.state?.q) return location.state.q; try { return sessionStorage.getItem(qKey) || ''; } catch { return ''; } });
  const setQ = (v) => { setQState(v); try { v ? sessionStorage.setItem(qKey, v) : sessionStorage.removeItem(qKey); } catch { /* storage blocked */ } };
  const [editing, setEditing] = useState(null);
  const searchRef = useRef(null);
  const all = rowsProp || db[table];
  const ql = q.toLowerCase();
  const rows = useMemo(() => all.filter((r) => (!filter || filter(r)) && (!q || JSON.stringify(r).toLowerCase().includes(ql))), [all, filter, q, ql]);
  const shown = rows.slice(0, 500);
  const name = singular || title.replace(/s$/, '');
  const startNew = () => !readOnly && setEditing({ ...blank, id: uid(), _new: true });
  const editRow = (r) => !readOnly && !rowLocked?.(r) && setEditing(r);
  // a command from Ctrl+K ("Add a customer") opens the form at once
  useEffect(() => { if (location.state?.create) startNew(); }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // the columns shown, per device (the first is always shown)
  const [hidden, setHidden] = useState(() => new Set(deviceSettings().hiddenCols?.[table] || []));
  const [chooser, setChooser] = useState(false);
  const setColumn = (label, on) => { const h = new Set(hidden); on ? h.delete(label) : h.add(label); setHidden(h); setDevice({ hiddenCols: { ...(deviceSettings().hiddenCols || {}), [table]: [...h] } }); };
  const cols = columns.filter((c, i) => i === 0 || !hidden.has(c.label));
  // Table / Board / Gallery (pages that describe a card), per page on this device
  const viewKey = table + ':' + location.pathname;
  const [view, setViewState] = useState(() => (card ? savedView(viewKey) : 'table'));
  const setView = (v) => { setViewState(v); saveView(viewKey, v); };
  const shownView = !card || (view === 'board' && !board) ? 'table' : view;

  const deletable = (r) => canDelete && !readOnly && !rowLocked?.(r);
  const del = async (list) => {
    const rs = list.filter(deletable);
    if (!rs.length) return toast(list.length ? 'These rows can\'t be deleted (a closed day, or not allowed)' : 'Nothing to delete', 'warn');
    const one = rs.length === 1;
    if (!(await ask({ title: one ? `Delete this ${name.toLowerCase()}?` : `Delete ${rs.length} ${title.toLowerCase()}?`, message: `${one ? '' : rs.slice(0, 5).map((r) => r.name || r.description || r.number || r.id).join(', ') + (rs.length > 5 ? '…' : '') + '. '}This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    if (one) remove(table, rs[0].id); else update((d) => { for (const r of rs) del1(d, table, r.id); });
    lc.clear();
    toast(one ? `${name} deleted` : `${rs.length} ${title.toLowerCase()} deleted`);
  };
  const exportRows = (list, file = table) => downloadFile(`${file}.csv`, toCSV(list.map(({ updatedAt, ...r }) => r)), 'text/csv');
  const lc = useListControls({ rows: shown, onEdit: readOnly ? null : editRow, onDelete: canDelete && !readOnly ? del : null, onNew: readOnly ? null : startNew, searchRef, onClearSearch: () => setQ('') });
  const menu = useContextMenu();
  const rowMenuFor = (e, r, i) => menu.open(e, [
    !readOnly && !rowLocked?.(r) && { label: 'Edit', Icon: Pencil, keyId: 'list:edit', run: () => editRow(r) },
    ...(rowMenu?.(r) || []),
    { label: lc.ticked.has(r.id) ? 'Untick' : 'Tick', Icon: CheckSquare, keyId: 'list:tick', run: () => lc.toggle(i) },
    { label: 'Copy', Icon: Copy, run: () => { const t = cols.map((c) => (c.render ? '' : r[c.key] ?? '')).filter((x) => x !== '').join('\t') || String(r.name || ''); navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Could not copy', 'warn')); } },
    { label: lc.ticked.size > 1 && lc.ticked.has(r.id) ? `Export ${lc.ticked.size} ticked (CSV)` : 'Export this row (CSV)', Icon: Download, run: () => exportRows(lc.ticked.size > 1 && lc.ticked.has(r.id) ? lc.tickedRows : [r]) },
    deletable(r) && '-',
    deletable(r) && { label: lc.ticked.size > 1 && lc.ticked.has(r.id) ? `Delete ${lc.ticked.size} ticked` : 'Delete', Icon: Trash2, danger: true, keyId: 'list:delete', run: () => del(lc.ticked.size > 1 && lc.ticked.has(r.id) ? lc.tickedRows : [r]) },
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{title}</h1>{subtitle && <div className="sub">{subtitle}</div>}</div>
        <div className="row gap">
          {headExtra}
          <SearchBox value={q} onChange={setQ} inputRef={searchRef} hint={`Search (${showKey(keyOf('list:search'))})`} />
          {card && <ViewSwitch value={shownView} onChange={setView} board={!!board} />}
          {shownView === 'table' && <span className="col-chooser-wrap" style={{ position: 'relative' }}>
            <button className="btn ghost" aria-expanded={chooser} onClick={() => setChooser((c) => !c)} title="Choose the columns shown on this device"><Columns3 size={16} />Columns</button>
            {chooser && (
              <div className="col-chooser" role="group" aria-label="Columns shown" onMouseLeave={() => setChooser(false)}>
                {columns.map((c, i) => <label key={c.label} className="field check"><input type="checkbox" disabled={i === 0} checked={i === 0 || !hidden.has(c.label)} onChange={(e) => setColumn(c.label, e.target.checked)} /><span>{c.label}</span></label>)}
              </div>
            )}
          </span>}
          <button className="btn ghost" title="Export CSV (the ticked rows, or all shown)" onClick={() => exportRows(lc.tickedRows.length ? lc.tickedRows : rows)}><Download size={16} />CSV</button>
          {!readOnly && <button className="btn primary" onClick={startNew} title={`Add ${name.toLowerCase()} (${showKey(keyOf('list:new'))})`}><Plus size={16} />Add {name.toLowerCase()}</button>}
        </div>
      </div>
      {lc.ticked.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Ticked rows">
          <strong>{lc.ticked.size} ticked</strong>
          <button className="btn sm" onClick={() => exportRows(lc.tickedRows)}><Download size={14} />Export</button>
          {(bulk?.(lc.tickedRows) || []).map((b) => <button key={b.label} className="btn sm" onClick={() => b.run(lc.tickedRows, lc.clear)}>{b.label}</button>)}
          {canDelete && !readOnly && <button className="btn sm danger" onClick={() => del(lc.tickedRows)}><Trash2 size={14} />Delete</button>}
          <button className="btn sm ghost" onClick={lc.clear}>Untick all <kbd>Esc</kbd></button>
        </div>
      )}
      {shownView === 'board' && <BoardView rows={rows} board={board} card={card} onOpen={readOnly ? null : editRow} onMenu={(e, r) => rowMenuFor(e, r, shown.indexOf(r))} />}
      {shownView === 'gallery' && <GalleryView rows={rows} card={card} onOpen={readOnly ? null : editRow} onMenu={(e, r) => rowMenuFor(e, r, shown.indexOf(r))} />}
      {shownView === 'table' && <div className="card table-wrap">
        <table>
          <thead>
            <tr><th className="tick"><input {...lc.allProps} /></th>{cols.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}<th /></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const rp = lc.rowProps(r, i, rowMenuFor);
              return (
              <tr key={r.id} {...rp} className={[rowClass?.(r), rp.className].filter(Boolean).join(' ')}>
                <td className="tick"><input {...lc.tickProps(r, i)} /></td>
                {cols.map((c) => <td key={c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="actions">
                  {extraActions?.(r)}
                  {!readOnly && rowLocked?.(r) && <span className="muted" title="This day is closed: it can't be changed">Day closed</span>}
                  {!readOnly && !rowLocked?.(r) && <button className="btn sm ghost" onClick={() => setEditing(r)}><Pencil size={14} />Edit</button>}
                  {deletable(r) && <button className="btn sm danger" title="Delete" aria-label="Delete" onClick={() => del([r])}><Trash2 size={14} /></button>}
                  <button type="button" className="icon-btn sm row-more" title="More actions" aria-label="More actions" onClick={(e) => rowMenuFor(e, r, i)}><Ellipsis size={16} /></button>
                </td>
              </tr>
              );
            })}
            {!rows.length && <Empty colSpan={cols.length + 2}>{q ? `No ${title.toLowerCase()} match “${q}”` : `No ${title.toLowerCase()} yet.${readOnly ? '' : ` Click “Add ${name.toLowerCase()}” to create one.`}`}</Empty>}
            {rows.length > 500 && <tr><td colSpan={cols.length + 2} className="empty">Showing 500 of {rows.length}. Use search to narrow down.</td></tr>}
          </tbody>
        </table>
      </div>}
      {menu.node}
      {editing && (
        <Modal title={(editing._new ? 'Add ' : 'Edit ') + name.toLowerCase()} onClose={() => setEditing(null)} wide>
          <RecordForm fields={fields} initial={editing} onCancel={() => setEditing(null)}
            onSave={({ _new, stock, ...rec }) => {
              onSave ? onSave(rec, _new, editing) : upsert(table, rec);
              setEditing(null);
              toast(`${name} ${_new ? 'added' : 'saved'}`);
            }} />
        </Modal>
      )}
    </div>
  );
}

/** Numbers on the dashboard roll up to their value when they first appear, and glide to a new value when the data
 * changes (text stays as given; the last frame is always the exact value; off with reduced motion) */
export function CountUp({ value, ms = 700 }) {
  const str = String(value ?? '');
  const m = str.match(/-?[\d,]*\.?\d+/);
  const target = m ? Number(m[0].replace(/,/g, '')) : NaN;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(() => (isFinite(target) && !still() ? 0 : target));
  const from = useRef(isFinite(target) && !still() ? 0 : target);
  useEffect(() => {
    if (!isFinite(target)) return;
    const start = isFinite(from.current) ? from.current : target;
    if (start === target || still()) { from.current = target; setShown(target); return; }
    const dur = from.current === 0 ? ms : Math.min(ms, 450);
    let raf, t0;
    const step = (t) => {
      t0 ??= t; const k = Math.min(1, (t - t0) / dur);
      const v = k < 1 ? start + (target - start) * (1 - (1 - k) ** 3) : target;
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || !isFinite(target) || /^-?0\d/.test(m[0]) || /[:/]\d/.test(str)) return str; // times, dates and codes stay as they are
  const dec = (m[0].split('.')[1] || '').length;
  const txt = shown.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return str.replace(m[0], m[0].includes(',') ? txt : txt.replace(/,/g, ''));
}

export function Stat({ label, value, sub, tone, icon: Icon, delta, to, state }) {
  const navigate = useNavigate();
  const go = to ? () => navigate(to, state ? { state } : undefined) : undefined;
  return (
    <div className={'card stat ' + (tone || '') + (to ? ' link' : '') + (/\balert\b/.test(tone || '') && Number(value) > 0 ? ' flagged' : '')} onClick={go} role={to ? 'link' : undefined} tabIndex={to ? 0 : undefined} onKeyDown={to ? (e) => e.key === 'Enter' && go() : undefined}>
      {Icon && <span className="stat-icon"><Icon size={20} /></span>}
      <small>{label}</small>
      <strong><CountUp value={value} /></strong>
      <span className="muted small">
        {delta != null && isFinite(delta) && (
          <span className={'delta ' + (delta >= 0 ? 'up' : 'down')}>{delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(Math.round(delta))}% </span>
        )}
        {sub}
      </span>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  // phones show the tabs as one sideways-scrolling strip: keep the chosen one in view
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current, on = box?.querySelector('.tab.active');
    if (!box || !on || box.scrollWidth <= box.clientWidth) return;
    const l = on.offsetLeft - box.offsetLeft, r = l + on.offsetWidth;
    if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, l - 24);
  }, [value]);
  return (
    <div className="tabs" role="tablist" ref={ref}>
      {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={value === k} className={'tab' + (value === k ? ' active' : '')} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

/** Short money for chart axes: 1.2M, 350K, 900 */
export const compact = (n) => {
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
};
/** A rounded axis top so grid lines fall on tidy numbers */
const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v); };

/** Chart frame: y-axis values on recessive grid lines, the plot, first / last x labels, an empty state */
function ChartFrame({ max, height, empty, first, last, children }) {
  return (
    <div className="chart">
      <div className="chart-plot" style={{ height }}>
        <div className="chart-grid" aria-hidden="true">{[1, 0.5, 0].map((f) => <div key={f} style={{ bottom: `${f * 100}%` }}><span>{compact(max * f)}</span></div>)}</div>
        {children}
        {empty && <div className="chart-empty">{empty}</div>}
      </div>
      <div className="chart-x"><span>{first}</span><span>{last}</span></div>
    </div>
  );
}

/** Vertical bar chart: data = [{label, values: [n, …]}], series = [{name}] (colours follow the series order) */
export function BarChart({ data, series, fmt, height = 180, empty = 'Nothing recorded in this period yet' }) {
  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const [hover, setHover] = useState(null);
  const none = !data.some((d) => d.values.some((v) => v > 0));
  return (
    <div onMouseLeave={() => setHover(null)}>
      <ChartFrame max={max} height={height} empty={none && empty} first={data[0]?.label} last={data[data.length - 1]?.label}>
        <div className="bars">
          {data.map((d, n) => (
            <div key={d.label} className={'bar-group' + (hover === n ? ' on' : '')} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} tabIndex={0} role="img"
              aria-label={`${d.label}: ${d.values.map((v, i) => `${series[i].name} ${fmt(v)}`).join(', ')}`}>
              {d.values.map((v, i) => <div key={i} className={'bar-fill s' + (i + 1)} style={{ height: v > 0 ? `max(2px, ${(v / max) * 100}%)` : 0 }} />)}
              {hover === n && (
                <div className={'chart-tooltip' + (n > data.length * 0.6 ? ' left' : '')} role="status">
                  <strong>{d.label}</strong>
                  {d.values.map((v, i) => <span key={i}><i className={'viz-swatch s' + (i + 1)} />{series[i].name}<b>{fmt(v)}</b></span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </ChartFrame>
      {series.length > 1 && <div className="legend chart-legend">{series.map((x, i) => <span key={x.name}><i className={'viz-swatch s' + (i + 1)} />{x.name}</span>)}</div>}
    </div>
  );
}

/** Smooth area chart for a single series: data = [{label, value}] */
export function AreaChart({ data, fmt, height = 170, empty = 'No sales in this period yet' }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = height;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const pts = data.map((d, i) => [(i * W) / Math.max(1, data.length - 1), H - (d.value / max) * H]);
  const path = pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`;
    const [x0, y0] = pts[i - 1];
    const cx = (x0 + p[0]) / 2;
    return `C${cx},${y0} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  const total = data.reduce((a, d) => a + d.value, 0);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const h = hover != null ? pts[hover] : null;
  return (
    <div>
      <div className="chart-total">Total <strong>{fmt(total)}</strong></div>
      <ChartFrame max={max} height={H} empty={!total && empty} first={data[0]?.label} last={data[data.length - 1]?.label}>
        <svg className="area-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Sales, total ${fmt(total)}`}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity=".22" />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {total > 0 && pts.length > 1 && <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#areaFill)" />}
          {total > 0 && pts.length > 1 && <path className="line" d={path} vectorEffect="non-scaling-stroke" />}
          {h && total > 0 && <line className="crosshair" x1={h[0]} x2={h[0]} y1="0" y2={H} vectorEffect="non-scaling-stroke" />}
        </svg>
        {h && total > 0 && <>
          <i className="area-dot" style={{ left: `${(h[0] / W) * 100}%`, top: `${(h[1] / H) * 100}%` }} />
          <div className={'chart-tooltip' + (hover > data.length * 0.6 ? ' left' : '')} style={{ left: `${(h[0] / W) * 100}%`, top: `${(h[1] / H) * 100}%` }} role="status">
            <strong>{data[hover].label}</strong><span><i className="viz-swatch s1" />Sales<b>{fmt(data[hover].value)}</b></span>
          </div>
        </>}
      </ChartFrame>
    </div>
  );
}

/** "PDF" button: exports what is on screen inside `target` (a ref), or the rows given in `data` */
export function PdfButton({ target, title, subtitle, file, data, label = 'PDF', className = 'btn ghost' }) {
  const { db } = useStore();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const name = await pagePdf(target?.current || null, { title, subtitle, file, db, data: typeof data === 'function' ? data() : data }); toast(`Saved ${name}`); }
    catch (e) { toast(e.message || 'The PDF could not be made', 'error'); }
    finally { setBusy(false); }
  };
  return <button type="button" className={className} onClick={go} disabled={busy} title="Download as PDF">{busy ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}{label}</button>;
}

/** Download a receipt / proforma as a PDF */
export function ReceiptPdfButton({ sale, className = 'btn ghost', label = 'PDF' }) {
  const { db, fmt } = useStore();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const name = await receiptPdf(sale, { db, fmt }); toast(`Saved ${name}`); }
    catch (e) { toast(e.message || 'The PDF could not be made', 'error'); }
    finally { setBusy(false); }
  };
  return <button type="button" className={className} onClick={go} disabled={busy} title="Download the receipt as a PDF">{busy ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}{label}</button>;
}

/** A tip shown the first time someone opens a page; dismissed once, remembered on this device */
export function PageTip({ id, title, children }) {
  const key = 'rxpos-tip:' + id;
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(key); } catch { return false; } });
  if (!open) return null;
  const close = () => { try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ } setOpen(false); };
  return (
    <div className="page-tip" role="note">
      <Lightbulb size={18} />
      <div className="grow"><strong>{title}</strong><div className="small">{children}</div></div>
      <button type="button" className="btn sm ghost" onClick={close}>Got it</button>
    </div>
  );
}

/** What kind of payment a method name is (for its colour): cash, momo, card, credit or '' (other) */
export function payKind(name, methods = []) {
  const m = methods.find((x) => x.name === name);
  const t = m?.type || '';
  if (t === 'cash' || t === 'momo' || t === 'credit') return t;
  if (/card|visa|master/i.test(name || '') || m?.id === 'card') return 'card';
  if (/momo|mobile money|airtel|mtn/i.test(name || '')) return 'momo';
  return /^cash$/i.test(name || '') ? 'cash' : '';
}
/** A payment method as a labelled colour chip (the label always shows: colour is never the only cue) */
export function PayChip({ name }) {
  const { db } = useStore();
  return <span className={'pay-chip ' + payKind(name, db.settings.paymentMethods || [])}>{name || '—'}</span>;
}

/** Page through a long list: "Show N per page" and page buttons. Returns the rows of the current page. */
export function usePages(rows, initial = 25) {
  const [size, setSize] = useState(initial);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages);
  return { rows: rows.slice((at - 1) * size, at * size), page: at, pages, size, setSize: (n) => { setSize(n); setPage(1); }, setPage, total: rows.length };
}
export function Pager({ p, sizes = [25, 50, 100] }) {
  if (p.total <= sizes[0]) return null;
  const nums = [...new Set([1, p.page - 1, p.page, p.page + 1, p.pages])].filter((n) => n >= 1 && n <= p.pages).sort((a, b) => a - b);
  return (
    <div className="pager no-print">
      <label className="muted small">Show <select value={p.size} onChange={(e) => p.setSize(Number(e.target.value))}>{sizes.map((n) => <option key={n}>{n}</option>)}</select> per page · {((p.page - 1) * p.size + 1).toLocaleString()}–{Math.min(p.page * p.size, p.total).toLocaleString()} of {p.total.toLocaleString()}</label>
      <span className="pager-btns">
        <button className="btn sm ghost" disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)} aria-label="Previous page">‹</button>
        {nums.map((n, i) => <span key={n}>{i && n - nums[i - 1] > 1 ? <span className="muted"> … </span> : null}<button className={'btn sm ' + (n === p.page ? 'primary' : 'ghost')} aria-current={n === p.page ? 'page' : undefined} onClick={() => p.setPage(n)}>{n}</button></span>)}
        <button className="btn sm ghost" disabled={p.page === p.pages} onClick={() => p.setPage(p.page + 1)} aria-label="Next page">›</button>
      </span>
    </div>
  );
}

/** Click-to-sort column headers: const s = useSort(rows, { date: (r) => r.date }, 'date'); <SortTh s={s} k="date">Date</SortTh> */
export function useSort(rows, keys, initial, dir = -1) {
  const [by, setBy] = useState(initial);
  const [d, setD] = useState(dir);
  const get = keys[by];
  const sorted = get ? [...rows].sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * d; }) : rows;
  return { rows: sorted, by, dir: d, sort: (k) => { if (k === by) setD(-d); else { setBy(k); setD(k === initial ? dir : 1); } } };
}
export function SortTh({ s, k, children, className = '' }) {
  const on = s.by === k;
  return <th className={className + ' sortable'} aria-sort={on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}><button type="button" className="th-sort" onClick={() => s.sort(k)}>{children}<span aria-hidden="true">{on ? (s.dir > 0 ? ' ▲' : ' ▼') : ' ↕'}</span></button></th>;
}

/**
 * Long lists draw their first rows at once and the rest a moment later, as a low-priority update that gives way to
 * taps and typing: a page with hundreds of rows opens as fast as a short one. Returns how many rows to draw now.
 */
export function useProgressive(total, first = 60, step = 80) {
  const [n, setN] = useState(first);
  useEffect(() => {
    if (total <= n) return;
    // a few rows at a time: drawing hundreds of rows at once is one long freeze the browser can't interrupt
    const go = () => startTransition(() => setN((x) => Math.min(total, x + step)));
    if (window.requestIdleCallback) { const id = requestIdleCallback(go, { timeout: 300 }); return () => cancelIdleCallback(id); }
    const id = setTimeout(go, 50); return () => clearTimeout(id);
  }, [total, n, step]);
  return Math.min(n, total);
}
