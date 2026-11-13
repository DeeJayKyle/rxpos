import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, PackageOpen, ReceiptText, FileText, ClipboardPlus, Users, Truck, Pill, FlaskConical,
  Boxes, PackagePlus, History, CalendarClock, PencilRuler, ScrollText, Wallet, Tags, Landmark, ArrowLeftRight, HandCoins,
  ArrowDownLeft, ArrowUpRight, ClipboardCheck, RefreshCw, Undo2, ShieldPlus, BookOpen, BarChart3, Settings as SettingsIcon, Search, Sun, Moon, Menu, LogOut, ChevronDown,
  CornerDownLeft, User, BellRing, ShoppingBag, Tag, FileUp, Building2, Send, ShieldCheck, Clock, BookMarked, MessagesSquare, UserCog, KeyRound, CalendarDays, Thermometer, Palette, MonitorSmartphone, ScanText, GraduationCap, Megaphone, CalendarRange, LockKeyhole, PanelLeftClose, PanelLeftOpen, WifiOff,
  Sparkles, Pin, Keyboard, UserPlus, Archive, BadgeCheck,
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
import { isWeb, isNative } from './platform.js';
import { keepsData } from './webpolicy.js';
import RefreshHost from './refresh.jsx';
import { startUpdates, onUpdate, applyUpdate, justUpdated, LABEL } from './update.js';
import { applyTheme, saveTheme, allowedThemes, savedMode, saveMode, systemDark, paletteFor, startupTheme, ACCENTS, savedAccent, saveAccent, withAccent } from './themes.js';
import { STYLES, applyStyle, savedStyle, saveStyle } from './surface.js';
import { LEVELS, applyLevel, savedLevel, saveLevel } from './vivid.js';
import { TwoStepModal } from './twostep.jsx';
import { setCrashCloud } from './crash.js';
import { setBadge } from './badges.js';
import { ACTIONS, keyOf, keyMatcher, showKey, typing } from './keymap.js';
import { deviceSettings, setDevice, onDevice } from './device.js';
import { Modal } from './ui.jsx';
import { BackButton, markNav, usePageMotion, useEdgeSwipeBack, useKeyboardFit } from './mobilenav.jsx';
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
  Insurers: page(() => import('./pages/Insurers.jsx')),
  Shelves: page(() => import('./pages/Shelves.jsx')),
  Payroll: page(() => import('./pages/Payroll.jsx')),
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
    ['/insurers', 'Insurers', ShieldCheck, null, null, <P.Insurers />, ['customers', 'finance']],
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
    ['/shelves', 'Shelves', Archive, null, null, <P.Shelves />, 'inventory.view'],
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
    ['/payroll', 'Payroll & HR', BadgeCheck, null, null, <P.Payroll />, 'payroll', 'finance'],
  ] },
  { group: 'Insights', items: [['/weekly', 'Weekly Summary', CalendarRange, null, null, <P.Weekly />, 'reports', 'reports'], ['/reports', 'Reports', BarChart3, null, null, <P.Reports />, ['reports', 'reports.lines'], 'reports']] },
  { group: 'System', items: [
    ['/users', 'Users & Roles', UserCog, null, null, <P.Users />, 'users.manage'],
    ['/settings', 'Settings', SettingsIcon, null, null, <P.Settings />, 'settings.manage'],
    ['/audit', 'Audit Log', ShieldCheck, null, null, <P.Audit />, 'audit'],
    ['/device', 'This Device & Updates', MonitorSmartphone, null, 'update', <P.Device />],
  ] },
];


/** The device's colour theme (any theme the owner allows for this pharmacy) and whether it follows the system */
function useTheme() {
  const [theme, setTheme] = useState(startupTheme);
  const [mode, setMode] = useState(savedMode);
  const [accent, setAccent] = useState(savedAccent);
  useEffect(() => { applyTheme(theme, accent); saveTheme(theme); saveAccent(accent); }, [theme, accent]);
  useEffect(() => saveMode(mode), [mode]);
  return [theme, setTheme, mode, setMode, accent, setAccent];
}

