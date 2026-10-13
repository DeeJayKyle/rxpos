// Money ledger derived from the records: every inflow/outflow with the account it hit.
// Accounts are the `banks` table; "cash-drawer" (Cash at hand) is the default.
export const CASH = 'cash-drawer';

export function ledger(db) {
  const e = [];
  const acct = (x) => x || CASH;
  for (const s of db.sales) {
    const paid = s.paid ?? s.total;
    if (paid > 0) e.push({ date: s.date, desc: `Sale ${s.number}${s.customerName ? ' – ' + s.customerName : ''}`, in: paid, out: 0, account: acct(s.bankId), kind: 'Sales' });
    if (s.status === 'refunded') e.push({ date: s.refundedAt || s.date, desc: `Refund ${s.number}`, in: 0, out: paid, account: acct(s.bankId), kind: 'Refunds' });
  }
  for (const p of db.purchases) {
    const paid = p.paid ?? p.total;
    if (paid > 0) e.push({ date: p.date, desc: `Purchase ${p.invoice || ''} – ${p.supplierName}`, in: 0, out: paid, account: acct(p.bankId), kind: 'Purchases' });
  }
  for (const x of db.expenses) {
    const cat = db.expenseCategories.find((c) => c.id === x.categoryId)?.name || 'Expense';
    e.push({ date: x.date, desc: `${cat}: ${x.description || ''}`, in: 0, out: x.amount, account: acct(x.bankId), kind: 'Expenses' });
  }
  for (const p of db.payments) {
    const who = p.kind === 'customer' ? db.customers.find((c) => c.id === p.partyId)?.name
      : p.kind === 'supplier' ? db.suppliers.find((c) => c.id === p.partyId)?.name
      : db.loans.find((l) => l.id === p.partyId)?.lender;
    const incoming = p.kind === 'customer';
    const label = { customer: 'Payment from', supplier: 'Payment to', loan: 'Loan repayment to' }[p.kind];
    e.push({ date: p.date, desc: `${label} ${who || ''}`, in: incoming ? p.amount : 0, out: incoming ? 0 : p.amount, account: acct(p.bankId), kind: 'Payments' });
  }
  for (const l of db.loans) e.push({ date: l.date, desc: `Loan received from ${l.lender}`, in: l.amount, out: 0, account: acct(l.bankId), kind: 'Loans' });
  for (const t of db.bankTx) {
    // deposit: cash → bank; withdrawal: bank → cash; transfer: from → to
    const from = t.type === 'Deposit' ? CASH : t.fromId || t.bankId;
    const to = t.type === 'Withdrawal' ? CASH : t.type === 'Deposit' ? t.bankId : t.toId;
    e.push({ date: t.date, desc: `${t.type}${t.note ? ' – ' + t.note : ''}`, in: 0, out: t.amount, account: from, kind: 'Banking' });
    e.push({ date: t.date, desc: `${t.type}${t.note ? ' – ' + t.note : ''}`, in: t.amount, out: 0, account: to, kind: 'Banking' });
  }
  return e.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function accountBalances(db) {
  const bal = Object.fromEntries(db.banks.map((b) => [b.id, Number(b.opening) || 0]));
  for (const x of ledger(db)) bal[x.account] = (bal[x.account] || 0) + x.in - x.out;
  return bal;
}

export function loanBalance(db, loan) {
  const repaid = db.payments.filter((p) => p.kind === 'loan' && p.partyId === loan.id).reduce((a, p) => a + p.amount, 0);
  const total = loan.amount * (1 + (Number(loan.interestRate) || 0) / 100);
  return { total, repaid, balance: total - repaid };
}
