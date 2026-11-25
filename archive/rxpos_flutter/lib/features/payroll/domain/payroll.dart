// Payroll & HR: the staff on the payroll (who may or may not use the app), their daily attendance and leave, salary
// advances, and monthly payroll runs with Uganda PAYE and NSSF. Paying a run records the net pay and the statutory
// deductions as ordinary expenses (category "Salaries"), in the same shape the React app's expenses have, so the
// cash book, the reports and the profit figures include them. Staff, attendance, advances and runs are tables of their
// own that only this app reads; the cloud only lets people with the Payroll permission change or download them.
import '../../../core/data/record_store.dart';
import '../../../core/rules/ids.dart';

const employeesTable = 'employees', attendanceTable = 'attendance', advancesTable = 'salaryAdvances', payrollsTable = 'payrolls';
const payrollTables = [employeesTable, attendanceTable, advancesTable, payrollsTable];

/// A day's attendance: present, absent (unpaid when the run says so), on leave or sick (paid), or a day off.
const attendanceKinds = [('present', 'Present'), ('absent', 'Absent'), ('leave', 'Leave'), ('sick', 'Sick'), ('off', 'Day off')];

const salariesCategory = 'Salaries';

double _n(Object? v) => (v as num?)?.toDouble() ?? double.tryParse('${v ?? ''}') ?? 0;
double _round(double v) => v.roundToDouble();

/// Uganda PAYE on a resident's monthly taxable pay (Income Tax Act, Third Schedule, as of 2026): nothing up to
/// 235,000; 10% of the part over 235,000; 10,000 + 20% over 335,000; 25,000 + 30% over 410,000; and a further 10% on
/// the part over 10,000,000.
double payeUganda(double gross) {
  if (gross <= 235000) return 0;
  if (gross <= 335000) return _round((gross - 235000) * .10);
  if (gross <= 410000) return _round(10000 + (gross - 335000) * .20);
  var tax = 25000 + (gross - 410000) * .30;
  if (gross > 10000000) tax += (gross - 10000000) * .10;
  return _round(tax);
}

/// NSSF: 5% of gross pay from the employee, 10% from the employer.
const nssfEmployeeRate = .05, nssfEmployerRate = .10;

class Employee {
  const Employee(this.raw);
  final Map<String, Object?> raw;
  factory Employee.fromRecord(Map<String, Object?> r) => Employee(r);
  String get id => '${raw['id']}';
  String get name => '${raw['name'] ?? ''}';
  String get jobTitle => '${raw['jobTitle'] ?? ''}';
  double get basic => _n(raw['basicSalary']);
  double get allowances => _n(raw['allowances']);
  /// pay for one hour of overtime (0: none)
  double get overtimeRate => _n(raw['overtimeRate']);
  bool get active => raw['active'] != false;
  bool get paye => raw['paye'] != false;
  bool get nssf => raw['nssf'] != false;
}

/// One person's line in a payroll run.
class PayLine {
  const PayLine({required this.employeeId, required this.name, required this.jobTitle, required this.basic, required this.allowances,
      required this.overtimeHours, required this.overtime, required this.unpaidDays, required this.absence, required this.gross,
      required this.paye, required this.nssfEmployee, required this.nssfEmployer, required this.advances, required this.advanceIds,
      required this.net, this.present = 0, this.leave = 0});
  final String employeeId, name, jobTitle;
  final double basic, allowances, overtimeHours, overtime, absence, gross, paye, nssfEmployee, nssfEmployer, advances, net;
  final int unpaidDays, present, leave;
  final List<String> advanceIds;
  double get deductions => paye + nssfEmployee + advances;

  Map<String, Object?> toJson() => {
        'employeeId': employeeId, 'name': name, 'jobTitle': jobTitle, 'basic': basic, 'allowances': allowances, 'overtimeHours': overtimeHours,
        'overtime': overtime, 'unpaidDays': unpaidDays, 'absence': absence, 'gross': gross, 'paye': paye, 'nssfEmployee': nssfEmployee,
        'nssfEmployer': nssfEmployer, 'advances': advances, 'advanceIds': advanceIds, 'net': net, 'present': present, 'leave': leave,
      };
  factory PayLine.fromJson(Map<String, Object?> j) => PayLine(
        employeeId: '${j['employeeId']}', name: '${j['name'] ?? ''}', jobTitle: '${j['jobTitle'] ?? ''}', basic: _n(j['basic']),
        allowances: _n(j['allowances']), overtimeHours: _n(j['overtimeHours']), overtime: _n(j['overtime']), unpaidDays: _n(j['unpaidDays']).round(),
        absence: _n(j['absence']), gross: _n(j['gross']), paye: _n(j['paye']), nssfEmployee: _n(j['nssfEmployee']), nssfEmployer: _n(j['nssfEmployer']),
        advances: _n(j['advances']), advanceIds: [for (final a in (j['advanceIds'] as List?) ?? const []) '$a'], net: _n(j['net']),
        present: _n(j['present']).round(), leave: _n(j['leave']).round(),
      );
}

