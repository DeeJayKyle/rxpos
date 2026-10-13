import { useState } from 'react';
import { useStore, uid, downloadFile, toCSV } from './store.jsx';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ f, value, onChange }) {
  const common = { id: f.key, required: f.required, value: value ?? '', onChange: (e) => onChange(e.target.value) };
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
  else input = <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} {...common} />;
  return (
    <label className={'field' + (f.type === 'checkbox' ? ' check' : '') + (f.full ? ' full' : '')} htmlFor={f.key}>
      <span>{f.label}</span>
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
        {fields.filter((f) => !f.hidden?.(rec)).map((f) => <Field key={f.key} f={f} value={rec[f.key]} onChange={(v) => setRec({ ...rec, [f.key]: v })} />)}
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary">{saveLabel}</button>
      </div>
    </form>
  );
}

/** Generic searchable list + add/edit/delete for a db table. */
export function CrudPage({ title, singular, table, fields, columns, blank = {}, extraActions, rowClass, rows: rowsProp, onSave, headExtra, canDelete = true, filter }) {
  const { db, upsert, remove } = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const all = rowsProp || db[table];
  const rows = all.filter((r) => (!filter || filter(r)) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const name = singular || title.replace(/s$/, '');

  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
        <div className="row gap">
          {headExtra}
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => downloadFile(`${table}.csv`, toCSV(rows.map(({ updatedAt, ...r }) => r)), 'text/csv')}>Export CSV</button>
          <button className="btn primary" onClick={() => setEditing({ ...blank, id: uid(), _new: true })}>+ Add</button>
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
                  <button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                  {canDelete && <button className="btn sm danger" onClick={() => confirm('Delete this record?') && remove(table, r.id)}>Delete</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={columns.length + 1} className="empty">No records</td></tr>}
            {rows.length > 500 && <tr><td colSpan={columns.length + 1} className="empty">Showing 500 of {rows.length}. Use search to narrow down.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={(editing._new ? 'Add ' : 'Edit ') + name} onClose={() => setEditing(null)} wide>
          <RecordForm fields={fields} initial={editing} onCancel={() => setEditing(null)}
            onSave={({ _new, stock, ...rec }) => { onSave ? onSave(rec, _new, editing) : upsert(table, rec); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone }) {
  return <div className={'card stat ' + (tone || '')}><small>{label}</small><strong>{value}</strong>{sub && <span className="muted">{sub}</span>}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => <button key={k} className={'tab' + (value === k ? ' active' : '')} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

/** Simple vertical bar chart: data = [{label, values: [n, …]}], series = [{name, className}] */
export function BarChart({ data, series, fmt, height = 180 }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  return (
    <div>
      <div className="bars" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="bar-group" title={d.label + ': ' + d.values.map((v, i) => `${series[i].name} ${fmt(v)}`).join(', ')}>
            {d.values.map((v, i) => <div key={i} className={'bar-fill ' + series[i].className} style={{ height: `${(v / max) * 100}%` }} />)}
          </div>
        ))}
      </div>
      <div className="row between muted small"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i className={'bar-fill ' + s.className} />{s.name}</span>)}</div>}
    </div>
  );
}
