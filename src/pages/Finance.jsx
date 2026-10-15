import { useState } from 'react';
import { CrudPage, Modal, RecordForm } from '../ui.jsx';
import { useStore, today, dayOf, uid, put, customerBalance, supplierBalance, downloadFile, toCSV } from '../store.jsx';
import { CASH, ledger, accountBalances, loanBalance } from '../finance.js';

const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card'];
const bankOptions = (db) => db.banks.map((b) => ({ value: b.id, label: b.name }));

export function Expenses() {
  const { db, fmt, user } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7));
  const inMonth = (e) => !month || String(e.date).startsWith(month);
  const total = db.expenses.filter(inMonth).reduce((a, e) => a + e.amount, 0);
  return (
    <CrudPage
      title="Expenses" table="expenses" filter={inMonth}
      headExtra={<><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><span className="muted">Total {fmt(total)}</span></>}
      blank={{ date: today(), bankId: CASH, method: 'Cash', recordedBy: user.name }}
      fields={[
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'categoryId', label: 'Category', type: 'select', required: true, options: db.expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'method', label: 'Payment method', type: 'select', options: METHODS },
        { key: 'bankId', label: 'Paid from', type: 'select', options: bankOptions(db) },
        { key: 'payee', label: 'Paid to' },
        { key: 'description', label: 'Description', full: true },
      ]}
      columns={[
        { label: 'Date', key: 'date' },
        { label: 'Category', render: (e) => db.expenseCategories.find((c) => c.id === e.categoryId)?.name },
        { label: 'Description', key: 'description' },
        { label: 'Paid to', key: 'payee' },
        { label: 'From', render: (e) => db.banks.find((b) => b.id === e.bankId)?.name },
        { label: 'Amount', num: true, render: (e) => fmt(e.amount) },
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
      columns={[{ label: 'Name', key: 'name' }, { label: 'Total spent', num: true, render: (c) => fmt(db.expenses.filter((e) => e.categoryId === c.id).reduce((a, e) => a + e.amount, 0)) }]}
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
        { label: 'Balance', num: true, render: (b) => <strong className={bal[b.id] < 0 ? 'text-danger' : ''}>{fmt(bal[b.id])}</strong> },
      ]}
    />
  );
}

export function BankTx() {
  const { db, fmt, user } = useStore();
  const name = (id) => db.banks.find((b) => b.id === id)?.name || '—';
  return (
    <CrudPage
      title="Deposits & Withdrawals" singular="Transaction" table="bankTx"
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
        { label: 'Date', key: 'date' },
        { label: 'Type', render: (t) => <span className={'badge ' + (t.type === 'Deposit' ? 'ok' : t.type === 'Withdrawal' ? 'warn' : '')}>{t.type}</span> },
        { label: 'Account', render: (t) => (t.type === 'Transfer' ? `${name(t.fromId)} → ${name(t.toId)}` : t.type === 'Deposit' ? `Cash → ${name(t.bankId)}` : `${name(t.bankId)} → Cash`) },
        { label: 'Reference', key: 'ref' },
        { label: 'Amount', num: true, render: (t) => fmt(t.amount) },
      ]}
    />
  );
}

function PaymentModal({ title, kind, partyId, max, onClose }) {
  const { db, update, user, fmt } = useStore();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">Outstanding: <strong>{fmt(max)}</strong></p>
      <RecordForm
        saveLabel="Record payment"
        initial={{ date: today(), amount: max > 0 ? max : 0, method: 'Cash', bankId: CASH }}
        fields={[
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'amount', label: 'Amount', type: 'number', required: true },
          { key: 'method', label: 'Method', type: 'select', options: METHODS },
          { key: 'bankId', label: kind === 'customer' ? 'Received into' : 'Paid from', type: 'select', options: bankOptions(db) },
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
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.name}</td><td>{r.phone}</td><td className="num"><strong>{fmt(r.bal)}</strong></td>
                <td className="actions"><button className="btn sm primary" onClick={() => setPay(r)}>{kind === 'customer' ? 'Receive payment' : 'Pay'}</button></td></tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="empty">No outstanding balances</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card table-wrap">
        <h3 className="pad">Payment history</h3>
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Method</th><th>Note</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {history.slice(0, 200).map((p) => <tr key={p.id}><td>{p.date}</td><td>{parties.find((x) => x.id === p.partyId)?.name}</td><td>{p.method}</td><td>{p.note}</td><td className="num">{fmt(p.amount)}</td></tr>)}
            {!history.length && <tr><td colSpan={5} className="empty">No payments yet</td></tr>}
          </tbody>
        </table>
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
          { label: 'Lender', key: 'lender' }, { label: 'Date', key: 'date' }, { label: 'Due', key: 'dueDate' },
          { label: 'Amount', num: true, render: (l) => fmt(l.amount) },
          { label: 'Total due', num: true, render: (l) => fmt(loanBalance(db, l).total) },
          { label: 'Repaid', num: true, render: (l) => fmt(loanBalance(db, l).repaid) },
          { label: 'Balance', num: true, render: (l) => <strong>{fmt(loanBalance(db, l).balance)}</strong> },
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
          <select value={account} onChange={(e) => setAccount(e.target.value)}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn ghost" onClick={() => downloadFile('cash-book.csv', toCSV(rows.map(({ date, desc, kind, in: i, out, bal: b }) => ({ date, description: desc, type: kind, in: i, out, balance: b }))), 'text/csv')}>Export CSV</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="num">Money in</th><th className="num">Money out</th><th className="num">Balance</th></tr></thead>
          <tbody>
            <tr className="dim"><td colSpan={5}>Opening balance</td><td className="num">{fmt(opening)}</td></tr>
            {rows.map((e, i) => (
              <tr key={i}><td>{new Date(e.date).toLocaleDateString()}</td><td>{e.desc}</td><td>{e.kind}</td>
                <td className="num text-ok">{e.in ? fmt(e.in) : ''}</td><td className="num text-danger">{e.out ? fmt(e.out) : ''}</td><td className="num"><strong>{fmt(e.bal)}</strong></td></tr>
            ))}
            <tr><td colSpan={3}><strong>Totals</strong></td><td className="num"><strong>{fmt(rows.reduce((a, e) => a + e.in, 0))}</strong></td><td className="num"><strong>{fmt(rows.reduce((a, e) => a + e.out, 0))}</strong></td><td className="num"><strong>{fmt(rows.length ? rows[rows.length - 1].bal : opening)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