/// The advances given to [employeeId] that no payroll has taken back yet.
List<Map<String, Object?>> openAdvances(Iterable<Map<String, Object?>> advances, String employeeId) =>
    [for (final a in advances) if ('${a['employeeId']}' == employeeId && (a['payrollId'] ?? '') == '') a];

/// [e]'s pay for [month] (YYYY-MM): basic + allowances + overtime − unpaid absence (basic ÷ [workingDays] a day, when
/// [deductAbsence]) = gross; less PAYE, the employee's NSSF and the advances still open = net.
PayLine payLine(Employee e, String month, {required Iterable<Map<String, Object?>> attendance, required Iterable<Map<String, Object?>> advances,
    int workingDays = 26, bool deductAbsence = false}) {
  final days = [for (final a in attendance) if ('${a['employeeId']}' == e.id && '${a['date']}'.startsWith(month)) a];
  final unpaid = days.where((a) => a['status'] == 'absent').length;
  final hours = days.fold<double>(0, (s, a) => s + _n(a['overtimeHours']));
  final overtime = _round(hours * e.overtimeRate);
  final absence = deductAbsence && workingDays > 0 ? _round(e.basic / workingDays * unpaid).clamp(0, e.basic).toDouble() : 0.0;
  final gross = e.basic + e.allowances + overtime - absence;
  final paye = e.paye ? payeUganda(gross) : 0.0;
  final nssfEe = e.nssf ? _round(gross * nssfEmployeeRate) : 0.0;
  final nssfEr = e.nssf ? _round(gross * nssfEmployerRate) : 0.0;
  final open = openAdvances(advances, e.id);
  final adv = open.fold<double>(0, (s, a) => s + _n(a['amount']));
  return PayLine(
    employeeId: e.id, name: e.name, jobTitle: e.jobTitle, basic: e.basic, allowances: e.allowances, overtimeHours: hours, overtime: overtime,
    unpaidDays: deductAbsence ? unpaid : 0, absence: absence, gross: gross, paye: paye, nssfEmployee: nssfEe, nssfEmployer: nssfEr,
    advances: adv, advanceIds: [for (final a in open) '${a['id']}'], net: gross - paye - nssfEe - adv,
    present: days.where((a) => a['status'] == 'present').length, leave: days.where((a) => a['status'] == 'leave' || a['status'] == 'sick').length,
  );
}

class PayrollTotals {
  const PayrollTotals(this.gross, this.paye, this.nssfEmployee, this.nssfEmployer, this.advances, this.net);
  final double gross, paye, nssfEmployee, nssfEmployer, advances, net;
  /// what the month costs the pharmacy: gross pay + the employer's NSSF
  double get cost => gross + nssfEmployer;
  /// owed to URA and NSSF for the month
  double get statutory => paye + nssfEmployee + nssfEmployer;
}

PayrollTotals totalsOf(Iterable<PayLine> lines) {
  double s(double Function(PayLine) f) => lines.fold(0, (a, l) => a + f(l));
  return PayrollTotals(s((l) => l.gross), s((l) => l.paye), s((l) => l.nssfEmployee), s((l) => l.nssfEmployer), s((l) => l.advances), s((l) => l.net));
}

List<PayLine> linesOf(Map<String, Object?> run) => [for (final l in (run['lines'] as List?) ?? const []) PayLine.fromJson((l as Map).cast<String, Object?>())];