/** The device's surface style (glass, clay, skeuomorphism, neumorphism, or flat) */
function useSurface() {
  const [style, setStyle] = useState(() => savedStyle());
  useEffect(() => { applyStyle(style); saveStyle(style); }, [style]);
  return [style, setStyle];
}

/** The device's colour level: Calm (standard) or Vivid (src/vivid.js). Applied and saved on the click itself: picking
 *  closes the menu, which removes this list, so a later effect would never run. */
function ColourLevel({ onPick }) {
  const level = savedLevel();
  const pick = (id) => { applyLevel(id); saveLevel(id); onPick(); };
  return LEVELS.map((l) => (
    <button key={l.id} className={'style-item' + (l.id === level ? ' on' : '')} onClick={() => pick(l.id)}>
      <span className={'swatch level-swatch level-' + l.id} />
      <span className="grow">{l.name}<small className="muted"> · {l.hint}</small></span>
    </button>
  ));
}

/** One switch between this device's usual theme and the premium dark look (Midnight Pro). The setting is kept on the
 *  device; switching only repaints, so the sale on the till, its client and totals stay exactly as they are. */
const PREMIUM = 'midnight-pro', PREMIUM_PREV = 'rxpos-premium-prev', PREMIUM_KEY = 'rxpos-advanced-ui';
function PremiumToggle({ theme, setTheme, setMode }) {
  const { db } = useStore();
  const list = allowedThemes(db.license?.[0]?.branding);
  if (!list.some((t) => t.id === PREMIUM)) return null;
  const useAdvancedUI = theme === PREMIUM;
  const toggle = () => {
    try {
      if (useAdvancedUI) {
        const prev = localStorage.getItem(PREMIUM_PREV);
        setTheme(prev && prev !== PREMIUM && list.some((t) => t.id === prev) ? prev : paletteFor('light', list));
        localStorage.setItem(PREMIUM_KEY, '0');
      } else {
        localStorage.setItem(PREMIUM_PREV, theme); localStorage.setItem(PREMIUM_KEY, '1');
        setMode(''); setTheme(PREMIUM);
      }
    } catch { setTheme(useAdvancedUI ? paletteFor('light', list) : PREMIUM); }
  };
  return (
    <button type="button" role="switch" aria-checked={useAdvancedUI} className={'premium-toggle' + (useAdvancedUI ? ' on' : '')} aria-label="Premium UI" onClick={toggle} title={useAdvancedUI ? 'Premium UI is on: back to your usual theme' : 'Premium UI: the dark Midnight Pro look'}>
      <Sparkles size={15} /><span>Premium UI</span><span className="premium-knob" aria-hidden="true" />
    </button>
  );
}

