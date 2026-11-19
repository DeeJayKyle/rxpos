import { useEffect, useState, useRef } from 'react';
import { Store, Printer, MessageSquareText, Cloud, DatabaseBackup, Sheet, Copy, CheckCircle2, XCircle, Smartphone, CreditCard, Plus, Trash2, RotateCcw, BellRing, MapPin, Search, Thermometer, RefreshCw } from 'lucide-react';
import { useStore, useSyncState, uid, audit, downloadFile, today, defaultSettings, DEFAULT_PAYMENT_METHODS } from '../store.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Printer as PrinterIcon, ScanBarcode, Repeat, Clock, MonitorSmartphone, UserCog } from 'lucide-react';
import { SettingsSearch, SettingsGroup, SettingsRow, ToggleRow, DangerZone, useFindSetting } from '../components/SettingsKit.jsx';
import { ask, toast } from '../feedback.jsx';
import { Help, HELP, smallPicture } from '../forms.jsx';
import { pharmacyLogo } from '../logo.jsx';
import { uploadAttachment } from '../attach.jsx';
import { cloudConfig, daySummary, dailyStockLink } from '../cloud.js';
import { searchPlaces, DEFAULT_PLACE, storageLimits } from '../weather.js';
import { isWeb, platformName } from '../platform.js';
import { pharmacyDefaults, validatePharmacyDefaults } from '../pharmacy-settings.js';
import { Updates } from './Device.jsx';
import ReportEmails from './ReportEmails.jsx';
import { showDateTime } from '../showdate.js';

