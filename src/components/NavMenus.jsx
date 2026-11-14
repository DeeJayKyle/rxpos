// Navigation styles (2026-11-14, from the owner's design references): the modern sidebar's action card, the bento
// mega menu (every page grouped, with what it is for and a featured action) and the top pill navbar for wide
// screens. Which style a device uses is chosen in This device → Navigation (device.js navStyle); the pages, their
// order and who may open them are the same in every style (App.jsx NAV).
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, ArrowRight, Sparkles, X, LayoutGrid } from 'lucide-react';
import { markNav } from '../mobilenav.jsx';

/** A line under each page's name in the mega menu */
export const PAGE_INFO = {
  '/': 'Overview & insights', '/pos': 'Sell to walk-in customers', '/pos/wholesale': 'Bulk orders at trade prices', '/sales': 'Every receipt, refunds',
  '/shifts': 'Open, close and cash-up', '/proformas': 'Quotations for clients', '/prescriptions': 'Records and refills', '/scan': 'Read a prescription photo',
  '/drug-info': 'Uses, doses, interactions', '/quiz': 'Train the team', '/customers': 'Clients, balances, allergies', '/suppliers': 'Who you buy from',
  '/insurers': 'Schemes and claims', '/chat': 'Team chat', '/reminders': 'Refill reminders', '/messages': 'SMS and WhatsApp', '/calendar': 'What is coming up',
  '/notes': 'SOPs, handovers, notes', '/medicines': 'The medicine list', '/formulations': 'Dosage forms', '/inventory': 'Stock on hand',
  '/add-stock': 'Receive a delivery', '/returns': 'Send stock back', '/purchases': 'Deliveries received', '/shelves': 'Where things are kept',
  '/stock-count': 'Count the shelves', '/controlled': 'Register and recalls', '/expiry': 'Expiring and expired', '/reorder': 'What to buy, dead stock',
  '/quick-edit': 'Prices in bulk', '/stock-card': 'One medicine\'s history', '/labels': 'Print barcodes', '/import': 'From a spreadsheet',
  '/storage': 'Temperature and humidity', '/branches': 'Every branch', '/transfers': 'Between branches', '/expenses': 'Money going out',
  '/expense-categories': 'How expenses are grouped', '/banks': 'Accounts and mobile money', '/bank-tx': 'Deposits and withdrawals', '/loans': 'Borrowed and lent',
  '/debtors': 'Who owes you', '/creditors': 'Who you owe', '/cash-book': 'Every shilling in and out', '/payroll': 'Salaries and attendance',
  '/weekly': 'The week at a glance', '/reports': 'Sales, profit, stock', '/users': 'Staff and permissions', '/settings': 'Pharmacy settings',
  '/audit': 'Who did what', '/device': 'This device, updates',
};

/**
 * The featured card: the most useful next step for this pharmacy right now (expiring stock, low stock, or the
 * day's cash-up), as on the sidebar's bottom card and in the mega menu.
 */
export function featuredAction(counts, can) {
  if (counts.expiry > 0 && can('inventory.view')) return { to: '/expiry', title: `${counts.expiry} batch${counts.expiry === 1 ? '' : 'es'} expiring`, text: 'Sell first or return them before they expire.', cta: 'Review' };
  if (counts.low > 0 && can('stock.receive')) return { to: '/reorder', title: `${counts.low} medicine${counts.low === 1 ? '' : 's'} running low`, text: 'A reorder list is ready from your sales.', cta: 'Reorder' };
  if (can('shifts')) return { to: '/shifts', title: 'Close the day', text: 'Count the cash and close your shift.', cta: 'Cash-up' };
  return { to: '/pos', title: 'Ready to sell', text: 'Open the till and serve the next customer.', cta: 'Open till' };
}

