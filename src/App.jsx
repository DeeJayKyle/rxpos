import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useStore, daysUntil } from './store.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/POS.jsx';
import Sales from './pages/Sales.jsx';
import Proformas from './pages/Proformas.jsx';
import { MedicineList, Formulations, StockLevels, QuickEdit, StockCard, Expiry } from './pages/Inventory.jsx';
import Purchases, { AddStock } from './pages/Purchases.jsx';
import Prescriptions from './pages/Prescriptions.jsx';
import { Customers, Suppliers } from './pages/People.jsx';
import { Expenses, ExpenseCategories, Banks, BankTx, Loans, Debtors, Creditors, CashBook } from './pages/Finance.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { items: [['/', 'Dashboard', '▦']] },
  { group: 'Sales', items: [['/pos', 'POS - Retail', '⌨', 'F2'], ['/pos/wholesale', 'POS - Wholesale', '▣', 'F3'], ['/sales', 'Sales History', '☰', 'F6'], ['/proformas', 'Proformas', '✎'], ['/prescriptions', 'Prescriptions', '℞']] },
  { group: 'People', items: [['/customers', 'Customers', '☺'], ['/suppliers', 'Suppliers', '⛟']] },
  { group: 'Medicine Inventory', items: [['/medicines', 'Medicine List', '✚'], ['/formulations', 'Formulations', '⚗'], ['/inventory', 'Inventory', '▤', 'F7'], ['/add-stock', 'Add Stock', '⇩', 'F4'], ['/purchases', 'Purchase History', '⧉'], ['/expiry', 'Soon Expiring / Expired', '⏳', null, 'expiry'], ['/quick-edit', 'Quick Edit', '✐'], ['/stock-card', 'Stock Card', '▥']] },
  { group: 'Finance', items: [['/expenses', 'Expenses', '↘'], ['/expense-categories', 'Expense Categories', '#'], ['/banks', 'Banks', '⌂'], ['/bank-tx', 'Deposits & Withdrawals', '⇄'], ['/loans', 'Loans', '%'], ['/debtors', 'Debtors', '↙'], ['/creditors', 'Creditors', '↗'], ['/cash-book', 'Cash Book', '▭']], roles: ['admin', 'pharmacist'] },
  { group: 'Reports', items: [['/reports', 'Reports', '▥']], roles: ['admin', 'pharmacist'] },
  { group: 'System', items: [['/settings', 'Settings & Sync', '⚙']], roles: ['admin'] },
];

const SHORTCUTS = { F2: '/pos', F3: '/pos/wholesale', F4: '/add-stock', F6: '/sales', F7: '/inventory' };

function SyncBadge() {
  const { syncStatus, syncNow } = useStore();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const s = syncStatus.state;
  const label = s === 'off' ? (online ? 'Online · local only' : 'Offline · local only')
    : s === 'ok' ? 'Synced ' + new Date(syncStatus.lastSync).toLocaleTimeString()
    : s === 'syncing' ? 'Syncing…' : s === 'offline' ? 'Offline · will sync later' : 'Sync error';
  const tone = s === 'ok' ? 'ok' : s === 'error' ? 'danger' : s === 'offline' || !online ? 'warn' : 'idle';
  return (
    <button className={'sync-badge ' + tone} title={syncStatus.error || 'Click to sync now'} onClick={syncNow}>
      <i />{label}
    </button>
  );
}

function Shell() {
  const { db, products, user, setUser } = useStore();
  const navigate = useNavigate();
  const expiring = products.filter((p) => p.expiry && p.stock > 0 && daysUntil(p.expiry) <= (db.settings.expiryWarnDays || 90)).length;

  useEffect(() => {
    const onKey = (e) => { if (SHORTCUTS[e.key]) { e.preventDefault(); navigate(SHORTCUTS[e.key]); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">✚</span> PharmaPOS</div>
        <div className="store-name">{db.settings.name}</div>
        <nav>
          {NAV.filter((g) => !g.roles || g.roles.includes(user.role)).map((g, i) => (
            <div key={i} className="nav-group">
              {g.group && <div className="nav-title">{g.group}</div>}
              {g.items.map(([to, label, icon, key, count]) => (
                <NavLink key={to} to={to} end>
                  <span className="nav-icon">{icon}</span><span className="grow">{label}</span>
                  {count === 'expiry' && expiring > 0 && <span className="count">{expiring}</span>}
                  {key && <kbd>{key}</kbd>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <SyncBadge />
        <div className="user-box">
          <div><strong>{user.name}</strong><small>{user.role}</small></div>
          <button className="btn sm ghost" onClick={() => setUser(null)}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS mode="retail" />} />
          <Route path="/pos/wholesale" element={<POS mode="wholesale" key="w" />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/proformas" element={<Proformas />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/medicines" element={<MedicineList />} />
          <Route path="/formulations" element={<Formulations />} />
          <Route path="/inventory" element={<StockLevels />} />
          <Route path="/add-stock" element={<AddStock />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/expiry" element={<Expiry />} />
          <Route path="/quick-edit" element={<QuickEdit />} />
          <Route path="/stock-card" element={<StockCard />} />
          {user.role !== 'cashier' && (
            <>
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/expense-categories" element={<ExpenseCategories />} />
              <Route path="/banks" element={<Banks />} />
              <Route path="/bank-tx" element={<BankTx />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/debtors" element={<Debtors />} />
              <Route path="/creditors" element={<Creditors />} />
              <Route path="/cash-book" element={<CashBook />} />
              <Route path="/reports" element={<Reports />} />
            </>
          )}
          {user.role === 'admin' && <Route path="/settings" element={<Settings />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { user } = useStore();
  return <HashRouter>{user ? <Shell /> : <Auth />}</HashRouter>;
}
