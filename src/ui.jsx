import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Search, Download, Plus, Pencil, Trash2, Inbox, Lightbulb, TrendingUp, TrendingDown, FileDown, Loader2 } from 'lucide-react';
import { pagePdf, receiptPdf } from './pdf.js';
import { useStore, uid, downloadFile, toCSV } from './store.jsx';
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
  const common = { id: f.key, required: f.required, value: value ?? '', onChange: (e) => onChange(e.target.value), placeholder: f.placeholder, autoFocus: f.autoFocus };
  let input;
  if (f.type === 'checkbox')
    input = <input id={f.key} type="checkbox" autoFocus={f.autoFocus} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
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
    <label className={'field' + (f.type === 'checkbox' ? ' check' : '') + (f.full ? ' full' : '')} htmlFor={f.key}>
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

export function SearchBox({ value, onChange, placeholder = 'Search…', big }) {
  return (
    <div className="search-wrap">
      <Search size={16} />
      <input className={'search' + (big ? ' big' : '')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
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
export function CrudPage({ title, subtitle, singular, table, fields, columns, blank = {}, extraActions, rowClass, rows: rowsProp, onSave, headExtra, canDelete = true, filter }) {
  const { db, upsert, remove } = useStore();
  const location = useLocation();
  const [q, setQ] = useState(location.state?.q || '');
  const [editing, setEditing] = useState(null);
  const all = rowsProp || db[table];
  const ql = q.toLowerCase();
  const rows = all.filter((r) => (!filter || filter(r)) && (!q || JSON.stringify(r).toLowerCase().includes(ql)));
  const name = singular || title.replace(/s$/, '');

  const del = async (r) => {
    if (!(await ask({ title: `Delete this ${name.toLowerCase()}?`, message: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return;
    remove(table, r.id);
    toast(`${name} deleted`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{title}</h1>{subtitle && <div className="sub">{subtitle}</div>}</div>
        <div className="row gap">
          {headExtra}
          <SearchBox value={q} onChange={setQ} />
          <button className="btn ghost" title="Export CSV" onClick={() => downloadFile(`${table}.csv`, toCSV(rows.map(({ updatedAt, ...r }) => r)), 'text/csv')}><Download size={16} />CSV</button>
          <button className="btn primary" onClick={() => setEditing({ ...blank, id: uid(), _new: true })}><Plus size={16} />Add {name.toLowerCase()}</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((r) => (
              <tr key={r.id} className={rowClass?.(r)}>
                {columns.map((c) => <td key={c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="actions">
                  {extraActions?.(r)}
                  <button className="btn sm ghost" onClick={() => setEditing(r)}><Pencil size={14} />Edit</button>
                  {canDelete && <button className="btn sm danger" title="Delete" onClick={() => del(r)}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <Empty colSpan={columns.length + 1}>{q ? `No ${title.toLowerCase()} match “${q}”` : `No ${title.toLowerCase()} yet. Click “Add ${name.toLowerCase()}” to create one.`}</Empty>}
            {rows.length > 500 && <tr><td colSpan={columns.length + 1} className="empty">Showing 500 of {rows.length}. Use search to narrow down.</td></tr>}
          </tbody>
        </table>
      </div>
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

/** Numbers on the dashboard roll up to their value the first time they appear (text stays as given) */
export function CountUp({ value, ms = 700 }) {
  const str = String(value ?? '');
  const m = str.match(/-?[\d,]*\.?\d+/);
  const target = m ? Number(m[0].replace(/,/g, '')) : NaN;
  const [shown, setShown] = useState(() => (isFinite(target) && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : target));
  const first = useRef(true);
  useEffect(() => {
    if (!isFinite(target)) return;
    if (!first.current) { setShown(target); return; }
    first.current = false;
    let raf, t0;
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / ms); setShown(target * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
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
    <div className={'card stat ' + (tone || '') + (to ? ' link' : '')} onClick={go} role={to ? 'link' : undefined} tabIndex={to ? 0 : undefined} onKeyDown={to ? (e) => e.key === 'Enter' && go() : undefined}>
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
  return (
    <div className="tabs" role="tablist">
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
            <div key={d.label} className={'bar-group' + (hover === n ? ' on' : '')} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} tabIndex={0}
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
