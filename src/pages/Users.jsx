import { useState } from 'react';
import { UserPlus, ShieldCheck, KeyRound, Trash2, Plus, Copy } from 'lucide-react';
import { useStore, makePassword, uid, put, del, audit, normalizePhone } from '../store.jsx';
import { PERMISSIONS, rolesOf, DEFAULT_ROLES } from '../access.js';
import { Modal, Tabs, Empty } from '../ui.jsx';
import { ask, askText, toast } from '../feedback.jsx';
import { twoStep } from '../cloud.js';
import { PasswordInput } from '../password.jsx';

/** Staff accounts and roles. Every person signs in with their own email; roles decide what they can do. */
export default function Users() {
  const { db, update, user, branchId, syncCfg } = useStore();
  const [tab, setTab] = useState('users');
  const [edit, setEdit] = useState(null);
  const [roleEdit, setRoleEdit] = useState(null);
  const allRoles = rolesOf(db);
  // Administrator accounts are created by the RxPOS owner; here admins manage everyone else
  const roles = (u) => allRoles.filter((r) => r.id !== 'admin' || u?.role === 'admin');
  const isAdminRow = (u) => u.role === 'admin' && u.id !== user.id;
  const roleName = (id) => allRoles.find((r) => r.id === id)?.name || id;

  const saveUser = async (e) => {
    e.preventDefault();
    const email = edit.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email && u.id !== edit.id)) return toast('Another user already has that email', 'error');
    if (edit._new && edit.password.length < 8) return toast('Use a password of at least 8 characters', 'error');
    const { _new, password, ...rec } = edit;
    const pw = _new ? await makePassword(password) : {};
    update((d) => {
      put(d, 'users', { ...(d.users.find((u) => u.id === rec.id) || {}), ...rec, email, phone: rec.phone?.trim(), whatsapp: rec.whatsapp?.trim(), ...pw });
      audit(d, user, _new ? 'User added' : 'User updated', `${rec.name} (${roleName(rec.role)})`, branchId);
    });
    toast(_new ? `${rec.name} can now sign in` : 'User saved');
    setEdit(null);
  };

  const resetTwoStep = async (u) => {
    if (!(await ask({ title: `Switch off two-step sign-in for ${u.name}?`, message: 'Only if they lost their phone. They sign in with the password and can set it up again.', confirmText: 'Switch off', danger: true }))) return;
    try { await twoStep(syncCfg, '/reset', { uid: u.id }); toast(`Two-step sign-in switched off for ${u.name}`); } catch (e) { toast(e.message, 'error'); }
  };
  const resetPassword = async (u) => {
    const pw = await askText({ title: `New password for ${u.name}`, type: 'password', minLength: 8, confirmText: 'Set password' });
    if (!pw) return;
    const fields = await makePassword(pw);
    update((d) => { put(d, 'users', { ...u, ...fields }); audit(d, user, 'Password reset', u.name, branchId); });
    toast('Password updated. Tell the user their new password.');
  };

  const removeUser = async (u) => {
    if (!(await ask({ title: `Delete ${u.name}?`, message: 'They will no longer be able to sign in on any device. Their past sales stay in the records.', confirmText: 'Delete user', danger: true }))) return;
    update((d) => { del(d, 'users', u.id); audit(d, user, 'User deleted', u.name, branchId); });
  };

  const saveRole = (e) => {
    e.preventDefault();
    const id = roleEdit.id || roleEdit.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return toast('Give the role a name', 'warn');
    if (roleEdit._new && allRoles.some((r) => r.id === id)) return toast('A role with that name exists', 'error');
    update((d) => {
      put(d, 'roles', { id, name: roleEdit.name.trim(), permissions: [...roleEdit.permissions] });
      audit(d, user, roleEdit._new ? 'Role created' : 'Role permissions changed', `${roleEdit.name}: ${roleEdit.permissions.length} permissions`, branchId);
    });
    toast('Role saved. It applies on every device after the next sync.');
    setRoleEdit(null);
  };
  const deleteRole = async (r) => {
    if (db.users.some((u) => u.role === r.id)) return toast(`Some users still have the ${r.name} role`, 'warn');
    if (!(await ask({ title: `Delete the ${r.name} role?`, danger: true, confirmText: 'Delete' }))) return;
    update((d) => { del(d, 'roles', r.id); audit(d, user, 'Role deleted', r.name, branchId); });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Users & Roles</h1><div className="sub">Each person signs in with their own account. Roles decide what they can see and do.</div></div>
        {tab === 'users'
          ? <button className="btn primary" onClick={() => setEdit({ _new: true, id: uid(), name: '', email: '', phone: '', whatsapp: '', role: 'cashier', branchId, password: '' })}><UserPlus size={16} />Add user</button>
          : <button className="btn primary" onClick={() => setRoleEdit({ _new: true, name: '', permissions: new Set(['pos.sell', 'sales.view', 'shifts', 'customers', 'chat']) })}><Plus size={16} />New role</button>}
      </div>
      <Tabs tabs={[['users', `Users (${db.users.length})`], ['roles', `Roles & permissions (${allRoles.length})`]]} value={tab} onChange={setTab} />

      {tab === 'users' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email (sign-in & recovery)</th><th>Phone / WhatsApp</th><th>Role</th>{db.branches.length > 1 && <th>Branch</th>}<th>Status</th><th /></tr></thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'dim' : ''}>
                  <td><strong>{u.name}</strong>{u.id === user.id && <span className="badge">you</span>}{u.twoFactor && <span className="badge ok" title="Two-step sign-in is on"><ShieldCheck size={11} />2-step</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || '—'}{u.whatsapp && u.whatsapp !== u.phone ? <><br /><small className="muted">WA {u.whatsapp}</small></> : null}</td>
                  <td><span className="badge">{roleName(u.role)}</span></td>
                  {db.branches.length > 1 && <td>{db.branches.find((b) => b.id === u.branchId)?.name || 'Any'}</td>}
                  <td>{u.disabled ? 'Disabled' : 'Active'}</td>
                  <td className="actions">
                    {isAdminRow(u) ? <small className="muted">Managed by RxPOS provider</small> : <>
                    <button className="btn sm ghost" onClick={() => setEdit({ ...u, password: '' })}>Edit</button>
                    <button className="btn sm ghost" onClick={() => resetPassword(u)}><KeyRound size={14} />Password</button>
                    </>}
                    {u.id !== user.id && !isAdminRow(u) && <button className="btn sm ghost" onClick={() => update((d) => { put(d, 'users', { ...u, disabled: !u.disabled }); audit(d, user, u.disabled ? 'User enabled' : 'User disabled', u.name, branchId); })}>{u.disabled ? 'Enable' : 'Disable'}</button>}
                    {u.twoFactor && u.id !== user.id && <button className="btn sm ghost" title="They lost their phone: switch two-step sign-in off so they can sign in with the password, then set it up again" onClick={() => resetTwoStep(u)}>Reset 2-step</button>}
                    {u.id !== user.id && !isAdminRow(u) && <button className="btn sm danger" title="Delete" onClick={() => removeUser(u)}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
              {!db.users.length && <Empty colSpan={7}>No users yet</Empty>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'roles' && (
        <div className="branch-grid">
          {allRoles.map((r) => (
            <div key={r.id} className="card branch-card">
              <div className="row between"><h3><ShieldCheck size={18} />{r.name}</h3>{r.builtIn && <span className="badge">built-in</span>}</div>
              <p className="muted small">{r.id === 'admin' ? 'Everything, always.' : `${r.permissions.length} permissions`} · {db.users.filter((u) => u.role === r.id).length} user(s)</p>
              <div className="row gap">
                {r.id !== 'admin' && <button className="btn sm ghost" onClick={() => setRoleEdit({ ...r, permissions: new Set(r.permissions) })}>Edit permissions</button>}
                <button className="btn sm ghost" title="Copy as a new role" onClick={() => setRoleEdit({ _new: true, name: r.name + ' (copy)', permissions: new Set(r.permissions) })}><Copy size={14} /></button>
                {!r.builtIn && <button className="btn sm danger" onClick={() => deleteRole(r)}><Trash2 size={14} /></button>}
                {r.builtIn && r.id !== 'admin' && db.roles.some((x) => x.id === r.id) && (
                  <button className="btn sm ghost" onClick={() => update((d) => { put(d, 'roles', { ...DEFAULT_ROLES.find((x) => x.id === r.id) }); })}>Reset to default</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal title={edit._new ? 'Add user' : `Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <form onSubmit={saveUser}>
            <div className="form-grid">
              <label className="field"><span>Full name</span><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="field"><span>Email (Gmail works) – used to sign in and recover the password</span><input type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <label className="field"><span>Phone (SMS recovery)</span><input inputMode="tel" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="07XX XXX XXX" /></label>
              <label className="field"><span>WhatsApp number</span><input inputMode="tel" value={edit.whatsapp || ''} onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })} placeholder="Same as phone if empty" /></label>
              <label className="field"><span>Role</span>
                <select value={edit.role} disabled={edit.id === user.id} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{roles(db.users.find((u) => u.id === edit.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
              {db.branches.length > 1 && (
                <label className="field"><span>Home branch</span>
                  <select value={edit.branchId || ''} onChange={(e) => setEdit({ ...edit, branchId: e.target.value })}><option value="">Any branch</option>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              )}
              {edit._new && <label className="field"><span>Password (8+ characters)</span><PasswordInput autoComplete="new-password" required value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></label>}
            </div>
            {edit.phone && normalizePhone(edit.phone).length < 12 && <p className="text-warn small">Check the phone number. It should look like 0772 123 456.</p>}
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">{edit._new ? 'Add user' : 'Save'}</button></div>
          </form>
        </Modal>
      )}

      {roleEdit && (
        <Modal title={roleEdit._new ? 'New role' : `Permissions – ${roleEdit.name}`} onClose={() => setRoleEdit(null)} wide>
          <form onSubmit={saveRole}>
            <label className="field"><span>Role name</span><input required value={roleEdit.name} disabled={!roleEdit._new && roleEdit.builtIn} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} placeholder="e.g. Store keeper" /></label>
            <div className="perm-grid">
              {PERMISSIONS.map(([group, list]) => (
                <div key={group} className="perm-group">
                  <div className="row between"><strong>{group}</strong>
                    <button type="button" className="btn sm ghost" onClick={() => { const all = list.every(([k]) => roleEdit.permissions.has(k)); const s = new Set(roleEdit.permissions); list.forEach(([k]) => (all ? s.delete(k) : s.add(k))); setRoleEdit({ ...roleEdit, permissions: s }); }}>{list.every(([k]) => roleEdit.permissions.has(k)) ? 'None' : 'All'}</button>
                  </div>
                  {list.map(([k, label]) => (
                    <label key={k} className="field check"><input type="checkbox" checked={roleEdit.permissions.has(k)} onChange={(e) => { const s = new Set(roleEdit.permissions); e.target.checked ? s.add(k) : s.delete(k); setRoleEdit({ ...roleEdit, permissions: s }); }} /><span>{label}</span></label>
                  ))}
                </div>
              ))}
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setRoleEdit(null)}>Cancel</button><button className="btn primary">Save role</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
