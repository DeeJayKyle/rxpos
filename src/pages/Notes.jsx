// Notes & SOPs: Notion-like pages for the pharmacy's procedures, checklists, handovers and meeting notes.
// Blocks are edited in place; "/" opens the block menu, Markdown shortcuts ("# ", "[] ", "- ", "1. ", "> ") change a
// block's type, the grip drags a block, and the ⋯ menu turns it into another type, copies, moves or deletes it.
// Pages nest under each other and can be starred (per person, on this device). Helpers and templates: src/notes.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NotebookPen, GripVertical, Star, FilePlus, LayoutTemplate, Copy, Trash2, ChevronRight, Ellipsis, Plus, Search, ArrowUp, ArrowDown, CornerDownRight, Repeat2 } from 'lucide-react';
import { useStore, put, del, audit, now } from '../store.jsx';
import { deviceSettings, setDevice } from '../device.js';
import { toast, ask } from '../feedback.jsx';
import { BLOCKS, BLOCK_NAME, COVERS, TEMPLATES, block, slashMatches, shortcut, newPage, childrenOf, branchIds, pathTo, pageText, progress, moveBlock, numberOf } from '../notes.js';

const ICONS = ['📄', '📋', '✅', '💊', '❄️', '🌅', '🔁', '🗓️', '⚠️', '📦', '💰', '🧾', '🩺', '🧪', '📞', '⭐', '📌', '🧹'];
const LAST = 'rxpos-notes-last';
const SAVE_MS = 500;

