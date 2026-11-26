import { DateRange } from '../forms.jsx';
import { useState, useMemo } from 'react';
import { closedSet, inClosedDay } from '../dayclose.js';
import { CrudPage, Modal, RecordForm } from '../ui.jsx';
import { DataTable } from '../datatable.jsx';
import { useStore, today, dayOf, uid, put, customerBalance, supplierBalance, downloadFile, toCSV } from '../store.jsx';
import { CASH, ledger, accountBalances, loanBalance } from '../finance.js';
import { showDate } from '../showdate.js';

const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card'];
const bankOptions = (db) => db.banks.map((b) => ({ value: b.id, label: b.name }));

/** step 18: rows of a closed day can't be changed or deleted (the cloud refuses it too) */
const useDayLock = (db) => { const closed = useMemo(() => closedSet(db.dayCloses), [db.dayCloses]); return (r) => inClosedDay(r, closed, dayOf); };

export function Expenses() {
  const { db, fmt, user } = useStore();
  const rowLocked = useDayLock(db);
  // E5: the one date-range control (this month to start with)
  const [range, setRange] = useState(() => ({ from: today().slice(0, 8) + '01', to: today() }));
  const month = range.from || range.to;
  const inMonth = (e) => (!range.from || String(e.date).slice(0, 10) >= range.from) && (!range.to || String(e.date).slice(0, 10) <= range.to);
  const total = db.expenses.filter(inMonth).reduce((a, e) => a + e.amount, 0);
  return (
    <CrudPage
      title="Expenses" table="expenses" filter={inMonth} rowLocked={rowLocked}
      totals={{ Amount: (rs) => fmt(rs.reduce((a, e) => a + (Number(e.amount) || 0), 0)) }}
      emptyText={month ? 'No expenses in these dates. Record rent, salaries, transport and other costs here: they come off the profit in reports.' : undefined}
      headExtra={<><DateRange from={range.from} to={range.to} onChange={setRange} /><span className="muted">Total {fmt(total)}</span></>}
      blank={{ date: today(), bankId: CASH, method: 'Cash', recordedBy: user.name }}
      fields={[
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'categoryId', label: 'Category', type: 'select', required: true, options: db.expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
        { key: 'amount', label: 'Amount', type: 'money', required: true, validate: (v) => (Number(v) > 0 ? '' : 'An expense is more than 0') },
        { key: 'method', label: 'Payment method', type: 'select', options: METHODS },
        { key: 'bankId', label: 'Paid from', type: 'select', options: bankOptions(db) },
        { key: 'payee', label: 'Paid to' },
        { key: 'description', label: 'Description', full: true },
      ]}
      columns={[
        { label: 'Date', key: 'date', render: (r) => showDate(r.date) },
        { label: 'Category', sortBy: (e) => db.expenseCategories.find((c) => c.id === e.categoryId)?.name, render: (e) => db.expenseCategories.find((c) => c.id === e.categoryId)?.name },
        { label: 'Description', key: 'description' },
        { label: 'Paid to', key: 'payee' },
        { label: 'From', sortBy: (e) => db.banks.find((b) => b.id === e.bankId)?.name, render: (e) => db.banks.find((b) => b.id === e.bankId)?.name },
        { label: 'Amount', num: true, sortBy: (e) => Number(e.amount) || 0, render: (e) => fmt(e.amount) },
      ]}
    />
  );
}

export function ExpenseCategories() {
  const { db, fmt } = useStore();
  return (
    <CrudPage
      title="Expense Categories" singular="Category" table="expenseCategories"
      fields={[{ key: 'name', label: 'Name', required: true }]}
      columns={[{ label: 'Name', key: 'name' }, { label: 'Total spent', num: true, sortBy: (c) => db.expenses.filter((e) => e.categoryId === c.id).reduce((a, e) => a + e.amount, 0), render: (c) => fmt(db.expenses.filter((e) => e.categoryId === c.id).reduce((a, e) => a + e.amount, 0)) }]}
    />
  );
}

