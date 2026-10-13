import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, PackageOpen, ReceiptText, FileText, ClipboardPlus, Users, Truck, Pill, FlaskConical,
  Boxes, PackagePlus, History, CalendarClock, PencilRuler, ScrollText, Wallet, Tags, Landmark, ArrowLeftRight, HandCoins,
  ArrowDownLeft, ArrowUpRight, BookOpen, BarChart3, Settings as SettingsIcon, Search, Sun, Moon, Menu, LogOut, ChevronDown,
  CornerDownLeft, User, Plus,
} from 'lucide-react';
import { useStore, daysUntil } from './store.jsx';
import Auth from './pages/Auth.jsx';

// Pages load on demand so the app opens fast, even on low-end PCs and phones
const page = (loader, name = 'default') => lazy(() => loader().then((m) => ({ default: m[name] })));
const inv = () => import('./pages/Inventory.jsx');
const fin = () => import('./pages/Finance.jsx');
const ppl = () => import('./pages/People.jsx');
const P = {
  Dashboard: page(() => import('./pages/Dashboard.jsx')),
  POS: page(() => import('./pages/POS.jsx')),
  Sales: page(() => import('./pages/Sales.jsx')),
  Proformas: page(() => import('./pages/Proformas.jsx')),
  Prescriptions: page(() => import('./pages/Prescriptions.jsx')),
  Customers: page(ppl, 'Customers'), Suppliers: page(ppl, 'Suppliers'),
  MedicineList: page(inv, 'MedicineList'), Formulations: page(inv, 'Formulations'), StockLevels: page(inv, 'StockLevels'),
  QuickEdit: page(inv, 'QuickEdit'), StockCard: page(inv, 'StockCard'), Expiry: page(inv, 'Expiry'),
  AddStock: page(() => import('./pages/Purchases.jsx'), 'AddStock'), Purchases: page(() => import('./pages/Purchases.jsx')),
  Expenses: page(fin, 'Expenses'), ExpenseCategories: page(fin, 'ExpenseCategories'), Banks: page(fin, 'Banks'), BankTx: page(fin, 'BankTx'),
  Loans: page(fin, 'Loans'), Debtors: page(fin, 'Debtors'), Creditors: page(fin, 'Creditors'), CashBook: page(fin, 'CashBook'),
  Reports: page(() => import('./pages/Reports.jsx')),
  Settings: page(() => import('./pages/Settings.jsx')),
};

// [path, label, Icon, shortcut, badge, element]
const NAV = [
  { items: [['/', 'Dashboard', LayoutDashboard, null, null, <P.Dashboard />]] },
  { group: 'Sales', items: [
    ['/pos', 'POS – Retail', ShoppingCart, 'F2', null, <P.POS mode="retail" />],
    ['/pos/wholesale', 'POS – Wholesale', PackageOpen, 'F3', null, <P.POS mode="wholesale" key="w" />],
    ['/sales', 'Sales History', ReceiptText, 'F6', null, <P.Sales />],
    ['/proformas', 'Proformas', FileText, null, null, <P.Proformas />],
    ['/prescriptions', 'Prescriptions', ClipboardPlus, null, null, <P.Prescriptions />],
  ] },
  { group: 'People', items: [['/customers', 'Customers', Users, null, null, <P.Customers />], ['/suppliers', 'Suppliers', Truck, null, null, <P.Suppliers />]] },
  { group: 'Medicine Inventory', items: [
    ['/medicines', 'Medicine List', Pill, null, null, <P.MedicineList />],
    ['/formulations', 'Formulations', FlaskConical, null, null, <P.Formulations />],
    ['/inventory', 'Inventory', Boxes, 'F7', 'low', <P.StockLevels />],
    ['/add-stock', 'Add Stock', PackagePlus, 'F4', null, <P.AddStock />],
    ['/purchases', 'Purchase History', History, null, null, <P.Purchases />],
    ['/expiry', 'Expiring / Expired', CalendarClock, null, 'expiry', <P.Expiry />],
    ['/quick-edit', 'Quick Edit', PencilRuler, null, null, <P.QuickEdit />],
    ['/stock-card', 'Stock Card', ScrollText, null, null, <P.StockCard />],
  ] },
  { group: 'Finance', roles: ['admin', 'pharmacist'], items: [
    ['/expenses', 'Expenses', Wallet, null, null, <P.Expenses />],
    ['/expense-categories', 'Expense Categories', Tags, null, null, <P.ExpenseCategories />],
    ['/banks', 'Banks', Landmark, null, null, <P.Banks />],
    ['/bank-tx', 'Deposits & Withdrawals', ArrowLeftRight, null, null, <P.BankTx />],
    ['/loans', 'Loans', HandCoins, null, null, <P.Loans />],
    ['/debtors', 'Debtors', ArrowDownLeft, null, null, <P.Debtors />],
    ['/creditors', 'Creditors', ArrowUpRight, null, null, <P.Creditors />],
    ['/cash-book', 'Cash Book', BookOpen, null, null, <P.CashBook />],
  ] },
  { group: 'Insights', roles: ['admin', 'pharmacist'], items: [['/reports', 'Reports', BarChart3, null, null, <P.Reports />]] },
  { group: 'System', roles: ['admin'], items: [['/settings', 'Settings & Sync', SettingsIcon, null, null, <P.Settings />]] },
];