export default function Notes() {
  const { db, update, user, branchId } = useStore();
  const location = useLocation();
  const notes = db.notes; // every synced table exists (store.jsx TABLES)
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => location.state?.id || (() => { try { return localStorage.getItem(LAST); } catch { return null; } })());
  const [open, setOpen] = useState({}); // tree branches folded open
  const [favs, setFavs] = useState(() => deviceSettings()['noteFavs:' + user.id] || []);
  const [tplOpen, setTplOpen] = useState(false);
  const page = notes.find((n) => n.id === sel) || null;
  useEffect(() => { if (!page && notes.length && !q) setSel(childrenOf(notes)[0]?.id || notes[0].id); }, [page, notes, q]);
  useEffect(() => { try { if (sel) localStorage.setItem(LAST, sel); } catch { /* storage blocked */ } }, [sel]);

  const create = (opts = {}) => {
    const rec = newPage({ user, ...opts });
    update((d) => { put(d, 'notes', rec); audit(d, user, 'Note page added', rec.title || 'Untitled', branchId); });
    if (rec.parentId) setOpen((o) => ({ ...o, [rec.parentId]: true }));
    setSel(rec.id); setTplOpen(false);
    return rec;
  };
  const fromTemplate = (t) => create({ title: t.title, icon: t.icon, blocks: t.blocks() });
  // Ctrl+K → "New note page" / "New checklist from a template"
  useEffect(() => {
    if (location.state?.create) create();
    else if (location.state?.template) fromTemplate(TEMPLATES.find((t) => t.id === location.state.template) || TEMPLATES[0]);
    if (location.state?.create || location.state?.template) window.history.replaceState({ ...window.history.state, usr: {} }, '');
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next); setDevice({ ['noteFavs:' + user.id]: next });
  };
  const remove = async (n) => {
    const ids = branchIds(notes, n.id);
    if (!(await ask({ title: `Delete “${n.title || 'Untitled'}”?`, message: ids.length > 1 ? `This page and the ${ids.length - 1} page${ids.length === 2 ? '' : 's'} under it are deleted on every device.` : 'It is deleted on every device.', confirmText: 'Delete', danger: true }))) return;
    update((d) => { ids.forEach((id) => del(d, 'notes', id)); audit(d, user, 'Note page deleted', n.title || 'Untitled', branchId); });
    setSel(n.parentId || null);
    toast('Page deleted');
  };
  const duplicate = (n) => create({ title: (n.title || 'Untitled') + ' (copy)', icon: n.icon, parentId: n.parentId || null, blocks: n.blocks.map((b) => ({ ...b, id: block().id })) });

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? notes.filter((n) => pageText(n).toLowerCase().includes(s)) : null;
  }, [q, notes]);

  const Tree = ({ parentId = null, depth = 0 }) => childrenOf(notes, parentId).map((n) => {
    const kids = notes.some((x) => x.parentId === n.id);
    return (
      <div key={n.id}>
        <div className={'note-link' + (n.id === sel ? ' on' : '')} style={{ paddingLeft: 6 + depth * 14 }}>
          <button type="button" className="note-twisty" aria-label={open[n.id] ? 'Fold' : 'Unfold'} aria-expanded={!!open[n.id]} style={{ visibility: kids ? 'visible' : 'hidden' }} onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>
            <ChevronRight size={13} style={{ transform: open[n.id] ? 'rotate(90deg)' : '' }} />
          </button>
          <button type="button" className="note-name" onClick={() => setSel(n.id)}><span aria-hidden="true">{n.icon || '📄'}</span><span className="grow">{n.title || 'Untitled'}</span></button>
          <button type="button" className="icon-btn sm note-add" title="Add a page inside" aria-label={`Add a page inside ${n.title || 'Untitled'}`} onClick={() => create({ parentId: n.id })}><Plus size={13} /></button>
        </div>
        {kids && open[n.id] && <Tree parentId={n.id} depth={depth + 1} />}
      </div>
    );
  });

  return (
    <div className="page notes-page">
      <aside className="notes-side card">
        <div className="notes-side-head"><h1><NotebookPen size={20} />Notes &amp; SOPs</h1></div>
        <label className="notes-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" aria-label="Search pages" /></label>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn sm primary" onClick={() => create()}><FilePlus size={15} />New page</button>
          <button type="button" className="btn sm ghost" aria-expanded={tplOpen} onClick={() => setTplOpen((o) => !o)}><LayoutTemplate size={15} />Templates</button>
        </div>
        {tplOpen && (
          <div className="notes-templates" role="list">
            {TEMPLATES.map((t) => <button key={t.id} type="button" role="listitem" className="note-link" onClick={() => fromTemplate(t)}><span aria-hidden="true">{t.icon}</span><span className="grow">{t.title}</span></button>)}
          </div>
        )}
        {found ? (
          <div className="notes-group"><span className="micro">Found {found.length}</span>
            {found.map((n) => <button key={n.id} type="button" className={'note-link' + (n.id === sel ? ' on' : '')} onClick={() => setSel(n.id)}><span aria-hidden="true">{n.icon}</span><span className="grow">{n.title || 'Untitled'}</span></button>)}
          </div>
        ) : <>
          {favs.some((id) => notes.some((n) => n.id === id)) && (
            <div className="notes-group"><span className="micro">Starred</span>
              {favs.map((id) => notes.find((n) => n.id === id)).filter(Boolean).map((n) => <button key={n.id} type="button" className={'note-link' + (n.id === sel ? ' on' : '')} onClick={() => setSel(n.id)}><span aria-hidden="true">{n.icon}</span><span className="grow">{n.title || 'Untitled'}</span></button>)}
            </div>
          )}
          <div className="notes-group"><span className="micro">Pages</span><Tree /></div>
        </>}
        {!notes.length && <p className="muted small">No pages yet. Start a blank page or pick a template: an opening checklist, the cold chain SOP, a shift handover.</p>}
      </aside>
      <section className="notes-main">
        {page ? <Editor key={page.id} page={page} notes={notes} update={update} user={user} onOpen={setSel} fav={favs.includes(page.id)} onFav={() => toggleFav(page.id)}
          onDelete={() => remove(page)} onDuplicate={() => duplicate(page)} onSub={() => create({ parentId: page.id })} />
          : <div className="card notes-empty"><NotebookPen size={28} /><h2>Write it down once, for everyone</h2><p className="muted">Procedures, checklists and handover notes, on every device.</p>
            <div className="row gap"><button type="button" className="btn primary" onClick={() => create()}><FilePlus size={16} />New page</button><button type="button" className="btn ghost" onClick={() => fromTemplate(TEMPLATES[0])}><LayoutTemplate size={16} />Opening checklist</button></div></div>}
      </section>
    </div>
  );
}