export function Banks() {
  const { db, fmt } = useStore();
  const bal = accountBalances(db);
  return (
    <CrudPage
      title="Banks" singular="Bank / account" table="banks" canDelete={false}
      headExtra={<span className="muted">Total {fmt(Object.values(bal).reduce((a, b) => a + b, 0))}</span>}
      fields={[
        { key: 'name', label: 'Bank / account name', required: true },
        { key: 'account', label: 'Account number' },
        { key: 'branch', label: 'Branch' },
        { key: 'opening', label: 'Opening balance', type: 'number' },
      ]}
      columns={[
        { label: 'Account', key: 'name' }, { label: 'Number', key: 'account' }, { label: 'Branch', key: 'branch' },
        { label: 'Balance', num: true, sortBy: (b) => bal[b.id] || 0, render: (b) => <strong className={bal[b.id] < 0 ? 'text-danger' : ''}>{fmt(bal[b.id])}</strong> },
      ]}
    />
  );
}

export function BankTx() {
  const { db, fmt, user } = useStore();
  const rowLocked = useDayLock(db);
  const name = (id) => db.banks.find((b) => b.id === id)?.name || '—';
  return (
    <CrudPage
      title="Deposits & Withdrawals" singular="Transaction" table="bankTx" rowLocked={rowLocked}
      blank={{ date: today(), type: 'Deposit', by: user.name }}
      fields={[
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'type', label: 'Type', type: 'select', required: true, options: ['Deposit', 'Withdrawal', 'Transfer'] },
        { key: 'bankId', label: 'Bank account', type: 'select', options: bankOptions(db), hidden: (r) => r.type === 'Transfer' },
        { key: 'fromId', label: 'From account', type: 'select', options: bankOptions(db), hidden: (r) => r.type !== 'Transfer' },
        { key: 'toId', label: 'To account', type: 'select', options: bankOptions(db), hidden: (r) => r.type !== 'Transfer' },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'ref', label: 'Slip / reference' },
        { key: 'note', label: 'Note', full: true },
      ]}
      columns={[
        { label: 'Date', key: 'date', render: (r) => showDate(r.date) },
        { label: 'Type', sortBy: (t) => t.type, render: (t) => <span className={'badge ' + (t.type === 'Deposit' ? 'ok' : t.type === 'Withdrawal' ? 'warn' : '')}>{t.type}</span> },
        { label: 'Account', render: (t) => (t.type === 'Transfer' ? `${name(t.fromId)} → ${name(t.toId)}` : t.type === 'Deposit' ? `Cash → ${name(t.bankId)}` : `${name(t.bankId)} → Cash`) },
        { label: 'Reference', key: 'ref' },
        { label: 'Amount', num: true, sortBy: (t) => Number(t.amount) || 0, render: (t) => fmt(t.amount) },
      ]}
    />
  );
}

export function PaymentModal({ title, kind, partyId, max, onClose }) {
  const { db, update, user, fmt } = useStore();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">Outstanding: <strong>{fmt(max)}</strong></p>
      <RecordForm
        saveLabel="Record payment"
        initial={{ date: today(), amount: max > 0 ? max : 0, method: 'Cash', bankId: CASH }}
        fields={[
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'amount', label: 'Amount', type: 'money', required: true, validate: (v) => (Number(v) > 0 ? '' : 'A payment is more than 0') },
          { key: 'method', label: 'Method', type: 'select', options: METHODS },
          { key: 'bankId', label: kind === 'customer' || kind === 'insurer' ? 'Received into' : 'Paid from', type: 'select', options: bankOptions(db) },
          { key: 'note', label: 'Note', full: true },
        ]}
        onCancel={onClose}
        onSave={(p) => { update((d) => { put(d, 'payments', { ...p, id: uid(), kind, partyId, by: user.name }); }); onClose(); }}
      />
    </Modal>
  );
}

