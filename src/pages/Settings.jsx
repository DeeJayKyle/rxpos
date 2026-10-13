import { useEffect, useState } from 'react';
import { Store, Printer, MessageSquareText, Cloud, Users as UsersIcon, DatabaseBackup, CheckCircle2, XCircle, Smartphone, SlidersHorizontal, CreditCard, Plus, Trash2, Eraser, RotateCcw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FEATURES } from '../access.js';
import { useStore, uid, audit, downloadFile, today, addSampleData, listSnapshots, loadSnapshot, defaultSettings, eraseData, DEFAULT_PAYMENT_METHODS, now } from '../store.jsx';
import { Tabs } from '../ui.jsx';
import { ask, askText, toast } from '../feedback.jsx';
import { cloudConfig, cloudLogin, cleanUrl, DEFAULT_CLOUD } from '../cloud.js';

export default function Settings() {
  const { db, update, setDb, saveSettings, user, syncCfg, saveSyncCfg, syncStatus, syncNow, branchId, setBranchId, can } = useStore();
  const licence = db.license?.[0]?.features || {};
  const [tab, setTab] = useState('general');
  const [s, setS] = useState(db.settings);
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


  const restore = async (data, label) => {
    if (!data?.products || !data.users || !data.movements) return toast('That is not a valid RxPOS backup', 'error');
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
      <Tabs value={tab} onChange={setTab} tabs={[['general', 'Pharmacy'], ['features', 'Features'], ['payments', 'Payment methods'], ['receipts', 'Receipts & stock'], ['messages', 'Messages & recovery'], ['online', 'Online & Mobile Money'], ['backup', 'Data & backup']]} />

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
          <h3 style={{ marginTop: 18 }}>Password recovery & client details</h3>
          <div className="form-grid">
            <label className="field"><span>Administrator's WhatsApp (staff who forget their password message this number)</span><input inputMode="tel" placeholder="07XX XXX XXX" value={s.adminWhatsApp || ''} onChange={(e) => setS({ ...s, adminWhatsApp: e.target.value })} /></label>
            <label className="field"><span>Client details at the POS</span>
              <select value={s.clientCapture || 'optional'} onChange={(e) => setS({ ...s, clientCapture: e.target.value })}>
                <option value="off">Off: walk-in sales only</option>
                <option value="optional">Optional: cashier may add/choose a client</option>
                <option value="required">Required: every sale needs a client</option>
              </select></label>
          </div>
          <p className="muted small">Staff can also reset their password themselves with a code sent to their email (Gmail works) or phone, once email/SMS sending is switched on in the cloud.</p>
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'features' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><SlidersHorizontal size={18} />Features</h3>
          <p className="muted small">Switch off parts of RxPOS this pharmacy doesn't use. They disappear from every device's menu. Features greyed out are not included in this pharmacy's RxPOS plan.</p>
          <div className="perm-grid">
            {FEATURES.map(([k, label, hint]) => {
              const allowed = licence[k] !== false;
              return (
                <label key={k} className={'field check' + (allowed ? '' : ' dim')} title={allowed ? '' : 'Not included in this pharmacy\'s plan'}>
                  <input type="checkbox" disabled={!allowed} checked={allowed && s.features?.[k] !== false} onChange={(e) => setS({ ...s, features: { ...(s.features || {}), [k]: e.target.checked } })} />
                  <span>{label}{hint && <small className="muted"> · {hint}</small>}</span>
                </label>
              );
            })}
          </div>
          {s.features?.branches === false && db.branches.length > 1 && <p className="text-warn small">Single-branch mode hides the other branches; their data is kept.</p>}
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'payments' && (() => {
        const methods = s.paymentMethods?.length ? s.paymentMethods : DEFAULT_PAYMENT_METHODS;
        const setMethods = (m) => setS({ ...s, paymentMethods: m });
        return (
          <form className="card" onSubmit={submitSettings}>
            <h3><CreditCard size={18} />Payment methods at the POS</h3>
            <p className="muted small">Add or remove ways customers can pay. The type decides how RxPOS treats it: <b>Cash</b> asks for the amount tendered and gives change; <b>Mobile Money</b> can send a payment request to the customer's phone; <b>Credit</b> puts the balance on the customer's account; <b>Other</b> just records it.</p>
            <table className="lines">
              <thead><tr><th>Name shown on the POS & receipt</th><th>Type</th><th /></tr></thead>
              <tbody>
                {methods.map((m, i) => (
                  <tr key={m.id}>
                    <td><input value={m.name} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} required /></td>
                    <td><select value={m.type} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      <option value="cash">Cash</option><option value="momo">Mobile Money</option><option value="credit">Credit (pay later)</option><option value="other">Other (card, bank, insurance…)</option>
                    </select></td>
                    <td><button type="button" className="icon-btn" title="Delete" disabled={methods.length <= 1} onClick={() => setMethods(methods.filter((_, j) => j !== i))}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row gap" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm ghost" onClick={() => setMethods([...methods, { id: uid(), name: '', type: 'other' }])}><Plus size={14} />Add payment method</button>
              <button type="button" className="btn sm ghost" onClick={() => setMethods(DEFAULT_PAYMENT_METHODS)}><RotateCcw size={14} />Defaults</button>
            </div>
            <div className="form-actions"><button className="btn primary">Save</button></div>
          </form>
        );
      })()}

      {tab === 'online' && (
        <>
          <form className="card" onSubmit={connect}>
            <h3><Cloud size={18} />Online sync</h3>
            <p className="muted">
              RxPOS always works offline on this device. Connected devices share stock, sales and customers across all branches, every 30 seconds
              whenever there is internet; sales made offline are sent when it returns.
            </p>
            <div className="sync-info">
              <span>Status: <strong className={syncStatus.state === 'error' ? 'text-danger' : syncStatus.state === 'ok' ? 'text-ok' : ''}>{syncCfg.url ? syncStatus.state : 'not connected'}</strong>{syncCfg.account && <> · signed in as {syncCfg.account}</>}</span>
              {syncCfg.lastSync && <span>Last sync: {new Date(syncCfg.lastSync).toLocaleString()}</span>}
              {syncStatus.error && <span className="text-danger">{syncStatus.error}</span>}
            </div>
            <Tabs value={hub.how} onChange={(how) => setHub({ ...hub, how })} tabs={[['account', 'With my RxPOS account'], ['key', 'With the sync key (admin)']]} />
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
          {can('data.reset') && (
            <div className="danger-zone">
              <h3><ShieldAlert size={18} />Danger zone</h3>
              <div className="row between gap">
                <div><strong>Restore default settings</strong><p className="muted small">Receipt, stock, message, payment-method and feature settings go back to factory defaults. Pharmacy name, address, phone, TIN and licence are kept.</p></div>
                <button type="button" className="btn ghost" onClick={async () => {
                  if (!(await ask({ title: 'Restore default settings?', message: 'All settings except your pharmacy details go back to factory defaults on every device.', confirmText: 'Restore defaults', danger: true }))) return;
                  const keep = Object.fromEntries(['name', 'address', 'phone', 'tin', 'license', 'currency', 'adminWhatsApp'].map((k) => [k, db.settings[k]]));
                  const next = { ...defaultSettings(), ...keep };
                  saveSettings(next); setS(next);
                  update((d) => audit(d, user, 'Settings restored to defaults', '', branchId));
                  toast('Default settings restored');
                }}><RotateCcw size={16} />Restore defaults</button>
              </div>
              <div className="row between gap">
                <div><strong>Erase all data</strong><p className="muted small">Deletes sales, stock, batches, customers, suppliers, finance records, prescriptions, messages, shifts and other users on <b>every connected device</b>. Your own account and roles are kept. Export a backup first.</p></div>
                <button type="button" className="btn danger-solid" onClick={async () => {
                  const keepMedicines = await ask({ title: 'Keep the medicine list?', message: 'Choose “Keep medicines” to erase everything except your medicines and prices (stock becomes zero). Choose “Cancel” to stop.', confirmText: 'Keep medicines' });
                  if (!keepMedicines) return;
                  const typed = await askText({ title: 'Type ERASE to confirm', message: 'This cannot be undone (except from a backup or snapshot).', confirmText: 'Erase all data' });
                  if (typed?.trim().toUpperCase() !== 'ERASE') return typed && toast('Nothing was erased', 'info');
                  downloadFile(`rxpos-before-erase-${today()}.json`, JSON.stringify(db), 'application/json');
                  let n = 0;
                  update((d) => { n = eraseData(d, { keepMedicines: true, keepUserId: user.id }); audit(d, user, 'All data erased', `kept medicines; ${n} records removed`, branchId); });
                  setTimeout(syncNow, 500);
                  toast('All data erased. A backup file was downloaded first.');
                }}><Eraser size={16} />Erase all data</button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