const SHORTCUTS = { F2: '/pos', F3: '/pos/wholesale', F4: '/add-stock', F6: '/sales', F7: '/inventory' };

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pharmapos-theme', theme); } catch {}
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function SyncPill() {
  const { syncStatus, syncNow } = useStore();
  const online = useOnline();
  const s = syncStatus.state;
  const label = s === 'off' ? (online ? 'On this device' : 'Offline')
    : s === 'ok' ? 'Synced ' + new Date(syncStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : s === 'syncing' ? (syncStatus.progress || 'Syncing…') : s === 'offline' ? 'Offline – will sync' : 'Sync error';
  const tone = s === 'ok' ? 'ok' : s === 'error' ? 'danger' : s === 'syncing' ? 'syncing' : s === 'offline' || !online ? 'warn' : '';
  return <button className={'pill ' + tone} title={syncStatus.error || 'Sync now'} onClick={syncNow}><i />{label}</button>;
}

/** Ctrl+K: jump to any page, medicine, customer or receipt */
function CommandPalette({ open, onClose, pages }) {
  const { db, products, fmt } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef();
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = (...v) => v.join(' ').toLowerCase().includes(s);
    const out = pages.filter((p) => !s || has(p.label)).slice(0, s ? 6 : 8).map((p) => ({ section: 'Pages', label: p.label, Icon: p.Icon, hint: p.key, go: () => navigate(p.to) }));
    if (s) {
      products.filter((p) => has(p.name, p.generic, p.barcode)).slice(0, 6).forEach((p) =>
        out.push({ section: 'Medicines', label: p.name, Icon: Pill, hint: `${p.stock} in stock · ${fmt(p.price)}`, go: () => navigate('/stock-card', { state: { productId: p.id } }) }));
      db.customers.filter((c) => has(c.name, c.phone)).slice(0, 4).forEach((c) =>
        out.push({ section: 'Customers', label: c.name, Icon: User, hint: c.phone, go: () => navigate('/customers', { state: { q: c.name } }) }));
      db.sales.filter((x) => has(x.number)).slice(0, 4).forEach((x) =>
        out.push({ section: 'Receipts', label: x.number, Icon: ReceiptText, hint: fmt(x.total), go: () => navigate('/sales', { state: { q: x.number } }) }));
    }
    return out;
  }, [q, pages, products, db.customers, db.sales, fmt, navigate]);

  if (!open) return null;
  const pick = (r) => { r.go(); onClose(); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) pick(results[active]);
  };
  let lastSection = null;
  return (
    <div className="modal-bg palette-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <div className="palette-input"><Search size={18} /><input ref={inputRef} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search pages, medicines, customers, receipts…" /><kbd>Esc</kbd></div>
        <div className="palette-list">
          {results.map((r, i) => {
            const head = r.section !== lastSection ? <div className="palette-section">{(lastSection = r.section)}</div> : null;
            return (
              <div key={r.section + r.label + i}>
                {head}
                <button className={'palette-item' + (i === active ? ' active' : '')} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
                  <r.Icon size={17} /><span>{r.label}</span>{r.hint && <small>{r.hint}</small>}{i === active && <CornerDownLeft size={14} />}
                </button>
              </div>
            );
          })}
          {!results.length && <div className="empty">Nothing found for “{q}”</div>}
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { db, products, user, setUser } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, toggleTheme] = useTheme();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem('pharmapos-nav')) || {}; } catch { return {}; } });

  const groups = NAV.filter((g) => !g.roles || g.roles.includes(user.role));
  const pages = groups.flatMap((g) => g.items.map(([to, label, Icon, key]) => ({ to, label, Icon, key })));
  const counts = useMemo(() => ({
    expiry: products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) <= (db.settings.expiryWarnDays || 90)).length,
    low: products.filter((p) => p.stock <= (p.reorder || 0)).length,
  }), [products, db.settings.expiryWarnDays]);

  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      else if (SHORTCUTS[e.key]) { e.preventDefault(); navigate(SHORTCUTS[e.key]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const toggleGroup = (g) => setCollapsed((c) => {
    const next = { ...c, [g]: !c[g] };
    try { localStorage.setItem('pharmapos-nav', JSON.stringify(next)); } catch {}
    return next;
  });
  const title = pages.find((p) => p.to === location.pathname)?.label || 'PharmaPOS';
  useEffect(() => { document.title = `${title} · PharmaPOS`; }, [title]);
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={'shell' + (drawer ? ' drawer-open' : '')}>
      <div className="drawer-bg" onClick={() => setDrawer(false)} />
      <aside className="sidebar">
        <div className="brand"><span className="logo"><Plus size={20} strokeWidth={3} /></span> PharmaPOS</div>
        <div className="store-name">{db.settings.name}</div>
        <nav>
          {groups.map((g, i) => (
            <div key={i} className="nav-group">
              {g.group && <button className="nav-title" onClick={() => toggleGroup(g.group)}>{g.group}<ChevronDown size={13} style={{ transform: collapsed[g.group] ? 'rotate(-90deg)' : '', transition: 'transform .15s' }} /></button>}
              {!collapsed[g.group] && g.items.map(([to, label, Icon, key, badge]) => (
                <NavLink key={to} to={to} end>
                  <Icon size={17} /><span className="grow">{label}</span>
                  {badge && counts[badge] > 0 && <span className="count">{counts[badge]}</span>}
                  {key && <kbd>{key}</kbd>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="user-box">
          <span className="avatar">{initials}</span>
          <div className="grow"><strong>{user.name}</strong><small>{user.role}</small></div>
          <button className="icon-btn" title="Log out" onClick={() => setUser(null)}><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}><Menu size={20} /></button>
          <button className="search-trigger" onClick={() => setPalette(true)}><Search size={16} /><span>Search medicines, customers, receipts…</span><kbd>Ctrl K</kbd></button>
          <div className="spacer grow" />
          <SyncPill />
          <button className="icon-btn" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        </header>
        <main className="content">
          <Suspense fallback={<div className="page"><div className="skeleton" /><div className="skeleton" style={{ height: 280 }} /></div>}>
            <Routes>
              {groups.flatMap((g) => g.items).map(([to, , , , , el]) => <Route key={to} path={to} element={el} />)}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav">
        <NavLink to="/" end><LayoutDashboard size={20} />Home</NavLink>
        <NavLink to="/inventory"><Boxes size={20} />Stock</NavLink>
        <NavLink to="/pos" className="fab"><ShoppingCart size={22} />Sell</NavLink>
        <NavLink to="/sales"><ReceiptText size={20} />Sales</NavLink>
        <button onClick={() => setDrawer(true)}><Menu size={20} />More</button>
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={pages} />
    </div>
  );
}

export default function App() {
  const { user } = useStore();
  useTheme();
  return <HashRouter>{user ? <Shell /> : <Auth />}</HashRouter>;
}
