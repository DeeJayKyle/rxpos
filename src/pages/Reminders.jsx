import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, MessageSquareText, Send, BellRing } from 'lucide-react';
import { DataTable } from '../datatable.jsx';
import { useStore, customerBalance, fillTemplate, normalizePhone, put, audit, daysUntil, now } from '../store.jsx';
import { reminderActive } from '../rxrules.js';
import { Tabs } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { cloudConfig, sendSms, whatsappLink } from '../cloud.js';
import { showDate } from '../showdate.js';

const addDays = (date, n) => new Date(new Date(date).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Refill reminders for chronic patients and payment reminders for debtors — by WhatsApp (free) or SMS. */
export default function Reminders() {
  const { db, fmt, update, user, syncCfg, branchId } = useStore();
  const [tab, setTab] = useState('refills');
  const [smsReady, setSmsReady] = useState(false);
  const [selected, setSelected] = useState({});
  const [sending, setSending] = useState(false);
  const s = db.settings;

  useEffect(() => { if (syncCfg.url) cloudConfig(syncCfg).then((c) => setSmsReady(!!c.sms)).catch(() => {}); }, [syncCfg]);

  const refills = useMemo(() => {
    const out = new Map();
    const chronic = new Map(db.products.filter((p) => p.chronic).map((p) => [p.id, p]));
    // 1) prescriptions with a refill interval
    for (const r of db.prescriptions) {
      if (!reminderActive(r)) continue;
      const due = addDays(r.dispensedOn || r.date, Number(r.refillDays));
      out.set(r.customerId + '|rx' + r.id, { customerId: r.customerId, medicine: (r.medications || '').split('\n')[0].slice(0, 60), due });
    }
    // 2) chronic medicines bought by registered customers (last purchase + refill interval)
    const last = new Map();
    for (const sale of db.sales) {
      if (sale.status === 'refunded' || !sale.customerId || sale.customerId === 'walk-in') continue;
      for (const i of sale.items) {
        if (!chronic.has(i.id)) continue;
        const k = sale.customerId + '|' + i.id;
        if (!last.has(k) || last.get(k) < sale.date) last.set(k, sale.date);
      }
    }
    for (const [k, date] of last) {
      const [customerId, pid] = k.split('|');
      const p = chronic.get(pid);
      out.set(k, { customerId, medicine: p.name, due: addDays(date, Number(p.refillDays) || 30) });
    }
    return [...out.entries()].map(([key, r]) => ({ key, ...r, customer: db.customers.find((c) => c.id === r.customerId), days: daysUntil(r.due) }))
      .filter((r) => r.customer && r.days <= 7 && r.days >= -30)
      .sort((a, b) => a.due.localeCompare(b.due));
  }, [db.prescriptions, db.sales, db.products, db.customers]);

  const debts = useMemo(() => db.customers.map((c) => ({ key: c.id, customer: c, amount: customerBalance(db, c.id) })).filter((r) => r.amount > 0.5).sort((a, b) => b.amount - a.amount), [db]);

  const rows = tab === 'refills' ? refills : debts;
  const message = (r) => fillTemplate(tab === 'refills' ? s.smsRefill : s.smsDebt, {
    name: r.customer.name.split(' ')[0], pharmacy: s.name, medicine: r.medicine, date: r.due && showDate(r.due), amount: fmt(r.amount), phone: s.phone,
  });

  const markSent = (list, channel) => update((d) => {
    for (const r of list) {
      const c = d.customers.find((x) => x.id === r.customer.id);
      if (c) put(d, 'customers', { ...c, lastReminderAt: now() });
    }
    audit(d, user, 'Reminder sent', `${list.length} ${tab === 'refills' ? 'refill' : 'payment'} reminder(s) by ${channel}`, branchId);
  });

  const smsTo = async (list) => {
    const withPhone = list.filter((r) => normalizePhone(r.customer.phone).length >= 12);
    if (!withPhone.length) return toast('None of these customers has a phone number', 'warn');
    if (!(await ask({ title: `Send ${withPhone.length} SMS?`, message: 'Each customer gets their own personalised message. SMS charges from Africa’s Talking apply.', confirmText: 'Send SMS' }))) return;
    setSending(true);
    let ok = 0;
    for (const r of withPhone) {
      try { const res = await sendSms(syncCfg, [normalizePhone(r.customer.phone)], message(r)); ok += res.sent || 0; } catch (e) { toast(e.message, 'error'); break; }
    }
    setSending(false);
    if (ok) { markSent(withPhone.slice(0, ok), 'SMS'); toast(`${ok} SMS sent`); }
    setSelected({});
  };

  const chosen = rows.filter((r) => selected[r.key]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Reminders</h1><div className="sub"><BellRing size={14} /> Bring patients back on time and collect what is owed</div></div>
        <div className="row gap">
          {chosen.length > 0 && <button className="btn primary" disabled={!smsReady || sending} onClick={() => smsTo(chosen)}><Send size={16} />SMS {chosen.length} selected</button>}
        </div>
      </div>
      {!smsReady && <div className="notice info-notice">WhatsApp reminders work now. To send SMS automatically, add your Africa’s Talking keys to the cloud (see README → SMS).</div>}
      <Tabs tabs={[['refills', `Refills due (${refills.length})`], ['debts', `Debtors (${debts.length})`]]} value={tab} onChange={(t) => { setTab(t); setSelected({}); }} />
      <DataTable id={'reminders-' + tab} rows={rows} rowKey={(r) => r.key} resetKey={tab} csv={false}
        empty={tab === 'refills' ? 'No refills due in the next 7 days. Mark medicines as “Chronic” or set a refill interval on prescriptions.' : 'Nobody owes you money 🎉'}
        tools={<label className="field check inline"><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && chosen.length === rows.length} onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(rows.map((r) => [r.key, true])) : {})} /><span>Select all</span></label>}
        columns={[
          { id: 'pick', label: 'Pick', fixed: true, noExport: true, render: (r) => <input type="checkbox" aria-label={`Select ${r.customer.name}`} checked={!!selected[r.key]} onChange={(e) => setSelected({ ...selected, [r.key]: e.target.checked })} /> },
          { id: 'customer', label: 'Customer', sortBy: (r) => r.customer.name, render: (r) => <strong>{r.customer.name}</strong> },
          { id: 'phone', label: 'Phone', sortBy: (r) => r.customer.phone || '', render: (r) => r.customer.phone || <span className="muted">no phone</span> },
          tab === 'refills'
            ? { id: 'due', label: 'Medicine · due', sortBy: (r) => r.days, csv: (r) => `${r.medicine} · ${r.days}`, render: (r) => <>{r.medicine}<br /><small className={r.days < 0 ? 'text-danger' : 'text-warn'}>{r.days < 0 ? `${-r.days} days overdue` : r.days === 0 ? 'due today' : `due in ${r.days} days`}</small></> }
            : { id: 'owes', label: 'Owes', num: true, sortBy: (r) => r.amount, render: (r) => <strong className="text-warn">{fmt(r.amount)}</strong> },
          { id: 'last', label: 'Last reminded', className: 'muted small', sortBy: (r) => r.customer.lastReminderAt || '', render: (r) => (r.customer.lastReminderAt ? showDate(r.customer.lastReminderAt) : '—') },
          { id: 'actions', label: 'Actions', noExport: true, className: 'actions', render: (r) => { const phone = normalizePhone(r.customer.phone); return <>
                    <a className={'btn sm ghost' + (phone.length < 12 ? ' disabled-link' : '')} href={phone.length >= 12 ? whatsappLink(phone, message(r)) : undefined} target="_blank" rel="noreferrer" onClick={() => phone.length >= 12 && markSent([r], 'WhatsApp')}><MessageCircle size={14} />WhatsApp</a>
                    <button className="btn sm ghost" disabled={!smsReady || sending || phone.length < 12} onClick={() => smsTo([r])}><MessageSquareText size={14} />SMS</button>
          </>; } },
        ]} />
      <p className="muted small">Edit the message wording in Settings → Messages. Placeholders: {'{name} {pharmacy} {medicine} {date} {amount}'}.</p>
    </div>
  );
}
