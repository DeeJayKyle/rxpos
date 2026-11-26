// Tables and lists, UI batch 3 (C): pieces every list shares. The Flutter app has the same in
// rxpos_flutter/lib/core/presentation/table_kit.dart.
//   useLoadMore   C7: 100 rows, then more as the list is scrolled ("Showing 100 of 2,340"), no page buttons
//   useColumns    C2: a "Columns" button: show / hide and reorder the columns, kept on this device
//   ColTh         a heading that moves (drag, or ← →), resizes (drag its right edge) and sorts, as on Add Stock
//   BulkBar       C4: the ticked rows' actions in a bar at the bottom of the screen
//   useSwipe      C10: on phones, a row swiped to the left shows its actions (Call, WhatsApp, Print, Refund…)
//   DetailsPane   C8: on screens 1280 px and wider a row's details open beside the list; narrower, a pop-up
//   HealthBar     C9: a thin bar of stock against the reorder level (2 × reorder = full)
import { useEffect, useRef, useState, useCallback } from 'react';
import { Columns3, ArrowUp, ArrowDown, X, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { deviceSettings, setDevice } from './device.js';
import { Modal } from './ui.jsx';

/** C7: the first `step` rows, then `step` more each time the end of the list comes into view. Sorting and filtering
 *  stay over the whole list (the caller passes the whole, sorted list). resetKey: start again (a new search). */
export function useLoadMore(rows, { step = 100, resetKey } = {}) {
  const [n, setN] = useState(step);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setN(step); }
  const more = useCallback(() => setN((x) => x + step), [step]);
  const shown = rows.length > n ? rows.slice(0, n) : rows;
  const sentinel = useRef(null);
  const left = rows.length - shown.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !left || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [left, more, shown.length]);
  const footer = left > 0 ? (
    <div className="load-more no-print" ref={sentinel} role="status">
      <span className="muted small">Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()}</span>
      <button type="button" className="btn sm ghost" onClick={more}>Show {Math.min(step, left).toLocaleString()} more</button>
    </div>
  ) : null;
  return { rows: shown, total: rows.length, footer, more };
}

/** C2: the columns of a list in this device's order, the hidden ones left out. defs: [{ id, label, fixed }] (a fixed
 *  column is always shown, first). Returns { shown: [ids], has(id), button, width(id), setWidth, moveTo, drag }.
 *  Phase 1 of the shared table (the owner's request, 2026-11-26): every list's columns move the way Add Stock's do
 *  (drag a heading, or its arrows) and are resized by dragging a heading's right edge; see ColTh. */
