import { CrudPage } from '../ui.jsx';
import { useStore, today } from '../store.jsx';

export default function Prescriptions() {
  const { db, upsert } = useStore();
  const statusClass = { Pending: 'warn', Dispensed: 'ok', Cancelled: 'danger' };
  return (
    <CrudPage
      title="Prescriptions"
      table="prescriptions"
      blank={{ date: today(), status: 'Pending' }}
      fields={[
        { key: 'customerId', label: 'Patient', type: 'select', required: true, options: db.customers.map((c) => ({ value: c.id, label: c.name })) },
        { key: 'date', label: 'Date issued', type: 'date' },
        { key: 'doctor', label: 'Prescriber', required: true },
        { key: 'facility', label: 'Hospital / clinic' },
        { key: 'diagnosis', label: 'Diagnosis' },
        { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Dispensed', 'Cancelled'] },
        { key: 'medications', label: 'Medications, dose & directions', type: 'textarea', full: true, required: true },
        { key: 'notes', label: 'Pharmacist notes / counselling', type: 'textarea', full: true },
      ]}
      columns={[
        { label: 'Date', key: 'date' },
        { label: 'Patient', render: (r) => db.customers.find((c) => c.id === r.customerId)?.name || '—' },
        { label: 'Prescriber', key: 'doctor' },
        { label: 'Medications', render: (r) => <span className="clip">{r.medications}</span> },
        { label: 'Status', render: (r) => <span className={'badge ' + statusClass[r.status]}>{r.status}</span> },
      ]}
      extraActions={(r) => r.status === 'Pending' && (
        <button className="btn sm primary" onClick={() => upsert('prescriptions', { ...r, status: 'Dispensed', dispensedOn: today() })}>Dispense</button>
      )}
    />
  );
}
