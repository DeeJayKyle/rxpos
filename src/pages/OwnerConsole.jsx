import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Plus, RefreshCw, KeyRound, PauseCircle, PlayCircle, Eraser, Copy, Smartphone, LogOut, Building2, ArrowLeft, Users, Database, SlidersHorizontal,
  Trash2, Download, Upload, Globe, Pencil, Search, ShieldAlert, MessageCircle, ExternalLink, Wand2, Eye, UserCog, Mail, LockKeyhole } from 'lucide-react';
import { FEATURES, DEFAULT_FEATURES, DEFAULT_ROLES } from '../access.js';
import { ownerApi, cleanUrl, cloudUrl, whatsappLink, ownerAuthConfig, ownerLogin, ownerGoogleLogin } from '../cloud.js';
import { Modal, Empty, Stat, Tabs } from '../ui.jsx';
import { toast, ask, askText } from '../feedback.jsx';
import { Logo } from '../logo.jsx';
import { downloadFile, today } from '../store.jsx';
import { isWeb } from '../platform.js';
import { THEMES } from '../themes.js';

const KEY = 'rxpos-owner-key';
/** GitHub mark (brand icons are not in lucide) */
const Github = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>;
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const genPassword = () => { const w = ['Amber', 'Cedar', 'Coral', 'Delta', 'Falcon', 'Harbor', 'Indigo', 'Jade', 'Lotus', 'Maple', 'Nova', 'Orchid', 'River', 'Sage', 'Tulip', 'Willow']; const r = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n; return `${w[r(16)]}-${1000 + r(9000)}-${w[r(16)]}`; };
const label = (r) => r?.name || r?.title || r?.number || r?.email || r?.action || r?.batch || r?.type || '';

