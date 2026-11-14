// Database views (2026-11-14, the owner's "Notion UI features"): the same list as a table, a board (cards in columns
// by a field: stock status, customer type, payment…) or a gallery (cards). The choice is kept per page on this
// device. Each card has the row's ⋯ menu (the same as the table's right-click menu) and opens like a table row.
import { Table2, KanbanSquare, LayoutGrid, Ellipsis } from 'lucide-react';
import { deviceSettings, setDevice } from '../device.js';

export const VIEW_KINDS = [['table', 'Table', Table2], ['board', 'Board', KanbanSquare], ['gallery', 'Gallery', LayoutGrid]];
const CAP = 120; // cards drawn per column / gallery (search narrows the rest)

export const savedView = (key) => deviceSettings().views?.[key] || 'table';
export const saveView = (key, v) => setDevice({ views: { ...(deviceSettings().views || {}), [key]: v } });

export function ViewSwitch({ value, onChange, board = true }) {
  return (
    <div className="seg view-switch" role="radiogroup" aria-label="View">
      {VIEW_KINDS.filter(([k]) => board || k !== 'board').map(([k, label, Icon]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} title={label} onClick={() => onChange(k)}><Icon size={15} /><span>{label}</span></button>
      ))}
    </div>
  );
}

/** One record as a card: card(r) → { title, sub, value, chips: [[text, tone]], art } */
function Card({ r, card, onOpen, onMenu }) {
  const c = card(r);
  return (
    <div className="dv-card" role="listitem" tabIndex={0} onDoubleClick={() => onOpen?.(r)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.(r); }} onContextMenu={(e) => onMenu?.(e, r)}>
      {c.art && <div className="dv-art" aria-hidden="true">{c.art}</div>}
      <div className="dv-body">
        <strong className="dv-title" title={c.title}>{c.title}</strong>
        {c.sub && <small className="muted dv-sub">{c.sub}</small>}
        {c.chips?.length > 0 && <span className="dv-chips">{c.chips.filter(Boolean).map(([t, tone]) => <span key={t} className={'badge ' + (tone || '')}>{t}</span>)}</span>}
        {c.value != null && <b className="dv-value num">{c.value}</b>}
      </div>
      {onMenu && <button type="button" className="dv-more icon-btn sm" aria-label={`Actions for ${c.title}`} title="Actions" onClick={(e) => onMenu(e, r)}><Ellipsis size={16} /></button>}
    </div>
  );
}

/** Columns of cards, one per group. board: { groups: [[key, label, tone]], of: (r) → key } */
export function BoardView({ rows, board, card, onOpen, onMenu }) {
  const cols = board.groups.map(([key, label, tone]) => ({ key, label, tone, items: [] }));
  const byKey = new Map(cols.map((c) => [c.key, c]));
  for (const r of rows) byKey.get(board.of(r))?.items.push(r);
  return (
    <div className="dv-board">
      {cols.map((c) => (
        <section key={c.key} className={'dv-col tone-' + (c.tone || 'none')} aria-label={c.label}>
          <header><span className="dv-dot" aria-hidden="true" />{c.label}<span className="dv-count">{c.items.length.toLocaleString()}</span></header>
          <div role="list" className="dv-col-items">
            {c.items.slice(0, CAP).map((r) => <Card key={r.id} r={r} card={card} onOpen={onOpen} onMenu={onMenu} />)}
            {c.items.length > CAP && <p className="muted small">and {(c.items.length - CAP).toLocaleString()} more: search to narrow down</p>}
            {!c.items.length && <p className="muted small dv-empty">None</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GalleryView({ rows, card, onOpen, onMenu }) {
  return (
    <>
      <div className="dv-gallery" role="list">{rows.slice(0, CAP * 2).map((r) => <Card key={r.id} r={r} card={card} onOpen={onOpen} onMenu={onMenu} />)}</div>
      {rows.length > CAP * 2 && <p className="muted small">Showing {CAP * 2} of {rows.length.toLocaleString()}. Search to narrow down.</p>}
    </>
  );
}
