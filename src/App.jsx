import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, PackageOpen, ReceiptText, FileText, ClipboardPlus, Users, Truck, Pill, FlaskConical,
  Boxes, PackagePlus, History, CalendarClock, PencilRuler, ScrollText, Wallet, Tags, Landmark, ArrowLeftRight, HandCoins,
  ArrowDownLeft, ArrowUpRight, ClipboardCheck, RefreshCw, Undo2, ShieldPlus, BookOpen, BarChart3, Settings as SettingsIcon, Search, Sun, Moon, Menu, LogOut, ChevronDown,
  CornerDownLeft, User, Plus, BellRing, ShoppingBag, Tag, FileUp, Building2, Send, ShieldCheck, Clock, BookMarked, MessagesSquare, UserCog, KeyRound, CalendarDays, Thermometer, Palette, MonitorSmartphone, ScanText, GraduationCap, Megaphone, CalendarRange, LockKeyhole,
} from 'lucide-react';
import { useStore, makePassword, put, audit, isLowStock, expiryCounts } from './store.jsx';
import { askText, ask, toast } from './feedback.jsx';
import { hasPin, setPin, clearPin } from './offline.js';
import Auth from './pages/Auth.jsx';
import { BrandLogo } from './logo.jsx';
import { unreadCount } from './pages/Chat.jsx';
import { Spotlight, HourlyReminder, NotificationBell, AlertWatcher, MessageWatcher, WeatherLogger } from './engage.jsx';
import { PopupHost } from './notify.jsx';
import { CallManager } from './calls.jsx';
import { WeeklyPopup } from './pages/Weekly.jsx';
import { AutoReorder } from './reorder.js';
import { isWeb } from './platform.js';
import RefreshHost from './refresh.jsx';
import { startUpdates, onUpdate, applyUpdate, justUpdated, LABEL } from './update.js';
import { applyTheme, savedTheme, saveTheme, allowedThemes } from './themes.js';
import { TwoStepModal } from './twostep.jsx';
import { setCrashCloud } from './crash.js';
import { setBadge } from './badges.js';
const OwnerConsole = lazy(() => import('./pages/OwnerConsole.jsx'));

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
  Branches: page(() => import('./pages/Branches.jsx')), Transfers: page(() => import('./pages/Branches.jsx'), 'Transfers'),
  Audit: page(() => import('./pages/Audit.jsx')),
  Reminders: page(() => import('./pages/Reminders.jsx')),
  Labels: page(() => import('./pages/Labels.jsx')),
  Import: page(() => import('./pages/Import.jsx')),
  Reorder: page(() => import('./pages/Reorder.jsx')),
  Shifts: page(() => import('./pages/Shifts.jsx')),
  Chat: page(() => import('./pages/Chat.jsx')),
  DrugInfo: page(() => import('./pages/DrugInfo.jsx')),
  Users: page(() => import('./pages/Users.jsx')),
  Calendar: page(() => import('./pages/Calendar.jsx')),
  Scan: page(() => import('./pages/Scan.jsx')),
  Quiz: page(() => import('./pages/Quiz.jsx')),
  Messages: page(() => import('./pages/Messages.jsx')),
  Weekly: page(() => import('./pages/Weekly.jsx')),
  Storage: page(() => import('./pages/Storage.jsx')),
  StockCount: page(() => import('./pages/StockCount.jsx')),
  Returns: page(() => import('./pages/Returns.jsx')),
  Controlled: page(() => import('./pages/Controlled.jsx')),
  Device: page(() => import('./pages/Device.jsx')),
};

