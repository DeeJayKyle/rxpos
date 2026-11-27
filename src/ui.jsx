import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useId, startTransition } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Search, Download, Plus, Pencil, Trash2, Inbox, Lightbulb, FileDown, Loader2, Copy, CheckSquare, Ellipsis, ChevronLeft, HelpCircle, ChevronDown } from 'lucide-react';
import { ViewSwitch, BoardView, GalleryView, savedView, saveView } from './components/DataViews.jsx';
import { pagePdf, receiptPdf } from './pdf.js';
import { useStore, uid, downloadFile, toCSV, del as del1 } from './store.jsx';
import { useListControls, useContextMenu } from './listcontrols.jsx';
import { keyOf, showKey } from './keymap.js';
import { deviceSettings, setDevice } from './device.js';
import { useSheetDrag } from './sheet.js';
import { ask, toast } from './feedback.jsx';
import { useFocusTrap } from './focustrap.js';
import { useLoadMore, useColumns, ColTh, useTabOrder, BulkBar, useSwipe, useWide, DetailsPane } from './tablekit.jsx';
import { MoneyInput, PhoneInput, checkField, PhotoField } from './forms.jsx';
import { lastChangeOf, ago } from './auditText.js';
import { DateInput } from './fields.jsx';

/** D7: in a pop-up's form, Enter moves to the next field (the last one sends the form) and Ctrl+Enter sends it at once;
 *  a text area keeps Enter for new lines */
export function enterNext(e) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
  const t = e.target, form = t.form || t.closest?.('form');
  if (!form || !t.matches?.('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); form.requestSubmit?.(); return; }
  if (t.matches('textarea, [data-enter], input[type=checkbox], input[type=radio], input[type=submit], input[type=button]') || e.shiftKey || e.altKey) return;
  const fields = [...form.querySelectorAll('input, select, textarea')].filter((x) => !x.disabled && !x.readOnly && x.type !== 'hidden' && x.offsetParent !== null && !x.closest('[data-enter-skip]'));
  const next = fields[fields.indexOf(t) + 1];
  if (!next) return; // the last field: Enter sends the form
  e.preventDefault();
  next.focus(); next.select?.();
}

/** A pop-up. size: sm 420 · md 640 · lg 960 px (UI batch 3, D9; `wide` is lg). On phones it rises as a sheet with its
 *  main button fixed at the bottom (D8); it opens with the cursor in its first field (D7). */
export function Modal({ title, onClose, children, wide, size }) {
  // focus kept inside, Escape closes only the top dialog, focus goes back on close (src/focustrap.js)
  const ref = useRef(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);
  useSheetDrag(ref, onClose); // 1.18.0: with sheets on, drag it down to close
  // D7: the cursor in the first field, not on the close button (an autoFocus field keeps it)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current, at = document.activeElement;
      if (!el || (el.contains(at) && at.matches('input, select, textarea'))) return;
      const first = [...el.querySelectorAll('input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])')].find((x) => x.offsetParent !== null && !x.closest('[data-no-autofocus]'));
      first?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, []);
  const sz = size || (wide ? 'lg' : 'md');
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={'modal size-' + sz + (sz === 'lg' ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={enterNext}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ f, value, onChange, error, onBlur }) {
  // A unique id per field instance (1.10): f.key alone collides when two forms on a page share a key, which breaks
  // the label-to-input link and aria wiring.
  const id = useId(), errId = useId();
  const store = useStore();
  const db = store?.db;
  const aria = error ? { 'aria-invalid': true, 'aria-describedby': errId } : {};
  const common = { id, required: f.required, value: value ?? '', onChange: (e) => onChange(e.target.value), placeholder: f.placeholder, autoFocus: f.autoFocus, onBlur, ...aria };
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
  // D5 / D6: amounts with the currency and commas; phone numbers formatted with a tick when they can take WhatsApp
  else if (f.type === 'money') input = <MoneyInput {...aria} id={id} required={f.required} autoFocus={f.autoFocus} placeholder={f.placeholder} onBlur={onBlur} currency={db?.settings?.currency || ''} value={value ?? ''} onChange={onChange} />;
  // A5: a medicine's photo (camera or file, made small, stored with the pharmacy's files)
  else if (f.type === 'photo') input = <PhotoField value={value || ''} onChange={onChange} cfg={store?.syncCfg} name={f.name} />;
  else if (f.type === 'phone') input = <PhoneInput {...aria} id={id} required={f.required} autoFocus={f.autoFocus} placeholder={f.placeholder || '0772 123 456'} onBlur={onBlur} value={value ?? ''} onChange={onChange} />;
  // 1.14.0: dates typed and shown in the chosen format (This device → Date format), not the browser's locale
  else if (f.type === 'date') input = <DateInput {...aria} id={id} required={f.required} autoFocus={f.autoFocus} onBlur={onBlur} value={value ?? ''} onChange={onChange} />;
  else input = <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min ?? 0 : undefined} {...common} />;
  return (
    <label className={'field' + (f.type === 'checkbox' ? ' check' : '') + (f.full ? ' full' : '') + (error ? ' has-error' : '')} htmlFor={id}>
      <span>{f.label}{f.required && <b className="text-danger"> *</b>}</span>
      {input}
      {/* 1.16.0 (the owner's clean-up): a field's help always in the same place, under it (no hover needed) */}
      {f.help && !error && <small className="field-help muted">{f.help}</small>}
      {error && <small className="field-error" id={errId} role="alert">{error}</small>}
    </label>
  );
}