function BalancesPage({ title, kind, parties, balanceOf, note }) {
  const { db, fmt } = useStore();
  const [pay, setPay] = useState(null);
  const rows = parties.map((p) => ({ ...p, bal: balanceOf(db, p.id) })).filter((p) => Math.abs(p.bal) > 0.001).sort((a, b) => b.bal - a.bal);
  const history = db.payments.filter((p) => p.kind === kind);
  return (
    <div className="page">
      <div className="page-head"><h1>{title}</h1><span className="muted">Total {fmt(rows.reduce((a, r) => a + r.bal, 0))}</span></div>
      <p className="muted">{note}</p>
      <div className="card table-wrap">
        <DataTable id={'balances-' + kind} wrapClass="dt-inner" rows={rows} sort={['bal', -1]} csv={kind === 'customer' ? 'debtors' : 'creditors'}
          empty={kind === 'customer' ? 'Nobody owes the pharmacy money. Sales on credit show here until they are paid.' : 'The pharmacy owes no supplier. Deliveries on credit show here until they are paid.'} columns={[
            { id: 'name', label: 'Name', key: 'name' },
            { id: 'phone', label: 'Phone', key: 'phone' },
            { id: 'bal', label: 'Balance', num: true, sortBy: (r) => r.bal, render: (r) => <strong>{fmt(r.bal)}</strong> },
            { id: 'actions', label: 'Actions', noExport: true, className: 'actions', render: (r) => <button className="btn sm primary" onClick={() => setPay(r)}>{kind === 'customer' ? 'Receive payment' : 'Pay'}</button> },
          ]} />
      </div>
      <div className="card table-wrap">
        <h3 className="pad">Payment history</h3>
        {/* every payment (no longer the first 200: the shared table, 2026-11-26) */}
        <DataTable id={'payments-' + kind} wrapClass="dt-inner" rows={history} sort={['date', -1]} csv={'payments-' + kind} empty="No payments yet. Payments you receive or make on a balance are listed here." columns={[
          { id: 'date', label: 'Date', key: 'date' },
          { id: 'name', label: 'Name', sortBy: (p) => parties.find((x) => x.id === p.partyId)?.name || '', render: (p) => parties.find((x) => x.id === p.partyId)?.name },
          { id: 'method', label: 'Method', key: 'method' },
          { id: 'note', label: 'Note', key: 'note' },
          { id: 'amount', label: 'Amount', num: true, sortBy: (p) => Number(p.amount) || 0, render: (p) => fmt(p.amount) },
        ]} />
      </div>
      {pay && <PaymentModal title={`${kind === 'customer' ? 'Payment from' : 'Payment to'} ${pay.name}`} kind={kind} partyId={pay.id} max={pay.bal} onClose={() => setPay(null)} />}
    </div>
  );
}

export function Debtors() {
  const { db } = useStore();
  return <BalancesPage title="Debtors (customers owe)" kind="customer" parties={db.customers} balanceOf={customerBalance} note="Credit sales not yet paid. Record payments as customers pay." />;
}

export function Creditors() {
  const { db } = useStore();
  return <BalancesPage title="Creditors (we owe)" kind="supplier" parties={db.suppliers} balanceOf={supplierBalance} note="Unpaid supplier purchases. Record payments as you pay suppliers." />;
}

