// Lists the same way everywhere (the owner's request, 2026-11-10: keyboard, mouse, selection): the arrow keys move a
// highlighted row, Enter opens it, E edits, Delete deletes (the ticked rows, or the highlighted one), N adds, / searches,
// Space ticks, Ctrl+A ticks all shown, Esc unticks and clears the search; a click highlights a row, a double-click
// opens it, Shift+click on a tick box ticks the rows in between, and a right-click shows what can be done with it. The
// keys come from the keyboard map (src/keymap.js), so they can be changed per device.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keyMatcher, keyOf, showKey, typing } from './keymap.js';

const LIST_KEYS = ['list:down', 'list:up', 'list:first', 'list:last', 'list:open', 'list:edit', 'list:delete', 'list:new', 'list:search', 'list:tick', 'list:all', 'list:clear'];

/**
 * rows: the rows shown, each with an id · onOpen / onEdit / onDelete(rowsOrRow) / onNew · searchRef: the list's search
 * box · onClearSearch. Returns the highlighted row, the ticked ids and the props for each row and tick box.
 */
export function useListControls({ rows, onOpen, onEdit, onDelete, onNew, searchRef, onClearSearch, enabled = true }) {
  const [active, setActive] = useState(-1);
  const [ticked, setTicked] = useState(() => new Set());
  const last = useRef(-1);
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  // ticks that are no longer shown (filtered away, deleted) drop off
  useEffect(() => { setTicked((t) => { const keep = new Set([...t].filter((id) => ids.includes(id))); return keep.size === t.size ? t : keep; }); }, [ids]);
  useEffect(() => { if (active >= rows.length) setActive(rows.length - 1); }, [rows.length, active]);
  const toggle = useCallback((i, shift) => {
    setTicked((t) => {
      const n = new Set(t);
      if (shift && last.current >= 0) {
        const on = !t.has(ids[i]);
        const [a, b] = [Math.min(last.current, i), Math.max(last.current, i)];
        for (let k = a; k <= b; k++) on ? n.add(ids[k]) : n.delete(ids[k]);
      } else if (n.has(ids[i])) n.delete(ids[i]); else n.add(ids[i]);
      return n;
    });
    last.current = i;
  }, [ids]);
  const tickAll = useCallback(() => setTicked((t) => (t.size === ids.length ? new Set() : new Set(ids))), [ids]);
  const clear = useCallback(() => setTicked(new Set()), []);
  const tickedRows = useMemo(() => rows.filter((r) => ticked.has(r.id)), [rows, ticked]);

  const api = useRef({});
  api.current = { rows, active, ticked, tickedRows, onOpen, onEdit, onDelete, onNew, searchRef, onClearSearch, toggle, tickAll, clear };
  useEffect(() => {
    if (!enabled) return undefined;
    const match = keyMatcher(LIST_KEYS);
    const onKey = (e) => {
      if (document.querySelector('.modal-bg, .ctx-menu')) return;
      const x = api.current;
      if (typing(e)) {
        // in the list's own search box: ↓ goes to the rows, Esc clears it
        if (x.searchRef?.current && e.target === x.searchRef.current) {
          if (e.key === 'ArrowDown' && x.rows.length) { e.preventDefault(); x.searchRef.current.blur(); setActive(0); }
          else if (e.key === 'Escape' && x.onClearSearch) { e.preventDefault(); x.onClearSearch(); x.searchRef.current.blur(); }
        }
        return;
      }
      const id = match(e);
      if (!id) return;
      const n = x.rows.length, r = x.rows[x.active];
      const go = (i) => { e.preventDefault(); setActive(Math.max(0, Math.min(n - 1, i))); };
      if (id === 'list:down') go(x.active + 1);
      else if (id === 'list:up') go(x.active <= 0 ? 0 : x.active - 1);
      else if (id === 'list:first') go(0);
      else if (id === 'list:last') go(n - 1);
      else if (id === 'list:open' && r && (x.onOpen || x.onEdit)) { e.preventDefault(); (x.onOpen || x.onEdit)(r); }
      else if (id === 'list:edit' && r && x.onEdit) { e.preventDefault(); x.onEdit(r); }
      else if (id === 'list:delete' && x.onDelete && (x.tickedRows.length || r)) { e.preventDefault(); x.onDelete(x.tickedRows.length ? x.tickedRows : [r]); }
      else if (id === 'list:new' && x.onNew) { e.preventDefault(); x.onNew(); }
      else if (id === 'list:search' && x.searchRef?.current) { e.preventDefault(); x.searchRef.current.focus(); x.searchRef.current.select?.(); }
      else if (id === 'list:tick' && x.active >= 0) { e.preventDefault(); x.toggle(x.active, e.shiftKey); }
      else if (id === 'list:all' && n) { e.preventDefault(); x.tickAll(); }
      else if (id === 'list:clear') { if (x.ticked.size) { e.preventDefault(); x.clear(); } else if (x.onClearSearch) x.onClearSearch(); setActive(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
  // the highlighted row stays in view
  useLayoutEffect(() => { if (active >= 0) document.querySelector('tr.row-active')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  /** props for row i: highlight on click, open on double-click, the menu on right-click (menu(e, row)) */
  const rowProps = (r, i, menu) => ({
    className: [i === active ? 'row-active' : '', ticked.has(r.id) ? 'row-ticked' : ''].filter(Boolean).join(' '),
    onClick: (e) => { if (!e.target.closest('button, a, input, select, label')) setActive(i); },
    onDoubleClick: (e) => { if (!e.target.closest('button, a, input, select') && (onOpen || onEdit)) { window.getSelection?.()?.removeAllRanges(); (onOpen || onEdit)(r); } },
    onContextMenu: menu ? (e) => { setActive(i); menu(e, r, i); } : undefined,
    'aria-selected': i === active || undefined,
  });
  const tickProps = (r, i) => ({ type: 'checkbox', checked: ticked.has(r.id), 'aria-label': 'Tick this row', onChange: () => {}, onClick: (e) => { e.stopPropagation(); toggle(i, e.shiftKey); } });
  const allProps = { type: 'checkbox', checked: ids.length > 0 && ticked.size === ids.length, ref: (el) => { if (el) el.indeterminate = ticked.size > 0 && ticked.size < ids.length; }, 'aria-label': 'Tick all rows shown', onChange: tickAll };
  return { active, setActive, ticked, tickedRows, toggle, tickAll, clear, rowProps, tickProps, allProps };
}

/** A right-click menu: const menu = useContextMenu(); …onContextMenu={(e) => menu.open(e, items)}…; {menu.node} */
export function useContextMenu() {
  const [at, setAt] = useState(null);
  const ref = useRef(null);
  const close = useCallback(() => setAt(null), []);
  useEffect(() => {
    if (!at) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const b = [...(ref.current?.querySelectorAll('button:not(:disabled)') || [])];
        const i = b.indexOf(document.activeElement);
        b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
      }
    };
    window.addEventListener('mousedown', off, true); window.addEventListener('keydown', key, true); window.addEventListener('blur', close); window.addEventListener('resize', close);
    document.querySelector('main.content')?.addEventListener('scroll', close, { passive: true });
    setTimeout(() => ref.current?.querySelector('button')?.focus(), 0);
    return () => { window.removeEventListener('mousedown', off, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); document.querySelector('main.content')?.removeEventListener('scroll', close); };
  }, [at, close]);
  const open = useCallback((e, items) => {
    const list = items.filter(Boolean);
    if (!list.length) return;
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 290), y = Math.min(e.clientY, window.innerHeight - 40 - list.length * 34);
    setAt({ x, y: Math.max(8, y), items: list });
  }, []);
  const node = at ? (
    <div className="ctx-menu" ref={ref} role="menu" style={{ left: at.x, top: at.y }}>
      {at.items.map((it, i) => (it === '-' ? <hr key={i} /> : (
        <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={() => { close(); it.run(); }}>
          {it.Icon && <it.Icon size={15} />}<span>{it.label}</span>{it.keyId && keyOf(it.keyId) && <kbd>{showKey(keyOf(it.keyId))}</kbd>}
        </button>
      )))}
    </div>
  ) : null;
  return { open, close, node };
}

/**
 * A card shown while the pointer rests on something (a medicine's stock and batches). const hc = useHoverCard((item)
 * => <…/>); <span {...hc.bind(item)}>…</span>; {hc.node}. Touch screens don't hover: nothing changes there.
 */
export function useHoverCard(render, delay = 450) {
  const [at, setAt] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const bind = (item) => ({
    onMouseEnter: (e) => { const { clientX: x, clientY: y } = e; clearTimeout(timer.current); timer.current = setTimeout(() => setAt({ item, x, y }), delay); },
    onMouseMove: (e) => { const { clientX: x, clientY: y } = e; setAt((a) => (a ? { ...a, x, y } : a)); },
    onMouseLeave: () => { clearTimeout(timer.current); setAt(null); },
  });
  const node = at ? <div className="hover-card" role="tooltip" style={{ left: Math.min(at.x + 16, window.innerWidth - 300), top: Math.min(at.y + 14, window.innerHeight - 220) }}>{render(at.item)}</div> : null;
  return { bind, node };
}
