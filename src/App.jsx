import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle,
  LayoutDashboard, ShoppingCart, PackageOpen, ReceiptText, FileText, ClipboardPlus, Users, Truck, Pill, FlaskConical,
  Boxes, PackagePlus, History, CalendarClock, PencilRuler, ScrollText, Wallet, Tags, Landmark, ArrowLeftRight, HandCoins,
  ArrowDownLeft, ArrowUpRight, ClipboardCheck, RefreshCw, Undo2, ShieldPlus, BookOpen, BarChart3, Settings as SettingsIcon, Search, Sun, Moon, Menu, LogOut, ChevronDown,
  BellRing, Plus, ShoppingBag, Tag, FileUp, Building2, Send, ShieldCheck, Clock, BookMarked, MessagesSquare, UserCog, KeyRound, CalendarDays, Thermometer, Palette, MonitorSmartphone, ScanText, GraduationCap, Megaphone, CalendarRange, LockKeyhole, NotebookPen, PanelLeftClose, PanelLeftOpen, WifiOff,
  Sparkles, Pin, Keyboard, UserPlus, Archive, BadgeCheck, BriefcaseMedical,
} from 'lucide-react';
import { endOtherSessions, setPersonGuard, borrowedToken, cloudLogin } from './cloud.js';
import { useStore, useSyncState, makePassword, put, audit, isLowStock, expiryCounts } from './store.jsx';
import { askText, ask, toast } from './feedback.jsx';
import { hasPin, setPin, clearPin, verifyOffline } from './offline.js';
import Auth from './pages/Auth.jsx';
import { BrandLogo, pharmacyLogo, setFileBase } from './logo.jsx';
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
import { applyTheme, saveTheme, allowedThemes, THEME_GROUPS, currentThemeId, savedMode, saveMode, systemDark, paletteFor, startupTheme, savedAccent, saveAccent } from './themes.js';
import { STYLES, applyStyle, savedStyle, saveStyle } from './surface.js';
import { LEVELS, applyLevel, savedLevel, saveLevel } from './vivid.js';
import { TwoStepModal } from './twostep.jsx';
import { setCrashCloud } from './crash.js';
import { homeFor, chosenTabs } from './landing.js';
import { setBadge } from './badges.js';
import { ACTIONS, keyOf, keyMatcher, showKey, typing } from './keymap.js';
import { deviceSettings, setDevice, onDevice } from './device.js';
import { Modal, PageSkeleton } from './ui.jsx';
import { MegaMenu, TopNav } from './components/NavMenus.jsx';
import { BackButton, markNav, usePageMotion, useEdgeSwipeBack, useKeyboardFit } from './mobilenav.jsx';
import AiOmnibar from './components/AiOmnibar.jsx';
import { warmSearchKeys } from './search.js';
const OwnerConsole = lazy(() => import('./pages/OwnerConsole.jsx'));