/// Save a draft run for [month] for every active employee (replacing an earlier draft of that month).
Future<Map<String, Object?>> draftPayroll(RecordStore store, {required String month, required List<Employee> staff,
    required Iterable<Map<String, Object?>> attendance, required Iterable<Map<String, Object?>> advances, required String by,
    Map<String, Object?>? replacing, int workingDays = 26, bool deductAbsence = false}) {
  if (replacing != null && replacing['status'] == 'paid') throw StoreRefused('The ${replacing['month']} payroll is already paid.');
  final lines = [for (final e in staff) if (e.active) payLine(e, month, attendance: attendance, advances: advances, workingDays: workingDays, deductAbsence: deductAbsence)];
  if (lines.isEmpty) throw StoreRefused('There is nobody active on the staff list.');
  return store.update((d) {
    final run = d.put(payrollsTable, {
      'id': replacing?['id'] ?? uid(), 'month': month, 'status': 'draft', 'workingDays': workingDays, 'deductAbsence': deductAbsence,
      'lines': [for (final l in lines) l.toJson()], 'createdBy': replacing?['createdBy'] ?? by, 'date': replacing?['date'] ?? d.now,
    });
    d.audit(by, replacing == null ? 'Payroll prepared' : 'Payroll recalculated', '$month: ${lines.length} staff');
    return run;
  });
}

/// Pay a draft run: it becomes paid (no longer changes), its advances are marked as taken back, and two expenses
/// are recorded: the net pay, and PAYE + NSSF (both shares) owed for the month.
Future<Map<String, Object?>> payPayroll(RecordStore store, Map<String, Object?> run, {required String by, required String date,
    required String bankId, required String method, required Iterable<Map<String, Object?>> categories,
    required Iterable<Map<String, Object?>> advances}) {
  if (run['status'] == 'paid') throw StoreRefused('This payroll is already paid.');
  final lines = linesOf(run), t = totalsOf(lines);
  return store.update((d) {
    var cat = categories.where((c) => '${c['name']}'.toLowerCase() == salariesCategory.toLowerCase()).firstOrNull;
    cat ??= d.put('expenseCategories', {'id': uid(), 'name': salariesCategory});
    Map<String, Object?> expense(String what, double amount, String payee) => d.put('expenses', {
          'id': uid(), 'date': date, 'categoryId': cat!['id'], 'description': what, 'amount': amount, 'method': method, 'bankId': bankId,
          'payee': payee, 'recordedBy': by,
        });
    final pay = expense('Salaries ${run['month']} (${lines.length} staff)', t.net, 'Staff');
    final tax = t.statutory > 0 ? expense('PAYE & NSSF ${run['month']}', t.statutory, 'URA / NSSF') : null;
    final ids = {for (final l in lines) ...l.advanceIds};
    for (final a in advances) {
      if (ids.contains('${a['id']}')) d.put(advancesTable, {...a, 'payrollId': run['id']});
    }
    final paid = d.put(payrollsTable, {...run, 'status': 'paid', 'paidAt': d.now, 'paidOn': date, 'paidBy': by, 'bankId': bankId, 'method': method,
      'expenseIds': [pay['id'], if (tax != null) tax['id']]});
    d.audit(by, 'Payroll paid', '${run['month']}: net ${t.net}, PAYE & NSSF ${t.statutory}');
    return paid;
  });
}

/// Give [employeeId] a salary advance: recorded as an expense now (category "Salaries") and taken back from the next payroll.
Future<Map<String, Object?>> giveAdvance(RecordStore store, {required Employee employee, required double amount, required String date,
    required String bankId, required String method, required String by, required Iterable<Map<String, Object?>> categories, String note = ''}) {
  if (amount <= 0) throw StoreRefused('An advance must be more than nothing.');
  return store.update((d) {
    var cat = categories.where((c) => '${c['name']}'.toLowerCase() == salariesCategory.toLowerCase()).firstOrNull;
    cat ??= d.put('expenseCategories', {'id': uid(), 'name': salariesCategory});
    final exp = d.put('expenses', {'id': uid(), 'date': date, 'categoryId': cat['id'], 'description': 'Salary advance: ${employee.name}',
      'amount': amount, 'method': method, 'bankId': bankId, 'payee': employee.name, 'recordedBy': by});
    final a = d.put(advancesTable, {'id': uid(), 'employeeId': employee.id, 'date': date, 'amount': amount, 'note': note, 'expenseId': exp['id'], 'by': by});
    d.audit(by, 'Salary advance', '${employee.name}: $amount');
    return a;
  });
}

/// Record [employeeId]'s attendance on [date] (one row a person a day).
Future<void> markAttendance(RecordStore store, {required String employeeId, required String date, required String status, double overtimeHours = 0,
    String note = '', required String by}) =>
    store.update((d) => d.put(attendanceTable, {'id': '$employeeId-$date', 'employeeId': employeeId, 'date': date, 'status': status,
      'overtimeHours': overtimeHours, 'note': note, 'by': by}));
