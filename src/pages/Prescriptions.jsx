import { Repeat } from 'lucide-react';
import { CrudPage } from '../ui.jsx';
import { canRecordRefill } from '../rxrules.js';
import { useStore, today, audit } from '../store.jsx';
import { toast, ask } from '../feedback.jsx';

const addDays = (date, n) => new Date(new Date(date).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Prescriptions with refills: how many refills are allowed, each refill logged with its date, and the next due date for reminders. */
export default function Prescriptions() {
  const { db, upsert, update, user, branchId } = useStore();
  const statusClass = { Pending: 'warn', Dispensed: 'ok', Cancelled: 'danger', Completed: '' };
  const nextDue = (r) => (r.refillDays && r.status === 'Dispensed' ? addDays(r.dispensedOn || r.date, Number(r.refillDays)) : null);

  const refill = async (r) => {
    const used = Number(r.refillsUsed || 0), allowed = Number(r.refillsAllowed || 0);
    if (!canRecordRefill(r)) return toast(allowed ? 'All refills on this prescription have been used. A new prescription is needed.' : 'This prescription allows no refills. A new prescription is needed.', 'warn');
    if (!(await ask({ title: `Record refill ${used + 1}${allowed ? ` of ${allowed}` : ''}?`, message: 'Dispense the medicines at the POS as usual; this logs the refill and sets the next reminder date.', confirmText: 'Record refill' }))) return;
    const next = { ...r, refillsUsed: used + 1, refillDates: [...(r.refillDates || []), today()], dispensedOn: today(), status: allowed && used + 1 >= allowed ? 'Completed' : 'Dispensed' };
    update((d) => {
      const i = d.prescriptions.findIndex((x) => x.id === r.id);
      if (i >= 0) d.prescriptions[i] = { ...next, updatedAt: new Date().toISOString() };
      audit(d, user, 'Prescription refilled', `${db.customers.find((c) => c.id === r.customerId)?.name || ''}: refill ${used + 1}${allowed ? '/' + allowed : ''}`, branchId);
    });
    toast('Refill recorded');
  };

  return (
    <CrudPage
      title="Prescriptions & Refills"
      singular="Prescription"
      table="prescriptions"
      subtitle="Record prescriptions, dispense them and track refills. Due refills appear in Reminders."
      blank={{ date: today(), status: 'Pending', refillsAllowed: 0, refillsUsed: 0 }}
      fields={[
        { key: 'customerId', label: 'Patient', type: 'select', required: true, options: db.customers.filter((c) => c.id !== 'walk-in').map((c) => ({ value: c.id, label: c.name + (c.phone ? ' · ' + c.phone : '') })) },
        { key: 'date', label: 'Date issued', type: 'date' },
        { key: 'doctor', label: 'Prescriber', required: true },
        { key: 'facility', label: 'Hospital / clinic' },
        { key: 'diagnosis', label: 'Diagnosis' },
        { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Dispensed', 'Completed', 'Cancelled'] },
        { key: 'refillsAllowed', label: 'Refills allowed (0 = none)', type: 'number' },
        { key: 'refillDays', label: 'Refill every (days)', type: 'number', placeholder: 'e.g. 30' },
        { key: 'medications', label: 'Medications, dose & directions', type: 'textarea', full: true, required: true },
        { key: 'notes', label: 'Pharmacist notes / counselling', type: 'textarea', full: true },
      ]}
      columns={[
        { label: 'Date', key: 'date' },
        { label: 'Patient', render: (r) => db.customers.find((c) => c.id === r.customerId)?.name || '—' },
        { label: 'Prescriber', key: 'doctor' },
        { label: 'Medications', render: (r) => <span className="clip">{r.medications}</span> },
        { label: 'Status', render: (r) => <span className={'badge ' + (statusClass[r.status] ?? '')}>{r.status}</span> },
        { label: 'Refills', render: (r) => (Number(r.refillsAllowed) ? `${r.refillsUsed || 0} / ${r.refillsAllowed}` : r.refillsUsed ? `${r.refillsUsed}` : '—') },
        { label: 'Next due', render: (r) => { const n = nextDue(r); return n ? <span className={n <= today() ? 'text-warn' : ''}>{n}</span> : '—'; } },
      ]}
      extraActions={(r) => (
        <>
          {r.status === 'Pending' && <button className="btn sm primary" onClick={() => upsert('prescriptions', { ...r, status: 'Dispensed', dispensedOn: today() })}>Dispense</button>}
          {r.status === 'Dispensed' && <button className="btn sm ghost" onClick={() => refill(r)}><Repeat size={14} />Refill</button>}
        </>
      )}
    />
  );
}
