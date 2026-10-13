import { useEffect, useState } from 'react';
import { Store, Printer, MessageSquareText, Cloud, Users as UsersIcon, DatabaseBackup, CheckCircle2, XCircle, Smartphone, UserPlus } from 'lucide-react';
import { useStore, makePassword, uid, put, audit, downloadFile, today, addSampleData, listSnapshots, loadSnapshot } from '../store.jsx';
import { Modal, Tabs } from '../ui.jsx';
import { ask, askText, toast } from '../feedback.jsx';
import { cloudConfig, cloudLogin, cleanUrl, DEFAULT_CLOUD } from '../cloud.js';

export default function Settings() {
  const { db, update, setDb, saveSettings, user, syncCfg, saveSyncCfg, syncStatus, syncNow, branchId, setBranchId } = useStore();
  const [tab, setTab] = useState('general');
  const [s, setS] = useState(db.settings);
  const [newUser, setNewUser] = useState(null);
  const [hub, setHub] = useState({ url: syncCfg.url || DEFAULT_CLOUD, key: syncCfg.account ? '' : syncCfg.key, email: '', password: '', how: syncCfg.account ? 'account' : 'key' });
  const [cfg, setCfg] = useState(null);
  const [snaps, setSnaps] = useState(null);

  useEffect(() => { listSnapshots().then(setSnaps).catch(() => setSnaps([])); }, []);
  useEffect(() => { if (syncCfg.url && syncCfg.key) cloudConfig(syncCfg).then(setCfg).catch((e) => setCfg({ error: e.message })); }, [syncCfg.url, syncCfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSettings = (e) => {
    e?.preventDefault();
    const num = (k, d = 0) => (s[k] === '' || s[k] == null ? d : Number(s[k]) || 0);
    saveSettings({ ...s, taxRate: num('taxRate'), decimals: num('decimals'), retailMarkup: num('retailMarkup', 50), wholesaleMarkup: num('wholesaleMarkup', 25),
      expiryWarnDays: num('expiryWarnDays', 90), paperWidth: num('paperWidth', 80), leadDays: num('leadDays', 7), coverDays: num('coverDays', 30), deadDays: num('deadDays', 90) });
    update((d) => audit(d, user, 'Settings changed', tab, branchId));
    toast('Settings saved');
  };

  const addUser = async (e) => {
    e.preventDefault();
    const email = newUser.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) return toast('A user with that email already exists', 'error');
    if (newUser.password.length < 8) return toast('Use a password of at least 8 characters', 'error');
    const pw = await makePassword(newUser.password);
    update((d) => {
      put(d, 'users', { id: uid(), name: newUser.name, email, role: newUser.role, phone: newUser.phone, ...pw });
      audit(d, user, 'User added', `${newUser.name} (${newUser.role})`, branchId);
    });
    setNewUser(null);
    toast(`${newUser.name} can now sign in${syncCfg.url ? ' on any device' : ''}`);
  };

  const resetPassword = async (u) => {
    const pw = await askText({ title: `New password for ${u.name}`, type: 'password', minLength: 8, confirmText: 'Set password' });
    if (!pw) return;
    const fields = await makePassword(pw);
    update((d) => { put(d, 'users', { ...u, ...fields }); audit(d, user, 'Password reset', u.name, branchId); });
    toast('Password updated');
  };

  const restore = async (data, label) => {
    if (!data?.products || !data.users || !data.movements) return toast('That is not a valid PharmaPOS backup', 'error');
    if (!(await ask({ title: 'Replace all data on this device?', message: `Everything on this device will be replaced with ${label}. Export a backup first if unsure.`, confirmText: 'Restore', danger: true }))) return;
    setDb({ ...data, _tomb: data._tomb || [] });
    toast('Data restored');
  };
  const importBackup = (file) => {
    const r = new FileReader();
    r.onload = () => { let data = null; try { data = JSON.parse(r.result); } catch {} restore(data, `the backup “${file.name}”`); };
    r.readAsText(file);
  };

  const connect = async (e) => {
    e.preventDefault();
    const url = cleanUrl(hub.url);
    const changed = url !== syncCfg.url;
    try {
      let key = hub.key.trim(), account = '';
      if (hub.how === 'account') {
        const res = await cloudLogin(url, hub.email.trim().toLowerCase(), hub.password);
        key = res.token; account = res.user.email;
      }
      saveSyncCfg({ ...syncCfg, url, key, account, ...(changed ? { cursor: 0, pushedAt: '' } : {}) });
      setHub((h) => ({ ...h, password: '' }));
      setTimeout(syncNow, 300);
      toast('Connected. Syncing now');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const field = (k, label, type = 'text', extra = {}) => (
    <label className="field"><span>{label}</span><input type={type} step="any" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} {...extra} /></label>
  );
  const Status = ({ ok, children }) => <div className={'status-line ' + (ok ? 'ok' : 'off')}>{ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{children}</div>;

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><div className="sub">{db.settings.name}</div></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['general', 'Pharmacy'], ['receipts', 'Receipts & stock'], ['messages', 'Messages'], ['online', 'Online & payments'], ['users', 'Users'], ['backup', 'Backup']]} />

      {tab === 'general' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><Store size={18} />Pharmacy details</h3>
          <div className="form-grid">
            {field('name', 'Pharmacy name')}
            {field('phone', 'Phone')}
            {field('address', 'Address')}
            {field('license', 'NDA licence / registration no.')}
            {field('tin', 'TIN')}
            {field('currency', 'Currency (e.g. UGX, KES, $)')}
            {field('decimals', 'Decimal places', 'number')}
            {field('taxRate', 'Tax / VAT rate (%)', 'number')}
            {field('retailMarkup', 'Default retail markup (%)', 'number')}
            {field('wholesaleMarkup', 'Default wholesale markup (%)', 'number')}
            <label className="field"><span>Non-cash sales go to</span>
              <select value={s.nonCashBankId || 'cash-drawer'} onChange={(e) => setS({ ...s, nonCashBankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
            <label className="field"><span>This device works as branch</span>
              <select value={branchId} onChange={(e) => { setBranchId(e.target.value); toast('Branch changed for this device'); }}>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
          </div>
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'receipts' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><Printer size={18} />Receipts, expiry & reordering</h3>
          <div className="form-grid">
            <label className="field"><span>Receipt printer paper</span>
              <select value={s.paperWidth || 80} onChange={(e) => setS({ ...s, paperWidth: Number(e.target.value) })}><option value={80}>80 mm thermal</option><option value={58}>58 mm thermal</option><option value={210}>A4 / normal printer</option></select>
            </label>
            <label className="field check"><input type="checkbox" checked={!!s.autoPrint} onChange={(e) => setS({ ...s, autoPrint: e.target.checked })} /><span>Print the receipt automatically after each sale</span></label>
            {field('receiptFooter', 'Receipt footer message')}
            {field('expiryWarnDays', 'Warn about expiry (days before)', 'number')}
            {field('leadDays', 'Supplier lead time (days)', 'number')}
            {field('coverDays', 'Reorder enough stock for (days)', 'number')}
            {field('deadDays', 'Dead stock after no sales for (days)', 'number')}
          </div>
          <p className="muted small">Tip: in the print dialog choose your thermal printer, set margins to “None” and scale to 100%. For silent printing on the desktop app, set the thermal printer as the Windows default printer.</p>
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'messages' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><MessageSquareText size={18} />Reminder messages (WhatsApp & SMS)</h3>
          <p className="muted small">Placeholders: {'{name} {pharmacy} {medicine} {date} {amount}'}. Keep SMS under 160 characters to pay for one message.</p>
          <label className="field full"><span>Refill reminder</span><textarea rows={3} value={s.smsRefill || ''} onChange={(e) => setS({ ...s, smsRefill: e.target.value })} /><small className="muted">{(s.smsRefill || '').length} characters</small></label>
          <label className="field full"><span>Payment reminder</span><textarea rows={3} value={s.smsDebt || ''} onChange={(e) => setS({ ...s, smsDebt: e.target.value })} /><small className="muted">{(s.smsDebt || '').length} characters</small></label>
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'online' && (
        <>
          <form className="card" onSubmit={connect}>
            <h3><Cloud size={18} />Online sync</h3>
            <p className="muted">
              PharmaPOS always works offline on this device. Connected devices share stock, sales and customers across all branches, every 30 seconds
              whenever there is internet; sales made offline are sent when it returns.
            </p>
            <div className="sync-info">
              <span>Status: <strong className={syncStatus.state === 'error' ? 'text-danger' : syncStatus.state === 'ok' ? 'text-ok' : ''}>{syncCfg.url ? syncStatus.state : 'not connected'}</strong>{syncCfg.account && <> · signed in as {syncCfg.account}</>}</span>
              {syncCfg.lastSync && <span>Last sync: {new Date(syncCfg.lastSync).toLocaleString()}</span>}
              {syncStatus.error && <span className="text-danger">{syncStatus.error}</span>}
            </div>
            <Tabs value={hub.how} onChange={(how) => setHub({ ...hub, how })} tabs={[['account', 'With my PharmaPOS account'], ['key', 'With the sync key (admin)']]} />
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="field"><span>Cloud address</span><input value={hub.url} onChange={(e) => setHub({ ...hub, url: e.target.value })} required /></label>
              {hub.how === 'account' ? (
                <>
                  <label className="field"><span>Email</span><input type="email" value={hub.email} onChange={(e) => setHub({ ...hub, email: e.target.value })} required /></label>
                  <label className="field"><span>Password</span><input type="password" value={hub.password} onChange={(e) => setHub({ ...hub, password: e.target.value })} required /></label>
                </>
              ) : <label className="field"><span>Sync key</span><input type="password" value={hub.key} onChange={(e) => setHub({ ...hub, key: e.target.value })} required /></label>}
            </div>
            <p className="muted small">Use the sync key on the first (owner) device so your staff accounts reach the cloud. After that, staff connect with their own email and password.</p>
            <div className="form-actions">
              {syncCfg.url && <button type="button" className="btn ghost" onClick={() => { saveSyncCfg({ ...syncCfg, url: '', key: '', account: '' }); toast('Disconnected'); }}>Disconnect</button>}
              {syncCfg.url && <button type="button" className="btn ghost" onClick={syncNow}>Sync now</button>}
              <button className="btn primary">{syncCfg.url ? 'Reconnect' : 'Connect'}</button>
            </div>
          </form>
          <div className="card">
            <h3><Smartphone size={18} />Mobile Money & SMS</h3>
            {!syncCfg.url ? <p className="muted">Connect to the cloud first.</p> : cfg?.error ? <p className="text-danger">{cfg.error}</p> : !cfg ? <p className="muted">Checking…</p> : (
              <div className="stack">
                <Status ok={cfg.mtn}>MTN MoMo {cfg.mtn ? `connected (${cfg.mtnEnv})` : '– not set up'}</Status>
                <Status ok={cfg.airtel}>Airtel Money {cfg.airtel ? `connected (${cfg.airtelEnv})` : '– not set up'}</Status>
                <Status ok={cfg.sms}>SMS (Africa’s Talking) {cfg.sms ? 'connected' : '– not set up'}</Status>
              </div>
            )}
            <p className="muted small">These are switched on by adding your merchant API keys to the cloud (Cloudflare → Workers → pharmapos → Settings → Variables and Secrets). The README lists the exact names. Until then, POS can still record Mobile Money payments with the transaction ID, and reminders go out by WhatsApp.</p>
          </div>
        </>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="row between"><h3><UsersIcon size={18} />Users</h3><button className="btn sm primary" onClick={() => setNewUser({ name: '', email: '', phone: '', role: 'cashier', password: '' })}><UserPlus size={14} />Add user</button></div>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'dim' : ''}>
                  <td><strong>{u.name}</strong>{u.algo !== 'pbkdf2' && <span className="badge warn" title="Signs in with an old password format; it upgrades at next sign-in">old password</span>}</td><td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={u.id === user.id} onChange={(e) => update((d) => { put(d, 'users', { ...u, role: e.target.value }); audit(d, user, 'Role changed', `${u.name}: ${u.role} → ${e.target.value}`, branchId); })}>
                      <option value="admin">admin</option><option value="pharmacist">pharmacist</option><option value="cashier">cashier</option>
                    </select>
                  </td>
                  <td>{u.disabled ? 'Disabled' : 'Active'}</td>
                  <td className="actions">
                    <button className="btn sm ghost" onClick={() => resetPassword(u)}>Reset password</button>
                    {u.id !== user.id && <button className="btn sm danger" onClick={() => update((d) => { put(d, 'users', { ...u, disabled: !u.disabled }); audit(d, user, u.disabled ? 'User enabled' : 'User disabled', u.name, branchId); })}>{u.disabled ? 'Enable' : 'Disable'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small"><b>admin</b> – everything, including users, settings and branches; <b>pharmacist</b> – everything except settings; <b>cashier</b> – selling, stock and customers (no finance, reports, refunds or stock adjustments). Every user signs in with their own account on any connected device, and their actions are recorded in the Audit Log.</p>
        </div>
      )}

      {tab === 'backup' && (
        <div className="card">
          <h3><DatabaseBackup size={18} />Backup & restore</h3>
          <p className="muted">All data is stored on this device{syncCfg.url ? ' and in the cloud' : ''}. Export a backup regularly to a USB stick or Google Drive.</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => downloadFile(`pharmapos-backup-${today()}.json`, JSON.stringify(db), 'application/json')}>Export backup</button>
            <label className="btn ghost">Import backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files[0] && importBackup(e.target.files[0])} /></label>
            <button className="btn ghost" onClick={async () => (await ask({ title: 'Add 10 sample medicines?', confirmText: 'Add' })) && (update((d) => addSampleData(d, user.name, branchId)), toast('Sample medicines added'))}>Add sample medicines</button>
          </div>
          <h3 style={{ marginTop: 20 }}>Automatic daily snapshots</h3>
          <p className="muted small">A copy of all data from each of the last 7 days is kept on this device. Restore one to undo a mistake.</p>
          <div className="row gap">
            {snaps?.map((d) => <button key={d} className="btn sm ghost" onClick={async () => restore(await loadSnapshot(d), `the snapshot from ${d}`)}>{new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</button>)}
            {snaps && !snaps.length && <span className="muted small">The first snapshot is taken a few seconds after you start working today.</span>}
          </div>
        </div>
      )}

      {newUser && (
        <Modal title="Add user" onClose={() => setNewUser(null)}>
          <form onSubmit={addUser}>
            <div className="form-grid">
              <label className="field"><span>Name</span><input required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
              <label className="field"><span>Email (used to sign in)</span><input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
              <label className="field"><span>Phone</span><input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} /></label>
              <label className="field"><span>Role</span>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="cashier">cashier</option><option value="pharmacist">pharmacist</option><option value="admin">admin</option>
                </select>
              </label>
              <label className="field"><span>Password (8+ characters)</span><input type="password" autoComplete="new-password" required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setNewUser(null)}>Cancel</button><button className="btn primary">Add user</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