function Editor({ page, notes, update, user, onOpen, fav, onFav, onDelete, onDuplicate, onSub }) {
  const [draft, setDraft] = useState(page);
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef(draft); latest.current = draft;
  const refs = useRef({});
  const [focusId, setFocusId] = useState(null);
  const [slash, setSlash] = useState(null); // { id, q, active }
  const [menu, setMenu] = useState(null); // block id with its ⋯ menu open
  const [pageMenu, setPageMenu] = useState(false);
  const [iconMenu, setIconMenu] = useState(false);
  const drag = useRef(null);
  const [over, setOver] = useState(null);

  // another device changed this page while nothing is waiting to be saved here: show its version
  useEffect(() => { if (!dirty.current && page.updatedAt !== latest.current.updatedAt) setDraft(page); }, [page]);
  const save = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const rec = { ...latest.current, updatedBy: user.name, editedAt: now() };
    update((d) => put(d, 'notes', rec));
  };
  useEffect(() => () => save(), []); // eslint-disable-line react-hooks/exhaustive-deps -- save what is typed when leaving the page
  const change = (fn) => {
    setDraft((p) => { const n = fn(p); latest.current = n; return n; });
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_MS);
  };
  const setBlocks = (fn) => change((p) => ({ ...p, blocks: fn(p.blocks) }));
  const patch = (id, v) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...v } : b)));
  const focus = (id, atEnd = true) => setFocusId({ id, atEnd, at: Date.now() });
  useEffect(() => {
    const el = focusId && refs.current[focusId.id];
    if (!el) return;
    el.focus();
    const at = focusId.atEnd ? el.value.length : 0;
    el.setSelectionRange?.(at, at);
  }, [focusId]);

  const insertAfter = (i, b) => { setBlocks((bs) => [...bs.slice(0, i + 1), b, ...bs.slice(i + 1)]); focus(b.id, false); };
  const removeAt = (i) => {
    const bs = latest.current.blocks;
    if (bs.length === 1) { patch(bs[0].id, { type: 'text', text: '' }); return; }
    setBlocks((x) => x.filter((_, j) => j !== i));
    focus(bs[Math.max(0, i - 1)].id);
  };
  const turnInto = (id, type) => { patch(id, { type, ...(type === 'todo' ? { checked: false } : {}) }); setSlash(null); setMenu(null); if (type === 'divider') { const i = latest.current.blocks.findIndex((b) => b.id === id); insertAfter(i, block('text')); } else focus(id); };

  const onText = (b, i, text) => {
    const t = b.type === 'text' || b.type === 'number' || b.type === 'bullet' ? shortcut(text) : null;
    if (t) { patch(b.id, { type: t, text: '', ...(t === 'todo' ? { checked: false } : {}) }); if (t === 'divider') insertAfter(i, block('text')); return; }
    patch(b.id, { text });
    setSlash(text.startsWith('/') && !text.includes('\n') ? { id: b.id, q: text.slice(1), active: 0 } : null);
  };
  const onKey = (e, b, i) => {
    const el = e.currentTarget;
    if (slash?.id === b.id) {
      const list = slashMatches(slash.q);
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, active: Math.min(slash.active + 1, list.length - 1) }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, active: Math.max(slash.active - 1, 0) }); return; }
      if (e.key === 'Enter' && list[slash.active]) { e.preventDefault(); patch(b.id, { text: '' }); turnInto(b.id, list[slash.active][0]); return; }
      if (e.key === 'Escape') { setSlash(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const listType = ['todo', 'bullet', 'number'].includes(b.type);
      if (listType && !b.text) { patch(b.id, { type: 'text' }); return; } // Enter on an empty list line ends the list
      const caret = el.selectionStart, rest = b.text.slice(caret);
      if (rest) patch(b.id, { text: b.text.slice(0, caret) });
      insertAfter(i, block(listType ? b.type : 'text', rest));
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== 'text') { e.preventDefault(); patch(b.id, { type: 'text' }); }
      else if (!b.text) { e.preventDefault(); removeAt(i); }
      else if (i > 0 && latest.current.blocks[i - 1].type !== 'divider') {
        e.preventDefault();
        const prev = latest.current.blocks[i - 1];
        setBlocks((bs) => bs.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)));
        const at = prev.text.length;
        setTimeout(() => { const p = refs.current[prev.id]; if (p) { p.focus(); p.setSelectionRange(at, at); } }, 0);
      }
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && i > 0) { e.preventDefault(); focus(latest.current.blocks[i - 1].id); }
    else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && i < latest.current.blocks.length - 1) { e.preventDefault(); focus(latest.current.blocks[i + 1].id, false); }
  };

  const crumbs = pathTo(notes, page.id);
  const pr = progress(draft);
  const kids = childrenOf(notes, page.id);

  return (
    <article className={'note-page card' + (draft.cover ? ' has-cover' : '')} onClick={() => { setMenu(null); setPageMenu(false); setIconMenu(false); }}>
      {draft.cover && <div className={'note-cover cover-' + draft.cover} aria-hidden="true" />}
      <nav className="note-crumbs" aria-label="Page path">
        <span className="muted">Notes</span>
        {crumbs.map((c) => <span key={c.id} className="row"><span className="muted" aria-hidden="true">/</span>{c.id === page.id ? <strong>{c.icon} {draft.title || 'Untitled'}</strong> : <button type="button" className="link-btn" onClick={() => onOpen(c.id)}>{c.icon} {c.title || 'Untitled'}</button>}</span>)}
        <span className="grow" />
        <button type="button" className={'icon-btn sm' + (fav ? ' on' : '')} aria-pressed={fav} title={fav ? 'Unstar' : 'Star this page'} aria-label={fav ? 'Unstar' : 'Star this page'} onClick={(e) => { e.stopPropagation(); onFav(); }}><Star size={15} fill={fav ? 'currentColor' : 'none'} /></button>
        <div className="note-pop-wrap">
          <button type="button" className="icon-btn sm" aria-label="Page actions" aria-expanded={pageMenu} onClick={(e) => { e.stopPropagation(); setPageMenu((o) => !o); }}><Ellipsis size={16} /></button>
          {pageMenu && (
            <div className="note-pop right" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" role="menuitem" onClick={() => { setPageMenu(false); onSub(); }}><CornerDownRight size={14} />Add a page inside</button>
              <button type="button" role="menuitem" onClick={() => { setPageMenu(false); onDuplicate(); }}><Copy size={14} />Duplicate</button>
              <span className="micro">Cover</span>
              <div className="note-covers">{COVERS.map((c) => <button key={c || 'none'} type="button" aria-label={c ? 'Cover ' + c : 'No cover'} className={'cover-dot cover-' + (c || 'none') + (draft.cover === c ? ' on' : '')} onClick={() => change((p) => ({ ...p, cover: c }))} />)}</div>
              {pr.total > 0 && <button type="button" role="menuitem" onClick={() => setBlocks((bs) => bs.map((b) => (b.type === 'todo' ? { ...b, checked: false } : b)))}><Repeat2 size={14} />Untick every to-do</button>}
              <button type="button" role="menuitem" className="text-danger" onClick={() => { setPageMenu(false); onDelete(); }}><Trash2 size={14} />Delete page</button>
            </div>
          )}
        </div>
      </nav>
      <header className="note-head">
        <div className="note-pop-wrap">
          <button type="button" className="note-icon" aria-label="Change the icon" onClick={(e) => { e.stopPropagation(); setIconMenu((o) => !o); }}>{draft.icon || '📄'}</button>
          {iconMenu && <div className="note-pop note-icons" onClick={(e) => e.stopPropagation()}>{ICONS.map((ic) => <button key={ic} type="button" onClick={() => { change((p) => ({ ...p, icon: ic })); setIconMenu(false); }}>{ic}</button>)}</div>}
        </div>
        <input className="note-title" value={draft.title} placeholder="Untitled" aria-label="Page title" onChange={(e) => change((p) => ({ ...p, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focus(draft.blocks[0]?.id, false); } }} />
        <div className="note-meta muted small">
          {draft.createdBy && <span>By {draft.createdBy}</span>}
          {draft.updatedBy && <span>· edited by {draft.updatedBy}{draft.editedAt ? ' ' + new Date(draft.editedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>}
          {pr.total > 0 && <span className="note-progress"><i style={{ width: `${(pr.done / pr.total) * 100}%` }} />{pr.done}/{pr.total} done</span>}
        </div>
      </header>
      <div className="note-blocks" onDragOver={(e) => e.preventDefault()}>
        {draft.blocks.map((b, i) => (
          <div key={b.id} className={'note-block nb-' + b.type + (over === i ? ' drop' : '') + (menu === b.id ? ' menu-on' : '')}
            onDragOver={(e) => { if (drag.current != null) { e.preventDefault(); setOver(i); } }}
            onDrop={(e) => { e.preventDefault(); if (drag.current != null) setBlocks((bs) => moveBlock(bs, drag.current, i)); drag.current = null; setOver(null); }}>
            <div className="nb-tools">
              <button type="button" className="nb-tool" aria-label="Block actions" title="Drag to move · click for actions" draggable
                onDragStart={(e) => { drag.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); }}
                onDragEnd={() => { drag.current = null; setOver(null); }}
                onClick={(e) => { e.stopPropagation(); setMenu(menu === b.id ? null : b.id); }}><GripVertical size={15} /></button>
              <button type="button" className="nb-tool" aria-label="Add a block below" title="Add a block below" onClick={() => insertAfter(i, block('text'))}><Plus size={15} /></button>
            </div>
            {menu === b.id && (
              <div className="note-pop" role="menu" onClick={(e) => e.stopPropagation()}>
                <span className="micro">Turn into</span>
                <div className="note-turn">{BLOCKS.map(([t, n]) => <button key={t} type="button" role="menuitem" className={t === b.type ? 'on' : ''} onClick={() => turnInto(b.id, t)}>{n}</button>)}</div>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); insertAfter(i, { ...b, id: block().id }); }}><Copy size={14} />Duplicate</button>
                <button type="button" role="menuitem" disabled={i === 0} onClick={() => { setMenu(null); setBlocks((bs) => moveBlock(bs, i, i - 1)); }}><ArrowUp size={14} />Move up</button>
                <button type="button" role="menuitem" disabled={i === draft.blocks.length - 1} onClick={() => { setMenu(null); setBlocks((bs) => moveBlock(bs, i, i + 1)); }}><ArrowDown size={14} />Move down</button>
                <button type="button" role="menuitem" className="text-danger" onClick={() => { setMenu(null); removeAt(i); }}><Trash2 size={14} />Delete</button>
              </div>
            )}
            {b.type === 'divider' ? <hr /> : <>
              {b.type === 'todo' && <input type="checkbox" className="nb-check" checked={!!b.checked} aria-label="Done" onChange={(e) => patch(b.id, { checked: e.target.checked })} />}
              {b.type === 'bullet' && <span className="nb-bullet" aria-hidden="true">•</span>}
              {b.type === 'number' && <span className="nb-num" aria-hidden="true">{numberOf(draft.blocks, i)}.</span>}
              {b.type === 'toggle' && <button type="button" className="nb-twisty" aria-label={b.open ? 'Fold' : 'Unfold'} aria-expanded={!!b.open} onClick={() => patch(b.id, { open: !b.open })}><ChevronRight size={15} style={{ transform: b.open ? 'rotate(90deg)' : '' }} /></button>}
              {b.type === 'callout' && <span className="nb-emoji" aria-hidden="true">💡</span>}
              <div className="nb-body">
                <AutoText refFn={(el) => { refs.current[b.id] = el; }} value={b.text} className={'nb-text' + (b.checked ? ' done' : '')}
                  placeholder={i === 0 && draft.blocks.length === 1 && !b.text ? 'Write, or type / for blocks' : b.type === 'text' ? '' : BLOCK_NAME[b.type]}
                  aria-label={BLOCK_NAME[b.type]} onChange={(text) => onText(b, i, text)} onKeyDown={(e) => onKey(e, b, i)} onBlur={() => setTimeout(() => setSlash((s) => (s?.id === b.id ? null : s)), 150)} />
                {b.type === 'toggle' && b.open && <AutoText value={b.children || ''} className="nb-text nb-children" placeholder="What is inside" aria-label="Inside the toggle" onChange={(children) => patch(b.id, { children })} />}
              </div>
              {slash?.id === b.id && (
                <div className="note-pop slash" role="listbox" aria-label="Blocks">
                  {slashMatches(slash.q).map(([t, n, hint], k) => (
                    <button key={t} type="button" role="option" aria-selected={k === slash.active} className={k === slash.active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => { patch(b.id, { text: '' }); turnInto(b.id, t); }}>
                      <strong>{n}</strong><small>{hint}</small>
                    </button>
                  ))}
                  {!slashMatches(slash.q).length && <span className="muted small">No block called “{slash.q}”</span>}
                </div>
              )}
            </>}
          </div>
        ))}
        <button type="button" className="note-add-block" onClick={() => insertAfter(draft.blocks.length - 1, block('text'))}><Plus size={15} />Add a block</button>
      </div>
      {kids.length > 0 && (
        <div className="note-kids"><span className="micro">Pages inside</span>
          {kids.map((k) => <button key={k.id} type="button" className="note-link" onClick={() => onOpen(k.id)}><span aria-hidden="true">{k.icon}</span><span className="grow">{k.title || 'Untitled'}</span><ChevronRight size={14} /></button>)}
        </div>
      )}
    </article>
  );
}

/** A textarea that grows with what is typed */
function AutoText({ value, onChange, refFn, ...rest }) {
  const el = useRef(null);
  useEffect(() => { const t = el.current; if (t) { t.style.height = '0px'; t.style.height = t.scrollHeight + 'px'; } }, [value]);
  return <textarea rows={1} ref={(x) => { el.current = x; refFn?.(x); }} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
