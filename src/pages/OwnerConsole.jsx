import { useEffect, useState } from 'react';
import { Crown, Plus, RefreshCw, KeyRound, PauseCircle, PlayCircle, Eraser, Copy, Smartphone, LogOut, Building2 } from 'lucide-react';
import { FEATURES, DEFAULT_FEATURES } from '../access.js';
import { ownerApi, DEFAULT_CLOUD, cleanUrl } from '../cloud.js';
import { Modal, Empty, Stat } from '../ui.jsx';
import { toast, ask, askText } from '../feedback.jsx';
import { Logo } from '../logo.jsx';

const KEY = 'rxpos-owner-key';
const defaultUrl = () => (/^https:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : DEFAULT_CLOUD);

/** RxPOS owner (vendor) console: manage the client pharmacies that use RxPOS. */
export default function OwnerConsole() {
  const [url] = useState(defaultUrl);
  const [ownerKey, setOwnerKey] = useState(() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } });
  const [draftKey, setDraftKey] = useState('');
  const [tenants, setTenants] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [created, setCreated] = useState(null);
  const [secrets, setSecrets] = useState(null);

  const api = (path, body) => ownerApi(url, ownerKey, path, body);
  const load = async (key = ownerKey) => {
    if (!key) return;
    setBusy(true);
    try { const j = await ownerApi(url, key, '/tenants'); setTenants(j.tenants); }
    catch (e) { toast(e.message, 'error'); if (/owner key/i.test(e.message)) { setOwnerKey(''); sessionStorage.removeItem(KEY); } }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (e) => {
    e.preventDefault();
    try { await ownerApi(url, draftKey.trim(), '/tenants'); sessionStorage.setItem(KEY, draftKey.trim()); setOwnerKey(draftKey.trim()); setDraftKey(''); load(draftKey.trim()); }
    catch (err) { toast(err.message, 'error'); }
  };

  if (!ownerKey) return (
    <div className="auth-bg owner-login">
      <div className="auth-side" style={{ gridColumn: '1 / -1' }}>
        <form className="auth-card" onSubmit={signIn}>
          <div className="brand big"><Logo size={40} /> RxPOS</div>
          <p className="muted center"><Crown size={14} /> Owner console: manage the pharmacies using RxPOS</p>
          <label className="field"><span>Owner key</span><input type="password" autoFocus value={draftKey} onChange={(e) => setDraftKey(e.target.value)} required /></label>
          <button className="btn primary block">Open console</button>
          <a className="muted small center" href="#/">← Back to RxPOS</a>
        </form>
      </div>
    </div>
  );

  const save = async (id, body, msg) => {
    setBusy(true);
    try { await api('/tenants/' + id, body); toast(msg); await load(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const j = await api('/tenants', { id: edit.id.trim().toLowerCase(), name: edit.name.trim(), notes: edit.notes, features: edit.features, copyCatalogFrom: edit.catalog ? 'main' : undefined });
      setCreated({ ...j, url: cleanUrl(url) });
      setEdit(null);
      await load();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const rotate = async (t) => {
    if (!(await ask({ title: `Issue a new key for ${t.name}?`, message: 'The current key stops working immediately. Staff signed in with their own accounts are not affected.', confirmText: 'New key', danger: true }))) return;
    try { const j = await api(`/tenants/${t.id}/rotate-key`, {}); setCreated({ tenant: t, syncKey: j.syncKey, url: cleanUrl(url), rotated: true }); } catch (e) { toast(e.message, 'error'); }
  };
  const reset = async (t) => {
    const typed = await askText({ title: `Erase ${t.name}'s data?`, message: `Sales, stock, customers, users and records are deleted on every device. Medicines are kept. Type the pharmacy code "${t.id}" to confirm.`, confirmText: 'Erase data' });
    if (!typed) return;
    try { const j = await api(`/tenants/${t.id}/reset`, { confirm: typed.trim(), keepMedicines: true }); toast(`${j.cleared} records erased`); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const copy = (text) => { navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {}); };

  const active = tenants?.filter((t) => t.status === 'active').length || 0;
  return (
    <div className="owner">
      <header className="topbar">
        <div className="brand" style={{ color: 'var(--text)' }}><Logo size={30} /> RxPOS <span className="badge"><Crown size={12} /> Owner</span></div>
        <div className="spacer grow" />
        <button className="btn ghost" onClick={() => load()} disabled={busy}><RefreshCw size={16} />Refresh</button>
        <button className="btn ghost" onClick={() => { sessionStorage.removeItem(KEY); setOwnerKey(''); setTenants(null); }}><LogOut size={16} />Lock</button>
      </header>
      <div className="page">
        <div className="page-head">
          <div><h1>Client pharmacies</h1><div className="sub">Each pharmacy has its own data, staff, payment keys and features. Cloud: {cleanUrl(url)}</div></div>
          <button className="btn primary" onClick={() => setEdit({ _new: true, id: '', name: '', notes: '', features: { ...DEFAULT_FEATURES }, catalog: true })}><Plus size={16} />New client pharmacy</button>
        </div>
        <div className="stats">
          <Stat label="Pharmacies" value={tenants?.length ?? '…'} icon={Building2} tone="teal" />
          <Stat label="Active" value={active} tone="violet" />
          <Stat label="Suspended" value={(tenants?.length || 0) - active} tone="red" />
        </div>
        <div className="branch-grid">
          {tenants?.map((t) => (
            <div key={t.id} className={'card branch-card' + (t.status !== 'active' ? ' dim' : '')}>
              <div className="row between"><h3><Building2 size={18} />{t.name}</h3><span className={'badge ' + (t.status === 'active' ? 'ok' : 'danger')}>{t.status}</span></div>
              <div className="muted small">Code <strong>{t.id}</strong> · since {new Date(t.created).toLocaleDateString()}</div>
              <div className="kv"><span>Medicines</span><strong>{t.stats.products.toLocaleString()}</strong></div>
              <div className="kv"><span>Users</span><strong>{t.stats.users}</strong></div>
              <div className="kv"><span>Sales recorded</span><strong>{t.stats.sales.toLocaleString()}</strong></div>
              <div className="kv"><span>Last activity</span><strong>{t.stats.lastActivity ? new Date(t.stats.lastActivity).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</strong></div>
              <div className="kv"><span>Payments</span><strong className="small">{[t.payments.mtn && 'MTN', t.payments.airtel && 'Airtel', t.payments.sms && 'SMS'].filter(Boolean).join(' · ') || 'none'}</strong></div>
              {t.notes && <p className="muted small">{t.notes}</p>}
              <div className="row gap">
                <button className="btn sm ghost" onClick={() => setEdit({ ...t })}>Features & details</button>
                {t.id !== 'main' && <button className="btn sm ghost" onClick={() => setSecrets({ tenant: t, values: {} })}><Smartphone size={14} />Payments & SMS</button>}
                {t.id !== 'main' && <button className="btn sm ghost" onClick={() => rotate(t)}><KeyRound size={14} />New key</button>}
                {t.id !== 'main' && (t.status === 'active'
                  ? <button className="btn sm ghost" onClick={() => save(t.id, { status: 'suspended' }, `${t.name} suspended`)}><PauseCircle size={14} />Suspend</button>
                  : <button className="btn sm primary" onClick={() => save(t.id, { status: 'active' }, `${t.name} reactivated`)}><PlayCircle size={14} />Reactivate</button>)}
                <button className="btn sm danger" onClick={() => reset(t)}><Eraser size={14} />Erase data</button>
              </div>
            </div>
          ))}
          {tenants && !tenants.length && <Empty>No pharmacies yet</Empty>}
          {!tenants && <div className="skeleton" />}
        </div>
      </div>

      {edit && (
        <Modal title={edit._new ? 'New client pharmacy' : `${edit.name} – features & details`} onClose={() => setEdit(null)} wide>
          <form onSubmit={edit._new ? create : (e) => { e.preventDefault(); save(edit.id, { name: edit.name, notes: edit.notes, features: edit.features }, 'Saved. Devices pick it up at their next sync.'); setEdit(null); }}>
            <div className="form-grid">
              <label className="field"><span>Pharmacy name</span><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              {edit._new && <label className="field"><span>Pharmacy code (used to sign in)</span><input required pattern="[a-z0-9][a-z0-9-]{1,23}" placeholder="e.g. citycare-ntinda" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></label>}
              <label className="field full"><span>Notes (contact person, phone, plan, renewal date…)</span><input value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            </div>
            <h3>Features for this pharmacy</h3>
            <div className="perm-grid">
              {FEATURES.map(([k, label, hint]) => (
                <label key={k} className="field check"><input type="checkbox" checked={edit.features[k] !== false} onChange={(e) => setEdit({ ...edit, features: { ...edit.features, [k]: e.target.checked } })} /><span>{label}{hint && <small className="muted"> · {hint}</small>}</span></label>
              ))}
            </div>
            {edit._new && <label className="field check"><input type="checkbox" checked={edit.catalog} onChange={(e) => setEdit({ ...edit, catalog: e.target.checked })} /><span>Start with the standard 9,710-medicine catalog</span></label>}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>{edit._new ? 'Create pharmacy' : 'Save'}</button></div>
          </form>
        </Modal>
      )}

      {created && (
        <Modal title={created.rotated ? 'New sync key' : `${created.tenant.name} is ready`} onClose={() => setCreated(null)}>
          <div className="stack">
            <div className="notice"><KeyRound size={16} /> Copy this key now. It is shown only once.</div>
            <div className="kv"><span>Cloud address</span><strong>{created.url}</strong></div>
            <div className="kv"><span>Pharmacy code</span><strong>{created.tenant.id}</strong></div>
            <div className="row gap"><code className="keybox grow">{created.syncKey}</code><button className="btn ghost" onClick={() => copy(created.syncKey)}><Copy size={16} />Copy</button></div>
            <p className="muted small">Give the owner of the pharmacy: the cloud address and this key. On their first device they open RxPOS → <b>Admin: sync key</b> → connect, then create their admin account in Users & Roles. Their staff then join with their own email and password.</p>
            <button className="btn ghost" onClick={() => copy(`RxPOS setup for ${created.tenant.name}\nAddress: ${created.url}\nPharmacy code: ${created.tenant.id}\nSync key: ${created.syncKey}`)}><Copy size={16} />Copy all setup details</button>
          </div>
        </Modal>
      )}

      {secrets && (
        <Modal title={`${secrets.tenant.name} – Mobile Money & SMS keys`} onClose={() => setSecrets(null)} wide>
          <form onSubmit={async (e) => { e.preventDefault(); const body = Object.fromEntries(Object.entries(secrets.values).filter(([, v]) => v !== undefined)); try { await api(`/tenants/${secrets.tenant.id}/secrets`, body); toast('Keys saved'); setSecrets(null); load(); } catch (err) { toast(err.message, 'error'); } }}>
            <p className="muted small">These are the pharmacy's own merchant keys, so its customers pay into its own account. Leave a field empty to keep the current value. Stored only in the RxPOS cloud.</p>
            {[['MTN MoMo', [['MTN_SUBSCRIPTION_KEY', 'Collections subscription key'], ['MTN_API_USER', 'API user'], ['MTN_API_KEY', 'API key'], ['MTN_ENV', 'Environment: sandbox or production']]],
              ['Airtel Money', [['AIRTEL_CLIENT_ID', 'Client ID'], ['AIRTEL_CLIENT_SECRET', 'Client secret'], ['AIRTEL_ENV', 'Environment: uat or production']]],
              ["SMS (Africa's Talking)", [['AT_USERNAME', 'Username'], ['AT_API_KEY', 'API key'], ['AT_SENDER_ID', 'Sender ID (optional)']]]].map(([title, fields]) => (
              <div key={title}><h3>{title}</h3><div className="form-grid">
                {fields.map(([k, label]) => <label key={k} className="field"><span>{label}</span><input type={/KEY|SECRET/.test(k) ? 'password' : 'text'} autoComplete="off" value={secrets.values[k] ?? ''} onChange={(e) => setSecrets({ ...secrets, values: { ...secrets.values, [k]: e.target.value } })} /></label>)}
              </div></div>
            ))}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setSecrets(null)}>Cancel</button><button className="btn primary">Save keys</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