function ThemePicker({ theme, setTheme, mode, setMode, accent, setAccent, style, setStyle }) {
  const { db } = useStore();
  const branding = db.license?.[0]?.branding;
  const list = allowedThemes(branding);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const current = list.find((t) => t.id === theme);
  // Keep within what the owner allows for this pharmacy
  useEffect(() => { if (list.length && !list.some((t) => t.id === theme)) setTheme(branding?.defaultTheme && list.some((t) => t.id === branding.defaultTheme) ? branding.defaultTheme : list[0].id); }, [branding]); // eslint-disable-line react-hooks/exhaustive-deps
  // Follow system: light or dark with the operating system, live when it changes
  useEffect(() => {
    if (mode !== 'system') return;
    const follow = () => setTheme(paletteFor(systemDark() ? 'dark' : 'light', list, branding?.defaultTheme));
    follow();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', follow);
    return () => mq.removeEventListener?.('change', follow);
  }, [mode, branding]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickBase = (base) => { setMode(''); if (current?.base !== base) setTheme(paletteFor(base, list, branding?.defaultTheme)); };
  const MODES = [['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', MonitorSmartphone]];
  const activeMode = mode === 'system' ? 'system' : current?.base;
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" title="Theme" aria-label="Theme" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Palette size={19} /></button>
      {open && (
        <div className="bell-menu theme-menu">
          <div className="bell-head">Appearance</div>
          <div className="mode-toggle" role="radiogroup" aria-label="Appearance">
            {MODES.map(([id, label, Icon]) => (
              <button key={id} role="radio" aria-checked={activeMode === id} className={'mode-opt' + (activeMode === id ? ' on' : '')}
                onClick={() => (id === 'system' ? setMode('system') : pickBase(id))}><Icon size={14} />{label}</button>
            ))}
          </div>
          <div className="bell-head">Accent</div>
          <div className="accent-row" role="radiogroup" aria-label="Accent colour">
            {[{ id: '', name: 'Theme colour' }, ...ACCENTS].map((a) => {
              const c = (current ? withAccent(current, a.id) : null)?.c;
              return (
                <button key={a.id || 'default'} role="radio" aria-checked={accent === a.id} title={a.name} aria-label={a.name}
                  className={'accent-opt' + (accent === a.id ? ' on' : '')} style={c ? { background: `linear-gradient(135deg, ${c.primary}, ${c.primary2})` } : undefined}
                  onClick={() => setAccent(a.id)} />
              );
            })}
          </div>
          <div className="bell-head">Theme</div>
          {list.map((t) => (
            <button key={t.id} className={'theme-item' + (t.id === theme ? ' on' : '')} onClick={() => { setMode(''); setTheme(t.id); setOpen(false); }}>
              <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.c.surface} 0 45%, ${t.c.primary} 45% 72%, ${t.c.primary2} 72%)`, borderColor: t.c.borderStrong }} />
              <span className="grow">{t.name}{t.inspired && t.inspired !== t.name && <small className="muted"> · {t.inspired}</small>}</span>
              {t.base === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          ))}
          <div className="bell-head">Colour</div>
          <ColourLevel onPick={() => setOpen(false)} />
          <div className="bell-head">Style</div>
          {STYLES.map((s) => (
            <button key={s.id} className={'style-item' + (s.id === style ? ' on' : '')} onClick={() => { setStyle(s.id); setOpen(false); }}>
              <span className={'swatch style-swatch surface-' + s.id} />
              <span className="grow">{s.name}<small className="muted"> · {s.hint}</small></span>
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
/**
 * Live clock plus where this device's work stands (1.6): Offline (with how many changes are waiting), Syncing, a count
 * of changes waiting, Synced, or Needs attention (a change the cloud refused, a failed save on the device, an expired
 * sign-in). The tooltip says why; clicking tries again (or opens This device when something needs attention).
 */
function ClockPill() {
  const { syncStatus, syncNow, setUser, pending, storageIssue } = useStore();
  const navigate = useNavigate();
  const online = useOnline();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const s = syncStatus.state;
  const waiting = pending > 0 ? `${pending} waiting` : '';
  const attention = storageIssue || syncStatus.rejected > 0 || s === 'error' || syncStatus.expired;
  const tone = attention ? 'danger' : s === 'offline' || !online ? 'warn' : s === 'syncing' || pending ? 'syncing' : 'ok';
  const tip = storageIssue || (syncStatus.expired ? 'Signed out of the cloud: click to sign in again'
    : syncStatus.rejected > 0 ? `${syncStatus.rejected} change(s) were refused by the cloud and kept on this device for review (This device → Sync & storage)`
    : s === 'error' ? `${syncStatus.error}${pending ? ` · ${pending} change(s) waiting, kept on this device` : ''}${syncStatus.retryAt ? ` · trying again at ${new Date(syncStatus.retryAt).toLocaleTimeString()}` : ''}`
    : !online || s === 'offline' ? (keepsData() ? `Offline: your work is saved on this device${pending ? ` (${pending} change(s) waiting)` : ''} and goes up when the internet is back` : 'Offline: the web version needs the internet')
    : syncStatus.lastSync ? (pending ? `${pending} change(s) on their way · ` : '') + 'Up to date ' + new Date(syncStatus.lastSync).toLocaleTimeString() : 'Connecting…');
  const label = s === 'off' && !pending ? 'On this device' : storageIssue ? 'Needs attention' : syncStatus.expired ? 'Sign in again' : attention ? 'Needs attention'
    : !online || s === 'offline' ? ['Offline', waiting].filter(Boolean).join(' · ') : s === 'syncing' ? 'Syncing…' : waiting || 'Synced';
  const clockTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), clockDate = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const click = () => (syncStatus.expired ? setUser(null) : storageIssue || syncStatus.rejected > 0 ? navigate('/device') : syncNow());
  return (
    // step 24: the spoken name starts with the words on the pill (axe label-content-name-mismatch), then the detail
    <button className={'pill clock ' + tone} title={tip} aria-label={`${label} ${clockTime} ${clockDate}. ${tip}`} onClick={click}>
      <i /><span className="clock-state" aria-live="polite">{label}</span>{' '}<span className="clock-time">{clockTime}</span>{' '}
      <span className="clock-date">{clockDate}</span>
    </button>
  );
}

/** Ctrl+K: jump to any page, medicine, customer or receipt */
function CommandPalette({ open, onClose, pages, commands = [] }) {
  const { db, products, fmt } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef();
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = (...v) => v.join(' ').toLowerCase().includes(s);
    // the owner's request: Ctrl+K also runs commands ("new sale", "receive stock", "add customer"…)
    const out = commands.filter((c) => (s ? has(c.label, c.words || '') : true)).slice(0, s ? 5 : 4).map((c) => ({ section: 'Commands', ...c }));
    out.push(...pages.filter((p) => !s || has(p.label)).slice(0, s ? 6 : 8).map((p) => ({ section: 'Pages', label: p.label, Icon: p.Icon, hint: p.key, go: () => navigate(p.to) })));
    if (s) {
      products.filter((p) => has(p.name, p.generic, p.barcode)).slice(0, 6).forEach((p) =>
        out.push({ section: 'Medicines', label: p.name, Icon: Pill, hint: `${p.stock} in stock · ${fmt(p.price)}`, go: () => navigate('/stock-card', { state: { productId: p.id } }) }));
      db.customers.filter((c) => has(c.name, c.phone)).slice(0, 4).forEach((c) =>
        out.push({ section: 'Customers', label: c.name, Icon: User, hint: c.phone, go: () => navigate('/customers', { state: { q: c.name } }) }));
      db.sales.filter((x) => has(x.number)).slice(0, 4).forEach((x) =>
        out.push({ section: 'Receipts', label: x.number, Icon: ReceiptText, hint: fmt(x.total), go: () => navigate('/sales', { state: { q: x.number } }) }));
    }
    return out;
  }, [q, pages, commands, products, db.customers, db.sales, fmt, navigate]);

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
        <div className="palette-input"><Search size={18} /><input ref={inputRef} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search pages, medicines, customers, receipts, or type a command…" /><kbd>Esc</kbd></div>
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

/** ? on any page: the keys as they are on this device, and what the mouse does */
function KeysHelp({ onClose, pages }) {
  const navigate = useNavigate();
  const allowed = new Set(pages.map((p) => 'go:' + p.to));
  const groups = ['Pages', 'Anywhere', 'Lists'];
  return (
    <Modal title="Keyboard and mouse" onClose={onClose} wide>
      <div className="keys-help">
        {groups.map((g) => (
          <section key={g}>
            <h4>{g === 'Lists' ? 'In lists (customers, medicines, sales…)' : g}</h4>
            <table className="keys-table"><tbody>
              {ACTIONS.filter(([id, , grp]) => grp === g && (!id.startsWith('go:') || allowed.has(id)) && keyOf(id)).map(([id, label]) => <tr key={id}><td><kbd>{showKey(keyOf(id))}</kbd></td><td>{label}</td></tr>)}
            </tbody></table>
          </section>
        ))}
        <section>
          <h4>Mouse</h4>
          <table className="keys-table"><tbody>
            <tr><td><kbd>Double-click</kbd></td><td>Open or edit a row</td></tr>
            <tr><td><kbd>Right-click</kbd></td><td>What you can do with a row</td></tr>
            <tr><td><kbd>Shift+click</kbd></td><td>Tick every row between two ticks</td></tr>
            <tr><td><kbd>Ctrl+click</kbd></td><td>Open a menu page in a new tab or window</td></tr>
            <tr><td><kbd>Hover</kbd></td><td>A medicine's stock and batches (Medicine List, Inventory)</td></tr>
          </tbody></table>
          <p className="muted small">The till has its own keys: press ? there.</p>
        </section>
      </div>
      <div className="form-actions"><button className="btn" onClick={() => { onClose(); navigate('/device', { state: { tab: 'keyboard' } }); }}>Change the keys</button><button className="btn primary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function Shell() {
  const { db, products, user, setUser, branchId, branch, update, syncNow, syncCfg } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme, themeMode, setThemeMode, accent, setAccent] = useTheme();
  const [surface, setSurface] = useSurface();
  const [drawer, setDrawer] = useState(false);
  // compact navigation rail (icons only) for more working width, e.g. at the POS; remembered on this device
  const [rail, setRail] = useState(() => {
    try { const v = localStorage.getItem('rxpos-rail'); if (v) return v === '1'; } catch { /* storage blocked */ }
    return matchMedia('(pointer: coarse) and (max-height: 520px)').matches; // a phone on its side: give the work the width
  });
  const toggleRail = () => setRail((r) => { try { localStorage.setItem('rxpos-rail', r ? '0' : '1'); } catch { /* storage blocked */ } return !r; });
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
  // phones: gliding page transitions, swipe from the left edge to go back, room for the on-screen keyboard
  const contentRef = useRef(null);
  usePageMotion(contentRef);
  useEdgeSwipeBack(contentRef);
  useKeyboardFit();
  // the keyboard map (src/keymap.js): pages, Ctrl+K, ?, back / forward, pin; the keys can be changed per device
  const [help, setHelp] = useState(false);
  const [nav, setNav] = useState(() => ({ pins: deviceSettings().navPins || [], recent: deviceSettings().navRecent || [] }));
  useEffect(() => onDevice((d) => setNav({ pins: d.navPins || [], recent: d.navRecent || [] })), []);
  const togglePin = (to) => { const pins = nav.pins.includes(to) ? nav.pins.filter((x) => x !== to) : [...nav.pins, to].slice(-8); setDevice({ navPins: pins }); toast(nav.pins.includes(to) ? 'Unpinned from the menu' : 'Pinned to the top of the menu'); };
  const here = location.pathname;
  const pinRef = useRef(); pinRef.current = () => togglePin(here);
  useEffect(() => {
    const ids = ACTIONS.map(([id]) => id).filter((id) => !id.startsWith('list:'));
    const match = keyMatcher(ids);
    const onKey = (e) => {
      // 1.10 don't fire global navigation/command shortcuts while a dialog or modal is open
      if (document.querySelector('.modal-bg')) return;
      const c = e.key;
      // a plain letter, digit or ? while typing in a box is the box's (F-keys and Ctrl/Alt combinations still work)
      if (typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey && c.length === 1) return;
      const id = match(e);
      if (!id) return;
      const onTill = window.location.hash.startsWith('#/pos');
      if (onTill && (id === 'help' || id === 'back' || id === 'forward')) return; // the till has its own ? sheet, and Alt+←/→ switch held sales
      if (id === 'palette' && document.querySelector('.pos.lay-adv')) return; // the Advanced till keeps Ctrl+K for its command bar
      e.preventDefault();
      e.stopImmediatePropagation(); // G then E is Expenses, not also "edit the row" in a list
      if (id.startsWith('go:')) navigate(id.slice(3));
      else if (id === 'palette') setPalette(true);
      else if (id === 'help') setHelp(true);
      else if (id === 'back') navigate(-1);
      else if (id === 'forward') navigate(1);
      else if (id === 'pin') pinRef.current();
    };
    // capture: before the lists' keys (src/listcontrols.jsx), so G then E is Expenses and not also "edit the row"
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [navigate]);
  // recent pages (this device), and each page's scroll position, kept while the app is open
  const scrolls = useRef({});
  useEffect(() => {
    const recent = [here, ...(deviceSettings().navRecent || []).filter((x) => x !== here)].slice(0, 6);
    setDevice({ navRecent: recent });
    const box = document.querySelector('main.content');
    const y = scrolls.current[here] || 0;
    const t = setTimeout(() => { if (box) box.scrollTop = y; }, 60);
    const save = () => { if (box) scrolls.current[here] = box.scrollTop; };
    box?.addEventListener('scroll', save, { passive: true });
    return () => { clearTimeout(t); box?.removeEventListener('scroll', save); };
  }, [here]);

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
        const { mustChangePassword, ...rest } = u;
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
  // Signing out never deletes unsent work: the Windows and Android apps keep it and send it later;
  // the web version keeps nothing, so it asks before letting it go
  const { pending: unsent, db: dbNow } = useStore();
  const signOut = async () => {
    const mine = (dbNow.drafts || []).filter((d) => d.userId === user.id).length;
    const out = await setUser(null, { confirmLoss: (n) => ask({ title: `${n} change(s) haven't reached the cloud`, message: 'This browser keeps nothing on the computer, so signing out now loses them. Stay signed in until the internet is back, or sign out anyway.', confirmText: 'Sign out anyway', cancelText: 'Stay signed in', danger: true }) });
    if (out && keepsData() && unsent) toast(`${unsent} change(s) are kept on this device and will be sent when someone signs in again.`, 'info');
    else if (out && mine) toast(`Your ${mine} held sale${mine === 1 ? '' : 's'}/draft${mine === 1 ? '' : 's'} stay saved: continue ${mine === 1 ? 'it' : 'them'} after signing in, on any device.`, 'info');
  };
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={'shell' + (drawer ? ' drawer-open' : '') + (rail ? ' rail' : '')}>
      <div className="drawer-bg" onClick={() => setDrawer(false)} />
      <aside className="sidebar">
        <div className="brand"><BrandLogo src={db.license?.[0]?.branding?.logo} size={34} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span>
          <button className="icon-btn rail-btn" onClick={toggleRail} aria-pressed={rail} aria-label={rail ? 'Expand the menu' : 'Collapse the menu to icons'} title={rail ? 'Expand the menu' : 'Collapse the menu to icons'}>{rail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
        <div className="store-name">{db.settings.name}</div>
        <nav>
          {/* pinned pages (G G, or the pin in the top bar) and the last pages used, on this device */}
          {(() => {
            const byTo = Object.fromEntries(pages.map((pg) => [pg.to, pg]));
            const pinned = nav.pins.map((t) => byTo[t]).filter(Boolean);
            const recent = nav.recent.filter((t) => t !== here && !nav.pins.includes(t)).map((t) => byTo[t]).filter(Boolean).slice(0, 4);
            const item = (pg, kind) => <NavLink key={kind + pg.to} to={pg.to} end title={rail ? pg.label : undefined} className={'nav-' + kind}><pg.Icon size={17} /><span className="grow">{pg.label}</span></NavLink>;
            return (<>
              {pinned.length > 0 && <div className="nav-group nav-quick"><div className="nav-title static">Pinned</div>{pinned.map((pg) => item(pg, 'pin'))}</div>}
              {recent.length > 0 && !rail && <div className="nav-group nav-quick"><div className="nav-title static">Recent</div>{recent.map((pg) => item(pg, 'recent'))}</div>}
            </>);
          })()}
          {groups.map((g, i) => (
            <div key={i} className="nav-group">
              {g.group && <button className="nav-title" aria-expanded={!collapsed[g.group]} onClick={() => toggleGroup(g.group)}>{g.group}<ChevronDown size={13} style={{ transform: collapsed[g.group] ? 'rotate(-90deg)' : '', transition: 'transform .15s' }} /></button>}
              {g.items.map(([to, label, Icon, , badge]) => { const key = keyOf('go:' + to) && showKey(keyOf('go:' + to)); return (
                <NavLink key={to} to={to} end title={rail ? label + (key ? ` (${key})` : '') : undefined} hidden={!rail && collapsed[g.group] && !g.items.some(([t]) => t === location.pathname) && !(badge && counts[badge] > 0)}>
                  <Icon size={17} /><span className="grow">{label}</span>
                  {badge && counts[badge] > 0 && <span className="count">{counts[badge]}</span>}
                  {key && <kbd>{key}</kbd>}
                </NavLink>
              ); })}
            </div>
          ))}
        </nav>
        <div className="user-box">
          <span className="avatar">{initials}</span>
          <div className="grow"><strong>{user.name}</strong><small>{user.role}</small></div>
          <button className="icon-btn" title="Change my password" onClick={() => changePassword(false)}><KeyRound size={17} /></button>
          {isNative && <button className={'icon-btn' + (pinSet ? ' text-ok' : '')} title={pinSet ? 'Quick PIN is set for this device' : 'Set a quick PIN for this device'} onClick={manageDevicePin}><LockKeyhole size={17} /></button>}{/* web: nothing is kept on the computer, so no device PIN */}
          {syncCfg?.key?.startsWith('u.') && <button className={'icon-btn' + (me?.twoFactor ? ' text-ok' : '')} title={me?.twoFactor ? 'Two-step sign-in is on' : 'Two-step sign-in'} onClick={() => setTwoStepOpen(true)}><ShieldCheck size={17} /></button>}
          <button className="icon-btn" title="Log out" onClick={signOut}><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          {here === '/' ? <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}><Menu size={20} /></button> : <BackButton />}
          <button className="search-trigger" onClick={() => setPalette(true)}><Search size={16} /><span>Search medicines, customers, receipts…</span><kbd>Ctrl K</kbd></button>
          {(() => {
            const g = groups.find((x) => x.items.some(([t]) => t === here));
            const pg = pages.find((x) => x.to === here);
            return pg ? (
              <nav className="crumbs" aria-label="You are here">
                {g?.group && <span className="muted">{g.group}</span>}{g?.group && <span className="muted" aria-hidden="true">›</span>}<strong>{pg.label}</strong>
                <button className={'icon-btn sm' + (nav.pins.includes(here) ? ' on' : '')} aria-pressed={nav.pins.includes(here)} onClick={() => togglePin(here)}
                  title={`${nav.pins.includes(here) ? 'Unpin this page from' : 'Pin this page to'} the top of the menu (${showKey(keyOf('pin'))})`} aria-label={nav.pins.includes(here) ? 'Unpin this page' : 'Pin this page'}><Pin size={14} /></button>
                <button className="icon-btn sm" onClick={() => setHelp(true)} title={`Keyboard and mouse (${showKey(keyOf('help'))})`} aria-label="Keyboard and mouse help"><Keyboard size={14} /></button>
              </nav>
            ) : null;
          })()}
          <div className="spacer grow" />
          {db.branches.length > 1 && <NavLink to="/branches" className="pill branch-pill" title="Branch this device works as"><Building2 size={14} />{branch?.name}</NavLink>}
          <ClockPill />
          <NotificationBell />
          <PremiumToggle theme={theme} setTheme={setTheme} setMode={setThemeMode} />
          <ThemePicker theme={theme} setTheme={setTheme} mode={themeMode} setMode={setThemeMode} accent={accent} setAccent={setAccent} style={surface} setStyle={setSurface} />
        </header>
        <main className="content" ref={contentRef}>
          <Suspense fallback={<div className="page"><div className="skeleton" /><div className="skeleton" style={{ height: 280 }} /></div>}>
            <Routes>
              {groups.flatMap((g) => g.items).map(([to, , , , , el]) => <Route key={to} path={to} element={el} />)}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end onClick={() => markNav('tab')}><LayoutDashboard size={20} /><span>Home</span></NavLink>
        <NavLink to="/inventory" onClick={() => markNav('tab')}><Boxes size={20} /><span>Stock</span></NavLink>
        <NavLink to="/pos" className="fab" onClick={() => markNav('tab')}><span className="fab-icon"><ShoppingCart size={22} /></span><span>Sell</span></NavLink>
        <NavLink to="/sales" onClick={() => markNav('tab')}><ReceiptText size={20} /><span>Sales</span></NavLink>
        <button onClick={() => setDrawer(true)} aria-expanded={drawer}><Menu size={20} /><span>More</span></button>
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={pages} commands={[
        ...(can('pos.sell') ? [{ label: 'New sale', words: 'sell till pos', Icon: ShoppingCart, hint: showKey(keyOf('go:/pos')), go: () => navigate('/pos') }] : []),
        ...(can('stock.receive') ? [{ label: 'Receive stock', words: 'add stock delivery invoice purchase', Icon: PackagePlus, hint: showKey(keyOf('go:/add-stock')), go: () => navigate('/add-stock') }] : []),
        ...(can('customers') ? [{ label: 'Add a customer', words: 'new client patient', Icon: UserPlus, go: () => navigate('/customers', { state: { create: true } }) }] : []),
        ...(can('suppliers') ? [{ label: 'Add a supplier', words: 'new supplier', Icon: Truck, go: () => navigate('/suppliers', { state: { create: true } }) }] : []),
        ...(can('medicines.manage') ? [{ label: 'Add a medicine', words: 'new product drug', Icon: Pill, go: () => navigate('/medicines', { state: { create: true } }) }] : []),
        ...(can('finance') ? [{ label: 'Add an expense', words: 'new expense spend', Icon: Wallet, go: () => navigate('/expenses', { state: { create: true } }) }] : []),
        { label: nav.pins.includes(here) ? 'Unpin this page' : 'Pin this page', words: 'pin favourite menu', Icon: Pin, hint: showKey(keyOf('pin')), go: () => togglePin(here) },
        { label: 'Keyboard and mouse help', words: 'shortcuts keys help', Icon: Keyboard, hint: showKey(keyOf('help')), go: () => setHelp(true) },
        { label: 'Change keyboard shortcuts', words: 'keys remap keyboard settings', Icon: Keyboard, go: () => navigate('/device', { state: { tab: 'keyboard' } }) },
      ]} />
      {help && <KeysHelp onClose={() => setHelp(false)} pages={pages} />}
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
      <HistoryLoading />
      <UpdateHost />
      <WebOffline />
      {twoStepOpen && <TwoStepModal onClose={() => setTwoStepOpen(false)} />}
    </div>
  );
}

/** Web version (online only): without internet nothing can be saved, so the screen says so and waits for the
 * connection. Changes already made go up as soon as it's back. The Windows and Android apps keep working offline. */
function WebOffline() {
  const online = useOnline();
  if (!isWeb || online) return null;
  return (
    <div className="modal-bg web-offline" role="alertdialog" aria-modal="true" aria-labelledby="web-offline-title">
      <div className="modal dialog">
        <div className="dialog-icon danger"><WifiOff size={24} /></div>
        <h3 id="web-offline-title">No internet connection</h3>
        <p className="muted">The web version of RxPOS works online only and keeps nothing on this computer, so it waits here until the connection is back. Anything you already did goes up as soon as it reconnects.</p>
        <p className="muted small">To keep selling without internet, use the RxPOS Windows or Android app.</p>
        <div className="row gap" style={{ justifyContent: 'center' }}><span className="spinner" style={{ margin: 0, width: 22, height: 22 }} /><span className="small">Waiting for the connection…</span></div>
      </div>
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
  // stage 2 of the faster sync: once the core (medicines, stock, clients, staff) is in, the app is ready to use
  if (!(syncStatus.first && syncStatus.state === 'syncing') || syncStatus.history || db.products.length > 50) return null;
  return (
    <div className="first-sync">
      <div className="spinner" />
      <h3>Setting up {db.settings.name !== 'My Pharmacy' ? db.settings.name : 'your pharmacy'} on this device…</h3>
      <p className="muted">{syncStatus.progress || 'Downloading medicines, stock and staff. This happens only once.'}</p>
    </div>
  );
}

/** While a full download brings the older records (stage 2 of the faster sync): say that reports may still grow */
function HistoryLoading() {
  const { syncStatus } = useStore();
  // stage 4: a device keeping recent history waits for the cloud's brought-forward figures (needs the internet)
  if (syncStatus.balancesPending) return <div className="history-loading" role="status">Older balances are still coming from the cloud: stock, debts and cash shown may be incomplete until this device is online</div>;
  if (!(syncStatus.history && syncStatus.state === 'syncing')) return null;
  return <div className="history-loading" role="status">{syncStatus.progress || 'Downloading older records…'} · sales history and reports fill in as they arrive; selling and stock are ready</div>;
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