export function useColumns(key, defs, legacyHidden) {
  // legacyHidden: the columns this device had hidden before they could be ordered (kept)
  const read = () => deviceSettings().columns?.[key] || (legacyHidden?.length ? { hidden: legacyHidden } : {});
  const [saved, setSaved] = useState(read);
  const save = (v) => { setSaved(v); setDevice({ columns: { ...(deviceSettings().columns || {}), [key]: v } }); };
  const ids = defs.map((d) => d.id);
  const order = [...(saved.order || []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(saved.order || []).includes(id))];
  const fixed = defs.filter((d) => d.fixed).map((d) => d.id);
  const movable = order.filter((id) => !fixed.includes(id));
  const hidden = new Set(saved.hidden || []);
  const shown = [...fixed, ...movable.filter((id) => !hidden.has(id))];
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const move = (id, d) => { const o = [...movable]; const i = o.indexOf(id); [o[i], o[i + d]] = [o[i + d], o[i]]; save({ ...saved, order: [...fixed, ...o] }); };
  /** id to the place of the shown column `before` (a heading dropped on another heading) */
  const moveTo = (id, before) => {
    if (fixed.includes(id) || id === before) return;
    const o = movable.filter((x) => x !== id);
    const at = fixed.includes(before) ? 0 : o.indexOf(before);
    const from = movable.indexOf(id), to = movable.indexOf(before);
    o.splice(at < 0 ? o.length : at + (from < to ? 1 : 0), 0, id);
    save({ ...saved, order: [...fixed, ...o] });
  };
  const toggle = (id) => { const h = new Set(hidden); h.has(id) ? h.delete(id) : h.add(id); save({ ...saved, hidden: [...h] }); };
  const widths = saved.widths || {};
  const width = (id) => (Number(widths[id]) > 0 ? Number(widths[id]) : undefined);
  /** a column's width in px (blank: as wide as its content); live: shown but not kept yet (while dragging the edge) */
  const [liveW, setLiveW] = useState(null);
  const setWidth = (id, w, live) => {
    if (live) return setLiveW({ id, w });
    setLiveW(null);
    const next = { ...widths }; if (w > 0) next[id] = Math.round(Math.max(MIN_COL_W, Math.min(MAX_COL_W, w))); else delete next[id];
    save({ ...saved, widths: next });
  };
  const label = (id) => defs.find((d) => d.id === id)?.label || id;
  const changed = !!(saved.order?.length || saved.hidden?.length || Object.keys(widths).length);
  const button = (
    <span className="col-chooser-wrap" ref={wrap}>
      <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Choose, order and size the columns shown on this device (or drag a heading, and its right edge)"><Columns3 size={16} />Columns</button>
      {open && (
        <div className="col-chooser" role="group" aria-label="Columns shown">
          {fixed.map((id) => <label key={id} className="field check"><input type="checkbox" checked disabled /><span>{label(id)}</span></label>)}
          {movable.map((id, i) => (
            <div key={id} className="col-row" data-col={id}>
              <label className="field check"><input type="checkbox" checked={!hidden.has(id)} onChange={() => toggle(id)} /><span>{label(id)}</span></label>
              <button type="button" className="icon-btn sm" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => move(id, -1)}><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn sm" aria-label={`Move ${label(id)} down`} disabled={i === movable.length - 1} onClick={() => move(id, 1)}><ArrowDown size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn sm ghost" disabled={!changed} onClick={() => save({})}>Standard columns</button>
        </div>
      )}
    </span>
  );
  const visMovable = shown.filter((id) => !fixed.includes(id));
  return {
    shown, has: (id) => shown.includes(id), button, label, fixed, changed, reset: () => save({}),
    width: (id) => (liveW?.id === id ? liveW.w : width(id)), setWidth, moveTo,
    /** move a shown column one place left (-1) or right (+1) among the shown ones */
    step: (id, d) => { const i = visMovable.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= visMovable.length) return; moveTo(id, visMovable[j]); },
    canStep: (id, d) => { const i = visMovable.indexOf(id); return i >= 0 && i + d >= 0 && i + d < visMovable.length; },
    dragId, setDragId,
  };
}
const MIN_COL_W = 48, MAX_COL_W = 900;

/**
 * A column heading that moves and resizes like Add Stock's (the owner's request, 2026-11-26): drag the heading onto
 * another to move it there (or its ← → arrows), drag its right edge to make it wider or narrower (double-click the
 * edge: as wide as its content; ← → on the edge: 16 px), click it to sort when `sort` (a useSort) and `k` are given.
 * cols: a useColumns. A fixed column (the first) resizes and sorts but stays first.
 */
export function ColTh({ cols, id, children, sort, k, className = '', style, title }) {
  const fixed = cols.fixed.includes(id);
  const w = cols.width(id);
  const ref = useRef(null);
  const name = typeof children === 'string' ? children : cols.label(id);
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const th = ref.current; if (!th) return;
    const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
    let last = w0;
    const onMove = (ev) => { last = Math.max(MIN_COL_W, w0 + ev.clientX - x0); cols.setWidth(id, last, true); };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.classList.remove('col-resizing'); cols.setWidth(id, last); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    document.body.classList.add('col-resizing');
  };
  const onEdgeKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    const cur = w || ref.current?.getBoundingClientRect().width || 120;
    cols.setWidth(id, cur + (e.key === 'ArrowRight' ? 16 : -16));
  };
  const on = sort && k && sort.by === k;
  const sized = w ? { width: w, minWidth: w, maxWidth: w } : null;
  return (
    <th ref={ref} data-col={id} className={['col-move', sort && k ? 'sortable' : '', cols.dragId === id ? 'dragging' : '', w ? 'col-sized' : '', className].filter(Boolean).join(' ')}
      style={{ ...style, ...sized }} aria-sort={sort && k ? (on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') : undefined}
      draggable={!fixed} title={title || (fixed ? undefined : 'Drag to move this column; drag its right edge to resize it')}
      onDragStart={fixed ? undefined : (e) => { if (e.target.closest?.('.col-resize')) { e.preventDefault(); return; } cols.setDragId(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* old browsers */ } }}
      onDragEnd={() => cols.setDragId(null)}
      onDragOver={(e) => { if (cols.dragId && cols.dragId !== id) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (cols.dragId) cols.moveTo(cols.dragId, id); cols.setDragId(null); }}>
      <span className="col-head">
        {!fixed && <GripVertical size={12} className="col-grip" aria-hidden="true" />}
        {sort && k
          ? <button type="button" className="th-sort" onClick={() => sort.sort(k)}>{children}<span aria-hidden="true">{on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ' ↕'}</span></button>
          : children}
        {!fixed && (
          <span className="col-arrows">
            <button type="button" className="icon-btn xs" disabled={!cols.canStep(id, -1)} aria-label={`Move ${name} left`} onClick={() => cols.step(id, -1)}><ChevronLeft size={12} /></button>
            <button type="button" className="icon-btn xs" disabled={!cols.canStep(id, 1)} aria-label={`Move ${name} right`} onClick={() => cols.step(id, 1)}><ChevronRight size={12} /></button>
          </span>
        )}
      </span>
      <span className="col-resize" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Resize ${name}`} title="Drag to resize; double-click to fit"
        onPointerDown={startResize} onMouseDown={(e) => e.preventDefault()} onDoubleClick={(e) => { e.stopPropagation(); cols.setWidth(id, 0); }} onKeyDown={onEdgeKey} onClick={(e) => e.stopPropagation()} />
    </th>
  );
}

/** C4: what can be done with the ticked rows, in a bar at the bottom of the screen. actions: [{ label, Icon, run,
 *  danger }] (each page only offers what this person may do; a Delete still asks first) */
export function BulkBar({ count, actions, onClear }) {
  if (!count) return null;
  return (
    <div className="bulk-bar bulk-dock" role="region" aria-label="Ticked rows">
      <strong>{count} selected</strong>
      {actions.filter(Boolean).map((a) => <button key={a.label} type="button" className={'btn sm ' + (a.danger ? 'danger' : '')} onClick={a.run}>{a.Icon && <a.Icon size={14} />}{a.label}</button>)}
      <button type="button" className="icon-btn sm" aria-label="Untick all (Esc)" title="Untick all (Esc)" onClick={onClear}><X size={16} /></button>
    </div>
  );
}

/** C10: on a touch screen, a row swiped to the left shows its actions; tapping elsewhere or swiping back hides them.
 *  Returns props for the row and whether it is open. */
export function useSwipe() {
  const [openId, setOpenId] = useState(null);
  const start = useRef(null);
  useEffect(() => {
    if (!openId) return undefined;
    const close = (e) => { if (!e.target.closest?.('.swipe-acts')) setOpenId(null); };
    document.addEventListener('touchstart', close, { passive: true });
    return () => document.removeEventListener('touchstart', close);
  }, [openId]);
  const props = (id) => ({
    onTouchStart: (e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, id }; },
    onTouchEnd: (e) => {
      const s = start.current; start.current = null;
      if (!s || s.id !== id) return;
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return; // a scroll, not a swipe
      setOpenId(dx < 0 ? id : null);
    },
    'data-swiped': openId === id ? '' : undefined,
  });
  return { props, openId, close: () => setOpenId(null) };
}

/** C8: a record's details beside the list on wide screens (≥ 1280 px), as a pop-up on narrower ones */
export function useWide(min = 1280) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const on = () => setWide(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, [q]);
  return wide;
}
export function DetailsPane({ title, onClose, children, wide }) {
  // Esc closes the pane as it closes a pop-up (not while a pop-up or menu is open over it)
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!wide) return undefined;
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal-bg, .ctx-menu, .col-chooser')) { e.preventDefault(); close.current(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [wide]);
  if (!wide) return <Modal title={title} onClose={onClose}>{children}</Modal>;
  return (
    <aside className="details-pane card" aria-label={title}>
      <div className="details-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
      <div className="details-body">{children}</div>
    </aside>
  );
}

/** C9: stock against the reorder level as a thin bar (twice the reorder level fills it), shaded by its state */
export function HealthBar({ stock, reorder }) {
  const r = Number(reorder) || 0, s = Math.max(0, Number(stock) || 0);
  const full = r > 0 ? r * 2 : Math.max(s, 1);
  const k = Math.min(1, s / full);
  const state = s <= 0 ? 'out' : r > 0 && s <= r ? 'low' : 'ok';
  return <span className={'health-bar ' + state} role="img" aria-label={`Stock ${state === 'out' ? 'out' : state === 'low' ? 'low' : 'good'}: ${s} of a ${r} reorder level`}><i style={{ width: `${Math.max(k * 100, s > 0 ? 4 : 0)}%` }} /></span>;
}