export function RecordForm({ fields, initial, onSave, onCancel, saveLabel = 'Save' }) {
  const [rec, setRec] = useState(initial);
  // D1: each field is checked when it is left, and again as it is typed once it has shown an error
  const [errors, setErrors] = useState({});
  const shownFields = fields.filter((f) => !f.hidden?.(rec));
  const check = (f, r = rec) => setErrors((e) => ({ ...e, [f.key]: checkField(f, r[f.key], r) }));
  const submit = (e) => {
    e.preventDefault();
    const all = Object.fromEntries(shownFields.map((f) => [f.key, checkField(f, rec[f.key], rec)]));
    setErrors(all);
    const bad = shownFields.find((f) => all[f.key]);
    if (bad) { e.currentTarget.querySelector(`[aria-invalid=true], label.has-error input, label.has-error select`)?.focus(); setTimeout(() => e.target.querySelector?.('[aria-invalid=true]')?.focus(), 0); return; }
    const out = { ...rec };
    fields.forEach((f) => { if (f.type === 'number' || f.type === 'money') out[f.key] = Number(String(out[f.key] ?? '').replace(/,/g, '') || 0); });
    onSave(out);
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        {shownFields.map((f, i) => (
          <Field key={f.key} f={i === 0 ? { ...f, autoFocus: true } : f.type === 'photo' ? { ...f, name: rec.name } : f} value={rec[f.key]} error={errors[f.key]}
            onBlur={() => check(f)}
            onChange={(v) => { const r = { ...rec, [f.key]: v }; setRec(r); if (errors[f.key]) check(f, r); }} />
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

/** F5 (UI batch 3): "Edited by Amina · 2 h ago" under a record's title, from the audit log, opening its entries */
export function WhoChanged({ keyText, by, at }) {
  const { db } = useStore();
  const navigate = useNavigate();
  const last = by ? { user: by, date: at } : lastChangeOf(db.audit, keyText);
  if (!last?.user) return null;
  return (
    <small className="who-changed" data-testid="who-changed">Edited by {last.user}{last.date ? ` · ${ago(last.date)}` : ''} ·{' '}
      <a href="#/audit" onClick={(e) => { e.preventDefault(); navigate('/audit', { state: { q: keyText } }); }}>history</a></small>
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
export function CrudPage({ title, subtitle, singular, table, fields, columns, blank = {}, extraActions, rowClass, rows: rowsProp, onSave, headExtra, canDelete = true, filter, readOnly = false, rowLocked, bulk, rowMenu, card, board, swipeActions, sideDetails, emptyText, totals, deleteEffects, modalSize }) {
  const { db, upsert, remove, update, user } = useStore();
  // F5: an edit says who made it and when (shown as "Edited by …" when the record opens again)
  const stamp = (rec, isNew) => (isNew ? rec : { ...rec, editedBy: user?.name || '', editedAt: new Date().toISOString() });
  const location = useLocation();
  const qKey = 'rxpos-q:' + table + ':' + location.pathname;
  const [q, setQState] = useState(() => { if (location.state?.q) return location.state.q; try { return sessionStorage.getItem(qKey) || ''; } catch { return ''; } });
  const setQ = (v) => { setQState(v); try { v ? sessionStorage.setItem(qKey, v) : sessionStorage.removeItem(qKey); } catch { /* storage blocked */ } };
  const [editing, setEditing] = useState(null);
  const searchRef = useRef(null);
  const all = rowsProp || db[table];
  const ql = q.toLowerCase();
  const rows = useMemo(() => all.filter((r) => (!filter || filter(r)) && (!q || JSON.stringify(r).toLowerCase().includes(ql))), [all, filter, q, ql]);
  // the shared table (2026-11-26): click a heading to sort by it (a column with a key, or its own sortBy(row)); kept on
  // this device; nothing is sorted until a heading is clicked, so each list keeps its own order
  const sortKeys = useMemo(() => Object.fromEntries(columns.map((c) => [c.label, c.sortBy || (c.key ? (r) => r[c.key] : null)]).filter(([, f]) => f)), [columns]);
  const sorted = useSort(rows, sortKeys, null, 1, 'crud:' + table);
  // UI batch 3: 100 rows then more as the list scrolls (C7)
  const more = useLoadMore(sorted.rows, { resetKey: q + '|' + sorted.by + '|' + sorted.dir });
  const shown = more.rows;
  const name = singular || title.replace(/s$/, '');
  const startNew = () => !readOnly && setEditing({ ...blank, id: uid(), _new: true });
  const editRow = (r) => !readOnly && !rowLocked?.(r) && setEditing(r);
  // a command from Ctrl+K ("Add a customer") opens the form at once
  useEffect(() => { if (location.state?.create) startNew(); }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // the columns shown and their order, per device (the first is always shown; UI batch 3, C2)
  const colsK = useColumns('crud:' + table, columns.map((c, i) => ({ id: c.label, label: c.label, fixed: i === 0 })), deviceSettings().hiddenCols?.[table]);
  // 1.16.0 (the owner's clean-up): a column marked empty(row) is left out while it is empty on every row in the list
  const cols = colsK.shown.map((id) => columns.find((c) => c.label === id)).filter(Boolean).filter((c) => !c.empty || rows.some((r) => !c.empty(r)));
  const cur = db.settings?.currency || '';
  const wide = useWide(); // C8: the record beside the list on wide screens (pages that ask for it)
  const swipe = useSwipe(); // C10: phones: a row swiped shows its actions (pages that give them)
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
    if (!(await ask({ title: one ? `Delete this ${name.toLowerCase()}?` : `Delete ${rs.length} ${title.toLowerCase()}?`, message: `${one ? '' : rs.slice(0, 5).map((r) => r.name || r.description || r.number || r.id).join(', ') + (rs.length > 5 ? '…' : '') + '. '}This cannot be undone.`,
      // D10: what goes, in counts, beside the red button
      effects: [`${rs.length} ${one ? name.toLowerCase() : title.toLowerCase()} removed on every device`, ...(deleteEffects?.(rs) || [])], confirmText: 'Delete', danger: true }))) return;
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
          {shownView === 'table' && colsK.button}
          <ExportMenu><button className="btn ghost" title="Export CSV (the ticked rows, or all shown)" onClick={() => exportRows(lc.tickedRows.length ? lc.tickedRows : rows)}><Download size={16} />CSV</button></ExportMenu>
          {!readOnly && <button className="btn primary" onClick={startNew} title={`Add ${name.toLowerCase()} (${showKey(keyOf('list:new'))})`}><Plus size={16} />Add {name.toLowerCase()}</button>}
        </div>
      </div>
      <BulkBar count={lc.ticked.size} onClear={lc.clear} actions={[
        { label: 'Export', Icon: Download, run: () => exportRows(lc.tickedRows) },
        ...(bulk?.(lc.tickedRows) || []).map((b) => ({ ...b, run: () => b.run(lc.tickedRows, lc.clear) })),
        canDelete && !readOnly && { label: 'Delete', Icon: Trash2, danger: true, run: () => del(lc.tickedRows) },
      ]} />
      {shownView === 'board' && <BoardView rows={rows} board={board} card={card} onOpen={readOnly ? null : editRow} onMenu={(e, r) => rowMenuFor(e, r, shown.indexOf(r))} />}
      {shownView === 'gallery' && <GalleryView rows={rows} card={card} onOpen={readOnly ? null : editRow} onMenu={(e, r) => rowMenuFor(e, r, shown.indexOf(r))} />}
      {shownView === 'table' && <div className={'list-and-details' + (sideDetails && wide && editing && !editing._new ? ' with-details' : '')}><div className="card table-wrap">
        <table className="phone-rows">
          <thead>
            <tr><th className="tick"><input {...lc.allProps} /></th>{cols.map((c) => <ColTh key={c.label} cols={colsK} id={c.label} sort={sorted} k={sortKeys[c.label] ? c.label : undefined} className={c.num ? 'num' : ''}>{c.label}{c.num && cur && shown.some((r) => isMoney(c.render ? c.render(r) : r[c.key], cur)) && <small className="th-cur"> ({cur})</small>}</ColTh>)}<th /></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const rp = lc.rowProps(r, i, rowMenuFor);
              return (
              <tr key={r.id} {...rp} {...(swipeActions ? swipe.props(r.id) : {})} className={[rowClass?.(r), rp.className, sideDetails && wide && editing?.id === r.id ? 'row-open' : ''].filter(Boolean).join(' ')}>
                <td className="tick"><input {...lc.tickProps(r, i)} /></td>
                {cols.map((c, ci) => <td key={c.label} data-label={ci ? c.label : undefined} className={[c.num ? 'num' : '', ci ? '' : 'row-title'].filter(Boolean).join(' ')}>{c.num ? moneyCell(c.render ? c.render(r) : r[c.key], cur) : c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="actions">
                  {extraActions?.(r)}
                  {!readOnly && rowLocked?.(r) && <span className="muted" title="This day is closed: it can't be changed">Day closed</span>}
                  {!readOnly && !rowLocked?.(r) && <button className="btn sm ghost" onClick={() => setEditing(r)}><Pencil size={14} />Edit</button>}
                  {deletable(r) && <button className="btn sm danger" title="Delete" aria-label="Delete" onClick={() => del([r])}><Trash2 size={14} /></button>}
                  <button type="button" className="icon-btn sm row-more" title="More actions" aria-label="More actions" onClick={(e) => rowMenuFor(e, r, i)}><Ellipsis size={16} /></button>
                  {swipeActions && swipe.openId === r.id && <span className="swipe-acts">{swipeActions(r).filter(Boolean).map((a) => (a.href
                    ? <a key={a.label} className="btn sm" href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={swipe.close}>{a.Icon && <a.Icon size={14} />}{a.label}</a>
                    : <button key={a.label} type="button" className="btn sm" onClick={() => { swipe.close(); a.run(); }}>{a.Icon && <a.Icon size={14} />}{a.label}</button>))}</span>}
                </td>
              </tr>
              );
            })}
            {!rows.length && <Empty colSpan={cols.length + 2} action={!q && !readOnly ? { label: `Add ${name.toLowerCase()}`, onClick: startNew } : undefined}>{q ? `No ${title.toLowerCase()} match “${q}”. Try fewer letters or another word.` : emptyText || `No ${title.toLowerCase()} yet.${readOnly ? '' : ` Add the first one and it shows here.`}`}</Empty>}
          </tbody>
          {/* C1: a money total pinned at the bottom (totals: { [column label]: (rows) => text }) */}
          {totals && rows.length > 0 && <tfoot><tr className="total-row"><td />{cols.map((c, ci) => <td key={c.label} className={c.num ? 'num' : ''}>{totals[c.label] ? totals[c.label](rows) : ci === 0 ? `Total · ${rows.length.toLocaleString()}` : ''}</td>)}<td /></tr></tfoot>}
        </table>
        {more.footer}
      </div>
      {sideDetails && wide && editing && !editing._new && (
        <DetailsPane wide title={'Edit ' + name.toLowerCase()} onClose={() => setEditing(null)}>
          <WhoChanged keyText={editing.name || editing.number || editing.description} by={editing.editedBy} at={editing.editedAt} />
          <RecordForm key={editing.id} fields={fields} initial={editing} onCancel={() => setEditing(null)}
            onSave={({ _new, stock, ...raw }) => { const rec = stamp(raw, _new); onSave ? onSave(rec, _new, editing) : upsert(table, rec); setEditing(null); toast(`${name} saved`, 'success', { sync: true }); }} />
        </DetailsPane>
      )}
      </div>}
      {menu.node}
      {editing && !(sideDetails && wide && !editing._new && shownView === 'table') && (
        <Modal title={(editing._new ? 'Add ' : 'Edit ') + name.toLowerCase()} onClose={() => setEditing(null)} size={modalSize || (fields.length > 12 ? 'lg' : 'md')}>
          {!editing._new && <WhoChanged keyText={editing.name || editing.number || editing.description} by={editing.editedBy} at={editing.editedAt} />}
          <RecordForm fields={fields} initial={editing} onCancel={() => setEditing(null)}
            onSave={({ _new, stock, ...raw }) => {
              const rec = stamp(raw, _new);
              onSave ? onSave(rec, _new, editing) : upsert(table, rec);
              setEditing(null);
              toast(`${name} ${_new ? 'added' : 'saved'}`, 'success', { sync: true });
            }} />
        </Modal>
      )}
    </div>
  );
}

/** Numbers on the dashboard roll up to their value when they first appear, and glide to a new value when the data
 * changes (text stays as given; the last frame is always the exact value; off with reduced motion) */
// 1.16.0 (the owner's clean-up, less motion): numbers roll up the first time a page shows them in a session, not on
// every visit; a change after that still glides
let rolledOnce = false;
export function CountUp({ value, ms = 700 }) {
  const str = String(value ?? '');
  const m = str.match(/-?[\d,]*\.?\d+/);
  const target = m ? Number(m[0].replace(/,/g, '')) : NaN;
  const still = () => rolledOnce || matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { const t = setTimeout(() => { rolledOnce = true; }, ms + 200); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

/** A page's shape while it loads (2026-11-18: skeletons, not a spinner or a blank page) */
export function PageSkeleton({ label = 'Loading' }) {
  return (
    <div className="page page-skeleton" role="status" aria-label={label}>
      <div className="sk sk-title" /><div className="sk sk-sub" />
      <div className="sk-row">{[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-card" />)}</div>
      <div className="sk sk-table">{Array.from({ length: 7 }, (_, i) => <div key={i} className="sk-line" />)}</div>
    </div>
  );
}

/** A tiny 7-day trend line for a figure card (2026-11-18); the last point is today */
export function Spark({ data }) {
  if (!data?.length || data.every((v) => !v)) return null;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1, w = 84, h = 26;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polygon points={`0,${h} ${line} ${w},${h}`} />
      <polyline points={line} />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="2.6" />
    </svg>
  );
}

/** A figure card. full: the whole amount when value is said short (UGX 1.2M, UI batch 3 B6): it is the card's tooltip
 *  and what screen readers say. The change and the "vs yesterday" line stay on one line (B2), the rest in the tooltip. */
/** A figure's percentage as a ring (the owner's reference, 1.15.0): [pct] the share, drawn up to 100%, [title] what it is */
export function StatRing({ pct, title }) {
  const c = 2 * Math.PI * 18, f = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <span className="stat-ring" title={title} role="img" aria-label={`${pct}% ${title}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true"><circle className="ring-track" cx="22" cy="22" r="18" />{f > 0 && <circle className="ring-arc" cx="22" cy="22" r="18" strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 22 22)" />}</svg>
      <b>{pct}%</b>
    </span>
  );
}

export function Stat({ label, value, full, sub, tone, icon: Icon, delta, to, state, goodDown, spark, ring, hint }) {
  const navigate = useNavigate();
  const go = to ? () => navigate(to, state ? { state } : undefined) : undefined;
  const short = full && full !== value;
  const d = delta != null && isFinite(delta) ? `${delta >= 0 ? '▲ +' : '▼ −'}${Math.abs(Math.round(delta))}%` : '';
  return (
    <div className={'card stat ' + (tone || '') + (to ? ' link' : '') + (/\balert\b/.test(tone || '') && Number(value) > 0 ? ' flagged' : '')} onClick={go} role={to ? 'link' : undefined} tabIndex={to ? 0 : undefined} onKeyDown={to ? (e) => e.key === 'Enter' && go() : undefined} title={hint}>
      {Icon && <span className="stat-icon"><Icon size={20} /></span>}
      <small>{label}</small>
      <strong title={short ? full : undefined} aria-label={short ? full : undefined} data-full={short ? full : undefined}>{short ? value : <CountUp value={value} />}</strong>
      {spark && <Spark data={spark} />}
      {ring && ring.pct != null && <StatRing {...ring} />}
      {(d || sub) && <span className="muted small stat-sub" title={typeof sub === 'string' ? (d ? d + ' ' : '') + sub : undefined}>
        {d && <span className={'delta ' + (delta >= 0 ? 'up' : 'down') + (goodDown ? ' inverse' : '')}>{d} </span>}
        {sub}
      </span>}
    </div>
  );
}

/** A page's side view (held sales, drafts, supplier prices): a button to open it, and "‹ back" while it is open
 *  (the owner's choice, 2026-11-15: a button instead of a tab) */
export function SubViews({ value, main, mainLabel, views, onChange }) {
  const cur = views.find(([k]) => k === value);
  if (value !== main && cur) return (
    <div className="subview-bar">
      <button type="button" className="btn ghost sm" onClick={() => onChange(main)}><ChevronLeft size={16} />{mainLabel}</button>
      <h2>{cur[1]}</h2>
    </div>
  );
  return (
    <div className="list-filters end">
      {views.map(([k, label, n, Icon]) => <button key={k} type="button" className={'btn sm ghost subview-btn' + (n > 0 ? ' has-count' : '')} onClick={() => onChange(k)}>{Icon && <Icon size={15} />}{label}{n > 0 && <span className="badge-count">{n}</span>}</button>)}
    </div>
  );
}

/** A small filter beside a page's search box (the owner's choice, 2026-11-15: filters, not a strip of tabs) */
export function FilterChips({ options, value, onChange, label = 'Show' }) {
  return (
    <div className="seg filter-chips" role="radiogroup" aria-label={label}>
      {options.map(([k, text, n]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {text}{n != null && <span className="chip-count">{n.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, id }) {
  // each set of tabs moves and hides like columns (useTabOrder); named by its page and its tabs unless given an id
  const { pathname } = useLocation();
  const keys = tabs.map(([k]) => k);
  const order = useTabOrder(id || pathname.split('/')[1] + ':' + keys.join(','), keys, value);
  const byKey = Object.fromEntries(tabs);
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
      {order.keys.map((k) => { const p = order.props(k, typeof byKey[k] === 'string' ? byKey[k] : 'this tab'); return <button key={k} type="button" role="tab" aria-selected={value === k} {...p} className={['tab', value === k ? 'active' : '', p.className].filter(Boolean).join(' ')} onClick={() => onChange(k)}>{byKey[k]}</button>; })}
      {order.menu}
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

/** 1.16.0 (the owner's clean-up, P): in tables the currency goes in the column heading ("Total (UGX)"); in each cell it
 *  stays in the text (read out, copied, printed) but out of sight, so the numbers stand alone and line up */
export const isMoney = (v, cur) => typeof v === 'string' && !!cur && v.startsWith(cur + ' ');
export function moneyCell(v, cur) {
  return isMoney(v, cur) ? <><span className="cur">{cur} </span>{v.slice(cur.length + 1)}</> : v;
}

/** 1.16.0 (the owner's clean-up): a page's CSV, PDF and other downloads behind one "Export" button. The choices stay in
 *  the page (hidden until opened), so a key or a script can still reach them. */
export function ExportMenu({ children, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="export-menu" ref={box}>
      <button type="button" className="btn ghost export-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Download size={16} />{label}<ChevronDown size={14} aria-hidden="true" /></button>
      <div className="export-drop" role="menu" hidden={!open} onClick={() => setOpen(false)}>{children}</div>
    </div>
  );
}

/** A page's tip behind a small "?" (1.16.0, the owner's clean-up): nothing shows on its own; the "?" is always there,
 *  and opens the tip under it until it is closed */
export function PageTip({ id, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="page-help" data-tip={id}>
      <button type="button" className="help-q" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Help: ${title}`} title={`Help: ${title}`}><HelpCircle size={16} /></button>
      {open && (
        <div className="page-tip" role="note">
          <Lightbulb size={18} />
          <div className="grow"><strong>{title}</strong><div className="small">{children}</div></div>
          <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </span>
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

/** Click-to-sort column headers: const s = useSort(rows, { date: (r) => r.date }, 'date'); <SortTh s={s} k="date">Date</SortTh>
 *  saveKey: the sort is kept on this device for that list (the shared table, 2026-11-26) */
const SORT_TEXT = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const sortCompare = (x, y) => {
  if (x == null || x === '') return y == null || y === '' ? 0 : 1; // blanks last either way round
  if (y == null || y === '') return -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return SORT_TEXT.compare(String(x), String(y));
};
export function useSort(rows, keys, initial, dir = -1, saveKey) {
  const kept = saveKey ? deviceSettings().sorts?.[saveKey] : null;
  const [by, setBy] = useState(kept && (keys[kept.by] || kept.by === null) ? kept.by : initial);
  const [d, setD] = useState(kept?.dir === 1 || kept?.dir === -1 ? kept.dir : dir);
  const keep = (b, x) => { if (saveKey) setDevice({ sorts: { ...(deviceSettings().sorts || {}), [saveKey]: { by: b, dir: x } } }); };
  const get = keys[by];
  const sorted = useMemo(() => (get ? [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if ((x == null || x === '') !== (y == null || y === '')) return sortCompare(x, y); // blanks stay last
    return sortCompare(x, y) * d;
  }) : rows), [rows, get, d]);
  return { rows: sorted, by, dir: d, sort: (k) => { if (k === by) { setD(-d); keep(by, -d); } else { const nd = k === initial ? dir : 1; setBy(k); setD(nd); keep(k, nd); } } };
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

/** A status in words, an icon and a colour (never colour alone): purchase orders and other records with a stage */
const STATUS_LOOK = {
  Requested: ['info', '?'], Draft: ['warn', '✎'], Sent: ['info', '➤'], Received: ['ok', '✓'], Pending: ['warn', '•'], Paid: ['ok', '✓'], Owing: ['warn', '!'], Refunded: ['muted', '↺'], Cancelled: ['muted', '×'],
};
export function StatusPill({ status }) {
  const [tone, mark] = STATUS_LOOK[status] || ['muted', '•'];
  return <span className={'status-pill ' + tone} data-status={status}><span aria-hidden="true">{mark}</span> {status}</span>;
}
