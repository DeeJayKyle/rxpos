import { CrudPage } from '../ui.jsx';
import { CallMenu } from '../calls.jsx';
import { useStore, customerBalance, supplierBalance } from '../store.jsx';

const initials = (n = '') => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export function Customers() {
  const { db, fmt } = useStore();
  const spent = (id) => db.sales.filter((s) => s.customerId === id && s.status !== 'refunded').reduce((a, s) => a + s.total, 0);
  return (
    <CrudPage
      title="Customers" table="customers" canDelete={false}
      fields={[
        { key: 'name', label: 'Full name / company', required: true },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Address' },
        { key: 'dob', label: 'Date of birth', type: 'date' },
        { key: 'type', label: 'Type', type: 'select', options: ['Retail', 'Wholesale', 'Clinic / Hospital', 'Insurance'] },
        { key: 'insurance', label: 'Insurance / HMO' },
        { key: 'insuranceNo', label: 'Policy number' },
        { key: 'creditLimit', label: 'Credit limit', type: 'number' },
        { key: 'allergies', label: 'Allergies', type: 'textarea', full: true },
        { key: 'notes', label: 'Notes', type: 'textarea', full: true },
      ]}
      board={{ groups: [['Retail', 'Retail'], ['Wholesale', 'Wholesale'], ['Clinic / Hospital', 'Clinic / Hospital'], ['Insurance', 'Insurance'], ['', 'No type set']], of: (c) => (['Retail', 'Wholesale', 'Clinic / Hospital', 'Insurance'].includes(c.type) ? c.type : '') }}
      card={(c) => ({ title: c.name, sub: [c.phone, c.insurance].filter(Boolean).join(' · '), art: <span className="dv-initials">{initials(c.name)}</span>,
        chips: [c.type && [c.type], c.allergies && ['Allergies: ' + c.allergies, 'danger'], c.creditLimit > 0 && ['Credit ' + fmt(c.creditLimit)]].filter(Boolean) })}
      columns={[
        { label: 'Name', key: 'name' },
        { label: 'Phone', render: (c) => (c.phone ? <span className="row gap">{c.phone}<CallMenu compact person={c} /></span> : '—') },
        { label: 'Type', key: 'type' },
        { label: 'Allergies', render: (c) => (c.allergies ? <span className="text-danger">{c.allergies}</span> : '—') },
        { label: 'Total bought', num: true, render: (c) => fmt(spent(c.id)) },
        { label: 'Owes', num: true, render: (c) => { const b = customerBalance(db, c.id); return b > 0 ? <span className="text-warn">{fmt(b)}</span> : '—'; } },
      ]}
    />
  );
}

export function Suppliers() {
  const { db, fmt } = useStore();
  const purchased = (id) => db.purchases.filter((p) => p.supplierId === id).reduce((a, p) => a + p.total, 0);
  return (
    <CrudPage
      title="Suppliers" table="suppliers" canDelete={false}
      fields={[
        { key: 'name', label: 'Company name', required: true },
        { key: 'contact', label: 'Contact person' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'tin', label: 'TIN / tax number' },
        { key: 'address', label: 'Address', type: 'textarea', full: true },
      ]}
      card={(x) => ({ title: x.name, sub: [x.contact, x.phone].filter(Boolean).join(' · '), art: <span className="dv-initials">{initials(x.name)}</span>, chips: [x.tin && ['TIN ' + x.tin]].filter(Boolean) })}
      columns={[
        { label: 'Company', key: 'name' },
        { label: 'Contact', key: 'contact' },
        { label: 'Phone', render: (s) => (s.phone ? <span className="row gap">{s.phone}<CallMenu compact person={s} /></span> : '—') },
        { label: 'Total purchased', num: true, render: (s) => fmt(purchased(s.id)) },
        { label: 'We owe', num: true, render: (s) => { const b = supplierBalance(db, s.id); return b > 0 ? <span className="text-warn">{fmt(b)}</span> : '—'; } },
      ]}
    />
  );
}