export default function Settings() {
  const { syncStatus } = useSyncState();
  const { db, update, saveSettings, user, syncCfg, syncNow, branchId, setBranchId, can, features, sharedSettings, pharmacyOverrides, resetPharmacyOverrides } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = () => typeof innerWidth === 'number' && innerWidth >= 900;
  // phones open on the list of settings; a PC shows the list beside the first section
  const [tab, setTabRaw] = useState(() => location.state?.tab || (wide() ? 'general' : null));
  const setTab = (t) => { setTabRaw(t); if (!wide()) scrollTo(0, 0); };
  useEffect(() => { if (location.state?.tab) setTabRaw(location.state.tab === 'danger' ? (wide() ? 'general' : null) : location.state.tab); }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useFindSetting(true);
  const [s, setS] = useState(db.settings);
  const settingsBaseline = useRef(db.settings);
  useEffect(() => {
    const old = settingsBaseline.current;
    setS((draft) => ({ ...db.settings, ...Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(old[k]))) }));
    settingsBaseline.current = db.settings;
  }, [db.settings]);
  const [cfg, setCfg] = useState(null);
  const [placeQ, setPlaceQ] = useState('');
  const [places, setPlaces] = useState(null);

  useEffect(() => { if (syncCfg.url && syncCfg.key) cloudConfig(syncCfg).then(setCfg).catch((e) => setCfg({ error: e.message })); }, [syncCfg.url, syncCfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSettings = async (e) => {
    e?.preventDefault();
    const num = (k, d = 0) => (s[k] === '' || s[k] == null ? d : Number(s[k]) || 0);
    const next = { ...s, taxRate: num('taxRate'), decimals: num('decimals'), retailMarkup: num('retailMarkup', 50), wholesaleMarkup: num('wholesaleMarkup', 25), priceRound: num('priceRound'), minMargin: num('minMargin', 20),
      expiryWarnDays: num('expiryWarnDays', 90), paperWidth: num('paperWidth', 80), leadDays: num('leadDays', 7), coverDays: num('coverDays', 30), deadDays: num('deadDays', 90),
      idleMinutes: num('idleMinutes', 3), quietFrom: num('quietFrom', 21), quietTo: num('quietTo', 7) };
    try {
      await saveSettings(tab === 'general' ? { ...db.settings, ...validatePharmacyDefaults(next) } : next);
      if (tab !== 'general') await update((d) => audit(d, user, 'Settings changed', tab, branchId));
      toast(tab === 'general' ? 'Saved on this device only.' : 'Settings saved. Shared preferences sync to other devices.');
    } catch (e) { toast(e.message, 'error'); }
  };

  // D3: a (?) beside the tricky ones, with one sentence on what it does
  const HELP_OF = { taxRate: HELP.tax, wholesaleMarkup: HELP.wholesale, retailMarkup: HELP.markup, expiryWarnDays: HELP.expiryWarn };
  const field = (k, label, type = 'text', extra = {}) => (
    <label className="field"><span>{label}{HELP_OF[k] && <Help text={HELP_OF[k]} />}</span><input type={type} step="any" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} {...extra} /></label>
  );
  const Status = ({ ok, children }) => <div className={'status-line ' + (ok ? 'ok' : 'off')}>{ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{children}</div>;
  const findPlace = async (e) => { e.preventDefault(); if (!placeQ.trim()) return; try { setPlaces(await searchPlaces(placeQ.trim())); } catch { toast('Could not search places. Check the internet.', 'error'); } };
  const lim = storageLimits(s);

  // a quick switch saves at once, for every device (like Save on its section)
  const quick = async (k, v) => {
    try {
      await saveSettings({ ...db.settings, [k]: v }); setS((x) => ({ ...x, [k]: v }));
      await update((d) => audit(d, user, 'Settings changed', `${k}: ${v ? 'on' : 'off'}`, branchId));
    } catch (e) { toast(e.message, 'error'); }
  };
  const restoreDefaults = async () => {
    const keep = Object.fromEntries([...Object.keys(pharmacyDefaults()), 'adminWhatsApp', 'weatherPlace'].map((k) => [k, db.settings[k]]));
    const next = { ...defaultSettings(), ...keep };
    await saveSettings(next); setS(next);
    await update((d) => audit(d, user, 'Settings restored to defaults', '', branchId));
    toast('Default settings restored');
  };
  const groups = [
    ['Pharmacy', [['general', 'Pharmacy', 'Name, contacts, tax and markups', Store], ['payments', 'Payment methods', 'Cash, mobile money, card and insurance at the till', CreditCard]]],
    ['Selling & stock', [['receipts', 'Receipts & stock', 'Printing, packs, expiry warnings and reordering', PrinterIcon]]],
    ['Alerts & messages', [['messages', 'Messages & recovery', 'Reminder texts, password recovery, client details', MessageSquareText], ['alerts', 'Alerts & storage', 'Daily summary, report emails, reminders, weather, storage limits', BellRing]]],
    ['Online & data', [['online', 'Online & Mobile Money', 'Cloud sync, Mobile Money and SMS', Cloud], ['backup', 'Data & backup', 'Updates, backups and the daily stock sheet', DatabaseBackup]]],
  ];
  const section = groups.flatMap(([, rows]) => rows).find(([k]) => k === tab);
  const SecIcon = section?.[3];
  return (
    <div className={'page settings-page' + (tab ? ' has-section' : '')}>
      <div className="page-head"><div><h1>Settings</h1><div className="sub">{db.settings.name} · shared by every device (per-device options are in This device)</div></div></div>
      <div className="settings-layout">
        <aside className="settings-side" aria-label="Settings sections">
          <SettingsSearch can={can} />
          <SettingsGroup label="Quick switches">
            <ToggleRow icon={Printer} label="Print receipts automatically" desc="After each sale" checked={!!db.settings.autoPrint} onChange={(v) => quick('autoPrint', v)} />
            <ToggleRow icon={ScanBarcode} label="Blind cash-up" desc="Count the cash before seeing the total" checked={!!db.settings.blindCashUp} onChange={(v) => quick('blindCashUp', v)} />
            <ToggleRow icon={Repeat} label="Automatic reorder levels" desc="Set every week from sales" checked={db.settings.autoReorder !== false} onChange={(v) => quick('autoReorder', v)} />
            {features.hourly !== false && <ToggleRow icon={Clock} label="Hourly reminder" desc="Time and today's to-dos" checked={db.settings.hourlyChime !== false} onChange={(v) => quick('hourlyChime', v)} />}
          </SettingsGroup>
          {groups.map(([label, rows]) => (
            <SettingsGroup key={label} label={label}>
              {rows.map(([k, name, desc, Icon]) => <SettingsRow key={k} icon={Icon} label={name} desc={desc} active={tab === k} onClick={() => setTab(k)} />)}
            </SettingsGroup>
          ))}
          <SettingsGroup label="More">
            <SettingsRow tab={false} icon={MonitorSmartphone} label="This device" desc="Screen, sounds, keyboard, updates" onClick={() => navigate('/device')} />
            {can('users.manage') && <SettingsRow tab={false} icon={UserCog} label="Users & roles" desc="Staff accounts and permissions" onClick={() => navigate('/users')} />}
          </SettingsGroup>
          <DangerZone actions={[can('data.reset') && { icon: RotateCcw, label: 'Restore default settings', desc: 'Every setting except the pharmacy details', title: 'Restore every setting to its default?', text: 'Receipt, stock, message, alert and payment-method settings go back to factory defaults on every device. Pharmacy name, address, phone, TIN and licence are kept. Sales, stock and records are not touched.', confirm: 'Restore defaults', final: 'All settings except your pharmacy details go back to factory defaults on every device.', note: 'To erase or restore a pharmacy\'s data, contact your RxPOS provider.', run: restoreDefaults }]} />
        </aside>
        <div className="settings-main">
          {section && <button type="button" className="btn ghost sm settings-back" onClick={() => setTab(null)}><ChevronLeft size={16} />All settings</button>}
          {section && <div className="settings-section-head"><span className="settings-icon big"><SecIcon size={20} /></span><div><h2>{section[1]}</h2><small className="muted">{section[2]}</small></div></div>}

      {tab === 'general' && can('settings.manage') && (
        // E6: the pharmacy's own logo, for every device: the menu, sign-in, receipts, invoices, the customer display
        <div className="card logo-card">
          <h3><Store size={18} />Pharmacy logo</h3>
          <div className="row gap wrap">
            {pharmacyLogo(db) ? <img className="logo-preview" src={pharmacyLogo(db)} alt="The pharmacy's logo" /> : <span className="logo-preview none muted small">No logo yet</span>}
            <label className="btn ghost">{db.settings.logo ? 'Change logo' : 'Upload a logo'}
              <input type="file" accept="image/*" hidden aria-label="Pharmacy logo" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { const small = await smallPicture(f, 512); const up = await uploadAttachment(syncCfg, small, 'logo.' + small.name.split('.').pop()); await quick('logo', up.path); toast('Logo saved for every device', 'success', { sync: true }); }
                catch (err) { toast(err.message || 'The logo could not be saved', 'error'); }
              }} /></label>
            {db.settings.logo && <button type="button" className="btn ghost" onClick={() => quick('logo', '')}>Remove</button>}
          </div>
          <small className="muted">Shown on the sign-in page, at the top of the menu, on receipts and invoices and on the customer display. {db.license?.[0]?.branding?.logo ? 'Your RxPOS provider has set a logo too: theirs is shown.' : ''}</small>
        </div>
      )}
      {tab === 'general' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><Store size={18} />Pharmacy details · this device</h3>
          <p className="muted small">Owner sets the shared defaults for every device. Edits here override them only on this device until you reset them. {isWeb && 'In the web version, overrides last for this browser tab’s session.'}</p>
          <p className="muted small">{Object.keys(pharmacyOverrides).length} local override(s) · Owner pharmacy name: {sharedSettings.name}</p>
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
            {field('minMargin', 'Target margin (%): lower margins are flagged', 'number')}
            <label className="field"><span>Round worked-out prices</span>
              <select value={String(s.priceRound || 0)} onChange={(e) => setS({ ...s, priceRound: Number(e.target.value) })}>
                <option value="0">To the nearest unit</option>
                {[10, 50, 100, 500].map((n) => <option key={n} value={n}>Up to the next {n}</option>)}
              </select>
            </label>
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
          <div className="form-actions"><button type="button" className="btn ghost" onClick={() => { try { resetPharmacyOverrides(); setS({ ...db.settings, ...pharmacyDefaults(sharedSettings) }); toast('Owner defaults restored on this device.'); } catch (e) { toast(e.message, 'error'); } }} disabled={!Object.keys(pharmacyOverrides).length}><RotateCcw size={16} />Use Owner defaults</button><button className="btn primary">Save for this device</button></div>
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
            <label className="field check"><input type="checkbox" checked={!!s.blindCashUp} onChange={(e) => setS({ ...s, blindCashUp: e.target.checked })} /><span>Blind cash-up: staff count the cash before they see what the drawer should hold<Help text={HELP.blind} /></span></label>
            <label className="field"><span>Refunds above this need a manager (0 = never)<Help text={HELP.refundApprove} /></span>
              <input type="number" min="0" step="1000" value={s.refundApproveAbove ?? 100000} onChange={(e) => setS({ ...s, refundApproveAbove: Math.max(0, Number(e.target.value) || 0) })} /></label>
            {field('receiptFooter', 'Receipt footer message')}
            <label className="field"><span>Add Stock receives medicines with packs in</span>
              <select value={s.receiveUnit || 'pack'} onChange={(e) => setS({ ...s, receiveUnit: e.target.value })}><option value="pack">Packs (the largest pack, e.g. boxes)</option><option value="unit">Single units</option></select>
            </label>
            <label className="field"><span>Retail till sells in</span>
              <select value={s.sellUnitRetail || 'unit'} onChange={(e) => setS({ ...s, sellUnitRetail: e.target.value })}><option value="unit">Single units (tablets, bottles…)</option><option value="pack">Packs</option></select>
            </label>
            <label className="field"><span>Wholesale till sells in</span>
              <select value={s.sellUnitWholesale || 'pack'} onChange={(e) => setS({ ...s, sellUnitWholesale: e.target.value })}><option value="pack">Packs (the largest pack)</option><option value="unit">Single units</option></select>
            </label>
            <p className="muted small full">Stock is always counted in single units. A medicine's packs are set in Medicine List → Packs; each line in Add Stock or at the till can still be switched between packs and units.</p>
            {field('expiryWarnDays', 'Warn about expiry (days before)', 'number')}
            <label className="field check"><input type="checkbox" checked={s.autoReorder !== false} onChange={(e) => setS({ ...s, autoReorder: e.target.checked })} /><span>Set reorder levels automatically every week from sales</span></label>
          </div>
          <details className="advanced">
            <summary>Advanced reordering</summary>
            <div className="form-grid">
              {field('leadDays', 'Supplier lead time (days)', 'number')}
              {field('coverDays', 'Reorder enough stock for (days)', 'number')}
              {field('deadDays', 'Dead stock after no sales for (days)', 'number')}
              {field('autoReorderDays', 'Use sales from the last (days)', 'number', { placeholder: '30' })}
              {field('safetyDays', 'Safety stock (extra days of sales)', 'number', { placeholder: '7' })}
            </div>
          </details>
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

      {tab === 'alerts' && <DailySummary s={s} setS={setS} onSave={submitSettings} />}
      {tab === 'alerts' && <ReportEmails />}
      {tab === 'alerts' && (
        <form className="card" onSubmit={submitSettings}>
          <h3><BellRing size={18} />Idle promotions & reminders</h3>
          <div className="form-grid">
            {features.promos !== false && <label className="field"><span>Show product promotions after the app is idle for (minutes, 0 = never)</span><input type="number" min="0" step="0.5" value={s.idleMinutes ?? 3} onChange={(e) => setS({ ...s, idleMinutes: e.target.value })} /></label>}
            {features.hourly !== false && <>
              <label className="field check"><input type="checkbox" checked={s.hourlyChime !== false} onChange={(e) => setS({ ...s, hourlyChime: e.target.checked })} /><span>Hourly time reminder with today's to-dos</span></label>
              <label className="field check"><input type="checkbox" checked={s.hourlySound !== false} onChange={(e) => setS({ ...s, hourlySound: e.target.checked })} /><span>Play a soft chime</span></label>
              <label className="field check"><input type="checkbox" checked={s.dailyGreetings !== false} onChange={(e) => setS({ ...s, dailyGreetings: e.target.checked })} /><span>Daily greeting, health tip and WHO health alerts to the team at 8 am, 2 pm and 4 pm (with one-tap sharing to clients on WhatsApp)</span></label>
              <label className="field"><span>Quiet from (hour, 0-23)</span><input type="number" min="0" max="23" value={s.quietFrom ?? 21} onChange={(e) => setS({ ...s, quietFrom: e.target.value })} /></label>
              <label className="field"><span>Quiet until (hour, 0-23)</span><input type="number" min="0" max="23" value={s.quietTo ?? 7} onChange={(e) => setS({ ...s, quietTo: e.target.value })} /></label>
            </>}
          </div>
          <p className="muted small">Pop-ups with a sound appear for short-expiry and low stock, slow movers, hot weather (from {s.hotAlert || 30}°C), rain forecasts and new messages. Turn sounds off on a device from the bell menu.</p>
          {'Notification' in window && (
            <p className="muted small">Desktop notifications when RxPOS is in the background: <strong>{Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked in this browser' : 'off'}</strong>
              {Notification.permission === 'default' && <> · <button type="button" className="link-btn" onClick={() => Notification.requestPermission().then(() => setS({ ...s }))}>Turn on</button></>}</p>
          )}
          {features.weather !== false && <>
            <h3 style={{ marginTop: 18 }}><MapPin size={18} />Weather location</h3>
            <label className="field"><span>Weather location</span>
              <select value={s.weatherMode || 'device'} onChange={(e) => setS({ ...s, weatherMode: e.target.value })}>
                <option value="device">Where each device is (GPS, or its internet connection)</option>
                <option value="fixed">A fixed town (choose below)</option>
              </select></label>
            {s.weatherMode === 'fixed' && <p className="muted small">Town: <strong>{(s.weatherPlace || DEFAULT_PLACE).name}</strong>. Weather from Open-Meteo (free, no account).</p>}
            {s.weatherMode === 'fixed' && <div className="picker"><div className="row gap">
              <input placeholder="Search your town, e.g. Mbarara" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findPlace(e)} />
              <button type="button" className="btn ghost" onClick={findPlace}><Search size={16} />Find</button>
            </div>
            {places && <div className="picker-list">{places.map((p) => <button type="button" key={p.name + p.lat} onClick={() => { setS({ ...s, weatherPlace: p }); setPlaces(null); setPlaceQ(''); }}>{p.name}</button>)}{!places.length && <span className="muted small">No place found</span>}</div>}</div>}
            <h3 style={{ marginTop: 18 }}><Thermometer size={18} />Storage limits</h3>
            <div className="form-grid">
              <label className="field"><span>Room: lowest (°C)</span><input type="number" value={s.roomMin ?? lim.roomMin} onChange={(e) => setS({ ...s, roomMin: e.target.value })} /></label>
              <label className="field"><span>Room: highest (°C)</span><input type="number" value={s.roomMax ?? lim.roomMax} onChange={(e) => setS({ ...s, roomMax: e.target.value })} /></label>
              <label className="field"><span>Fridge: lowest (°C)</span><input type="number" value={s.fridgeMin ?? lim.fridgeMin} onChange={(e) => setS({ ...s, fridgeMin: e.target.value })} /></label>
              <label className="field"><span>Fridge: highest (°C)</span><input type="number" value={s.fridgeMax ?? lim.fridgeMax} onChange={(e) => setS({ ...s, fridgeMax: e.target.value })} /></label>
              <label className="field"><span>Hot-weather alert from (°C)</span><input type="number" value={s.hotAlert ?? lim.hotAlert} onChange={(e) => setS({ ...s, hotAlert: e.target.value })} /></label>
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
              <span>Status: <strong className={syncStatus.state === 'error' ? 'text-danger' : syncStatus.state === 'ok' ? 'text-ok' : ''}>{syncStatus.state}</strong>{syncCfg.lastSync && <> · last sync {showDateTime(syncCfg.lastSync)}</>}</span>
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

      {tab === 'backup' && <Updates />}
      {tab === 'backup' && (
        <div className="card">
          <h3><DatabaseBackup size={18} />Backup</h3>
          <p className="muted">All data is kept on this device and in the RxPOS cloud. You can also download a copy to keep on a USB stick or Google Drive.</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => downloadFile(`rxpos-backup-${today()}.json`, JSON.stringify({ ...db, settings: sharedSettings }), 'application/json')}>Download a backup</button>
          </div>
          {can('settings.manage') && syncCfg?.url && <DailyStockSheet syncCfg={syncCfg} />}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

/** Which build this device runs, and its self-update (src/update.js) */
/** Daily owner summary: emailed every evening at 21:00 to the addresses here; preview, send now or share on WhatsApp */
function DailySummary({ s, setS, onSave }) {
  const { syncCfg, can } = useStore();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const run = async (send) => {
    setBusy(send ? 'send' : 'preview');
    try {
      const r = await daySummary(syncCfg, send);
      setPreview(r.text);
      if (send) toast(r.sent ? `Summary emailed to ${r.sent} address${r.sent > 1 ? 'es' : ''}` : r.error || 'Add an email address first, then save', r.sent ? 'success' : 'warn');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(''); }
  };
  if (!can('reports')) return null;
  return (
    <form className="card" onSubmit={onSave}>
      <h3><MessageSquareText size={18} />Daily summary for the owner</h3>
      <p className="muted small">Every evening at 9 pm: the day's sales and how they were paid, profit, expenses, refunds, each branch, best sellers, and stock expiring or running low.</p>
      <div className="form-grid">
        <label className="field full"><span>Email it to (up to 5 addresses, separated by commas)</span><input type="text" inputMode="email" value={s.summaryEmails || ''} onChange={(e) => setS({ ...s, summaryEmails: e.target.value })} placeholder="owner@example.com" /></label>
      </div>
      <div className="row gap">
        <button className="btn primary">Save</button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => run(false)}>{busy === 'preview' ? 'Loading…' : "Preview today's summary"}</button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => run(true)}>{busy === 'send' ? 'Sending…' : 'Email it now'}</button>
        {preview && <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(preview)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>}
      </div>
      {preview && <pre className="summary-preview">{preview}</pre>}
    </form>
  );
}

/** Settings → Data & backup: the private link a Google Sheet reads every day's stock figures from (worker/dailystock.js) */
function DailyStockSheet({ syncCfg }) {
  const [link, setLink] = useState(undefined); // undefined: loading · null: none yet · string
  const [busy, setBusy] = useState(false);
  useEffect(() => { dailyStockLink(syncCfg).then((r) => setLink(r.url || null)).catch(() => setLink(null)); }, [syncCfg?.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const formula = link ? `=IMPORTDATA("${link}")` : '';
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`, 'success'); } catch { toast('Select the text and copy it', 'warn'); } };
  const renew = async () => {
    if (link && !(await ask({ title: 'Make a new link?', message: 'The old link stops working at once: paste the new formula into your sheet.', confirmText: 'Make a new link' }))) return;
    setBusy(true);
    try { setLink((await dailyStockLink(syncCfg, true)).url); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3><Sheet size={18} />Daily stock sheet (Google Sheets)</h3>
      <p className="muted small">Every day&apos;s sales, opening and closing stock value, purchases (stock added at cost), cost of stock sold, profit and expenses, worked out by the cloud from all your devices. Paste the formula into an empty tab of your Google Sheet: it refreshes by itself, and a day corrects itself if a till sends its sales late. Anyone who can open the sheet can read these daily totals (nothing else).</p>
      {link === undefined ? <p className="muted small">Loading…</p> : link ? (
        <>
          <code className="small" style={{ display: 'block', wordBreak: 'break-all', margin: '8px 0' }}>{formula}</code>
          <div className="row gap">
            <button type="button" className="btn primary" onClick={() => copy(formula, 'Formula')}><Copy size={16} />Copy formula</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={renew}><RefreshCw size={16} />Make a new link</button>
          </div>
        </>
      ) : <button type="button" className="btn primary" disabled={busy} onClick={renew}><Sheet size={16} />Create the link</button>}
    </div>
  );
}
