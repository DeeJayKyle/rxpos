// 1.18.0 App Library (the owner's choice, iPhone-style): every page this person may open as app icons, sorted into
// folders by menu group, with Suggestions (pinned and recent pages) first and a search that lists pages A to Z.
// From Control Centre, the top bar's grid, or Ctrl+Shift+A.
import { useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { markNav } from '../mobilenav.jsx';
import { useFocusTrap } from '../focustrap.js';

function AppIcon({ to, label, Icon, badge, onPick, big }) {
  return (
    <NavLink to={to} end className={'lib-app' + (big ? ' big' : '')} onClick={onPick} title={label}>
      <span className="lib-icon"><Icon size={big ? 26 : 20} aria-hidden="true" />{badge > 0 && <span className="lib-badge">{badge > 99 ? '99+' : badge}</span>}</span>
      <span className="lib-name">{label}</span>
    </NavLink>
  );
}

export function AppLibrary({ groups, counts, pins = [], recent = [], onClose }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  const [q, setQ] = useState('');
  const [openFolder, setOpenFolder] = useState('');
  const all = useMemo(() => groups.flatMap((g) => g.items.map(([to, label, Icon, , badge]) => ({ to, label, Icon, badge: badge ? counts[badge] || 0 : 0, group: g.group || 'Home' }))), [groups, counts]);
  const byTo = Object.fromEntries(all.map((a) => [a.to, a]));
  const suggestions = [...pins, ...recent, '/pos', '/inventory', '/sales', '/'].filter((t, i, a) => byTo[t] && a.indexOf(t) === i).slice(0, 8).map((t) => byTo[t]);
  const pick = () => { markNav('tab'); onClose(); };
  const found = q.trim() ? all.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.label.localeCompare(b.label)) : null;
  const folder = openFolder && groups.find((g) => (g.group || 'Home') === openFolder);
  return (
    <div className="lib-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="lib-sheet" role="dialog" aria-modal="true" aria-label="App Library">
        <div className="lib-head">
          <label className="lib-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="App Library" aria-label="Search the pages" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {found ? (
          <ul className="lib-list" aria-label="Pages A to Z">
            {found.map((a) => <li key={a.to}><NavLink to={a.to} end onClick={pick}><span className="lib-icon sm"><a.Icon size={16} aria-hidden="true" /></span><span className="grow">{a.label}</span><small className="muted">{a.group}</small></NavLink></li>)}
            {!found.length && <li className="muted small">No page called “{q.trim()}”</li>}
          </ul>
        ) : folder ? (
          <section className="lib-folder-open" aria-label={folder.group || 'Home'}>
            <button type="button" className="link-btn" onClick={() => setOpenFolder('')}>‹ All folders</button>
            <h3>{folder.group || 'Home'}</h3>
            <div className="lib-apps">{folder.items.map(([to, label, Icon, , badge]) => <AppIcon key={to} {...{ to, label, Icon }} badge={badge ? counts[badge] : 0} onPick={pick} big />)}</div>
          </section>
        ) : (
          <div className="lib-grid">
            <section className="lib-folder lib-suggest" aria-label="Suggestions">
              <div className="lib-apps">{suggestions.slice(0, 4).map((a) => <AppIcon key={a.to} {...a} onPick={pick} big />)}</div>
              <h3>Suggestions</h3>
            </section>
            {groups.map((g) => { const name = g.group || 'Home'; const items = g.items; const shown = items.length > 4 ? items.slice(0, 3) : items; return (
              <section key={name} className="lib-folder" aria-label={name}>
                <div className="lib-apps">
                  {shown.map(([to, label, Icon, , badge]) => <AppIcon key={to} {...{ to, label, Icon }} badge={badge ? counts[badge] : 0} onPick={pick} big />)}
                  {items.length > 4 && (
                    <button type="button" className="lib-more" aria-label={`All ${items.length} pages in ${name}`} onClick={() => setOpenFolder(name)}>
                      {items.slice(3, 7).map(([to, , Icon]) => <span key={to}><Icon size={13} aria-hidden="true" /></span>)}
                    </button>
                  )}
                </div>
                <h3><button type="button" className="link-btn" onClick={() => setOpenFolder(name)}>{name}</button></h3>
              </section>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}
