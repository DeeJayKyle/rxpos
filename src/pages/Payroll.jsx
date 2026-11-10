// Payroll & HR (step 26, copied from the Flutter app's features/payroll: the same records, tables and rules in
// src/payroll.js): the staff on the payroll (who may or may not use the app), their daily attendance and leave, salary
// advances, and monthly payroll runs with Uganda PAYE and NSSF. Paying a run, or giving an advance, records ordinary
// expenses (category "Salaries"), so the cash book, the reports and the profit include them. Needs the Payroll
// permission (the cloud sends these tables to no one else).
import { useMemo, useState } from 'react';
import { UserPlus, Calculator, CheckCircle2, Download, HandCoins } from 'lucide-react';
import { Modal, RecordForm, Tabs } from '../ui.jsx';
import { useStore, uid, put, audit, today, now, downloadFile, toCSV } from '../store.jsx';
import { toast } from '../feedback.jsx';
import { CASH } from '../finance.js';
import { ATTENDANCE_KINDS, SALARIES_CATEGORY, payLine, payrollTotals } from '../payroll.js';

const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'];
const month0 = () => today().slice(0, 7);

export default function Payroll() {
  const { db, update, user, branchId, fmt } = useStore();
  const [tab, setTab] = useState('staff');
  const [edit, setEdit] = useState(null);
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(month0());
  const [form, setForm] = useState(null); // { kind: 'advance' | 'prepare' | 'pay' | 'overtime', ... }
  const staff = useMemo(() => [...(db.employees || [])].sort((a, b) => String(a.name).localeCompare(b.name)), [db.employees]);
  const active = staff.filter((e) => e.active !== false);
  const attendance = db.attendance || [], advances = db.salaryAdvances || [], runs = db.payrolls || [];
  const banks = db.banks.map((b) => ({ value: b.id, label: b.name }));
  const nameOf = (id) => staff.find((e) => e.id === id)?.name || '—';
  const category = (d) => d.expenseCategories.find((c) => String(c.name).toLowerCase() === SALARIES_CATEGORY.toLowerCase()) || put(d, 'expenseCategories', { id: uid(), name: SALARIES_CATEGORY });

  // ---- staff ----
  const saveStaff = async (rec) => {
    await update((d) => { put(d, 'employees', { ...rec, basicSalary: Number(rec.basicSalary) || 0, allowances: Number(rec.allowances) || 0, overtimeRate: Number(rec.overtimeRate) || 0 }); audit(d, user, rec._new ? 'Staff added' : 'Staff changed', rec.name, branchId); });
    setEdit(null); toast(`${rec.name} saved`);
  };
  // ---- attendance ----
  const att = (id, date = day) => attendance.find((a) => a.employeeId === id && a.date === date);
  const mark = (e, status, overtimeHours) => update((d) => put(d, 'attendance', { id: `${e.id}-${day}`, employeeId: e.id, date: day, status, overtimeHours: overtimeHours ?? Number(att(e.id)?.overtimeHours || 0), note: '', by: user.name }));
  const everyonePresent = () => update((d) => { for (const e of active) if (!att(e.id)) put(d, 'attendance', { id: `${e.id}-${day}`, employeeId: e.id, date: day, status: 'present', overtimeHours: 0, note: '', by: user.name }); });
  const monthCount = (id, ...kinds) => attendance.filter((a) => a.employeeId === id && String(a.date).startsWith(day.slice(0, 7)) && kinds.includes(a.status)).length;
  // ---- advances ----
  const giveAdvance = async (v) => {
    const e = staff.find((x) => x.id === v.employeeId), amount = Number(v.amount) || 0;
    if (!e) return toast('Choose who the advance is for', 'warn');
    if (!(amount > 0)) return toast('An advance must be more than nothing', 'warn');
    await update((d) => {
      const cat = category(d);
      const exp = put(d, 'expenses', { id: uid(), date: v.date, categoryId: cat.id, description: `Salary advance: ${e.name}`, amount, method: v.method || 'Cash', bankId: v.bankId || CASH, payee: e.name, recordedBy: user.name });
      put(d, 'salaryAdvances', { id: uid(), employeeId: e.id, date: v.date, amount, note: v.note || '', expenseId: exp.id, by: user.name });
      audit(d, user, 'Salary advance', `${e.name}: ${amount}`, branchId);
    });
    setForm(null); toast(`Advance of ${fmt(amount)} given to ${e.name}`);
  };
  // ---- payroll ----
  const run = runs.find((r) => r.month === month) || null;
  const paid = run?.status === 'paid';
  const lines = run?.lines || [];
  const t = payrollTotals(lines);
  const prepare = async (v) => {
    const workingDays = Number(v.workingDays) || 26, deductAbsence = !!v.deductAbsence;
    const ls = active.map((e) => payLine(e, month, { attendance, advances, workingDays, deductAbsence }));
    if (!ls.length) return toast('There is nobody active on the staff list', 'warn');
    await update((d) => {
      put(d, 'payrolls', { id: run?.id || uid(), month, status: 'draft', workingDays, deductAbsence, lines: ls, createdBy: run?.createdBy || user.name, date: run?.date || now() });
      audit(d, user, run ? 'Payroll recalculated' : 'Payroll prepared', `${month}: ${ls.length} staff`, branchId);
    });
    setForm(null); toast(`${month} payroll ${run ? 'recalculated' : 'prepared'}`);
  };
  const pay = async (v) => {
    if (!run || paid) return;
    await update((d) => {
      const cat = category(d);
      const expense = (description, amount, payee) => put(d, 'expenses', { id: uid(), date: v.date, categoryId: cat.id, description, amount, method: v.method || 'Cash', bankId: v.bankId || CASH, payee, recordedBy: user.name });
      const payE = expense(`Salaries ${month} (${lines.length} staff)`, t.net, 'Staff');
      const taxE = t.statutory > 0 ? expense(`PAYE & NSSF ${month}`, t.statutory, 'URA / NSSF') : null;
      const ids = new Set(lines.flatMap((l) => l.advanceIds || []));
      for (const a of d.salaryAdvances) if (ids.has(a.id)) put(d, 'salaryAdvances', { ...a, payrollId: run.id });
      put(d, 'payrolls', { ...run, status: 'paid', paidAt: now(), paidOn: v.date, paidBy: user.name, bankId: v.bankId || CASH, method: v.method || 'Cash', expenseIds: [payE.id, ...(taxE ? [taxE.id] : [])] });
      audit(d, user, 'Payroll paid', `${month}: net ${t.net}, PAYE & NSSF ${t.statutory}`, branchId);
    });
    setForm(null); toast(`${month} payroll paid: recorded in Expenses`);
  };
  const exportRun = () => downloadFile(`payroll-${month}.csv`, toCSV(lines.map((l) => ({ name: l.name, jobTitle: l.jobTitle, basic: l.basic, allowances: l.allowances, overtime: l.overtime, absence: l.absence, gross: l.gross, paye: l.paye, nssfEmployee: l.nssfEmployee, nssfEmployer: l.nssfEmployer, advances: l.advances, net: l.net }))), 'text/csv');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Payroll &amp; HR</h1><div className="sub">{active.length} on the payroll · {fmt(active.reduce((a, e) => a + (Number(e.basicSalary) || 0) + (Number(e.allowances) || 0), 0))} a month before overtime</div></div>
      </div>
      <Tabs tabs={[['staff', 'Staff'], ['attendance', 'Attendance & leave'], ['advances', 'Salary advances'], ['payroll', 'Payroll']]} value={tab} onChange={setTab} />

      {tab === 'staff' && (
        <div className="card table-wrap">
          <div className="row between pad"><span className="muted">The people paid by the pharmacy (they need not use the app).</span>
            <span className="row gap"><button className="btn ghost" onClick={() => downloadFile('staff.csv', toCSV(staff.map(({ updatedAt, ...e }) => e)), 'text/csv')}><Download size={16} />CSV</button>
              <button className="btn primary" onClick={() => setEdit({ _new: true, id: uid(), name: '', jobTitle: '', basicSalary: 0, allowances: 0, overtimeRate: 0, paye: true, nssf: true, active: true, paymentMethod: 'Cash' })}><UserPlus size={16} />Add staff member</button></span></div>
          <table>
            <thead><tr><th>Name</th><th>Job</th><th className="num">Basic</th><th className="num">Allowances</th><th>Deductions</th><th /></tr></thead>
            <tbody>
              {staff.map((e) => (
                <tr key={e.id} className={e.active === false ? 'dim' : ''} onDoubleClick={() => setEdit(e)}>
                  <td><strong>{e.name}</strong>{e.active === false && <small> · left</small>}<br /><small className="muted">{e.phone}</small></td><td>{e.jobTitle}</td>
                  <td className="num">{fmt(e.basicSalary)}</td><td className="num">{fmt(e.allowances || 0)}</td>
                  <td className="muted">{[e.paye !== false && 'PAYE', e.nssf !== false && 'NSSF'].filter(Boolean).join(' · ') || 'none'}</td>
                  <td className="actions"><button className="btn sm ghost" onClick={() => setEdit(e)}>Edit</button></td>
                </tr>
              ))}
              {!staff.length && <tr><td colSpan={6} className="empty">No staff yet. Add the people the pharmacy pays.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card">
          <div className="row gap wrap pad">
            <label className="field inline"><span>Day</span><input type="date" aria-label="Attendance day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
            <button className="btn" onClick={everyonePresent} disabled={!active.length}>Everyone else present</button>
          </div>
          {active.map((e) => (
            <div key={e.id} className="row gap wrap attendance-row">
              <strong className="att-name">{e.name}</strong>
              {ATTENDANCE_KINDS.map(([k, l]) => <button type="button" key={k} className={'chip' + (att(e.id)?.status === k ? ' active' : '')} aria-pressed={att(e.id)?.status === k} onClick={() => mark(e, k)}>{l}</button>)}
              {Number(e.overtimeRate) > 0 && <button type="button" className="chip" onClick={() => setForm({ kind: 'overtime', e, h: att(e.id)?.overtimeHours || 0 })}>Overtime {att(e.id)?.overtimeHours || 0} h</button>}
              <small className="muted">{day.slice(0, 7)}: {monthCount(e.id, 'present')} present, {monthCount(e.id, 'absent')} absent, {monthCount(e.id, 'leave', 'sick')} leave/sick</small>
            </div>
          ))}
          {!active.length && <p className="empty">Add staff first, then mark each day here.</p>}
        </div>
      )}

      {tab === 'advances' && (
        <div className="card table-wrap">
          <div className="row between pad"><span className="muted">An advance is paid now (an expense) and taken back from the next payroll.</span>
            <button className="btn primary" disabled={!active.length} onClick={() => setForm({ kind: 'advance' })}><HandCoins size={16} />Give an advance</button></div>
          <table>
            <thead><tr><th>Date</th><th>To</th><th>Note</th><th className="num">Amount</th><th>Taken back</th></tr></thead>
            <tbody>
              {[...advances].sort((a, b) => String(b.date).localeCompare(a.date)).map((a) => (
                <tr key={a.id}><td>{a.date}</td><td>{nameOf(a.employeeId)}</td><td className="muted">{a.note}</td><td className="num">{fmt(a.amount)}</td><td>{a.payrollId ? runs.find((r) => r.id === a.payrollId)?.month || 'yes' : <span className="badge warn">open</span>}</td></tr>
              ))}
              {!advances.length && <tr><td colSpan={5} className="empty">No advances</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="card table-wrap">
          <div className="row gap wrap pad">
            <label className="field inline"><span>Month</span><input type="month" aria-label="Payroll month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
            {!paid && <button className="btn primary" disabled={!active.length} onClick={() => setForm({ kind: 'prepare', workingDays: run?.workingDays || 26, deductAbsence: !!run?.deductAbsence })}><Calculator size={16} />{run ? 'Recalculate' : 'Prepare'}</button>}
            {run && !paid && <button className="btn" onClick={() => setForm({ kind: 'pay', date: today(), bankId: CASH, method: 'Cash' })}><CheckCircle2 size={16} />Mark as paid</button>}
            {run && <button className="btn ghost" onClick={exportRun}><Download size={16} />CSV</button>}
            {run && <span className={'badge ' + (paid ? 'ok' : 'warn')}>{paid ? `paid on ${run.paidOn}` : 'draft'}</span>}
          </div>
          {run ? (
            <table>
              <thead><tr><th>Name</th><th className="num">Gross</th><th className="num">PAYE</th><th className="num">NSSF (5%)</th><th className="num">Advances</th><th className="num">Net pay</th><th className="num">NSSF (10%, employer)</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.employeeId}><td><strong>{l.name}</strong>{l.jobTitle && <small className="muted"> · {l.jobTitle}</small>}<br /><small className="muted">basic {fmt(l.basic)}{l.allowances ? ` + allowances ${fmt(l.allowances)}` : ''}{l.overtime ? ` + overtime ${fmt(l.overtime)} (${l.overtimeHours} h)` : ''}{l.absence ? ` − ${l.unpaidDays} unpaid days ${fmt(l.absence)}` : ''}</small></td>
                    <td className="num">{fmt(l.gross)}</td><td className="num">{fmt(l.paye)}</td><td className="num">{fmt(l.nssfEmployee)}</td><td className="num">{fmt(l.advances)}</td><td className="num"><strong>{fmt(l.net)}</strong></td><td className="num">{fmt(l.nssfEmployer)}</td></tr>
                ))}
                <tr className="total-row"><td>Total · costs the pharmacy {fmt(t.cost)} · owed to URA and NSSF {fmt(t.statutory)}</td><td className="num">{fmt(t.gross)}</td><td className="num">{fmt(t.paye)}</td><td className="num">{fmt(t.nssfEmployee)}</td><td className="num">{fmt(t.advances)}</td><td className="num"><strong>{fmt(t.net)}</strong></td><td className="num">{fmt(t.nssfEmployer)}</td></tr>
              </tbody>
            </table>
          ) : <p className="empty">No payroll for {month} yet. Prepare it from the staff list, attendance and open advances.</p>}
        </div>
      )}

      {edit && (
        <Modal title={edit._new ? 'New staff member' : `Edit ${edit.name}`} onClose={() => setEdit(null)} wide>
          <RecordForm initial={edit} onCancel={() => setEdit(null)} onSave={({ _new, ...rec }) => saveStaff({ ...rec, _new })} saveLabel="Save" fields={[
            { key: 'name', label: 'Full name', required: true }, { key: 'jobTitle', label: 'Job title' }, { key: 'phone', label: 'Phone' }, { key: 'startDate', label: 'Started on', type: 'date' },
            { key: 'basicSalary', label: 'Basic salary a month', type: 'number', required: true }, { key: 'allowances', label: 'Allowances a month (transport, lunch…)', type: 'number' },
            { key: 'overtimeRate', label: 'Overtime pay an hour', type: 'number' }, { key: 'paye', label: 'Deduct PAYE (Uganda bands)', type: 'checkbox' },
            { key: 'nssf', label: 'Deduct NSSF (5% employee, 10% employer)', type: 'checkbox' }, { key: 'nssfNo', label: 'NSSF number' }, { key: 'tin', label: 'TIN' },
            { key: 'paymentMethod', label: 'Paid by', type: 'select', options: METHODS }, { key: 'account', label: 'Bank or mobile money account' }, { key: 'active', label: 'On the payroll', type: 'checkbox' },
          ]} />
        </Modal>
      )}
      {form?.kind === 'advance' && (
        <Modal title="Salary advance" onClose={() => setForm(null)}>
          <RecordForm initial={{ date: today(), bankId: CASH, method: 'Cash', employeeId: '', amount: 0, note: '' }} onCancel={() => setForm(null)} onSave={giveAdvance} saveLabel="Give advance" fields={[
            { key: 'employeeId', label: 'To', type: 'select', required: true, options: active.map((e) => ({ value: e.id, label: e.name })) }, { key: 'amount', label: 'Amount', type: 'number', required: true },
            { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'method', label: 'Payment method', type: 'select', options: METHODS }, { key: 'bankId', label: 'Paid from', type: 'select', options: banks }, { key: 'note', label: 'Note' },
          ]} />
        </Modal>
      )}
      {form?.kind === 'prepare' && (
        <Modal title={`Payroll for ${month}`} onClose={() => setForm(null)}>
          <RecordForm initial={{ workingDays: form.workingDays, deductAbsence: form.deductAbsence }} onCancel={() => setForm(null)} onSave={prepare} saveLabel={run ? 'Recalculate' : 'Prepare'} fields={[
            { key: 'workingDays', label: 'Working days in the month', type: 'number', required: true }, { key: 'deductAbsence', label: 'Take unpaid absences off the basic pay', type: 'checkbox' },
          ]} />
        </Modal>
      )}
      {form?.kind === 'pay' && (
        <Modal title={`Pay the ${month} payroll`} onClose={() => setForm(null)}>
          <p className="muted">Net pay {fmt(t.net)} and PAYE &amp; NSSF {fmt(t.statutory)} are recorded as expenses (Salaries); the advances are marked taken back.</p>
          <RecordForm initial={{ date: today(), bankId: CASH, method: 'Cash' }} onCancel={() => setForm(null)} onSave={pay} saveLabel="Mark as paid" fields={[
            { key: 'date', label: 'Paid on', type: 'date', required: true }, { key: 'method', label: 'Payment method', type: 'select', options: METHODS }, { key: 'bankId', label: 'Paid from', type: 'select', options: banks },
          ]} />
        </Modal>
      )}
      {form?.kind === 'overtime' && (
        <Modal title={`Overtime for ${form.e.name} on ${day}`} onClose={() => setForm(null)}>
          <RecordForm initial={{ h: form.h }} onCancel={() => setForm(null)} onSave={(v) => { mark(form.e, att(form.e.id)?.status || 'present', Number(v.h) || 0); setForm(null); }} fields={[{ key: 'h', label: 'Hours', type: 'number' }]} />
        </Modal>
      )}
    </div>
  );
}

