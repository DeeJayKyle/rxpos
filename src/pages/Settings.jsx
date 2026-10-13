import { useEffect, useState } from 'react';
import { useStore, hashPassword, uid, put, downloadFile, today, addSampleData, listSnapshots, loadSnapshot } from '../store.jsx';
import { Modal } from '../ui.jsx';
import { ask, askText, toast } from '../feedback.jsx';

export default function Settings() {
  const { db, update, setDb, saveSettings, user, syncCfg, saveSyncCfg, syncStatus, syncNow } = useStore();
  const [s, setS] = useState(db.settings);
  const [saved, setSaved] = useState(false);
  const [newUser, setNewUser] = useState(null);
  const [hub, setHub] = useState({ url: syncCfg.url, key: syncCfg.key });

  const submitSettings = (e) => {
    e.preventDefault();
    const num = (k) => Number(s[k]) || 0;
    saveSettings({ ...s, taxRate: num('taxRate'), decimals: num('decimals'), retailMarkup: num('retailMarkup'), wholesaleMarkup: num('wholesaleMarkup'), expiryWarnDays: num('expiryWarnDays') || 90 });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast('Settings saved');
  };

  const addUser = async (e) => {
    e.preventDefault();
    const email = newUser.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) return toast('A user with that email already exists', 'error');
    if (newUser.password.length < 6) return toast('Password must be at least 6 characters', 'error');
    const hash = await hashPassword(newUser.password);
    update((d) => { put(d, 'users', { id: uid(), name: newUser.name, email, role: newUser.role, hash }); });
    setNewUser(null);
    toast(`${newUser.name} can now sign in`);
  };

  const resetPassword = async (u) => {
    const pw = await askText({ title: `New password for ${u.name}`, type: 'password', minLength: 6, confirmText: 'Set password' });
    if (!pw) return;
    const hash = await hashPassword(pw);
    update((d) => { put(d, 'users', { ...u, hash }); });
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
    r.onload = () => {
      let data = null;
      try { data = JSON.parse(r.result); } catch {}
      restore(data, `the backup “${file.name}”`);
    };
    r.readAsText(file);
  };

  const [snaps, setSnaps] = useState(null);
  useEffect(() => { listSnapshots().then(setSnaps).catch(() => setSnaps([])); }, []);

  const connectHub = (e) => {
    e.preventDefault();
    let url = hub.url.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//.test(url)) url = 'http://' + url;
    const changed = url !== syncCfg.url;
    // A new hub starts from scratch: push everything, pull everything
    saveSyncCfg({ ...syncCfg, url, key: hub.key.trim(), ...(changed ? { cursor: 0, pushedAt: '' } : {}) });
    setTimeout(syncNow, 300);
  };

  const field = (k, label, type = 'text') => (
    <label className="field"><span>{label}</span><input type={type} step="any" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>
  );

  return (
    <div className="page">
      <h1>Settings</h1>
      <form className="card" onSubmit={submitSettings}>
        <h3>Pharmacy details</h3>
        <div className="form-grid">
          {field('name', 'Pharmacy name')}
          {field('phone', 'Phone')}
          {field('address', 'Address')}
          {field('license', 'License / registration no.')}
          {field('tin', 'TIN')}
          {field('currency', 'Currency (e.g. UGX, KES, $)')}
          {field('decimals', 'Decimal places', 'number')}
          {field('taxRate', 'Tax / VAT rate (%)', 'number')}
          {field('retailMarkup', 'Default retail markup (%)', 'number')}
          {field('wholesaleMarkup', 'Default wholesale markup (%)', 'number')}
          {field('expiryWarnDays', 'Warn about expiry (days before)', 'number')}
          <label className="field"><span>Non-cash sales go to</span>
            <select value={s.nonCashBankId || 'cash-drawer'} onChange={(e) => setS({ ...s, nonCashBankId: e.target.value })}>
              {db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {field('receiptFooter', 'Receipt footer')}
        </div>
        <div className="form-actions">{saved && <span className="text-ok">Saved ✓</span>}<button className="btn primary">Save settings</button></div>
      </form>

      <form className="card" onSubmit={connectHub}>
        <h3>Online sync</h3>
        <p className="muted">
          PharmaPOS always works offline on this device. Link every PC, phone and browser to the same hub to share stock, sales and
          customers across branches. Changes sync every 30 seconds whenever there is a connection; sales made offline are sent when it returns.
          {location.protocol === 'https:' && !location.hostname.includes('localhost') && <> This web app's own address works as the hub: <code>{location.origin}</code></>}
        </p>
        <div className="form-grid">
          <label className="field"><span>Hub address</span><input placeholder="https://pharmapos.yourname.workers.dev" value={hub.url} onChange={(e) => setHub({ ...hub, url: e.target.value })} /></label>
          <label className="field"><span>Sync key</span><input type="password" value={hub.key} onChange={(e) => setHub({ ...hub, key: e.target.value })} /></label>
        </div>
        <div className="sync-info">
          <span>Status: <strong className={syncStatus.state === 'error' ? 'text-danger' : syncStatus.state === 'ok' ? 'text-ok' : ''}>{syncStatus.state}</strong></span>
          {syncCfg.lastSync && <span>Last sync: {new Date(syncCfg.lastSync).toLocaleString()}</span>}
          {syncStatus.error && <span className="text-danger">{syncStatus.error}</span>}
          <span className="muted">Device ID: {syncCfg.deviceId}</span>
        </div>
        <div className="form-actions">
          {syncCfg.url && <button type="button" className="btn ghost" onClick={() => { saveSyncCfg({ ...syncCfg, url: '', key: '' }); setHub({ url: '', key: '' }); }}>Unlink</button>}
          {syncCfg.url && <button type="button" className="btn ghost" onClick={syncNow}>Sync now</button>}
          <button className="btn primary">{syncCfg.url ? 'Save' : 'Link to hub'}</button>
        </div>
      </form>

      <div className="card">
        <div className="row between"><h3>Users</h3><button className="btn sm primary" onClick={() => setNewUser({ name: '', email: '', role: 'cashier', password: '' })}>+ Add user</button></div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id} className={u.disabled ? 'dim' : ''}>
                <td>{u.name}</td><td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === user.id} onChange={(e) => update((d) => { put(d, 'users', { ...u, role: e.target.value }); })}>
                    <option value="admin">admin</option><option value="pharmacist">pharmacist</option><option value="cashier">cashier</option>
                  </select>
                </td>
                <td>{u.disabled ? 'Disabled' : 'Active'}</td>
                <td className="actions">
                  <button className="btn sm ghost" onClick={() => resetPassword(u)}>Reset password</button>
                  {u.id !== user.id && <button className="btn sm danger" onClick={() => update((d) => { put(d, 'users', { ...u, disabled: !u.disabled }); })}>{u.disabled ? 'Enable' : 'Disable'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Roles: <b>admin</b> – everything; <b>pharmacist</b> – everything except settings; <b>cashier</b> – sales, inventory and customers (no finance, reports, refunds or stock adjustments).</p>
      </div>

      <div className="card">
        <h3>Backup & restore</h3>
        <p className="muted">All data is stored on this device{syncCfg.url ? ' and on your hub' : ''}. Export a backup regularly.</p>
        <div className="row gap">
          <button className="btn primary" onClick={() => downloadFile(`pharmapos-backup-${today()}.json`, JSON.stringify(db), 'application/json')}>Export backup</button>
          <label className="btn ghost">Import backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files[0] && importBackup(e.target.files[0])} /></label>
          <button className="btn ghost" onClick={async () => (await ask({ title: 'Add 10 sample medicines?', confirmText: 'Add' })) && (update((d) => addSampleData(d, user.name)), toast('Sample medicines added'))}>Add sample medicines</button>
        </div>
        <h3 style={{ marginTop: 20 }}>Automatic daily snapshots</h3>
        <p className="muted small">PharmaPOS keeps a copy of all data from each of the last 7 days on this device. Restore one to undo a mistake.</p>
        <div className="row gap">
          {snaps?.map((d) => (
            <button key={d} className="btn sm ghost" onClick={async () => restore(await loadSnapshot(d), `the snapshot from ${d}`)}>{new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</button>
          ))}
          {snaps && !snaps.length && <span className="muted small">The first snapshot is taken a few seconds after you start working today.</span>}
        </div>
      </div>

      {newUser && (
        <Modal title="Add user" onClose={() => setNewUser(null)}>
          <form onSubmit={addUser}>
            <div className="form-grid">
              <label className="field"><span>Name</span><input required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
              <label className="field"><span>Email</span><input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
              <label className="field"><span>Role</span>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="cashier">cashier</option><option value="pharmacist">pharmacist</option><option value="admin">admin</option>
                </select>
              </label>
              <label className="field"><span>Password</span><input type="password" required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setNewUser(null)}>Cancel</button><button className="btn primary">Add user</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