export function Loans() {
  const { db, fmt } = useStore();
  const [pay, setPay] = useState(null);
  return (
    <>
      <CrudPage
        title="Loans" table="loans"
        blank={{ date: today(), bankId: CASH, interestRate: 0 }}
        fields={[
          { key: 'lender', label: 'Lender', required: true },
          { key: 'date', label: 'Date received', type: 'date', required: true },
          { key: 'amount', label: 'Amount', type: 'number', required: true },
          { key: 'interestRate', label: 'Total interest (%)', type: 'number' },
          { key: 'dueDate', label: 'Due date', type: 'date' },
          { key: 'bankId', label: 'Received into', type: 'select', options: bankOptions(db) },
          { key: 'purpose', label: 'Purpose', full: true },
        ]}
        columns={[
          { label: 'Lender', key: 'lender' }, { label: 'Date', key: 'date', render: (r) => showDate(r.date) }, { label: 'Due', key: 'dueDate', render: (r) => showDate(r.dueDate) },
          { label: 'Amount', num: true, sortBy: (l) => Number(l.amount) || 0, render: (l) => fmt(l.amount) },
          { label: 'Total due', num: true, sortBy: (l) => loanBalance(db, l).total, render: (l) => fmt(loanBalance(db, l).total) },
          { label: 'Repaid', num: true, sortBy: (l) => loanBalance(db, l).repaid, render: (l) => fmt(loanBalance(db, l).repaid) },
          { label: 'Balance', num: true, sortBy: (l) => loanBalance(db, l).balance, render: (l) => <strong>{fmt(loanBalance(db, l).balance)}</strong> },
        ]}
        extraActions={(l) => loanBalance(db, l).balance > 0 && <button className="btn sm primary" onClick={() => setPay(l)}>Repay</button>}
      />
      {pay && <PaymentModal title={`Repay ${pay.lender}`} kind="loan" partyId={pay.id} max={loanBalance(db, pay).balance} onClose={() => setPay(null)} />}
    </>
  );
}

export function CashBook() {
  const { db, fmt } = useStore();
  const [account, setAccount] = useState(CASH);
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const bank = db.banks.find((b) => b.id === account);
  let bal = Number(bank?.opening) || 0;
  const all = ledger(db).filter((e) => e.account === account).map((e) => ({ ...e, bal: (bal += e.in - e.out) }));
  const rows = all.filter((e) => dayOf(e.date) >= from && dayOf(e.date) <= to);
  const opening = rows.length ? rows[0].bal - rows[0].in + rows[0].out : (all.filter((e) => dayOf(e.date) < from).pop()?.bal ?? (Number(bank?.opening) || 0));
  return (
    <div className="page">
      <div className="page-head">
        <h1>Cash Book</h1>
        <div className="row gap">
          <select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <DateRange from={from} to={to} allowAll={false} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
          <button className="btn ghost" onClick={() => downloadFile('cash-book.csv', toCSV(rows.map(({ date, desc, kind, in: i, out, bal: b }) => ({ date, description: desc, type: kind, in: i, out, balance: b }))), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <div className="card table-wrap">
        <DataTable id="cash-book" wrapClass="dt-inner" rows={rows} rowKey={(e, i) => e.id || `${e.date}|${e.desc}|${e.bal}|${i}`} csv={false} resetKey={[account, from, to].join('|')}
          caption={<>Opening balance <strong>{fmt(opening)}</strong></>} empty="No money in or out in this period"
          foot={(id, all, i) => (i === 0 ? <strong>Totals</strong> : id === 'in' ? <strong>{fmt(rows.reduce((a, e) => a + e.in, 0))}</strong> : id === 'out' ? <strong>{fmt(rows.reduce((a, e) => a + e.out, 0))}</strong> : id === 'bal' ? <strong>{fmt(rows.length ? rows[rows.length - 1].bal : opening)}</strong> : '')}
          columns={[
            { id: 'date', label: 'Date', key: 'date', render: (e) => showDate(e.date) },
            { id: 'desc', label: 'Description', key: 'desc' },
            { id: 'kind', label: 'Type', key: 'kind' },
            { id: 'in', label: 'Money in', num: true, className: 'text-ok', sortBy: (e) => e.in || 0, render: (e) => (e.in ? fmt(e.in) : '') },
            { id: 'out', label: 'Money out', num: true, className: 'text-danger', sortBy: (e) => e.out || 0, render: (e) => (e.out ? fmt(e.out) : '') },
            { id: 'bal', label: 'Balance', num: true, sortBy: (e) => e.bal, render: (e) => <strong>{fmt(e.bal)}</strong> },
          ]} />
      </div>
    </div>
  );
}