/** The sidebar's bottom card (hidden in the icon rail) */
export function NavPromo({ counts, can }) {
  const f = featuredAction(counts, can);
  return (
    <NavLink to={f.to} className="nav-promo">
      <span className="nav-promo-glow" aria-hidden="true" />
      <Sparkles size={16} aria-hidden="true" />
      <strong>{f.title}</strong>
      <small>{f.text}</small>
      <span className="nav-promo-cta">{f.cta} <ArrowRight size={14} aria-hidden="true" /></span>
    </NavLink>
  );
}

/** One group's pages as tiles (icon, name, what it is for, badge) */
function GroupTiles({ g, counts, onPick }) {
  return g.items.map(([to, label, Icon, , badge]) => (
    <NavLink key={to} to={to} end className="mega-item" onClick={onPick}>
      <span className="mega-icon"><Icon size={18} aria-hidden="true" /></span>
      <span className="grow"><strong>{label}</strong><small>{PAGE_INFO[to] || ''}</small></span>
      {badge && counts[badge] > 0 && <span className="count">{counts[badge]}</span>}
    </NavLink>
  ));
}

/** Every page, grouped, as a bento sheet (phones: More; wide screens: the All pages button of the top navbar) */
export function MegaMenu({ open, onClose, groups, counts, can, onFullMenu }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const f = featuredAction(counts, can);
  const pick = () => { markNav('tab'); onClose(); };
  return (
    <div className="mega-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mega-sheet" role="dialog" aria-modal="true" aria-label="All pages">
        <div className="mega-head">
          <span className="micro">All pages</span>
          {onFullMenu && <button type="button" className="btn sm ghost" onClick={() => { onClose(); onFullMenu(); }}>Account &amp; menu</button>}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mega-grid">
          <button type="button" className="mega-featured" onClick={() => { pick(); navigate(f.to); }}>
            <Sparkles size={18} aria-hidden="true" />
            <strong>{f.title}</strong>
            <small>{f.text}</small>
            <span className="mega-cta">{f.cta} <ArrowRight size={14} aria-hidden="true" /></span>
          </button>
          {groups.map((g, i) => (
            <section key={g.group || i} className="mega-group">
              <h3 className="micro">{g.group || 'Home'}</h3>
              <GroupTiles g={g} counts={counts} onPick={pick} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Wide screens: a horizontal navbar of pill tabs, one per group, each opening its pages as a dropdown panel */
export function TopNav({ groups, counts, can, here, onAll }) {
  const [open, setOpen] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(''); };
    const k = (e) => e.key === 'Escape' && setOpen('');
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', k); };
  }, [open]);
  useEffect(() => setOpen(''), [here]);
  const f = featuredAction(counts, can);
  return (
    <nav className="top-nav" ref={ref} aria-label="Main">
      {groups.map((g) => {
        if (!g.group) return g.items.map(([to, label, Icon]) => <NavLink key={to} to={to} end className="top-pill"><Icon size={15} aria-hidden="true" />{label}</NavLink>);
        const active = g.items.some(([t]) => t === here);
        const badges = g.items.reduce((a, it) => a + (it[4] ? counts[it[4]] || 0 : 0), 0);
        return (
          <div key={g.group} className="top-group">
            <button type="button" className={'top-pill' + (active ? ' active' : '') + (open === g.group ? ' open' : '')} aria-expanded={open === g.group} onClick={() => setOpen(open === g.group ? '' : g.group)}>
              {g.group}{badges > 0 && <span className="count">{badges}</span>}<ChevronDown size={14} aria-hidden="true" />
            </button>
            {open === g.group && (
              <div className="top-panel" role="menu">
                <div className="top-panel-items"><GroupTiles g={g} counts={counts} onPick={() => setOpen('')} /></div>
                <NavLink to={f.to} className="mega-featured small" onClick={() => setOpen('')}>
                  <Sparkles size={16} aria-hidden="true" /><strong>{f.title}</strong><small>{f.text}</small><span className="mega-cta">{f.cta} <ArrowRight size={14} aria-hidden="true" /></span>
                </NavLink>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="top-pill" onClick={onAll} title="All pages"><LayoutGrid size={15} aria-hidden="true" />All</button>
    </nav>
  );
}