// [path, label, Icon, shortcut, badge, element, permission, feature]
const NAV = [
  { items: [['/', 'Dashboard', LayoutDashboard, null, null, <P.Dashboard />]] },
  { group: 'Sales', items: [
    ['/pos', 'POS – Retail', ShoppingCart, 'F2', null, <P.POS mode="retail" />, 'pos.sell'],
    ['/pos/wholesale', 'POS – Wholesale', PackageOpen, 'F3', null, <P.POS mode="wholesale" key="w" />, 'pos.wholesale', 'wholesale'],
    ['/sales', 'Sales History', ReceiptText, 'F6', null, <P.Sales />, 'sales.view'],
    ['/shifts', 'Shifts & Cash-up', Clock, null, null, <P.Shifts />, 'shifts', 'shifts'],
    ['/proformas', 'Proformas', FileText, null, null, <P.Proformas />, 'proformas', 'proformas'],
    ['/prescriptions', 'Prescriptions & Refills', ClipboardPlus, null, null, <P.Prescriptions />, 'prescriptions', 'prescriptions'],
    ['/scan', 'Scan Prescription', ScanText, null, null, <P.Scan />, 'prescriptions', 'ai'],
    ['/drug-info', 'Drug Information', BookMarked, null, null, <P.DrugInfo />, null, 'drugInfo'],
    ['/quiz', 'Drug Quiz', GraduationCap, null, null, <P.Quiz />, null, 'drugInfo'],
  ] },
  { group: 'People', items: [
    ['/customers', 'Customers', Users, null, null, <P.Customers />, 'customers'],
    ['/suppliers', 'Suppliers', Truck, null, null, <P.Suppliers />, 'suppliers'],
    ['/chat', 'Chat & Messages', MessagesSquare, null, 'chat', <P.Chat />, 'chat', 'chat'],
    ['/reminders', 'Reminders', BellRing, null, null, <P.Reminders />, 'reminders', 'reminders'],
    ['/messages', 'Messages & SMS', Megaphone, null, null, <P.Messages />, 'reminders', 'reminders'],
    ['/calendar', 'Calendar', CalendarDays, null, null, <P.Calendar />, null, 'calendar'],
  ] },
  { group: 'Medicine Inventory', items: [
    ['/medicines', 'Medicine List', Pill, null, null, <P.MedicineList />, 'inventory.view'],
    ['/formulations', 'Formulations', FlaskConical, null, null, <P.Formulations />, 'medicines.manage'],
    ['/inventory', 'Inventory', Boxes, 'F7', 'low', <P.StockLevels />, 'inventory.view'],
    ['/add-stock', 'Add Stock', PackagePlus, 'F4', null, <P.AddStock />, 'stock.receive'],
    ['/returns', 'Returns to Supplier', Undo2, null, null, <P.Returns />, ['stock.receive', 'stock.adjust']],
    ['/purchases', 'Purchase History', History, null, null, <P.Purchases />, 'stock.receive'],
    ['/stock-count', 'Stock Count', ClipboardCheck, null, null, <P.StockCount />, ['stock.count', 'stock.adjust']],
    ['/controlled', 'Controlled Drugs & Recalls', ShieldPlus, null, null, <P.Controlled />, 'inventory.view'],
    ['/expiry', 'Expiring / Expired', CalendarClock, null, 'expiry', <P.Expiry />, 'inventory.view'],
    ['/reorder', 'Reorder & Dead Stock', ShoppingBag, null, null, <P.Reorder />, 'stock.receive', 'reorder'],
    ['/quick-edit', 'Quick Edit', PencilRuler, null, null, <P.QuickEdit />, 'medicines.manage'],
    ['/stock-card', 'Stock Card', ScrollText, null, null, <P.StockCard />, 'inventory.view'],
    ['/labels', 'Barcode Labels', Tag, null, null, <P.Labels />, 'medicines.manage', 'labels'],
    ['/import', 'Import Medicines', FileUp, null, null, <P.Import />, 'medicines.manage', 'import'],
    ['/storage', 'Weather & Storage', Thermometer, null, null, <P.Storage />, 'inventory.view', 'weather'],
  ] },
  { group: 'Branches', items: [
    ['/branches', 'All Branches', Building2, null, null, <P.Branches />, 'branches.view', 'branches'],
    ['/transfers', 'Stock Transfers', Send, null, 'transfers', <P.Transfers />, 'transfers', 'branches'],
  ] },
  { group: 'Finance', items: [
    ['/expenses', 'Expenses', Wallet, null, null, <P.Expenses />, 'finance', 'finance'],
    ['/expense-categories', 'Expense Categories', Tags, null, null, <P.ExpenseCategories />, 'finance', 'finance'],
    ['/banks', 'Banks', Landmark, null, null, <P.Banks />, 'finance', 'finance'],
    ['/bank-tx', 'Deposits & Withdrawals', ArrowLeftRight, null, null, <P.BankTx />, 'finance', 'finance'],
    ['/loans', 'Loans', HandCoins, null, null, <P.Loans />, 'finance', 'finance'],
    ['/debtors', 'Debtors', ArrowDownLeft, null, null, <P.Debtors />, 'finance', 'finance'],
    ['/creditors', 'Creditors', ArrowUpRight, null, null, <P.Creditors />, 'finance', 'finance'],
    ['/cash-book', 'Cash Book', BookOpen, null, null, <P.CashBook />, 'finance', 'finance'],
  ] },
  { group: 'Insights', items: [['/weekly', 'Weekly Summary', CalendarRange, null, null, <P.Weekly />, 'reports', 'reports'], ['/reports', 'Reports', BarChart3, null, null, <P.Reports />, 'reports', 'reports']] },
  { group: 'System', items: [
    ['/users', 'Users & Roles', UserCog, null, null, <P.Users />, 'users.manage'],
    ['/settings', 'Settings', SettingsIcon, null, null, <P.Settings />, 'settings.manage'],
    ['/audit', 'Audit Log', ShieldCheck, null, null, <P.Audit />, 'audit'],
    ['/device', 'This Device & Updates', MonitorSmartphone, null, 'update', <P.Device />],
  ] },
];