// Pages load on demand so the app opens fast, even on low-end PCs and phones; once it is open and idle every page's
// code is loaded in the background (one at a time), so opening a page for the first time is as quick as the second
const loaders = new Set();
const page = (loader, name = 'default') => { loaders.add(loader); return lazy(() => loader().then((m) => ({ default: m[name] }))); };
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 200));
let preloaded = false;
function preloadPages() {
  if (preloaded) return;
  preloaded = true;
  const list = [...loaders];
  const next = () => { const l = list.shift(); if (l) l().catch(() => {}).finally(() => whenIdle(next)); };
  setTimeout(() => whenIdle(next), 1500); // after the first screen is drawn and the first sync has started
}
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
  Kits: page(() => import('./pages/Kits.jsx')),
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
  Notes: page(() => import('./pages/Notes.jsx')),
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
const TAB_ICONS = { '/': LayoutDashboard, '/inventory': Boxes, '/customers': Users, '/prescriptions': ClipboardPlus, '/sales': ReceiptText, '/shifts': Clock, '/expiry': CalendarClock, '/add-stock': PackagePlus, '/chat': MessageCircle, '/reports': BarChart3, '/expenses': Wallet };
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
    ['/notes', 'Notes & SOPs', NotebookPen, null, null, <P.Notes />, null, 'notes'],
  ] },
  { group: 'Medicine Inventory', items: [
    ['/medicines', 'Medicine List', Pill, null, null, <P.MedicineList />, 'inventory.view'],
    ['/formulations', 'Formulations', FlaskConical, null, null, <P.Formulations />, 'medicines.manage'],
    ['/inventory', 'Inventory', Boxes, 'F7', 'low', <P.StockLevels />, 'inventory.view'],
    ['/add-stock', 'Add Stock', PackagePlus, 'F4', null, <P.AddStock />, 'stock.receive'],
    ['/kits', 'Kits', BriefcaseMedical, null, 'kits', <P.Kits />, 'inventory.view'],
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
const PREMIUM = 'navy-teal', PREMIUM_PREV = 'rxpos-premium-prev', PREMIUM_KEY = 'rxpos-advanced-ui';
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

function ThemePicker({ theme, setTheme, mode, setMode, style, setStyle }) {
  const { db } = useStore();
  const branding = db.license?.[0]?.branding;
  const list = allowedThemes(branding);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const current = list.find((t) => t.id === theme);
  // Keep within what the owner allows for this pharmacy
  useEffect(() => { if (list.length && !list.some((t) => t.id === theme)) { const d = currentThemeId(branding?.defaultTheme || ''); setTheme(d && list.some((t) => t.id === d) ? d : list[0].id); } }, [branding]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // a theme is previewed while the pointer is on it (2026-11-18); closing the menu puts the chosen one back
  useEffect(() => { if (!open) applyTheme(theme); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <div className="bell-menu theme-menu" onMouseLeave={() => applyTheme(theme)}>
          <div className="bell-head">Appearance</div>
          <div className="mode-toggle" role="radiogroup" aria-label="Appearance">
            {MODES.map(([id, label, Icon]) => (
              <button key={id} role="radio" aria-checked={activeMode === id} className={'mode-opt' + (activeMode === id ? ' on' : '')}
                onClick={() => (id === 'system' ? setMode('system') : pickBase(id))}><Icon size={14} />{label}</button>
            ))}
          </div>
          {/* themes by group (src/themes.js THEME_GROUPS): Clinical, Colourful, Dashboard looks, Dark, High contrast */}
          {THEME_GROUPS.map((g) => [g, list.filter((t) => (t.group || 'Clinical') === g)]).filter(([, ts]) => ts.length).map(([g, ts]) => (
            <div key={g} className="theme-group" role="group" aria-label={g}>
              <div className="bell-head">{g}</div>
              {ts.map((t) => (
                <button key={t.id} className={'theme-item' + (t.id === theme ? ' on' : '')} onClick={() => { setMode(''); setTheme(t.id); setOpen(false); }}
                  onMouseEnter={() => applyTheme(t.id)} onFocus={() => applyTheme(t.id)}>
                  <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.c.sidebar} 0 30%, ${t.c.surface} 30% 55%, ${t.c.primary} 55% 78%, ${t.c.primary2} 78%)`, borderColor: t.c.borderStrong }} />
                  <span className="grow">{t.name}{t.inspired && t.inspired !== t.name && <small className="muted"> · {t.inspired}</small>}</span>
                  {t.base === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                </button>
              ))}
            </div>
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

/** F4 (UI batch 3): a slim banner under the top bar while offline ("Offline · 3 changes waiting to send"), which turns
 *  green ("All sent") for 3 s once the internet is back and everything has gone */
function OfflineBanner() {
  const online = useOnline();
  const { pending = 0, syncStatus } = useSyncState() || {};
  const [back, setBack] = useState(false);
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) setBack(true);
    was.current = online;
  }, [online]);
  useEffect(() => {
    if (!back || pending) return undefined;
    const t = setTimeout(() => setBack(false), 3000);
    return () => clearTimeout(t);
  }, [back, pending]);
  const off = !online || syncStatus?.state === 'offline';
  if (!off && !back) return null;
  return (
    <div className={'offline-banner' + (off ? '' : pending ? ' sending' : ' sent')} role="status" aria-live="polite">
      {off ? <>Offline · {pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to send` : 'your work is kept on this device'}</> : pending ? <>Back online · sending {pending} change{pending === 1 ? '' : 's'}…</> : <>All sent</>}
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
  const { syncNow, setUser } = useStore();
  const { syncStatus, pending, storageIssue } = useSyncState();
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
    // shown only when something needs the person (offline, refused changes, sign in again, storage): the owner asked for
    // no sync button while all is well (17 Nov 2026); F5 still syncs, and the account menu has Sync now
    <button className={'pill clock ' + tone} hidden={tone === 'ok' || tone === 'syncing'} title={tip} aria-label={`${label} ${clockTime} ${clockDate}. ${tip}`} onClick={click}>
      <i /><span className="clock-state" aria-live="polite">{label}</span>{' '}<span className="clock-time">{clockTime}</span>{' '}
      <span className="clock-date">{clockDate}</span>
    </button>
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
  const { db, products, user, setUser, branchId, branch, update, syncNow, syncCfg, saveSyncCfg } = useStore();
  // Audit P2-7, option 1: before a call that acts as a person in the cloud, someone who signed in with a PIN or offline
  // password on a device holding another person's token confirms with their own password (src/cloud.js personGuard).
  // The device then keeps their token; syncing and selling never wait for this.
  const guardRef = useRef({});
  guardRef.current = { user, syncCfg, saveSyncCfg, users: db.users };
  useEffect(() => {
    setPersonGuard(async (cfg) => {
      const { user: u, syncCfg: sc, saveSyncCfg: save, users } = guardRef.current;
      if (!u || !borrowedToken(cfg, u.id)) return cfg;
      const me = users.find((x) => x.id === u.id) || u;
      const pw = await askText({ title: 'Confirm it is you', message: `This device is still signed in to the cloud as someone else (they signed in last with their password). To do this as ${u.name}, type your password.`, type: 'password', confirmText: 'Continue' });
      if (!pw) throw new Error('Not done: it needs your own password on this device.');
      const r = await cloudLogin(cfg.url, me.email || me.username || '', pw, cfg.tenant);
      if (r.twoFactor) throw new Error('You use two-step sign-in: sign out, then sign in with your password and code to do this.');
      if (!r.token || r.user?.id !== u.id) throw new Error('That password signed in a different account. Nothing was done.');
      const next = { ...(sc || cfg), key: r.token, keyUser: r.user.id };
      await save(next);
      toast('Signed in to the cloud as you on this device');
      return { ...cfg, key: r.token, keyUser: r.user.id };
    });
    return () => setPersonGuard(null);
  }, []);
  useEffect(() => preloadPages(), []); // every page's code, in the background once the app is open
  useEffect(() => warmSearchKeys(products), [products.length]); // eslint-disable-line react-hooks/exhaustive-deps -- once per new medicine count
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
  setFileBase(syncCfg?.url); // E6: the pharmacy's logo and other files come from its cloud
  // E8: the opening screen next time shows this pharmacy's logo and name
  const splashLogo = pharmacyLogo(db), splashName = db.settings?.name || '';
  useEffect(() => { try { localStorage.setItem('rxpos-splash', JSON.stringify({ logo: splashLogo, name: splashName })); } catch { /* storage blocked */ } }, [splashLogo, splashName]);
  // Menu groups: someone who never folded the menu starts with only Sales open (plus the page they are on), so
  // ~45 pages don't all compete for attention; their own choices are remembered after that
  const [collapsed, setCollapsed] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('pharmapos-nav')); if (saved) return saved; } catch { /* first visit */ }
    return Object.fromEntries(NAV.filter((g) => g.group && g.group !== 'Sales').map((g) => [g.group, true]));
  });

  const { can, features, batchesOf, day, kits } = useStore();
  // Show only what this person's role may use and what is switched on for this pharmacy
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(([, , , , , , perm, feat]) => (!perm || [].concat(perm).some(can)) && (!feat || features[feat] !== false)) })).filter((g) => g.items.length);
  const pages = groups.flatMap((g) => g.items.map(([to, label, Icon, key]) => ({ to, label, Icon, key })));
  // F8: the four pages this device chose for the phone's bottom bar (This device), else the role's standard bar
  const [barPick, setBarPick] = useState(() => deviceSettings().bottomBar || null);
  useEffect(() => onDevice((d) => setBarPick(d.bottomBar || null)), []);
  const tabs = chosenTabs(barPick, can, (to) => pages.some((x) => x.to === to));
  // role-based landing (src/landing.js): once per sign-in in this tab, from the dashboard to the role's own page
  useEffect(() => {
    if (!user?.id) return;
    let seen = null; try { seen = sessionStorage.getItem('rxpos-landed'); } catch { /* storage blocked */ }
    if (seen === user.id) return;
    try { sessionStorage.setItem('rxpos-landed', user.id); } catch { /* storage blocked */ }
    const home = homeFor(user.role, can);
    if (location.pathname === '/' && home !== '/' && pages.some((x) => x.to === home)) navigate(home, { replace: true });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [updReady, setUpdReady] = useState(false);
  useEffect(() => onUpdate((u) => setUpdReady(u.status === 'ready')), []);
  const counts = useMemo(() => ({
    update: updReady ? 1 : 0,
    expiry: (() => { const c = expiryCounts(products, batchesOf, db.settings.expiryWarnDays || 90); return c.soon + c.expired; })(),
    low: products.filter(isLowStock).length,
    kits: kits.filter((k) => k.active !== false && k.canMake != null && k.canMake <= 3).length, // recommendation 6: kits running low
    transfers: db.transfers.filter((t) => t.toId === branchId && t.status === 'In transit').length,
    chat: unreadCount(db, user),
  }), [products, kits, batchesOf, db.settings.expiryWarnDays, db.transfers, db.messages, branchId, user, day, updReady]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // the navigation style chosen in This device → Navigation: the sidebar (default) or the top pill navbar (wide screens)
  const [navStyle, setNavStyle] = useState(() => deviceSettings().navStyle || 'sidebar');
  useEffect(() => onDevice((d) => { setNav({ pins: d.navPins || [], recent: d.navRecent || [] }); setNavStyle(d.navStyle || 'sidebar'); }), []);
  const [mega, setMega] = useState(false); // every page as a bento sheet (phones: More; top navbar: All)
  useEffect(() => setMega(false), [location.pathname]);
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
    const search = () => setPalette(true); // the Dashboard's search box
    window.addEventListener('rxpos:search', search);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('rxpos:search', search); };
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
  /** The current password before a change to how someone signs in on this device (checked with this device's verifier) */
  const confirmItsYou = async (why) => {
    const pw = await askText({ title: 'Confirm it is you', message: `${why} Type your current password.`, type: 'password', minLength: 1, confirmText: 'Continue' });
    if (pw === null || pw === undefined) return false;
    const ok = await verifyOffline(syncCfg?.tenant, user.id, pw).catch(() => false);
    if (!ok) toast('Wrong password. Nothing was changed.', 'error');
    return ok;
  };
  const manageDevicePin = async () => {
    const tenant = syncCfg?.tenant;
    if (hasPin(tenant, user.id)) {
      if (await ask({ title: 'Remove this device’s quick PIN?', message: 'You will sign in with your full password on this device. You can set a new PIN any time.', confirmText: 'Remove PIN', danger: true })) {
        if (!(await confirmItsYou('Removing the quick PIN changes how you sign in on this device.'))) return;
        clearPin(tenant, user.id); setPinSet(false); toast('PIN removed from this device');
        update((d) => audit(d, user, 'Quick PIN removed from a device', 'this device only', branchId));
      }
      return;
    }
    if (!(await confirmItsYou('A quick PIN lets you sign in on this device without your full password.'))) return;
    const pin = await askText({ title: 'Set a quick PIN for this device', message: 'A 4–8 digit PIN signs you in on this device, even offline, without typing your full password. It is kept on this device only, never synced.', type: 'password', minLength: 4, confirmText: 'Next' });
    if (!pin) return;
    const again = await askText({ title: 'Type the PIN again', type: 'password', minLength: 4, confirmText: 'Save PIN' });
    if (again === null) return;
    if (again !== pin) return toast('The two PINs did not match. Try again.', 'error');
    try { await setPin(tenant, user.id, pin); setPinSet(true); toast('Quick PIN set for this device'); update((d) => audit(d, user, 'Quick PIN set on a device', 'this device only', branchId)); } catch (e) { toast(e.message, 'error'); }
  };
  const asked = useRef(false);
  useEffect(() => { if (me?.mustChangePassword && !asked.current) { asked.current = true; changePassword(true); } }, [me?.mustChangePassword]); // eslint-disable-line react-hooks/exhaustive-deps
  // Signing out never deletes unsent work: the Windows and Android apps keep it and send it later;
  // the web version keeps nothing, so it asks before letting it go
  const { db: dbNow } = useStore();
  const { pending: unsent } = useSyncState();
  const signOut = async () => {
    const mine = (dbNow.drafts || []).filter((d) => d.userId === user.id).length;
    const out = await setUser(null, { confirmLoss: (n) => ask({ title: `${n} change(s) haven't reached the cloud`, message: 'This browser keeps nothing on the computer, so signing out now loses them. Stay signed in until the internet is back, or sign out anyway.', confirmText: 'Sign out anyway', cancelText: 'Stay signed in', danger: true }) });
    if (out && keepsData() && unsent) toast(`${unsent} change(s) are kept on this device and will be sent when someone signs in again.`, 'info');
    else if (out && mine) toast(`Your ${mine} held sale${mine === 1 ? '' : 's'}/draft${mine === 1 ? '' : 's'} stay saved: continue ${mine === 1 ? 'it' : 'them'} after signing in, on any device.`, 'info');
  };
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // the account card on This device asks for these (pages/Device.jsx AccountCard)
  const accountRef = useRef(null);
  // 2026-11 audit: end every other sign-in of this person (a lost phone, a shared computer); this device stays signed in
  const signOutOthers = async () => {
    if (passOwner(syncCfg?.key) !== user.id) return toast('Sign out and sign in again with the internet on this device first, so it is signed in as you.', 'warn');
    if (!(await ask({ title: 'Sign out everywhere else?', message: 'Every other phone, computer or browser signed in as you is signed out now (they need your password again). This device stays signed in.', confirmText: 'Sign out everywhere else', danger: true }))) return;
    try { await endOtherSessions(syncCfg); toast('Signed out everywhere else'); } catch (e) { toast(e.message, 'error'); }
  };
  accountRef.current = { password: () => changePassword(false), pin: manageDevicePin, twostep: () => setTwoStepOpen(true), logout: signOut, others: signOutOthers };
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef(null);
  useEffect(() => {
    if (!accountOpen) return;
    const off = (e) => !accountMenuRef.current?.contains(e.target) && setAccountOpen(false);
    const esc = (e) => e.key === 'Escape' && setAccountOpen(false);
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', esc); };
  }, [accountOpen]);
  useEffect(() => {
    const on = (e) => accountRef.current?.[e.detail]?.();
    window.addEventListener('rxpos:account', on);
    return () => window.removeEventListener('rxpos:account', on);
  }, []);

  return (
    <div className={'shell nav-' + navStyle + (drawer ? ' drawer-open' : '') + (rail ? ' rail' : '') + (here === '/' ? ' on-home' : '')}>
      <div className="drawer-bg" onClick={() => setDrawer(false)} />
      <aside className="sidebar">
        <div className="brand"><BrandLogo src={pharmacyLogo(db)} size={34} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span>
          <button className="icon-btn rail-btn" onClick={toggleRail} aria-pressed={rail} aria-label={rail ? 'Expand the menu' : 'Collapse the menu to icons'} title={rail ? 'Expand the menu' : 'Collapse the menu to icons'}>{rail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
        <div className="store-name">{db.settings.name}</div>
        <nav>
          {/* pinned pages (G G, or the pin in the top bar) and the last pages used, on this device */}
          {(() => {
            const byTo = Object.fromEntries(pages.map((pg) => [pg.to, pg]));
            const pinned = nav.pins.map((t) => byTo[t]).filter(Boolean);
            // the owner's choice (2026-11-15): no Recent list; Pinned folds like every other group
            const shut = !rail && collapsed.Pinned;
            return pinned.length > 0 && (
              <div className={'nav-group nav-quick' + (shut ? ' collapsed' : ' open')}>
                <div className="nav-title-row"><button className="nav-title" aria-expanded={!shut} onClick={() => toggleGroup('Pinned')}><ChevronDown size={13} className="nav-chev" />Pinned<span className="nav-count">{pinned.length}</span></button></div>
                {pinned.map((pg, n) => <NavLink key={'pin' + pg.to} to={pg.to} end style={{ '--i': n }} hidden={shut && pg.to !== location.pathname} title={rail ? pg.label : undefined} className="nav-pin"><pg.Icon size={17} /><span className="grow">{pg.label}</span></NavLink>)}
              </div>
            );
          })()}
          {groups.map((g, i) => { const add = QUICK_ADD[g.group] && can(QUICK_ADD[g.group][2]) ? QUICK_ADD[g.group] : null; const alerts = g.items.reduce((a, it) => a + (it[4] && counts[it[4]] > 0 ? counts[it[4]] : 0), 0); return (
            <div key={i} className={'nav-group' + (collapsed[g.group] ? ' collapsed' : ' open')}>
              {g.group && <div className="nav-title-row">
                <button className="nav-title" aria-expanded={!collapsed[g.group]} onClick={() => toggleGroup(g.group)}>
                  <ChevronDown size={13} className="nav-chev" /><span className="nav-name">{g.group}</span><span className="nav-count" title={`${g.items.length} pages`}>{g.items.length}</span>
                  {collapsed[g.group] && alerts > 0 && <span className="count">{alerts}</span>}
                </button>
                {add && <button type="button" className="nav-add" title={add[0]} aria-label={add[0]} onClick={() => navigate(add[1], add[3] ? { state: add[3] } : undefined)}><Plus size={14} /></button>}
              </div>}
              {g.items.map(([to, label, Icon, , badge], n) => { const key = keyOf('go:' + to) && showKey(keyOf('go:' + to)); return (
                <NavLink key={to} to={to} end style={{ '--i': n }} title={label + (key ? ` (${key})` : '')} hidden={!rail && collapsed[g.group] && !g.items.some(([t]) => t === location.pathname) && !(badge && counts[badge] > 0)}>
                  <Icon size={17} /><span className="grow">{label}</span>
                  {badge && counts[badge] > 0 && <span className="count">{counts[badge]}</span>}
                  {key && <kbd>{key}</kbd>}
                </NavLink>
              ); })}
            </div>
          ); })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          {here === '/' ? <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}><Menu size={20} /></button> : <BackButton />}
          <button className="search-trigger" onClick={() => setPalette(true)}><Search size={16} /><span>Search or ask AI…</span><kbd>Ctrl K</kbd></button>
          {(() => {
            const g = groups.find((x) => x.items.some(([t]) => t === here));
            const pg = pages.find((x) => x.to === here);
            return pg ? (
              <nav className="crumbs" aria-label="You are here">
                {g?.group && <button type="button" className="link-btn muted crumb-group" title={`Every page under ${g.group}`} onClick={() => setMega(true)}>{g.group}</button>}{g?.group && <span className="muted" aria-hidden="true">›</span>}<strong>{pg.label}</strong>
                {here !== '/' && <button className={'icon-btn sm' + (nav.pins.includes(here) ? ' on' : '')} aria-pressed={nav.pins.includes(here)} onClick={() => togglePin(here)}
                  title={`${nav.pins.includes(here) ? 'Unpin this page from' : 'Pin this page to'} the top of the menu (${showKey(keyOf('pin'))})`} aria-label={nav.pins.includes(here) ? 'Unpin this page' : 'Pin this page'}><Pin size={14} /></button>}
                <button className="icon-btn sm" onClick={() => setHelp(true)} title={`Keyboard and mouse (${showKey(keyOf('help'))})`} aria-label="Keyboard and mouse help"><Keyboard size={14} /></button>
              </nav>
            ) : null;
          })()}
          {navStyle === 'top' && <TopNav groups={groups} counts={counts} can={can} here={here} onAll={() => setMega(true)} />}
          <div className="spacer grow" />
          {db.branches.length > 1 && <NavLink to="/branches" className="pill branch-pill" title="Branch this device works as"><Building2 size={14} />{branch?.name}</NavLink>}
          <ClockPill />
          <NotificationBell />
          <PremiumToggle theme={theme} setTheme={setTheme} setMode={setThemeMode} />
          <ThemePicker theme={theme} setTheme={setTheme} mode={themeMode} setMode={setThemeMode} accent={accent} setAccent={setAccent} style={surface} setStyle={setSurface} />
          {/* the signed-in person: top right beside the theme, a drop-down (the owner's request, 17 Nov 2026) */}
          <div className="account-menu" ref={accountMenuRef}>
            <button className="account-btn" aria-haspopup="menu" aria-expanded={accountOpen} title="My account" onClick={() => setAccountOpen((o) => !o)}>
              <span className="avatar">{initials}</span><span className="account-who"><strong>{user.name}</strong><small>{user.role}</small></span><ChevronDown size={15} />
            </button>
            <div className="account-drop" role="menu" hidden={!accountOpen} onClick={() => setAccountOpen(false)}>
              <div className="account-drop-head"><span className="avatar">{initials}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></div>
              <button className="menu-item" role="menuitem" title="Change my password" onClick={() => changePassword(false)}><KeyRound size={16} />Change my password</button>
              {isNative && <button className={'menu-item' + (pinSet ? ' text-ok' : '')} role="menuitem" title={pinSet ? 'Quick PIN is set for this device' : 'Set a quick PIN for this device'} onClick={manageDevicePin}><LockKeyhole size={16} />{pinSet ? 'Quick PIN is set for this device' : 'Set a quick PIN for this device'}</button>}{/* web: nothing is kept on the computer, so no device PIN */}
              {syncCfg?.key?.startsWith('u.') && <button className={'menu-item' + (me?.twoFactor ? ' text-ok' : '')} role="menuitem" title={me?.twoFactor ? 'Two-step sign-in is on' : 'Two-step sign-in'} onClick={() => setTwoStepOpen(true)}><ShieldCheck size={16} />{me?.twoFactor ? 'Two-step sign-in is on' : 'Two-step sign-in'}</button>}
              <button className="menu-item" role="menuitem" title="Sync now (F5)" onClick={() => syncNow()}><RefreshCw size={16} />Sync now</button>
              <button className="menu-item danger" role="menuitem" title="Log out" onClick={signOut}><LogOut size={16} />Log out</button>
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className="content" ref={contentRef} data-page={here}>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              {groups.flatMap((g) => g.items).map(([to, , , , , el]) => <Route key={to} path={to} element={el} />)}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {/* the pages this role may open (src/landing.js) */}
        {tabs.left.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => markNav('tab')}>{(() => { const I = TAB_ICONS[to]; return <I size={20} />; })()}<span>{label}</span></NavLink>)}
        {tabs.sell && <NavLink to="/pos" className="fab" onClick={() => markNav('tab')}><span className="fab-icon"><ShoppingCart size={22} /></span><span>Sell</span></NavLink>}
        {tabs.right.map(([to, label]) => <NavLink key={to} to={to} onClick={() => markNav('tab')}>{(() => { const I = TAB_ICONS[to]; return <I size={20} />; })()}<span>{label}</span></NavLink>)}
        <button onClick={() => setMega(true)} aria-expanded={mega}><Menu size={20} /><span>More</span></button>
      </nav>
      <MegaMenu open={mega} onClose={() => setMega(false)} groups={groups} counts={counts} can={can} onFullMenu={() => setDrawer(true)} />
      <AiOmnibar open={palette} onClose={() => setPalette(false)} pages={pages} commands={[
        ...(can('pos.sell') ? [{ label: 'New sale', words: 'sell till pos', Icon: ShoppingCart, hint: showKey(keyOf('go:/pos')), go: () => navigate('/pos') }] : []),
        ...(can('stock.receive') ? [{ label: 'Receive stock', words: 'add stock delivery invoice purchase', Icon: PackagePlus, hint: showKey(keyOf('go:/add-stock')), go: () => navigate('/add-stock') }] : []),
        ...(can('customers') ? [{ label: 'Add a customer', words: 'new client patient', Icon: UserPlus, go: () => navigate('/customers', { state: { create: true } }) }] : []),
        ...(can('suppliers') ? [{ label: 'Add a supplier', words: 'new supplier', Icon: Truck, go: () => navigate('/suppliers', { state: { create: true } }) }] : []),
        ...(can('medicines.manage') ? [{ label: 'Add a medicine', words: 'new product drug', Icon: Pill, go: () => navigate('/medicines', { state: { create: true } }) }] : []),
        ...(can('finance') ? [{ label: 'Add an expense', words: 'new expense spend', Icon: Wallet, go: () => navigate('/expenses', { state: { create: true } }) }] : []),
        ...(features.notes !== false ? [{ label: 'New note page', words: 'note sop page notion write checklist', Icon: NotebookPen, go: () => navigate('/notes', { state: { create: true } }) }] : []),
        ...(features.notes !== false ? [{ label: 'New checklist from a template', words: 'template opening checklist sop handover', Icon: NotebookPen, go: () => navigate('/notes', { state: { template: 'opening' } }) }] : []),
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
  const { db } = useStore();
  const { syncStatus } = useSyncState();
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
  const { syncStatus } = useSyncState();
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
  if (location.pathname === '/owner' && isWeb) return <Suspense fallback={<PageSkeleton />}><OwnerConsole /></Suspense>;
  return user ? <Shell /> : <Auth />;
}

// The + beside a menu group: its most common "new …" (the sidebar groups from the owner's references, 2026-11-15)
const QUICK_ADD = {
  Sales: ['New sale', '/pos', 'pos.sell'],
  People: ['Add a customer', '/customers', 'customers', { create: true }],
  'Medicine Inventory': ['Receive stock', '/add-stock', 'stock.receive'],
  Finance: ['Add an expense', '/expenses', 'finance', { create: true }],
};

/** Whose sign-in pass this is (the person it was issued to); '' for a pharmacy key */
export const passOwner = (key) => { try { return String(key || '').startsWith('u.') ? JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || '' : ''; } catch { return ''; } };

export default function App() {
  useHideSplash();
  return <HashRouter><Gate /></HashRouter>;
}
