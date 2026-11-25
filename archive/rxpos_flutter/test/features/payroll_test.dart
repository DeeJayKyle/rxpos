// Payroll & HR: Uganda PAYE bands, NSSF, overtime, unpaid absence, advances taken back, and paying a run as expenses.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/payroll/domain/payroll.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  test('PAYE follows the Uganda monthly bands', () {
    expect(payeUganda(200000), 0);
    expect(payeUganda(235000), 0);
    expect(payeUganda(300000), 6500);
    expect(payeUganda(400000), 23000);
    expect(payeUganda(1000000), 202000);
    expect(payeUganda(12000000), 3702000); // 25,000 + 30% of 11,590,000 + 10% of 2,000,000
  });

  const ann = Employee({'id': 'e1', 'name': 'Ann Sample', 'jobTitle': 'Dispenser', 'basicSalary': 780000, 'allowances': 120000, 'overtimeRate': 5000});
  final attendance = [
    {'id': 'e1-2026-10-02', 'employeeId': 'e1', 'date': '2026-10-02', 'status': 'absent'},
    {'id': 'e1-2026-10-03', 'employeeId': 'e1', 'date': '2026-10-03', 'status': 'absent'},
    {'id': 'e1-2026-10-04', 'employeeId': 'e1', 'date': '2026-10-04', 'status': 'present', 'overtimeHours': 3},
    {'id': 'e1-2026-10-05', 'employeeId': 'e1', 'date': '2026-10-05', 'status': 'leave'},
    {'id': 'e1-2026-09-30', 'employeeId': 'e1', 'date': '2026-09-30', 'status': 'absent'},
  ];
  final advances = [
    {'id': 'a1', 'employeeId': 'e1', 'amount': 100000, 'date': '2026-10-10'},
    {'id': 'a0', 'employeeId': 'e1', 'amount': 50000, 'date': '2026-09-10', 'payrollId': 'old'},
  ];

  test('a pay line: overtime, unpaid days, PAYE, NSSF and the open advance', () {
    final l = payLine(ann, '2026-10', attendance: attendance, advances: advances, deductAbsence: true);
    expect((l.overtime, l.unpaidDays, l.absence, l.gross), (15000, 2, 60000, 855000));
    expect((l.paye, l.nssfEmployee, l.nssfEmployer), (158500, 42750, 85500));
    expect((l.advances, l.net), (100000, 553750));
    expect(l.advanceIds, ['a1']);
    expect((l.present, l.leave), (1, 1));
    // absences are paid unless the run says otherwise; PAYE and NSSF can be switched off per person
    final paid = payLine(const Employee({'id': 'e1', 'basicSalary': 780000, 'paye': false, 'nssf': false}), '2026-10', attendance: attendance, advances: const []);
    expect((paid.absence, paid.gross, paid.paye, paid.nssfEmployee, paid.net), (0, 780000, 0, 0, 780000));
    expect(PayLine.fromJson(l.toJson()).toJson(), l.toJson());
  });

  test('prepare and pay a run: two expenses in the React shape, advances taken back, no second payment', () async {
    await store.update((d) {
      d.put(employeesTable, ann.raw);
      d.put(employeesTable, {'id': 'e2', 'name': 'Former Staff', 'basicSalary': 500000, 'active': false});
      for (final a in [...attendance]) {
        d.put(attendanceTable, a);
      }
      for (final a in advances) {
        d.put(advancesTable, a);
      }
    });
    final staff = (await store.rows(employeesTable)).map(Employee.fromRecord).toList();
    final run = await draftPayroll(store, month: '2026-10', staff: staff, attendance: await store.rows(attendanceTable),
        advances: await store.rows(advancesTable), by: 'Tia', deductAbsence: true);
    expect(linesOf(run).map((l) => l.name), ['Ann Sample']);
    expect(run['status'], 'draft');

    final paid = await payPayroll(store, run, by: 'Tia', date: '2026-10-31', bankId: 'cash-drawer', method: 'Cash',
        categories: await store.rows('expenseCategories'), advances: await store.rows(advancesTable));
    expect(paid['status'], 'paid');
    // the standard "Salaries" category is used, not a second one
    final cats = (await store.rows('expenseCategories')).where((c) => c['name'] == 'Salaries').toList();
    expect(cats.single['id'], 'expcat-salaries');
    final exp = (await store.rows('expenses'))..sort((a, b) => '${a['description']}'.compareTo('${b['description']}'));
    expect(exp.map((e) => (e['description'], e['amount'])), [('PAYE & NSSF 2026-10', 158500 + 42750 + 85500), ('Salaries 2026-10 (1 staff)', 553750)]);
    for (final e in exp) {
      expect(e.keys.toSet(), containsAll(['id', 'date', 'categoryId', 'description', 'amount', 'method', 'bankId', 'payee', 'recordedBy']));
      expect(e['categoryId'], cats.single['id']);
    }
    final adv = {for (final a in await store.rows(advancesTable)) a['id']: a['payrollId']};
    expect(adv, {'a1': run['id'], 'a0': 'old'});
    expect(() => payPayroll(store, paid, by: 'Tia', date: '2026-10-31', bankId: 'cash-drawer', method: 'Cash', categories: cats, advances: const []),
        throwsA(isA<StoreRefused>()));
    expect(() => draftPayroll(store, month: '2026-10', staff: staff, attendance: const [], advances: const [], by: 'Tia', replacing: paid),
        throwsA(isA<StoreRefused>()));
  });

  test('an advance is an expense now and is taken back once', () async {
    final a = await giveAdvance(store, employee: ann, amount: 70000, date: '2026-11-03', bankId: 'cash-drawer', method: 'Cash', by: 'Tia',
        categories: const [{'id': 'c9', 'name': 'salaries'}]);
    final exp = (await store.rows('expenses')).single;
    expect((exp['amount'], exp['categoryId'], exp['payee'], a['expenseId']), (70000, 'c9', 'Ann Sample', exp['id']));
    final l = payLine(ann, '2026-11', attendance: const [], advances: await store.rows(advancesTable));
    expect(l.advances, 70000);
    expect(() => giveAdvance(store, employee: ann, amount: 0, date: '2026-11-03', bankId: 'cash-drawer', method: 'Cash', by: 'Tia', categories: const []),
        throwsA(isA<StoreRefused>()));
  });

  test('attendance is one row a person a day', () async {
    await markAttendance(store, employeeId: 'e1', date: '2026-11-03', status: 'present', by: 'Tia');
    await markAttendance(store, employeeId: 'e1', date: '2026-11-03', status: 'sick', by: 'Tia');
    final rows = await store.rows(attendanceTable);
    expect(rows.map((r) => r['status']), ['sick']);
  });
}
