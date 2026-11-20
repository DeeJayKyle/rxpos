// 1.18.0 Home screen (the owner's choice, iPhone-style; Control Centre → Home screen): the dashboard's widgets on a
// home screen in three sizes (small, medium, large), with a dock of the main pages at the bottom. Press and hold a
// widget (or Edit) to arrange: the widgets wiggle, − takes one off, the size button cycles S → M → L, drag one onto
// another (or use ‹ ›) to move it, and + adds one back from the gallery. Kept on this device (This device's dash.home).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ChevronLeft, ChevronRight, Check, Scaling } from 'lucide-react';
import { deviceSettings, setDevice, onDevice } from '../device.js';
import { dateLocale } from '../showdate.js';

export const SIZES = ['s', 'm', 'l'];
const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Large' };

/** This device's home screen: the widgets in order and their sizes (`catalogue`: every widget, with its default size and whether it starts on) */
export function homeLayout(catalogue, d = deviceSettings()) {
  const saved = d.dash?.home || {};
  const ids = catalogue.map((w) => w.id);
  const order = saved.order ? saved.order.filter((id) => ids.includes(id)) : catalogue.filter((w) => w.home).map((w) => w.id);
  const sizes = Object.fromEntries(catalogue.map((w) => [w.id, SIZES.includes(saved.sizes?.[w.id]) ? saved.sizes[w.id] : w.size]));
  return { order, sizes };
}
const saveHome = (home) => { const dash = deviceSettings().dash || {}; setDevice({ dash: { ...dash, home: { ...(dash.home || {}), ...home } } }); };

/** A clock widget: the time and the date, live */
export function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  return (
    <div className="card w-clock">
      <span className="w-label">{now.toLocaleDateString(dateLocale(), { weekday: 'long' })}</span>
      <strong className="w-big">{now.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}</strong>
      <span className="muted">{now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' })}</span>
    </div>
  );
}

/** A small figure widget */
export function FigureWidget({ label, value, sub, to, state, tone = '', Icon }) {
  return (
    <Link className={'card w-figure ' + tone} to={to} state={state}>
      <span className="w-label">{Icon && <Icon size={15} aria-hidden="true" />}{label}</span>
      <strong className="w-big">{value}</strong>
      {sub && <span className="muted small">{sub}</span>}
    </Link>
  );
}

export function HomeScreen({ catalogue, cards, dock }) {
  const [lay, setLay] = useState(() => homeLayout(catalogue));
  useEffect(() => onDevice((d) => setLay(homeLayout(catalogue, d))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const drag = useRef('');
  const hold = useRef(0);
  const names = Object.fromEntries(catalogue.map((w) => [w.id, w.name]));
  const save = (patch) => { const next = { ...lay, ...patch }; setLay(next); saveHome(next); };
  const move = (id, by) => { const o = [...lay.order], i = o.indexOf(id), j = Math.max(0, Math.min(o.length - 1, i + by)); o.splice(i, 1); o.splice(j, 0, id); save({ order: o }); };
  const dropOn = (target) => { const id = drag.current; drag.current = ''; if (!id || id === target) return; const o = lay.order.filter((x) => x !== id); o.splice(o.indexOf(target), 0, id); save({ order: o }); };
  const resize = (id) => save({ sizes: { ...lay.sizes, [id]: SIZES[(SIZES.indexOf(lay.sizes[id]) + 1) % SIZES.length] } });
  // press and hold (half a second) to start arranging, as on a phone
  const pressStart = (e) => { if (editing || e.button > 0 || e.target.closest('button, a, input, select')) return; clearTimeout(hold.current); hold.current = setTimeout(() => setEditing(true), 500); };
  const pressEnd = () => clearTimeout(hold.current);
  const hidden = catalogue.filter((w) => !lay.order.includes(w.id));

  return (
    <div className={'home-screen' + (editing ? ' arranging' : '')} onPointerDown={pressStart} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd}>
      <div className="home-bar">
        {editing && <button type="button" className="btn sm ghost" onClick={() => setGallery(true)} disabled={!hidden.length}><Plus size={15} />Add a widget</button>}
        <span className="grow" />
        <button type="button" className={'btn sm ' + (editing ? 'primary' : 'ghost')} onClick={() => { setEditing((x) => !x); setGallery(false); }}>{editing ? <><Check size={15} />Done</> : 'Edit home screen'}</button>
      </div>
      <div className="home-grid">
        {lay.order.map((id, i) => {
          const el = cards[id]?.();
          if (!el && !editing) return null;
          return (
            <div key={id} className={'home-widget size-' + lay.sizes[id]} data-widget={id} style={{ '--i': i }}
              draggable={editing} onDragStart={() => { drag.current = id; }} onDragOver={(e) => editing && e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropOn(id); }}>
              {el || <div className="card w-empty muted small">{names[id]}: nothing to show now</div>}
              {editing && (
                <div className="widget-tools">
                  <button type="button" className="w-remove" aria-label={`Remove ${names[id]}`} onClick={() => save({ order: lay.order.filter((x) => x !== id) })}><Minus size={14} /></button>
                  <button type="button" aria-label={`Move ${names[id]} earlier`} onClick={() => move(id, -1)} disabled={i === 0}><ChevronLeft size={14} /></button>
                  <button type="button" className="w-size" aria-label={`${names[id]}: ${SIZE_NAMES[lay.sizes[id]]}. Change the size`} onClick={() => resize(id)}><Scaling size={14} />{lay.sizes[id].toUpperCase()}</button>
                  <button type="button" aria-label={`Move ${names[id]} later`} onClick={() => move(id, 1)} disabled={i === lay.order.length - 1}><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {gallery && editing && (
        <div className="widget-gallery card" role="region" aria-label="Widget gallery">
          <h3>Add a widget</h3>
          <div className="gallery-list">
            {hidden.map((w) => <button key={w.id} type="button" className="btn ghost" onClick={() => { save({ order: [...lay.order, w.id] }); if (hidden.length === 1) setGallery(false); }}><Plus size={14} />{w.name}</button>)}
          </div>
        </div>
      )}
      {dock.length > 0 && (
        <nav className="home-dock" aria-label="Dock">
          {dock.map(({ to, label, Icon }) => <Link key={to} to={to} className="dock-app" title={label}><span className="lib-icon"><Icon size={22} aria-hidden="true" /></span><span className="lib-name">{label}</span></Link>)}
        </nav>
      )}
    </div>
  );
}
