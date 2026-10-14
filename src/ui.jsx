import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Search, Download, Plus, Pencil, Trash2, Inbox, TrendingUp, TrendingDown } from 'lucide-react';
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
  const common = { id: f.key, required: f.required, value: value ?? '', onChange: (e) => onChange(e.target.value), placeholder: f.placeholder };
  let input;
  if (f.type === 'checkbox')
    input = <input id={f.key} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
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

export function Empty({ children = 'Nothing here yet', colSpan }) {
  const body = <div className="cart-empty"><Inbox size={34} /><span>{children}</span></div>;
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

export function Stat({ label, value, sub, tone, icon: Icon, delta, to, state }) {
  const navigate = useNavigate();
  const go = to ? () => navigate(to, state ? { state } : undefined) : undefined;
  return (
    <div className={'card stat ' + (tone || '') + (to ? ' link' : '')} onClick={go} role={to ? 'link' : undefined} tabIndex={to ? 0 : undefined} onKeyDown={to ? (e) => e.key === 'Enter' && go() : undefined}>
      {Icon && <span className="stat-icon"><Icon size={20} /></span>}
      <small>{label}</small>
      <strong>{value}</strong>
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

/** Vertical bar chart: data = [{label, values: [n, …]}], series = [{name, className}] */
export function BarChart({ data, series, fmt, height = 180 }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const [hover, setHover] = useState(null);
  return (
    <div>
      <div className="chart-tip">{hover ? <><strong>{hover.label}</strong> · {hover.values.map((v, i) => `${series[i].name} ${fmt(v)}`).join(' · ')}</> : ' '}</div>
      <div className="bars" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d) => (
          <div key={d.label} className="bar-group" onMouseEnter={() => setHover(d)}>
            {d.values.map((v, i) => <div key={i} className={'bar-fill ' + series[i].className} style={{ height: `${(v / max) * 100}%` }} />)}
          </div>
        ))}
      </div>
      <div className="row between muted small" style={{ marginTop: 6 }}><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i className={'bar-fill ' + s.className} />{s.name}</span>)}</div>}
    </div>
  );
}

/** Smooth area chart for a single series: data = [{label, value}] */
export function AreaChart({ data, fmt, height = 170 }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = height, pad = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data.map((d, i) => [pad + (i * (W - pad * 2)) / Math.max(1, data.length - 1), H - pad - (d.value / max) * (H - pad * 2 - 10)]);
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
  return (
    <div>
      <div className="chart-tip">{hover != null ? <><strong>{data[hover].label}</strong> · {fmt(data[hover].value)}</> : <>Total <strong>{fmt(total)}</strong></>}</div>
      <svg className="area-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity=".32" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="grid" x1="0" x2={W} y1={H * f} y2={H * f} />)}
        {pts.length > 1 && <path d={`${path} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="url(#areaFill)" />}
        {pts.length > 1 && <path className="line" d={path} vectorEffect="non-scaling-stroke" />}
        {hover != null && <><line className="grid" x1={pts[hover][0]} x2={pts[hover][0]} y1="0" y2={H} /><circle className="dot" cx={pts[hover][0]} cy={pts[hover][1]} r="4" vectorEffect="non-scaling-stroke" /></>}
      </svg>
      <div className="row between muted small" style={{ marginTop: 6 }}><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
    </div>
  );
}
