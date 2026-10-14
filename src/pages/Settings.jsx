import { useEffect, useState } from 'react';
import { Store, Printer, MessageSquareText, Cloud, DatabaseBackup, CheckCircle2, XCircle, Smartphone, CreditCard, Plus, Trash2, RotateCcw, ShieldAlert, BellRing, MapPin, Search, Thermometer } from 'lucide-react';
import { useStore, uid, audit, downloadFile, today, defaultSettings, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { Tabs } from '../ui.jsx';
import { ask, toast } from '../feedback.jsx';
import { cloudConfig } from '../cloud.js';
import { searchPlaces, DEFAULT_PLACE, storageLimits } from '../weather.js';
import { isWeb, platformName } from '../platform.js';

export default function Settings() {
  const { db, update, saveSettings, user, syncCfg, syncStatus, syncNow, branchId, setBranchId, can, features } = useStore();
  const [tab, setTab] = useState('general');
  const [s, setS] = useState(db.settings);
  const [cfg, setCfg] = useState(null);
  const [placeQ, setPlaceQ] = useState('');
  const [places, setPlaces] = useState(null);

  useEffect(() => { if (syncCfg.url && syncCfg.key) cloudConfig(syncCfg).then(setCfg).catch((e) => setCfg({ error: e.message })); }, [syncCfg.url, syncCfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSettings = (e) => {
    e?.preventDefault();
    const num = (k, d = 0) => (s[k] === '' || s[k] == null ? d : Number(s[k]) || 0);
    saveSettings({ ...s, taxRate: num('taxRate'), decimals: num('decimals'), retailMarkup: num('retailMarkup', 50), wholesaleMarkup: num('wholesaleMarkup', 25),
      expiryWarnDays: num('expiryWarnDays', 90), paperWidth: num('paperWidth', 80), leadDays: num('leadDays', 7), coverDays: num('coverDays', 30), deadDays: num('deadDays', 90),
      idleMinutes: num('idleMinutes', 3), quietFrom: num('quietFrom', 21), quietTo: num('quietTo', 7) });
    update((d) => audit(d, user, 'Settings changed', tab, branchId));
    toast('Settings saved. Every device gets them at the next sync.');
  };

  const field = (k, label, type = 'text', extra = {}) => (
    <label className="field"><span>{label}</span><input type={type} step="any" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} {...extra} /></label>
  );
  const Status = ({ ok, children }) => <div className={'status-line ' + (ok ? 'ok' : 'off')}>{ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{children}</div>;
  const findPlace = async (e) => { e.preventDefault(); if (!placeQ.trim()) return; try { setPlaces(await searchPlaces(placeQ.trim())); } catch { toast('Could not search places. Check the internet.', 'error'); } };
  const lim = storageLimits(s);

  const tabs = [['general', 'Pharmacy'], ['payments', 'Payment methods'], ['receipts', 'Receipts & stock'], ['messages', 'Messages & recovery'], ['alerts', 'Alerts & storage'], ['online', 'Online & Mobile Money'], ['backup', 'Data & backup']];
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><div className="sub">{db.settings.name}</div></div></div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'general' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><Store size={18} />Pharmacy details</h3>
          <div className="form-grid">
            {field('name', 'Pharmacy name (shown on receipts)')}
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
            {db.branches.length > 1 && features.branches !== false && (
              <label className="field"><span>This device works as branch</span>
                <select value={branchId} onChange={(e) => { setBranchId(e.target.value); toast('Branch changed for this device'); }}>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </label>
            )}
          </div>
          <p className="muted small">Branches, features and administrator accounts are managed by your RxPOS provider.</p>
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
          <div className="form-actions"><button className="btn primary">Save</button></div>
        </form>
      )}

      {tab === 'alerts' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><BellRing size={18} />Idle promotions & reminders</h3>
          <div className="form-grid">
            {features.promos !== false && <label className="field"><span>Show product promotions after the app is idle for (minutes, 0 = never)</span><input type="number" min="0" step="0.5" value={s.idleMinutes ?? 3} onChange={(e) => setS({ ...s, idleMinutes: e.target.value })} /></label>}
            {features.hourly !== false && <>
              <label className="field check"><input type="checkbox" checked={s.hourlyChime !== false} onChange={(e) => setS({ ...s, hourlyChime: e.target.checked })} /><span>Hourly time reminder with today's to-dos</span></label>
              <label className="field check"><input type="checkbox" checked={s.hourlySound !== false} onChange={(e) => setS({ ...s, hourlySound: e.target.checked })} /><span>Play a soft chime</span></label>
              <label className="field"><span>Quiet from (hour, 0-23)</span><input type="number" min="0" max="23" value={s.quietFrom ?? 21} onChange={(e) => setS({ ...s, quietFrom: e.target.value })} /></label>
              <label className="field"><span>Quiet until (hour, 0-23)</span><input type="number" min="0" max="23" value={s.quietTo ?? 7} onChange={(e) => setS({ ...s, quietTo: e.target.value })} /></label>
            </>}
          </div>
          {'Notification' in window && (
            <p className="muted small">Desktop notifications when RxPOS is in the background: <strong>{Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked in this browser' : 'off'}</strong>
              {Notification.permission === 'default' && <> · <button type="button" className="link-btn" onClick={() => Notification.requestPermission().then(() => setS({ ...s }))}>Turn on</button></>}</p>
          )}
          {features.weather !== false && <>
            <h3 style={{ marginTop: 18 }}><MapPin size={18} />Weather location</h3>
            <p className="muted small">Currently: <strong>{(s.weatherPlace || DEFAULT_PLACE).name}</strong>. Weather from Open-Meteo (free, no account).</p>
            <div className="picker"><div className="row gap">
              <input placeholder="Search your town, e.g. Mbarara" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findPlace(e)} />
              <button type="button" className="btn ghost" onClick={findPlace}><Search size={16} />Find</button>
            </div>
            {places && <div className="picker-list">{places.map((p) => <button type="button" key={p.name + p.lat} onClick={() => { setS({ ...s, weatherPlace: p }); setPlaces(null); setPlaceQ(''); }}>{p.name}</button>)}{!places.length && <span className="muted small">No place found</span>}</div>}</div>
            <h3 style={{ marginTop: 18 }}><Thermometer size={18} />Storage limits</h3>
            <div className="form-grid">
              <label className="field"><span>Room: lowest (°C)</span><input type="number" value={s.roomMin ?? lim.roomMin} onChange={(e) => setS({ ...s, roomMin: e.target.value })} /></label>
              <label className="field"><span>Room: highest (°C)</span><input type="number" value={s.roomMax ?? lim.roomMax} onChange={(e) => setS({ ...s, roomMax: e.target.value })} /></label>
              <label className="field"><span>Fridge: lowest (°C)</span><input type="number" value={s.fridgeMin ?? lim.fridgeMin} onChange={(e) => setS({ ...s, fridgeMin: e.target.value })} /></label>
              <label className="field"><span>Fridge: highest (°C)</span><input type="number" value={s.fridgeMax ?? lim.fridgeMax} onChange={(e) => setS({ ...s, fridgeMax: e.target.value })} /></label>
              <label className="field"><span>Humidity: highest (%)</span><input type="number" value={s.humidityMax ?? lim.humidityMax} onChange={(e) => setS({ ...s, humidityMax: e.target.value })} /></label>
            </div>
          </>}
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
          <div className="card">
            <h3><Cloud size={18} />Online sync</h3>
            <p className="muted">RxPOS works offline on this device and syncs automatically: your changes go up within seconds, and other devices' changes come down every 10 seconds while the app is open.</p>
            <div className="sync-info">
              <span>Pharmacy: <strong>{syncCfg.pharmacy || db.settings.name}</strong>{syncCfg.slug && isWeb && <> · web address <strong>{location.origin}/{syncCfg.slug}</strong></>}</span>
              <span>Signed in as {syncCfg.account || user.email} · {platformName}</span>
              <span>Status: <strong className={syncStatus.state === 'error' ? 'text-danger' : syncStatus.state === 'ok' ? 'text-ok' : ''}>{syncStatus.state}</strong>{syncCfg.lastSync && <> · last sync {new Date(syncCfg.lastSync).toLocaleString()}</>}</span>
              {syncStatus.error && <span className="text-danger">{syncStatus.error}</span>}
            </div>
            <div className="form-actions"><button type="button" className="btn primary" onClick={syncNow}>Sync now</button></div>
          </div>
          <div className="card">
            <h3><Smartphone size={18} />Mobile Money & SMS</h3>
            {cfg?.error ? <p className="text-danger">{cfg.error}</p> : !cfg ? <p className="muted">Checking…</p> : (
              <div className="stack">
                <Status ok={cfg.mtn}>MTN MoMo {cfg.mtn ? `connected (${cfg.mtnEnv})` : '– not set up'}</Status>
                <Status ok={cfg.airtel}>Airtel Money {cfg.airtel ? `connected (${cfg.airtelEnv})` : '– not set up'}</Status>
                <Status ok={cfg.sms}>SMS (Africa’s Talking) {cfg.sms ? 'connected' : '– not set up'}</Status>
              </div>
            )}
            <p className="muted small">Merchant keys are added by your RxPOS provider. Until then, the POS can still record Mobile Money payments with the transaction ID, and reminders go out by WhatsApp.</p>
          </div>
        </>
      )}

      {tab === 'backup' && (
        <div className="card">
          <h3><DatabaseBackup size={18} />Backup</h3>
          <p className="muted">All data is kept on this device and in the RxPOS cloud. You can also download a copy to keep on a USB stick or Google Drive.</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => downloadFile(`rxpos-backup-${today()}.json`, JSON.stringify(db), 'application/json')}>Download a backup</button>
          </div>
          {can('data.reset') && (
            <div className="danger-zone">
              <h3><ShieldAlert size={18} />Restore default settings</h3>
              <div className="row between gap">
                <p className="muted small">Receipt, stock, message, alert and payment-method settings go back to factory defaults. Pharmacy name, address, phone, TIN and licence are kept. To erase or restore a pharmacy's data, contact your RxPOS provider.</p>
                <button type="button" className="btn ghost" onClick={async () => {
                  if (!(await ask({ title: 'Restore default settings?', message: 'All settings except your pharmacy details go back to factory defaults on every device.', confirmText: 'Restore defaults', danger: true }))) return;
                  const keep = Object.fromEntries(['name', 'address', 'phone', 'tin', 'license', 'currency', 'adminWhatsApp', 'weatherPlace'].map((k) => [k, db.settings[k]]));
                  const next = { ...defaultSettings(), ...keep };
                  saveSettings(next); setS(next);
                  update((d) => audit(d, user, 'Settings restored to defaults', '', branchId));
                  toast('Default settings restored');
                }}><RotateCcw size={16} />Restore defaults</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