/** RxPOS owner console (web only): create and manage every client pharmacy. */
export default function OwnerConsole() {
  const url = cleanUrl(cloudUrl());
  // Owner session token (or the master key) for this browser tab
  const [ownerKey, setOwnerKey] = useState(() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } });
  const [tenants, setTenants] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // tenant id being managed
  const [creating, setCreating] = useState(null);
  const [created, setCreated] = useState(null);
  const [account, setAccount] = useState(false);

  const api = (path, body) => ownerApi(url, ownerKey, path, body);
  const signOut = () => { try { sessionStorage.removeItem(KEY); } catch {} setOwnerKey(''); setTenants(null); setOpen(null); };
  const load = async (key = ownerKey) => {
    if (!key) return;
    setBusy(true);
    try { const j = await ownerApi(url, key, '/tenants'); setTenants(j.tenants); }
    catch (e) { toast(e.message, 'error'); if (/sign in again|owner key|expired/i.test(e.message)) signOut(); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const signedIn = (token, mustSetPassword) => {
    try { sessionStorage.setItem(KEY, token); } catch {}
    setOwnerKey(token); load(token);
    if (mustSetPassword) { setAccount(true); toast('Signed in with the master key. Set your own owner password now.', 'info'); }
  };

  if (!isWeb) return (
    <div className="auth-bg owner-login"><div className="auth-side" style={{ gridColumn: '1 / -1' }}><div className="auth-card">
      <div className="brand big"><Logo size={40} /> RxPOS</div>
      <p className="muted center">The owner console is available on the web version only.</p>
      <a className="btn ghost block" href="#/">← Back to RxPOS</a>
    </div></div></div>
  );
  if (!ownerKey) return <OwnerSignIn url={url} onSignedIn={signedIn} />;

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = creating;
      const j = await api('/tenants', {
        name: c.name.trim(), slug: c.slug, address: c.address, phone: c.phone, notes: c.notes, features: c.features,
        branches: c.branches.split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name })),
        admin: { name: c.adminName, email: c.adminEmail, phone: c.adminPhone, password: c.adminPassword, mustChange: c.mustChange },
      });
      setCreated({ tenant: j.tenant, syncKey: j.syncKey, email: c.adminEmail.trim().toLowerCase(), adminName: c.adminName, phone: c.adminPhone, password: c.adminPassword });
      setCreating(null);
      await load();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {});
  const webAddress = (t) => `${url}/${t.slug}`;
  const welcome = (c) => `Welcome to RxPOS, ${c.adminName || ''}!\n\nYour pharmacy: ${c.tenant.name}\nWeb: ${webAddress(c.tenant)}\nEmail: ${c.email}\nPassword: ${c.password}\n\nWindows & Android apps: sign in with the same email and password. You'll be asked to choose your own password the first time. Then add your staff in Users & Roles.`;

  if (open) return <TenantAdmin id={open} api={api} url={url} onBack={() => { setOpen(null); load(); }} />;

  const active = tenants?.filter((t) => t.status === 'active').length || 0;
  return (
    <div className="owner">
      <OwnerBar busy={busy} onRefresh={() => load()} onLock={signOut}><button className="btn ghost" onClick={() => setAccount(true)}><UserCog size={16} />Owner account</button></OwnerBar>
      {account && <OwnerAccount api={api} onClose={() => setAccount(false)} />}
      <div className="page">
        <div className="page-head">
          <div><h1>Client pharmacies</h1><div className="sub">Each pharmacy has its own web address, data, staff, branches, features and payment keys.</div></div>
          <button className="btn primary" onClick={() => setCreating({ name: '', slug: '', slugEdited: false, address: '', phone: '', notes: '', branches: '', adminName: '', adminEmail: '', adminPhone: '', adminPassword: genPassword(), mustChange: true, features: { ...DEFAULT_FEATURES } })}><Plus size={16} />New pharmacy</button>
        </div>
        <div className="stats">
          <Stat label="Pharmacies" value={tenants?.length ?? '…'} icon={Building2} tone="teal" />
          <Stat label="Active" value={active} tone="violet" />
          <Stat label="Suspended" value={(tenants?.length || 0) - active} tone="red" />
          <Stat label="Staff accounts" value={tenants?.reduce((a, t) => a + t.stats.users, 0) ?? '…'} icon={Users} />
        </div>
        <div className="branch-grid">
          {tenants?.map((t) => (
            <div key={t.id} className={'card branch-card tenant-card' + (t.status !== 'active' ? ' dim' : '')} onClick={() => setOpen(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(t.id)}>
              <div className="row between"><h3><Building2 size={18} />{t.name}</h3><span className={'badge ' + (t.status === 'active' ? 'ok' : 'danger')}>{t.status}</span></div>
              <a className="small tenant-url" href={webAddress(t)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Globe size={12} /> {webAddress(t).replace(/^https?:\/\//, '')}</a>
              <div className="kv"><span>Medicines</span><strong>{t.stats.products.toLocaleString()}</strong></div>
              <div className="kv"><span>Staff · branches</span><strong>{t.stats.users} · {t.stats.branches || 1}</strong></div>
              <div className="kv"><span>Sales recorded</span><strong>{t.stats.sales.toLocaleString()}</strong></div>
              <div className="kv"><span>Last activity</span><strong>{t.stats.lastActivity ? new Date(t.stats.lastActivity).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</strong></div>
              {t.notes && <p className="muted small">{t.notes}</p>}
              <button className="btn sm primary">Manage <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} /></button>
            </div>
          ))}
          {tenants && !tenants.length && <Empty>No pharmacies yet</Empty>}
          {!tenants && <div className="skeleton" />}
        </div>
      </div>

      {creating && (
        <Modal title="New pharmacy" onClose={() => setCreating(null)} wide>
          <form onSubmit={create}>
            <div className="form-grid">
              <label className="field"><span>Pharmacy name</span><input required autoFocus value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value, slug: creating.slugEdited ? creating.slug : slugify(e.target.value) })} /></label>
              <label className="field"><span>Web address</span><div className="slug-input"><span>{url.replace(/^https?:\/\//, '')}/</span><input required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" value={creating.slug} onChange={(e) => setCreating({ ...creating, slug: slugify(e.target.value), slugEdited: true })} /></div></label>
              <label className="field"><span>Address / town</span><input value={creating.address} onChange={(e) => setCreating({ ...creating, address: e.target.value })} /></label>
              <label className="field"><span>Pharmacy phone</span><input value={creating.phone} onChange={(e) => setCreating({ ...creating, phone: e.target.value })} /></label>
              <label className="field full"><span>Extra branches (optional, comma-separated; "Main branch" is always created)</span><input value={creating.branches} onChange={(e) => setCreating({ ...creating, branches: e.target.value })} placeholder="e.g. Ntinda, Kireka" /></label>
              <label className="field full"><span>Notes (contact person, plan, renewal date…)</span><input value={creating.notes} onChange={(e) => setCreating({ ...creating, notes: e.target.value })} /></label>
            </div>
            <h3>Administrator account</h3>
            <div className="form-grid">
              <label className="field"><span>Full name</span><input required value={creating.adminName} onChange={(e) => setCreating({ ...creating, adminName: e.target.value })} /></label>
              <label className="field"><span>Email (Gmail works)</span><input type="email" required value={creating.adminEmail} onChange={(e) => setCreating({ ...creating, adminEmail: e.target.value })} /></label>
              <label className="field"><span>Phone / WhatsApp</span><input value={creating.adminPhone} onChange={(e) => setCreating({ ...creating, adminPhone: e.target.value })} placeholder="07XX XXX XXX" /></label>
              <label className="field"><span>Temporary password</span><div className="row gap"><input required minLength={8} value={creating.adminPassword} onChange={(e) => setCreating({ ...creating, adminPassword: e.target.value })} /><button type="button" className="icon-btn" title="New password" onClick={() => setCreating({ ...creating, adminPassword: genPassword() })}><Wand2 size={16} /></button></div></label>
              <label className="field check full"><input type="checkbox" checked={creating.mustChange} onChange={(e) => setCreating({ ...creating, mustChange: e.target.checked })} /><span>Ask them to choose their own password at first sign-in</span></label>
            </div>
            <h3>Features</h3>
            <FeatureGrid value={creating.features} onChange={(features) => setCreating({ ...creating, features })} />
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setCreating(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create pharmacy'}</button></div>
          </form>
        </Modal>
      )}

      {created && (
        <Modal title={`${created.tenant.name} is ready`} onClose={() => setCreated(null)}>
          <div className="stack">
            <div className="kv"><span>Web address</span><strong><a href={webAddress(created.tenant)} target="_blank" rel="noreferrer">{webAddress(created.tenant)}</a></strong></div>
            <div className="kv"><span>Administrator</span><strong>{created.email}</strong></div>
            <div className="kv"><span>Temporary password</span><strong>{created.password}</strong></div>
            <div className="row gap">
              <button className="btn primary" onClick={() => copy(welcome(created))}><Copy size={16} />Copy welcome message</button>
              {created.phone && <a className="btn ghost" target="_blank" rel="noreferrer" href={whatsappLink(created.phone.replace(/^0/, '256'), welcome(created))}><MessageCircle size={16} />Send on WhatsApp</a>}
            </div>
            <details><summary className="muted small">Pharmacy sync key (owner only)</summary>
              <div className="notice"><KeyRound size={16} /> Shown only once. Only needed for a LAN hub or integrations; staff never need it.</div>
              <div className="row gap"><code className="keybox grow">{created.syncKey}</code><button className="btn ghost" onClick={() => copy(created.syncKey)}><Copy size={16} /></button></div></details>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OwnerBar({ busy, onRefresh, onLock, children }) {
  return (
    <header className="topbar">
      <div className="brand" style={{ color: 'var(--text)' }}><Logo size={30} /> RxPOS <span className="badge"><Crown size={12} /> Owner</span></div>
      {children}
      <div className="spacer grow" />
      {onRefresh && <button className="btn ghost" onClick={onRefresh} disabled={busy}><RefreshCw size={16} />Refresh</button>}
      {onLock && <button className="btn ghost" onClick={onLock}><LogOut size={16} />Lock</button>}
    </header>
  );
}

function FeatureGrid({ value, onChange }) {
  return (
    <div className="perm-grid">
      {FEATURES.map(([k, l, hint]) => (
        <label key={k} className="field check"><input type="checkbox" checked={value[k] !== false} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} /><span>{l}{hint && <small className="muted"> · {hint}</small>}</span></label>
      ))}
    </div>
  );
}

/** Everything about one pharmacy */
function TenantAdmin({ id, api, url, onBack }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [features, setFeatures] = useState(null);
  const [userEdit, setUserEdit] = useState(null);
  const [branchEdit, setBranchEdit] = useState(null);
  const [secrets, setSecrets] = useState({});
  const [testTo, setTestTo] = useState('');
  const [shownKey, setShownKey] = useState(null);

  const load = async () => {
    try {
      const j = await api('/tenants/' + id);
      setD(j); setInfo({ name: j.tenant.name, slug: j.tenant.slug, notes: j.tenant.notes }); setFeatures(j.tenant.features);
    } catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const doing = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); await load(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };

  if (!d) return <div className="owner"><OwnerBar /><div className="page"><div className="skeleton" /></div></div>;
  const t = d.tenant;
  const address = `${url}/${t.slug}`;
  const roles = DEFAULT_ROLES.map((r) => r.id);

  const saveUser = (e) => { e.preventDefault(); const { _new, ...user } = userEdit; doing(async () => { await api(`/tenants/${t.id}/users`, { user }); setUserEdit(null); }, _new ? `${user.name} can now sign in` : 'User saved'); };
  const deleteUser = async (u) => (await ask({ title: `Delete ${u.name}?`, message: 'They can no longer sign in on any device.', danger: true, confirmText: 'Delete' })) && doing(() => api(`/tenants/${t.id}/users/${encodeURIComponent(u.id)}/delete`, {}), 'User deleted');
  const saveBranch = (e) => { e.preventDefault(); doing(async () => { await api(`/tenants/${t.id}/branches`, { branch: branchEdit }); setBranchEdit(null); }, 'Branch saved'); };
  const deletePharmacy = async () => {
    const typed = await askText({ title: `Delete ${t.name} for ever?`, message: `Its web address, staff accounts, branches and all its data are removed from the cloud. Devices signed in to it stop syncing. Type "${t.slug}" to confirm.`, confirmText: 'Delete pharmacy' });
    if (!typed) return;
    setBusy(true);
    try { const j = await api(`/tenants/${t.id}/delete`, { confirm: typed.trim() }); toast(`${t.name} deleted (${j.deleted.toLocaleString()} records)`); onBack(); }
    catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const deleteBranch = async (b) => (await ask({ title: `Delete ${b.name}?`, message: 'Its past sales stay in the reports. Move its stock to another branch first.', danger: true, confirmText: 'Delete' })) && doing(() => api(`/tenants/${t.id}/branches/${encodeURIComponent(b.id)}/delete`, {}), 'Branch deleted');

  return (
    <div className="owner">
      <OwnerBar busy={busy} onRefresh={load}><button className="btn ghost" onClick={onBack}><ArrowLeft size={16} />All pharmacies</button></OwnerBar>
      <div className="page">
        <div className="page-head">
          <div><h1>{t.name} <span className={'badge ' + (t.status === 'active' ? 'ok' : 'danger')}>{t.status}</span></h1>
            <div className="sub"><a href={address} target="_blank" rel="noreferrer"><Globe size={12} /> {address}</a> · <button className="link-btn" onClick={() => navigator.clipboard?.writeText(address).then(() => toast('Address copied'))}>copy</button></div></div>
          <div className="row gap">
            {t.status === 'active'
              ? <button className="btn ghost" onClick={async () => (await ask({ title: `Suspend ${t.name}?`, message: 'Its staff cannot sign in or sync until you reactivate it. Data is kept.', danger: true, confirmText: 'Suspend' })) && doing(() => api('/tenants/' + t.id, { status: 'suspended' }), 'Suspended')}><PauseCircle size={16} />Suspend</button>
              : <button className="btn primary" onClick={() => doing(() => api('/tenants/' + t.id, { status: 'active' }), 'Reactivated')}><PlayCircle size={16} />Reactivate</button>}
            <a className="btn ghost" href={address} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open</a>
            <button className="btn danger" onClick={deletePharmacy}><Trash2 size={16} />Delete</button>
          </div>
        </div>
        <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Overview'], ['features', 'Features'], ['brand', 'Look & logo'], ['staff', `Staff (${d.users.length})`], ['branches', `Branches (${d.branches.length})`], ['data', 'Data'], ['payments', 'Payments & SMS'], ['errors', 'Device errors'], ['danger', 'Reset / delete']]} />

        {tab === 'overview' && (
          <>
            <div className="stats">
              <Stat label="Medicines" value={t.stats.products.toLocaleString()} tone="teal" />
              <Stat label="Sales" value={t.stats.sales.toLocaleString()} tone="violet" />
              <Stat label="Records" value={t.stats.records.toLocaleString()} />
              <Stat label="Last activity" value={t.stats.lastActivity ? new Date(t.stats.lastActivity).toLocaleDateString() : '—'} sub={t.stats.lastActivity ? new Date(t.stats.lastActivity).toLocaleTimeString() : ''} />
            </div>
            <form className="card" onSubmit={(e) => { e.preventDefault(); doing(() => api('/tenants/' + t.id, info), 'Saved'); }}>
              <h3><Pencil size={17} />Details</h3>
              <div className="form-grid">
                <label className="field"><span>Pharmacy name</span><input required value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></label>
                <label className="field"><span>Web address</span><div className="slug-input"><span>{url.replace(/^https?:\/\//, '')}/</span><input required value={info.slug} onChange={(e) => setInfo({ ...info, slug: slugify(e.target.value) })} /></div></label>
                <label className="field full"><span>Notes</span><input value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} /></label>
              </div>
              {info.slug !== t.slug && <p className="text-warn small">Changing the address means old links stop working; staff simply sign in at the new one. Installed apps are not affected.</p>}
              <div className="form-actions"><button className="btn primary" disabled={busy}>Save</button></div>
            </form>
          </>
        )}

        {tab === 'brand' && <BrandingTab t={t} onSave={(branding, msg) => doing(() => api('/tenants/' + t.id, { branding }), msg)} busy={busy} />}

        {tab === 'features' && (
          <div className="card">
            <p className="muted small">Choose what this pharmacy can use. Switched-off parts disappear from every device at its next sync (within seconds).</p>
            <FeatureGrid value={features} onChange={setFeatures} />
            <div className="form-actions"><button className="btn primary" disabled={busy} onClick={() => doing(() => api('/tenants/' + t.id, { features }), 'Features saved')}>Save features</button></div>
          </div>
        )}

        {tab === 'staff' && (
          <>
            <div className="row between"><p className="muted small">Create the pharmacy's administrators here. Administrators then add their other staff themselves.</p>
              <button className="btn primary" onClick={() => setUserEdit({ _new: true, name: '', email: '', phone: '', role: 'admin', password: genPassword(), mustChange: true, branchId: '' })}><Plus size={16} />Add user</button></div>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {d.users.map((u) => (
                    <tr key={u.id} className={u.disabled ? 'dim' : ''}>
                      <td><strong>{u.name}</strong>{u.mustChangePassword && <span className="badge warn">temp password</span>}</td><td>{u.email}</td><td>{u.phone || '—'}</td>
                      <td><span className="badge">{u.role}</span></td><td>{u.disabled ? 'Disabled' : 'Active'}</td>
                      <td className="actions">
                        <button className="btn sm ghost" onClick={() => setUserEdit({ ...u, password: '' })}>Edit</button>
                        <button className="btn sm ghost" onClick={async () => { const pw = await askText({ title: `New password for ${u.name}`, minLength: 8, confirmText: 'Set password', placeholder: genPassword() }); if (pw) doing(() => api(`/tenants/${t.id}/users`, { user: { ...u, password: pw, mustChange: true } }), 'Password set. They choose their own at next sign-in.'); }}><KeyRound size={14} />Password</button>
                        <button className="btn sm ghost" onClick={() => doing(() => api(`/tenants/${t.id}/users`, { user: { ...u, disabled: !u.disabled } }), u.disabled ? 'Enabled' : 'Disabled')}>{u.disabled ? 'Enable' : 'Disable'}</button>
                        <button className="btn sm danger" onClick={() => deleteUser(u)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {!d.users.length && <Empty colSpan={6}>No users yet. Add the administrator.</Empty>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'branches' && (
          <>
            <div className="row between"><p className="muted small">Branches appear on the pharmacy's devices at their next sync. Each device chooses which branch it works as.</p>
              <button className="btn primary" onClick={() => setBranchEdit({ name: '', address: '', phone: '', manager: '' })}><Plus size={16} />Add branch</button></div>
            <div className="branch-grid">
              {d.branches.map((b) => (
                <div key={b.id} className="card branch-card">
                  <div className="row between"><h3><Building2 size={18} />{b.name}</h3>
                    <span><button className="icon-btn" title="Edit" onClick={() => setBranchEdit(b)}><Pencil size={15} /></button>{b.id !== 'main' && <button className="icon-btn" title="Delete" onClick={() => deleteBranch(b)}><Trash2 size={15} /></button>}</span></div>
                  {b.address && <p className="muted small">{b.address}</p>}{b.phone && <p className="muted small">{b.phone}</p>}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'errors' && <DeviceErrors t={t} api={api} />}
        {tab === 'data' && <DataBrowser t={t} tables={d.tables} api={api} onChanged={load} />}

        {tab === 'payments' && (
          t.id === 'main' ? <div className="card"><p className="muted">The main pharmacy uses the Cloudflare secrets (deploy\setup-mobile-money.ps1).</p></div> : (
            <form className="card" onSubmit={(e) => { e.preventDefault(); doing(async () => { await api(`/tenants/${t.id}/secrets`, Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== undefined))); setSecrets({}); }, 'Keys saved'); }}>
              <p className="muted small">The pharmacy's own merchant keys, so its customers pay into its own account. Leave a field empty to keep the current value. Status: MTN {t.payments.mtn ? '✓' : '—'} · Airtel {t.payments.airtel ? '✓' : '—'} · SMS {t.payments.sms ? '✓' : '—'}</p>
              {[['MTN MoMo', [['MTN_SUBSCRIPTION_KEY', 'Collections subscription key'], ['MTN_API_USER', 'API user'], ['MTN_API_KEY', 'API key'], ['MTN_ENV', 'Environment: sandbox or production']]],
                ['Airtel Money', [['AIRTEL_CLIENT_ID', 'Client ID'], ['AIRTEL_CLIENT_SECRET', 'Client secret'], ['AIRTEL_ENV', 'Environment: uat or production']]],
                ["SMS (Africa's Talking)", [['AT_USERNAME', 'Username'], ['AT_API_KEY', 'API key'], ['AT_SENDER_ID', 'Sender ID (optional)']]]].map(([title, fields]) => (
                <div key={title}><h3><Smartphone size={16} />{title}</h3><div className="form-grid">
                  {fields.map(([k, l]) => <label key={k} className="field"><span>{l}</span><input type={/KEY|SECRET/.test(k) ? 'password' : 'text'} autoComplete="off" value={secrets[k] ?? ''} onChange={(e) => setSecrets({ ...secrets, [k]: e.target.value })} /></label>)}
                </div></div>
              ))}
              <div className="form-actions"><button className="btn primary" disabled={busy}>Save keys</button></div>
              <div className="notice small">
                <b>Africa's Talking (SMS):</b> create a free account at africastalking.com → open your team → Create App (the app's name is the <b>Username</b>) → Settings → API Key → generate, then paste both above and save.
                New accounts start in "sandbox" (use the username <code>sandbox</code> for testing); top up and go live to text real phones. A Sender ID is optional (it needs approval).
              </div>
              <div className="row gap">
                <input placeholder="Your phone, e.g. 0772 123456" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <button type="button" className="btn ghost" disabled={busy || !t.payments.sms} title={t.payments.sms ? '' : 'Save the Africa’s Talking keys first'} onClick={async () => { setBusy(true); try { const j = await api(`/tenants/${t.id}/test-sms`, { to: testTo }); toast(j.sent ? 'Test SMS sent' : 'SMS provider answered: ' + (j.recipients?.[0]?.status || 'not sent'), j.sent ? 'success' : 'warn'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } }}>Send test SMS</button>
              </div>
            </form>
          )
        )}

        {tab === 'danger' && (
          <div className="card danger-zone">
            <h3><ShieldAlert size={18} />Keys, reset and delete</h3>
            {t.id !== 'main' && (
              <div className="row between gap">
                <div><strong>Sync key</strong><p className="muted small">Owner-only key for a LAN hub or integrations. Staff never need it. Issuing a new one stops the old one.</p>
                  {shownKey && <div className="row gap"><code className="keybox grow">{shownKey}</code><button className="btn ghost" onClick={() => navigator.clipboard?.writeText(shownKey).then(() => toast('Copied'))}><Copy size={16} /></button></div>}</div>
                <button className="btn ghost" onClick={async () => (await ask({ title: 'Issue a new sync key?', danger: true, confirmText: 'New key' })) && doing(async () => { const j = await api(`/tenants/${t.id}/rotate-key`, {}); setShownKey(j.syncKey); }, 'New key issued')}><KeyRound size={16} />New sync key</button>
              </div>
            )}
            <div className="row between gap">
              <div><strong>Reset data</strong><p className="muted small">Erases sales, stock, customers, suppliers, finance, prescriptions, messages and logs on every device. Staff accounts, branches, settings and (optionally) medicines are kept. Download a backup first (Data tab).</p></div>
              <button className="btn ghost" onClick={async () => {
                const keepMedicines = await ask({ title: 'Keep the medicine list?', message: 'Keep medicines and prices (stock goes to zero)? Choose Cancel to erase medicines too.', confirmText: 'Keep medicines' });
                const typed = await askText({ title: `Type "${t.slug}" to erase ${t.name}'s data`, confirmText: 'Erase data' });
                if (typed) doing(async () => { const j = await api(`/tenants/${t.id}/reset`, { confirm: typed.trim(), keepMedicines }); toast(`${j.cleared} records erased`); });
              }}><Eraser size={16} />Reset data</button>
            </div>
            <div className="row between gap">
              <div><strong>Delete pharmacy</strong><p className="muted small">Removes the pharmacy, its web address, staff and all its data from the cloud. Cannot be undone. Download a backup first (Data tab → Export all).</p></div>
              <button className="btn danger-solid" onClick={deletePharmacy}><Trash2 size={16} />Delete pharmacy</button>
            </div>
          </div>
        )}
      </div>

      {userEdit && (
        <Modal title={userEdit._new ? `Add user to ${t.name}` : `Edit ${userEdit.name}`} onClose={() => setUserEdit(null)}>
          <form onSubmit={saveUser}>
            <div className="form-grid">
              <label className="field"><span>Full name</span><input required value={userEdit.name} onChange={(e) => setUserEdit({ ...userEdit, name: e.target.value })} /></label>
              <label className="field"><span>Email</span><input type="email" required value={userEdit.email} onChange={(e) => setUserEdit({ ...userEdit, email: e.target.value })} /></label>
              <label className="field"><span>Phone / WhatsApp</span><input value={userEdit.phone || ''} onChange={(e) => setUserEdit({ ...userEdit, phone: e.target.value })} /></label>
              <label className="field"><span>Role</span><select value={userEdit.role} onChange={(e) => setUserEdit({ ...userEdit, role: e.target.value })}>{[...new Set([...roles, userEdit.role])].map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              {d.branches.length > 1 && <label className="field"><span>Home branch</span><select value={userEdit.branchId || ''} onChange={(e) => setUserEdit({ ...userEdit, branchId: e.target.value })}><option value="">Any branch</option>{d.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
              {userEdit._new && <label className="field"><span>Temporary password</span><input required minLength={8} value={userEdit.password} onChange={(e) => setUserEdit({ ...userEdit, password: e.target.value })} /></label>}
            </div>
            {userEdit._new && <p className="muted small">Share the password privately. They will choose their own at first sign-in.</p>}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setUserEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
          </form>
        </Modal>
      )}
      {branchEdit && (
        <Modal title={branchEdit.id ? `Edit ${branchEdit.name}` : 'Add branch'} onClose={() => setBranchEdit(null)}>
          <form onSubmit={saveBranch}>
            <div className="form-grid">
              {[['name', 'Branch name', true], ['address', 'Address / town'], ['phone', 'Phone'], ['manager', 'Manager']].map(([k, l, req]) => (
                <label key={k} className="field"><span>{l}</span><input required={!!req} value={branchEdit[k] || ''} onChange={(e) => setBranchEdit({ ...branchEdit, [k]: e.target.value })} /></label>))}
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setBranchEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Look at, search, edit, add or delete any record; export and import a whole pharmacy */
function DataBrowser({ t, tables, api, onChanged }) {
  const [table, setTable] = useState(tables.find((x) => x.t === 'products')?.t || tables[0]?.t || 'products');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [res, setRes] = useState(null);
  const [edit, setEdit] = useState(null);
  const [progress, setProgress] = useState('');

  const load = async () => {
    setRes(null);
    try { setRes(await api(`/tenants/${t.id}/records?t=${encodeURIComponent(table)}&offset=${offset}&q=${encodeURIComponent(q)}`)); } catch (e) { toast(e.message, 'error'); setRes({ total: 0, rows: [] }); }
  };
  useEffect(() => { load(); }, [table, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = useMemo(() => {
    const keys = new Map();
    for (const r of res?.rows || []) for (const k of Object.keys(r.rec || {})) if (!['id', 'updatedAt', 'hash', 'salt', 'algo', 'iter', 'items', 'alloc'].includes(k)) keys.set(k, (keys.get(k) || 0) + 1);
    return [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  }, [res]);

  const saveRecord = async (e) => {
    e.preventDefault();
    let rec;
    try { rec = JSON.parse(edit.text); } catch { return toast('That is not valid JSON', 'error'); }
    try { await api(`/tenants/${t.id}/records`, { t: table, id: edit.id || rec.id || crypto.randomUUID(), rec }); toast('Saved. Devices get it at their next sync.'); setEdit(null); load(); onChanged(); } catch (err) { toast(err.message, 'error'); }
  };
  const deleteRecord = async (r) => {
    if (!(await ask({ title: `Delete this ${table} record?`, message: label(r.rec) || r.id, danger: true, confirmText: 'Delete' }))) return;
    try { await api(`/tenants/${t.id}/records`, { t: table, id: r.id, deleted: true }); toast('Deleted'); load(); onChanged(); } catch (err) { toast(err.message, 'error'); }
  };
  const exportAll = async () => {
    setProgress('Preparing download…');
    try { const j = await api(`/tenants/${t.id}/export`); downloadFile(`rxpos-${t.slug}-${today()}.json`, JSON.stringify(j), 'application/json'); } catch (e) { toast(e.message, 'error'); } finally { setProgress(''); }
  };
  const importFile = async (file) => {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('That file is not an RxPOS backup', 'error'); }
    const records = [];
    for (const [k, v] of Object.entries(data)) {
      if (k === 'settings' && v && typeof v === 'object') records.push({ t: 'settings', id: 'settings', rec: v });
      else if (Array.isArray(v) && /^[A-Za-z]{2,30}$/.test(k) && k !== 'license') for (const r of v) if (r?.id != null) records.push({ t: k, id: r.id, rec: r });
    }
    if (!records.length) return toast('No records found in that file', 'error');
    if (!(await ask({ title: `Import ${records.length.toLocaleString()} records into ${t.name}?`, message: 'Records with the same id are replaced; others are added. Nothing is deleted.', confirmText: 'Import' }))) return;
    try {
      for (let i = 0; i < records.length; i += 400) {
        setProgress(`Importing ${Math.min(i + 400, records.length).toLocaleString()} of ${records.length.toLocaleString()}…`);
        await api(`/tenants/${t.id}/records`, { records: records.slice(i, i + 400) });
      }
      toast(`${records.length.toLocaleString()} records imported`);
      onChanged(); load();
    } catch (e) { toast(e.message, 'error'); } finally { setProgress(''); }
  };

  return (
    <>
      <div className="card">
        <div className="row between gap">
          <div className="row gap">
            <select value={table} onChange={(e) => { setTable(e.target.value); setOffset(0); setQ(''); }}>
              {[...new Set([...tables.map((x) => x.t), 'products', 'customers', 'suppliers', 'sales', 'users', 'settings'])].sort().map((x) => <option key={x} value={x}>{x} ({tables.find((y) => y.t === x)?.n || 0})</option>)}
            </select>
            <form className="row gap" onSubmit={(e) => { e.preventDefault(); setOffset(0); load(); }}><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn ghost"><Search size={16} /></button></form>
          </div>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setEdit({ id: '', text: '{\n  \n}' })}><Plus size={16} />New record</button>
            <button className="btn ghost" onClick={exportAll}><Download size={16} />Export all</button>
            <label className="btn ghost"><Upload size={16} />Import<input type="file" accept=".json" hidden onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} /></label>
          </div>
        </div>
        {progress && <div className="notice">{progress}</div>}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Record</th>{cols.map((c) => <th key={c}>{c}</th>)}<th>Changed</th><th /></tr></thead>
          <tbody>
            {res?.rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{label(r.rec) || r.id}</strong><br /><small className="muted">{r.id}</small></td>
                {cols.map((c) => <td key={c} className="clip">{typeof r.rec?.[c] === 'object' ? JSON.stringify(r.rec[c]).slice(0, 40) : String(r.rec?.[c] ?? '')}</td>)}
                <td><small>{new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</small></td>
                <td className="actions">
                  <button className="btn sm ghost" onClick={() => { const { hash, salt, algo, iter, ...rest } = r.rec || {}; setEdit({ id: r.id, text: JSON.stringify(table === 'users' ? rest : r.rec, null, 2), hidden: table === 'users' ? { hash, salt, algo, iter } : null }); }}><Eye size={14} />Open</button>
                  <button className="btn sm danger" onClick={() => deleteRecord(r)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {res && !res.rows.length && <Empty colSpan={cols.length + 3}>No records</Empty>}
            {!res && <tr><td colSpan={cols.length + 3}><div className="skeleton" /></td></tr>}
          </tbody>
        </table>
        {res && res.total > 50 && (
          <div className="row between" style={{ padding: 10 }}>
            <span className="muted small">{offset + 1}–{Math.min(offset + 50, res.total)} of {res.total.toLocaleString()}</span>
            <div className="row gap"><button className="btn sm ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="btn sm ghost" disabled={offset + 50 >= res.total} onClick={() => setOffset(offset + 50)}>Next</button></div>
          </div>
        )}
      </div>
      {edit && (
        <Modal title={edit.id ? `${table} · ${edit.id}` : `New ${table} record`} onClose={() => setEdit(null)} wide>
          <form onSubmit={(e) => { if (edit.hidden) { try { const rec = JSON.parse(edit.text); edit.text = JSON.stringify({ ...rec, ...edit.hidden }); } catch {} } saveRecord(e); }}>
            <textarea className="json-edit" rows={18} spellCheck={false} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            {table === 'users' && <p className="muted small">Password fields are hidden. To change a password, add <code>"password": "new-password"</code> or use the Staff tab.</p>}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save record</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Owner sign-in: own password (or the master key), Google, GitHub */
function OwnerSignIn({ url, onSignedIn }) {
  const [cfg, setCfg] = useState(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const googleRef = useRef(null);

  useEffect(() => {
    // Back from "Sign in with GitHub": #/owner?ot=<session> or ?oerr=<message>
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if (q.get('ot') || q.get('oerr')) history.replaceState(null, '', location.pathname + '#/owner');
    if (q.get('ot')) { onSignedIn(q.get('ot')); return; }
    if (q.get('oerr')) setError(q.get('oerr'));
    ownerAuthConfig(url).then(setCfg).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Sign in with Google" button (Google Identity Services)
  useEffect(() => {
    if (!cfg?.google || !googleRef.current) return;
    const render = () => {
      window.google.accounts.id.initialize({ client_id: cfg.google.clientId, callback: async ({ credential }) => {
        setBusy(true); setError('');
        try { const j = await ownerGoogleLogin(url, credential); onSignedIn(j.token); } catch (e) { setError(e.message); } finally { setBusy(false); }
      } });
      window.google.accounts.id.renderButton(googleRef.current, { theme: 'filled_blue', size: 'large', text: 'continue_with', width: 300 });
    };
    if (window.google?.accounts?.id) { render(); return; }
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = render;
    sc.onerror = () => setError('Could not load Google sign-in. Check the internet connection.');
    document.head.appendChild(sc);
  }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const j = await ownerLogin(url, pw); onSignedIn(j.token, j.mustSetPassword); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-bg owner-login">
      <div className="auth-side" style={{ gridColumn: '1 / -1' }}>
        <form className="auth-card" onSubmit={submit}>
          <div className="brand big"><Logo size={40} /> RxPOS</div>
          <p className="muted center"><Crown size={14} /> Owner console: create and manage the pharmacies using RxPOS</p>
          <label className="field"><span>{cfg?.password ? 'Owner password' : 'Owner key'}</span>
            <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary block" disabled={busy}><LockKeyhole size={16} />{busy ? 'Checking…' : 'Sign in'}</button>
          {(cfg?.google || cfg?.github) && <div className="or-line"><span>or</span></div>}
          {cfg?.google && <div className="google-btn" ref={googleRef} />}
          {cfg?.github && <a className="btn ghost block" href={url + '/api/owner-auth/github/start'}><Github size={16} />Continue with GitHub</a>}
          <details className="muted small"><summary>Forgot the password?</summary>
            <p>{cfg?.google || cfg?.github ? 'Sign in with your linked Google or GitHub account above, then set a new password in Owner account. ' : ''}
              You can always sign in with the master key saved in <b>Documents\RxPOS-Data\RxPOS-OWNER-KEY.txt</b> on the setup PC (paste it in the box above).</p></details>
          <a className="muted small center" href="#/">← Back to RxPOS</a>
        </form>
      </div>
    </div>
  );
}

/** Owner account: own password, and Google / GitHub accounts that can sign in (recovery) */
function OwnerAccount({ api, onClose }) {
  const [a, setA] = useState(null);
  const [pw, setPw] = useState({ current: '', password: '', confirm: '' });
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/account').then((j) => { setA(j); setLinks({ email: j.email, googleEmail: j.googleEmail, googleClientId: j.googleClientId, githubLogin: j.githubLogin, githubClientId: j.githubClientId, githubClientSecret: '' }); })
      .catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (body, ok) => { setBusy(true); try { const j = await api('/account', body); setA(j); toast(ok); return true; } catch (e) { toast(e.message, 'error'); return false; } finally { setBusy(false); } };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => {});
  if (!a) return <Modal title="Owner account" onClose={onClose}><div className="skeleton" /></Modal>;
  const f = (k, lbl, extra = {}) => <label className="field"><span>{lbl}</span><input value={links[k] ?? ''} onChange={(e) => setLinks({ ...links, [k]: e.target.value })} autoComplete="off" {...extra} /></label>;
  return (
    <Modal title="Owner account" onClose={onClose} wide>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save({ email: links.email || '' }, links.email ? 'Owner email saved: sign in on the main page with it and your owner password' : 'Owner email removed'); }}>
        <h3><Mail size={17} />Owner email {a.email ? <span className="badge ok">on</span> : <span className="badge">off</span>}</h3>
        <p className="muted small">With this email and your owner password you can sign in on the main page ({location.host}) and go straight to managing your pharmacies. If you also work at a pharmacy with the same email, your password decides where you go (or you choose when they are the same).</p>
        <div className="form-grid">{f('email', 'Owner email', { type: 'email', placeholder: 'you@gmail.com' })}</div>
        <div className="form-actions"><button className="btn primary" disabled={busy}>Save email</button></div>
      </form>

      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.password !== pw.confirm) { toast('The two new passwords do not match', 'error'); return; }
        if (await save({ password: pw.password, current: pw.current }, 'Owner password saved. Use it to sign in from now on.')) setPw({ current: '', password: '', confirm: '' });
      }}>
        <h3><LockKeyhole size={17} />{a.hasPassword ? 'Change your owner password' : 'Set your own owner password'}</h3>
        <div className="form-grid">
          {a.hasPassword && <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>}
          <label className="field"><span>New password (10+ characters)</span><input type="password" autoComplete="new-password" minLength={10} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required /></label>
          <label className="field"><span>Type it again</span><input type="password" autoComplete="new-password" minLength={10} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></label>
        </div>
        <div className="form-actions"><button className="btn primary" disabled={busy}>Save password</button></div>
      </form>

      <form className="stack" onSubmit={(e) => { e.preventDefault(); save({ googleEmail: links.googleEmail, googleClientId: links.googleClientId }, 'Google sign-in saved'); }}>
        <h3><Mail size={17} />Sign in with Google (Gmail) {a.googleEmail && a.googleClientId ? <span className="badge ok">on</span> : <span className="badge">off</span>}</h3>
        <div className="form-grid">
          {f('googleEmail', 'Your Gmail / Google account', { type: 'email', placeholder: 'you@gmail.com' })}
          {f('googleClientId', 'Google OAuth client ID', { placeholder: '…apps.googleusercontent.com' })}
        </div>
        <details className="muted small"><summary>How to get the Google client ID (free, once)</summary>
          <ol><li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud console → APIs & Services → Credentials</a> (sign in with your Google account; create a project named RxPOS if asked).</li>
            <li>OAuth consent screen: External, app name RxPOS, your email. Add yourself as a test user (or publish the app).</li>
            <li>Create credentials → OAuth client ID → Web application. Authorised JavaScript origins: <code>{a.origin}</code> <button type="button" className="link-btn" onClick={() => copy(a.origin)}>copy</button></li>
            <li>Copy the Client ID into the box above and save.</li></ol></details>
        <div className="form-actions"><button className="btn primary" disabled={busy}>Save Google sign-in</button></div>
      </form>

      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        const body = { githubLogin: links.githubLogin, githubClientId: links.githubClientId };
        if (links.githubClientSecret) body.githubClientSecret = links.githubClientSecret;
        save(body, 'GitHub sign-in saved').then((ok) => ok && setLinks((l) => ({ ...l, githubClientSecret: '' })));
      }}>
        <h3><Github size={17} />Sign in with GitHub {a.githubLogin && a.githubClientId && a.githubSecretSet ? <span className="badge ok">on</span> : <span className="badge">off</span>}</h3>
        <div className="form-grid">
          {f('githubLogin', 'Your GitHub username', { placeholder: 'e.g. DeeJayKyle' })}
          {f('githubClientId', 'GitHub OAuth app client ID')}
          {f('githubClientSecret', a.githubSecretSet ? 'Client secret (saved; type to replace)' : 'GitHub OAuth app client secret', { type: 'password' })}
        </div>
        <details className="muted small"><summary>How to create the GitHub OAuth app (free, once)</summary>
          <ol><li>Open <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub → Settings → Developer settings → OAuth Apps</a> → New OAuth App.</li>
            <li>Name RxPOS, Homepage URL <code>{a.origin}</code>, Authorization callback URL <code>{a.githubCallback}</code> <button type="button" className="link-btn" onClick={() => copy(a.githubCallback)}>copy</button></li>
            <li>Register, copy the Client ID, then Generate a new client secret and paste both above.</li></ol></details>
        <div className="form-actions"><button className="btn primary" disabled={busy}>Save GitHub sign-in</button></div>
      </form>
      <p className="muted small">The master key in <b>RxPOS-OWNER-KEY.txt</b> always works as an emergency key. Keep that file somewhere safe.</p>
    </Modal>
  );
}

/** Make an uploaded logo small (max 256 px PNG) so it loads fast everywhere */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml' && file.size < 120000) { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('That file is not an image'));
    img.src = URL.createObjectURL(file);
  });
}

/** Owner: the pharmacy's logo and the colour themes its staff may choose from */
function BrandingTab({ t, onSave, busy }) {
  const b = t.branding || {};
  const [logo, setLogo] = useState(b.logo || '');
  const [themes, setThemes] = useState(() => new Set(b.themes?.length ? b.themes : THEMES.map((x) => x.id)));
  const [def, setDef] = useState(b.defaultTheme || '');
  const pick = async (file) => { try { const d = await shrinkImage(file); if (d.length > 200000) throw new Error('That logo is too large even after resizing. Use a simpler image.'); setLogo(d); } catch (e) { toast(e.message, 'error'); } };
  const toggle = (id) => { const n = new Set(themes); n.has(id) ? n.delete(id) : n.add(id); setThemes(n); };
  const all = themes.size === THEMES.length;
  return (
    <div className="stack">
      <div className="card">
        <h3>Logo</h3>
        <div className="row gap brand-row">
          <div className="logo-preview">{logo ? <img src={logo} alt="Pharmacy logo" /> : <Logo size={64} />}</div>
          <div className="stack">
            <p className="muted small">Shown on the pharmacy's sign-in page, the app menu and printed receipts. PNG, JPG or SVG; square works best.</p>
            <div className="row gap">
              <label className="btn ghost"><Upload size={16} />Choose image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => e.target.files[0] && pick(e.target.files[0])} /></label>
              {logo && <button className="btn ghost" onClick={() => setLogo('')}><Trash2 size={16} />Use the RxPOS logo</button>}
            </div>
          </div>
        </div>
        <div className="form-actions"><button className="btn primary" disabled={busy || logo === (b.logo || '')} onClick={() => onSave({ logo }, 'Logo saved. Devices show it at their next sync.')}>Save logo</button></div>
      </div>
      <div className="card">
        <div className="row between"><h3>Themes this pharmacy can use</h3>
          <button className="btn sm ghost" onClick={() => setThemes(all ? new Set(['light', 'dark', 'clinic-blue']) : new Set(THEMES.map((x) => x.id)))}>{all ? 'Choose a few' : 'Allow all'}</button></div>
        <p className="muted small">Staff pick from these with the palette button. Allow at least 3. {themes.size} of {THEMES.length} allowed.</p>
        <div className="theme-grid">
          {THEMES.map((x) => (
            <label key={x.id} className={'theme-card' + (themes.has(x.id) ? ' on' : '')}>
              <input type="checkbox" checked={themes.has(x.id)} onChange={() => toggle(x.id)} />
              <span className="theme-demo" style={{ background: x.c.bg, borderColor: x.c.borderStrong }}>
                <i style={{ background: x.c.sidebar }} /><b style={{ background: x.c.surface, borderColor: x.c.border }}><em style={{ background: `linear-gradient(135deg, ${x.c.primary}, ${x.c.primary2})` }} /><u style={{ background: x.c.muted }} /></b>
              </span>
              <span className="theme-name">{x.name}<small className="muted">{x.base}{x.inspired && x.inspired !== x.name ? ' · ' + x.inspired : ''}</small></span>
            </label>
          ))}
        </div>
        <div className="form-grid">
          <label className="field"><span>Default theme for new devices</span>
            <select value={def} onChange={(e) => setDef(e.target.value)}><option value="">Device decides (light / dark)</option>{THEMES.filter((x) => themes.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <div className="form-actions"><button className="btn primary" disabled={busy || themes.size < 3} onClick={() => onSave({ themes: all ? [] : [...themes], defaultTheme: themes.has(def) ? def : '' }, 'Themes saved')}>Save themes</button></div>
      </div>
    </div>
  );
}

/** Errors reported by this pharmacy's devices (src/crash.js), the same error grouped with how often and where */
function DeviceErrors({ t, api }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api('/tenants/' + t.id + '/errors').then((r) => setList(r.errors || [])).catch((e) => { toast(e.message, 'error'); setList([]); });
  useEffect(() => { load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = async (k) => { await api('/tenants/' + t.id + '/errors', { clear: true, ...(k ? { k } : {}) }); load(); };
  if (!list) return <div className="card"><div className="skeleton" /></div>;
  return (
    <div className="card table-wrap">
      <div className="row between gap"><p className="muted small">Errors on this pharmacy's devices, reported privately to the RxPOS cloud (no sales or patient data). The same error is one row.</p>
        {list.length > 0 && <button className="btn sm ghost" onClick={() => clear()}>Clear all</button>}</div>
      <table>
        <thead><tr><th>Error</th><th>Page</th><th>Device</th><th className="num">Times</th><th>Last seen</th><th /></tr></thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.k}>
              <td><strong>{e.message}</strong><br /><small className="muted">{e.kind} · build {e.build || '—'}</small>
                {open === e.k && <pre className="error-stack">{e.stack || 'No stack'}</pre>}</td>
              <td>{e.page}</td><td>{e.platform}</td><td className="num">{e.count}</td>
              <td>{new Date(e.last_at).toLocaleString()}<br /><small className="muted">first {new Date(e.first_at).toLocaleDateString()}</small></td>
              <td className="actions"><button className="btn sm ghost" onClick={() => setOpen(open === e.k ? null : e.k)}>{open === e.k ? 'Hide' : 'Details'}</button><button className="btn sm ghost" onClick={() => clear(e.k)}>Fixed</button></td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={6} className="empty">No errors reported. 🎉</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
