// Payroll & HR rules (step 26, copied from the Flutter app's features/payroll/domain/payroll.dart; both are checked
// against tests/payroll-cases.json): Uganda PAYE and NSSF, a person's pay for a month from their attendance and
// open advances, and a run's totals. Paying a run records the net pay and the statutory deductions as ordinary
// expenses (category "Salaries"), so the cash book, the reports and the profit figures include them.
export const PAYROLL_TABLES = ['employees', 'attendance', 'salaryAdvances', 'payrolls'];
export const ATTENDANCE_KINDS = [['present', 'Present'], ['absent', 'Absent'], ['leave', 'Leave'], ['sick', 'Sick'], ['off', 'Day off']];
export const SALARIES_CATEGORY = 'Salaries';
export const NSSF_EMPLOYEE_RATE = 0.05, NSSF_EMPLOYER_RATE = 0.10;
const n = (v) => Number(v) || 0;
const round = (v) => Math.round(v); // as Dart's roundToDouble for the amounts here (whole shillings, never negative)

/** Uganda PAYE on a resident's monthly taxable pay (Income Tax Act, Third Schedule, as of 2026) */
export function payeUganda(gross) {
  if (gross <= 235000) return 0;
  if (gross <= 335000) return round((gross - 235000) * 0.10);
  if (gross <= 410000) return round(10000 + (gross - 335000) * 0.20);
  let tax = 25000 + (gross - 410000) * 0.30;
  if (gross > 10000000) tax += (gross - 10000000) * 0.10;
  return round(tax);
}

/** The advances given to a person that no payroll has taken back yet */
export const openAdvances = (advances, employeeId) => (advances || []).filter((a) => String(a.employeeId) === String(employeeId) && !a.payrollId);

/**
 * A person's pay for a month (YYYY-MM): basic + allowances + overtime − unpaid absence (basic ÷ working days a day,
 * when deductAbsence) = gross; less PAYE, the employee's NSSF and the advances still open = net.
 */
export function payLine(e, month, { attendance = [], advances = [], workingDays = 26, deductAbsence = false } = {}) {
  const days = attendance.filter((a) => String(a.employeeId) === String(e.id) && String(a.date).startsWith(month));
  const unpaid = days.filter((a) => a.status === 'absent').length;
  const hours = days.reduce((s, a) => s + n(a.overtimeHours), 0);
  const basic = n(e.basicSalary), allowances = n(e.allowances);
  const overtime = round(hours * n(e.overtimeRate));
  const absence = deductAbsence && workingDays > 0 ? Math.min(Math.max(round((basic / workingDays) * unpaid), 0), basic) : 0;
  const gross = basic + allowances + overtime - absence;
  const paye = e.paye !== false ? payeUganda(gross) : 0;
  const nssfEmployee = e.nssf !== false ? round(gross * NSSF_EMPLOYEE_RATE) : 0;
  const nssfEmployer = e.nssf !== false ? round(gross * NSSF_EMPLOYER_RATE) : 0;
  const open = openAdvances(advances, e.id);
  const adv = open.reduce((s, a) => s + n(a.amount), 0);
  return {
    employeeId: String(e.id), name: String(e.name || ''), jobTitle: String(e.jobTitle || ''), basic, allowances, overtimeHours: hours, overtime,
    unpaidDays: deductAbsence ? unpaid : 0, absence, gross, paye, nssfEmployee, nssfEmployer, advances: adv, advanceIds: open.map((a) => String(a.id)),
    net: gross - paye - nssfEmployee - adv, present: days.filter((a) => a.status === 'present').length, leave: days.filter((a) => a.status === 'leave' || a.status === 'sick').length,
  };
}

/** A run's totals: gross, PAYE, both NSSF shares, advances, net; cost = gross + employer's NSSF; statutory = owed to URA and NSSF */
export function payrollTotals(lines) {
  const s = (k) => (lines || []).reduce((a, l) => a + n(l[k]), 0);
  const t = { gross: s('gross'), paye: s('paye'), nssfEmployee: s('nssfEmployee'), nssfEmployer: s('nssfEmployer'), advances: s('advances'), net: s('net') };
  return { ...t, cost: t.gross + t.nssfEmployer, statutory: t.paye + t.nssfEmployee + t.nssfEmployer };
}