const SHORTCUTS = { F2: '/pos', F3: '/pos/wholesale', F4: '/add-stock', F6: '/sales', F7: '/inventory' };

/** The device's colour theme (any theme the owner allows for this pharmacy) */
function useTheme() {
  const [theme, setTheme] = useState(() => savedTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);
  return [theme, setTheme];
}

function ThemePicker({ theme, setTheme }) {
  const { db } = useStore();
  const branding = db.license?.[0]?.branding;
  const list = allowedThemes(branding);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  // Keep within what the owner allows for this pharmacy
  useEffect(() => { if (list.length && !list.some((t) => t.id === theme)) setTheme(branding?.defaultTheme && list.some((t) => t.id === branding.defaultTheme) ? branding.defaultTheme : list[0].id); }, [branding]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" title="Theme" onClick={() => setOpen((o) => !o)}><Palette size={19} /></button>
      {open && (
        <div className="bell-menu theme-menu">
          <div className="bell-head">Theme</div>
          {list.map((t) => (
            <button key={t.id} className={'theme-item' + (t.id === theme ? ' on' : '')} onClick={() => { setTheme(t.id); setOpen(false); }}>
              <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.c.surface} 0 45%, ${t.c.primary} 45% 72%, ${t.c.primary2} 72%)`, borderColor: t.c.borderStrong }} />
              <span className="grow">{t.name}{t.inspired && t.inspired !== t.name && <small className="muted"> · {t.inspired}</small>}</span>
              {t.base === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

/** Live clock (with seconds). The dot shows the connection: green = up to date, amber = offline, red = needs attention. */
function ClockPill() {
  const { syncStatus, syncNow, setUser } = useStore();
  const online = useOnline();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const s = syncStatus.state;
  const tone = syncStatus.expired || s === 'error' ? 'danger' : s === 'offline' || !online ? 'warn' : s === 'syncing' ? 'syncing' : 'ok';
  const tip = syncStatus.expired ? 'Signed out of the cloud: click to sign in again' : s === 'error' ? syncStatus.error : !online || s === 'offline' ? 'Offline: your work is saved and goes up when the internet is back'
    : syncStatus.lastSync ? 'Up to date ' + new Date(syncStatus.lastSync).toLocaleTimeString() : 'Connecting…';
  return (
    <button className={'pill clock ' + tone} title={tip} onClick={() => (syncStatus.expired ? setUser(null) : syncNow())}>
      <i /><span className="clock-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span className="clock-date">{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </button>
  );
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
  const { db, products, user, setUser, branchId, branch, update, syncNow, syncCfg } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useTheme();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [twoStepOpen, setTwoStepOpen] = useState(false);
  useEffect(() => { setCrashCloud(syncCfg?.url && syncCfg?.key ? { url: syncCfg.url, key: syncCfg.key } : null); }, [syncCfg?.url, syncCfg?.key]);
  // Menu groups: someone who never folded the menu starts with only Sales open (plus the page they are on), so
  // ~45 pages don't all compete for attention; their own choices are remembered after that
  const [collapsed, setCollapsed] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('pharmapos-nav')); if (saved) return saved; } catch { /* first visit */ }
    return Object.fromEntries(NAV.filter((g) => g.group && g.group !== 'Sales').map((g) => [g.group, true]));
  });

  const { can, features, batchesOf, day } = useStore();
  // Show only what this person's role may use and what is switched on for this pharmacy
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(([, , , , , , perm, feat]) => (!perm || [].concat(perm).some(can)) && (!feat || features[feat] !== false)) })).filter((g) => g.items.length);
  const pages = groups.flatMap((g) => g.items.map(([to, label, Icon, key]) => ({ to, label, Icon, key })));
  const [updReady, setUpdReady] = useState(false);
  useEffect(() => onUpdate((u) => setUpdReady(u.status === 'ready')), []);
  const counts = useMemo(() => ({
    update: updReady ? 1 : 0,
    expiry: (() => { const c = expiryCounts(products, batchesOf, db.settings.expiryWarnDays || 90); return c.soon + c.expired; })(),
    low: products.filter(isLowStock).length,
    transfers: db.transfers.filter((t) => t.toId === branchId && t.status === 'In transit').length,
    chat: unreadCount(db, user),
  }), [products, batchesOf, db.settings.expiryWarnDays, db.transfers, db.messages, branchId, user, day, updReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setBadge(counts.chat + counts.transfers), [counts.chat, counts.transfers]); // the number on the app / taskbar icon

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
  const title = pages.find((p) => p.to === location.pathname)?.label || 'RxPOS';
  useEffect(() => { document.title = `${title} · RxPOS`; }, [title]);
  // Change my own password; staff brought over from another system must set their own on first sign-in
  const me = db.users.find((u) => u.id === user.id);
  const changePassword = async (forced) => {
    for (;;) {
      const pw = await askText({ title: forced ? `Welcome, ${user.name.split(/\s+/)[0]}. Set your own password` : 'Change my password', message: forced ? 'You signed in with a temporary password. Choose a new one (8+ characters) that only you know.' : 'New password (8+ characters)', type: 'password', minLength: 8, confirmText: 'Next' });
      if (!pw) return;
      const again = await askText({ title: 'Type the new password again', type: 'password', minLength: 8, confirmText: 'Save password' });
      if (again === null) return;
      if (again !== pw) { toast('The two passwords did not match. Try again.', 'error'); continue; }
      const fields = await makePassword(pw);
      update((d) => {
        const u = d.users.find((x) => x.id === user.id);
        if (!u) return;
        const { mustChangePassword, ...rest } = u; // eslint-disable-line no-unused-vars
        put(d, 'users', { ...rest, ...fields });
        audit(d, user, 'Password changed', user.name, branchId);
      });
      return toast('Password changed');
    }
  };
  // Quick device PIN (0.2): a per-device offline shortcut, stored only on this device, never synced.
  const [pinSet, setPinSet] = useState(() => hasPin(syncCfg?.tenant, user.id));
  const manageDevicePin = async () => {
    const tenant = syncCfg?.tenant;
    if (hasPin(tenant, user.id)) {
      if (await ask({ title: 'Remove this device’s quick PIN?', message: 'You will sign in with your full password on this device. You can set a new PIN any time.', confirmText: 'Remove PIN', danger: true })) {
        clearPin(tenant, user.id); setPinSet(false); toast('PIN removed from this device');
      }
      return;
    }
    const pin = await askText({ title: 'Set a quick PIN for this device', message: 'A 4–8 digit PIN signs you in on this device, even offline, without typing your full password. It is kept on this device only, never synced.', type: 'password', minLength: 4, confirmText: 'Next' });
    if (!pin) return;
    const again = await askText({ title: 'Type the PIN again', type: 'password', minLength: 4, confirmText: 'Save PIN' });
    if (again === null) return;
    if (again !== pin) return toast('The two PINs did not match. Try again.', 'error');
    try { await setPin(tenant, user.id, pin); setPinSet(true); toast('Quick PIN set for this device'); } catch (e) { toast(e.message, 'error'); }
  };
  const asked = useRef(false);
  useEffect(() => { if (me?.mustChangePassword && !asked.current) { asked.current = true; changePassword(true); } }, [me?.mustChangePassword]); // eslint-disable-line react-hooks/exhaustive-deps
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={'shell' + (drawer ? ' drawer-open' : '')}>
      <div className="drawer-bg" onClick={() => setDrawer(false)} />
      <aside className="sidebar">
        <div className="brand"><BrandLogo src={db.license?.[0]?.branding?.logo} size={34} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span></div>
        <div className="store-name">{db.settings.name}</div>
        <nav>
          {groups.map((g, i) => (
            <div key={i} className="nav-group">
              {g.group && <button className="nav-title" aria-expanded={!collapsed[g.group]} onClick={() => toggleGroup(g.group)}>{g.group}<ChevronDown size={13} style={{ transform: collapsed[g.group] ? 'rotate(-90deg)' : '', transition: 'transform .15s' }} /></button>}
              {g.items.map(([to, label, Icon, key, badge]) => (
                <NavLink key={to} to={to} end hidden={collapsed[g.group] && !g.items.some(([t]) => t === location.pathname) && !(badge && counts[badge] > 0)}>
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
          <button className="icon-btn" title="Change my password" onClick={() => changePassword(false)}><KeyRound size={17} /></button>
          <button className={'icon-btn' + (pinSet ? ' text-ok' : '')} title={pinSet ? 'Quick PIN is set for this device' : 'Set a quick PIN for this device'} onClick={manageDevicePin}><LockKeyhole size={17} /></button>
          {syncCfg?.key?.startsWith('u.') && <button className={'icon-btn' + (me?.twoFactor ? ' text-ok' : '')} title={me?.twoFactor ? 'Two-step sign-in is on' : 'Two-step sign-in'} onClick={() => setTwoStepOpen(true)}><ShieldCheck size={17} /></button>}
          <button className="icon-btn" title="Log out" onClick={() => setUser(null)}><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}><Menu size={20} /></button>
          <button className="search-trigger" onClick={() => setPalette(true)}><Search size={16} /><span>Search medicines, customers, receipts…</span><kbd>Ctrl K</kbd></button>
          <div className="spacer grow" />
          {db.branches.length > 1 && <NavLink to="/branches" className="pill branch-pill" title="Branch this device works as"><Building2 size={14} />{branch?.name}</NavLink>}
          <ClockPill />
          <NotificationBell />
          <ThemePicker theme={theme} setTheme={setTheme} />
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
      <Spotlight />
      <RefreshHost refresh={syncNow} />
      <HourlyReminder />
      <AlertWatcher />
      <MessageWatcher />
      <WeatherLogger />
      <PopupHost />
      <CallManager />
      <WeeklyPopup />
      <AutoReorder />
      <FirstDownload />
      <UpdateHost />
      {twoStepOpen && <TwoStepModal onClose={() => setTwoStepOpen(false)} />}
    </div>
  );
}

/** Self-updates: start checking, show a small "update ready" pill, and say once that RxPOS was updated */
function UpdateHost() {
  const [u, setU] = useState({ status: 'current' });
  useEffect(() => { startUpdates(); if (justUpdated()) toast(`RxPOS updated (${LABEL})`, 'info'); return onUpdate(setU); }, []);
  if (u.status !== 'ready') return null;
  return <button className="update-pill" onClick={applyUpdate} title="It also switches by itself when nothing is in progress"><RefreshCw size={14} />New version ready · Update</button>;
}

/** The first sign-in on a device downloads the whole pharmacy: show progress instead of empty pages */
function FirstDownload() {
  const { syncStatus, db } = useStore();
  if (!(syncStatus.first && syncStatus.state === 'syncing') || db.products.length > 50) return null;
  return (
    <div className="first-sync">
      <div className="spinner" />
      <h3>Setting up {db.settings.name !== 'My Pharmacy' ? db.settings.name : 'your pharmacy'} on this device…</h3>
      <p className="muted">{syncStatus.progress || 'Downloading medicines, stock and staff. This happens only once.'}</p>
    </div>
  );
}

/** Fade out the splash screen (index.html) once RxPOS is ready, after its short intro animation. */
function useHideSplash() {
  useEffect(() => {
    const s = document.getElementById('splash');
    if (!s) return;
    const wait = Math.max(0, 900 - performance.now());
    const t = setTimeout(() => { s.classList.add('done'); setTimeout(() => s.remove(), 400); }, wait);
    return () => clearTimeout(t);
  }, []);
}

function Gate() {
  const { user } = useStore();
  const location = useLocation();
  // The owner console is web-only and works without signing in to a pharmacy (it has its own owner key)
  if (location.pathname === '/owner' && isWeb) return <Suspense fallback={<div className="loading"><div className="spinner" /></div>}><OwnerConsole /></Suspense>;
  return user ? <Shell /> : <Auth />;
}

export default function App() {
  useHideSplash();
  return <HashRouter><Gate /></HashRouter>;
}
