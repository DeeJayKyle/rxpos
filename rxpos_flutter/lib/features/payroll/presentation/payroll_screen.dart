import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../finance/domain/ledger.dart' show cashDrawer;
import '../../finance/presentation/finance_screen.dart' show payMethods;
import '../domain/payroll.dart';

const payrollTabs = [('staff', 'Staff'), ('attendance', 'Attendance & leave'), ('advances', 'Advances'), ('runs', 'Payroll')];

/// Payroll & HR: the staff list with pay, daily attendance and leave, salary advances, and monthly payroll runs
/// (PAYE, NSSF, advances taken back) that are paid as expenses, with payslips and exports.
class PayrollScreen extends ConsumerStatefulWidget {
  const PayrollScreen({super.key, this.tab = 'staff'});
  final String tab;
  @override
  ConsumerState<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends ConsumerState<PayrollScreen> {
  late String _tab = payrollTabs.any((t) => t.$1 == widget.tab) ? widget.tab : 'staff';
  String _day = today();
  String _month = today().substring(0, 7);

  RecordStore get _store => ref.read(recordStoreProvider);
  Future<String> _who() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

  Future<void> _run(Future<void> Function() f) async {
    try {
      await f();
    } on StoreRefused catch (e) {
      if (mounted) say(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = {for (final n in [...payrollTables, 'banks', 'expenseCategories']) n: ref.watch(tableProvider(n)).value};
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (t.values.any((v) => v == null)) return const Center(child: CircularProgressIndicator());
    final staff = t[employeesTable]!.map(Employee.fromRecord).toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    final banks = [(cashDrawer, 'Cash at hand'), for (final b in t['banks']!) if (b['id'] != cashDrawer) ('${b['id']}', '${b['name']}')];
    final body = switch (_tab) {
      'attendance' => _attendance(staff, t[attendanceTable]!),
      'advances' => _advances(staff, t[advancesTable]!, banks, t['expenseCategories']!, st),
      'runs' => _runs(staff, t, banks, st),
      _ => _staff(staff, st),
    };
    final active = staff.where((e) => e.active).toList();
    return PageFrame(
      title: 'Payroll & HR',
      subtitle: '${active.length} on the payroll · ${st.money(active.fold<double>(0, (a, e) => a + e.basic + e.allowances))} a month before overtime',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final (k, l) in payrollTabs)
              Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(key: Key('payroll-tab-$k'), label: Text(l), selected: _tab == k, onSelected: (_) => setState(() => _tab = k))),
          ]),
        ),
        const SizedBox(height: 8),
        Expanded(child: body),
      ]),
    );
  }

  Widget _head(List<Widget> children) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: children));
  Widget _list(List<Widget> rows, String empty) => rows.isEmpty ? EmptyState(empty) : ListView.separated(itemCount: rows.length, separatorBuilder: (_, _) => const Divider(height: 1), itemBuilder: (_, i) => rows[i]);
  Widget _monthField() => SizedBox(width: 140, child: TextFormField(key: ValueKey('month-$_tab'), initialValue: _month, decoration: const InputDecoration(labelText: 'Month', hintText: 'YYYY-MM', isDense: true),
      onChanged: (v) => setState(() => _month = RegExp(r'^\d{4}-\d{2}$').hasMatch(v.trim()) ? v.trim() : _month)));

  // ---- Staff ----
  Widget _staff(List<Employee> staff, PharmacySettings st) {
    Future<void> edit(Employee? e) async {
      final v = await editRecord(context, title: e == null ? 'New staff member' : 'Edit ${e.name}', delete: e == null ? null : 'staff member',
          initial: e?.raw ?? const {'active': true, 'paye': true, 'nssf': true, 'paymentMethod': 'Cash'}, fields: [
        const FormFieldSpec('name', 'Full name', required: true),
        const FormFieldSpec('jobTitle', 'Job title'),
        const FormFieldSpec('phone', 'Phone'),
        const FormFieldSpec('startDate', 'Started on', kind: FieldKind.date),
        const FormFieldSpec('basicSalary', 'Basic salary a month', kind: FieldKind.number, required: true),
        const FormFieldSpec('allowances', 'Allowances a month (transport, lunch…)', kind: FieldKind.number),
        const FormFieldSpec('overtimeRate', 'Overtime pay an hour', kind: FieldKind.number),
        const FormFieldSpec('paye', 'Deduct PAYE (Uganda bands)', kind: FieldKind.flag),
        const FormFieldSpec('nssf', 'Deduct NSSF (5% employee, 10% employer)', kind: FieldKind.flag),
        const FormFieldSpec('nssfNo', 'NSSF number'),
        const FormFieldSpec('tin', 'TIN'),
        FormFieldSpec('paymentMethod', 'Paid by', kind: FieldKind.choice, options: [for (final m in payMethods) (m, m)]),
        const FormFieldSpec('account', 'Bank or mobile money account'),
        const FormFieldSpec('active', 'On the payroll', kind: FieldKind.flag),
      ]);
      if (v == null) return;
      final by = await _who();
      await _store.update((d) {
        if (identical(v, deleteRecord) && e != null) {
          d.del(employeesTable, e.id);
          d.audit(by, 'Staff member removed', e.name);
          return;
        }
        d.put(employeesTable, {...?e?.raw, ...v, 'id': e?.id ?? uid()});
        d.audit(by, e == null ? 'Staff member added' : 'Staff member edited', '${v['name']}');
      });
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        FilledButton.icon(key: const Key('add-employee'), onPressed: () => edit(null), icon: const Icon(Icons.person_add_alt), label: const Text('Add staff member')),
        ExportButtons(name: 'staff', settings: st, title: 'Staff', csv: () => [
          for (final e in staff) {'name': e.name, 'jobTitle': e.jobTitle, 'phone': e.raw['phone'], 'startDate': e.raw['startDate'], 'basicSalary': e.basic,
            'allowances': e.allowances, 'overtimeRate': e.overtimeRate, 'paye': e.paye, 'nssf': e.nssf, 'nssfNo': e.raw['nssfNo'], 'tin': e.raw['tin'], 'active': e.active},
        ]),
      ]),
      Expanded(child: _list([
        for (final e in staff)
          ListTile(
            leading: CircleAvatar(child: Text(e.name.isEmpty ? '?' : e.name[0].toUpperCase())),
            title: Text(e.name + (e.active ? '' : ' (left)')),
            subtitle: Text([if (e.jobTitle.isNotEmpty) e.jobTitle, if ('${e.raw['phone'] ?? ''}'.isNotEmpty) '${e.raw['phone']}', if (!e.paye) 'no PAYE', if (!e.nssf) 'no NSSF'].join(' · ')),
            trailing: Text(st.money(e.basic + e.allowances)),
            onTap: () => edit(e),
          ),
      ], 'Nobody on the staff list yet: add the people you pay, whether or not they use RxPOS.')),
    ]);
  }

  // ---- Attendance & leave ----
  Widget _attendance(List<Employee> staff, List<Map<String, Object?>> attendance) {
    final active = staff.where((e) => e.active).toList();
    final byId = {for (final a in attendance) if (a['date'] == _day) '${a['employeeId']}': a};
    final month = _day.substring(0, 7);
    int count(String id, String status) => attendance.where((a) => a['employeeId'] == id && '${a['date']}'.startsWith(month) && a['status'] == status).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        SizedBox(width: 150, child: TextFormField(key: const Key('attendance-day'), initialValue: _day, decoration: const InputDecoration(labelText: 'Day', hintText: 'YYYY-MM-DD', isDense: true),
            onChanged: (v) => setState(() => _day = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v.trim()) ? v.trim() : _day))),
        OutlinedButton(onPressed: () async {
          final by = await _who();
          for (final e in active) {
            if (!byId.containsKey(e.id)) await markAttendance(_store, employeeId: e.id, date: _day, status: 'present', by: by);
          }
        }, child: const Text('Everyone else present')),
      ]),
      Expanded(child: _list([
        for (final e in active)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              SizedBox(width: 200, child: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w600))),
              for (final (k, l) in attendanceKinds)
                ChoiceChip(key: Key('att-${e.id}-$k'), label: Text(l), selected: byId[e.id]?['status'] == k, onSelected: (_) async =>
                    markAttendance(_store, employeeId: e.id, date: _day, status: k, overtimeHours: ((byId[e.id]?['overtimeHours'] as num?) ?? 0).toDouble(), by: await _who())),
              if (e.overtimeRate > 0)
                ActionChip(label: Text('Overtime ${(byId[e.id]?['overtimeHours'] as num?) ?? 0} h'), onPressed: () async {
                  final v = await editRecord(context, title: 'Overtime for ${e.name} on $_day', fields: const [FormFieldSpec('h', 'Hours', kind: FieldKind.number)],
                      initial: {'h': byId[e.id]?['overtimeHours'] ?? 0});
                  if (v == null) return;
                  await markAttendance(_store, employeeId: e.id, date: _day, status: '${byId[e.id]?['status'] ?? 'present'}', overtimeHours: ((v['h'] as num?) ?? 0).toDouble(), by: await _who());
                }),
              Text('$month: ${count(e.id, 'present')} present, ${count(e.id, 'absent')} absent, ${count(e.id, 'leave') + count(e.id, 'sick')} leave/sick',
                  style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
      ], 'Add staff first, then mark each day here.')),
    ]);
  }

  // ---- Advances ----
  Widget _advances(List<Employee> staff, List<Map<String, Object?>> advances, List<(String, String)> banks, List<Map<String, Object?>> cats, PharmacySettings st) {
    String nameOf(Object? id) => staff.where((e) => e.id == '$id').firstOrNull?.name ?? '—';
    final rows = [...advances]..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        FilledButton.icon(onPressed: staff.isEmpty ? null : () async {
          final v = await editRecord(context, title: 'Salary advance', save: 'Give advance', initial: {'date': today(), 'bankId': cashDrawer, 'method': 'Cash'}, fields: [
            FormFieldSpec('employeeId', 'To', kind: FieldKind.choice, required: true, options: [for (final e in staff) if (e.active) (e.id, e.name)]),
            const FormFieldSpec('amount', 'Amount', kind: FieldKind.number, required: true),
            const FormFieldSpec('date', 'Date', kind: FieldKind.date, required: true),
            FormFieldSpec('method', 'Payment method', kind: FieldKind.choice, options: [for (final m in payMethods) (m, m)]),
            FormFieldSpec('bankId', 'Paid from', kind: FieldKind.choice, options: banks),
            const FormFieldSpec('note', 'Note'),
          ]);
          if (v == null) return;
          final by = await _who();
          await _run(() => giveAdvance(_store, employee: staff.firstWhere((e) => e.id == v['employeeId']), amount: ((v['amount'] as num?) ?? 0).toDouble(),
              date: '${v['date']}', bankId: '${v['bankId'] ?? cashDrawer}', method: '${v['method'] ?? 'Cash'}', by: by, categories: cats, note: '${v['note'] ?? ''}'));
        }, icon: const Icon(Icons.payments_outlined), label: const Text('Give an advance')),
        Text('Not yet taken back: ${st.money(advances.where((a) => (a['payrollId'] ?? '') == '').fold<double>(0, (s, a) => s + ((a['amount'] as num?) ?? 0)))}'),
      ]),
      Expanded(child: _list([
        for (final a in rows)
          ListTile(
            title: Text('${nameOf(a['employeeId'])} · ${st.money((a['amount'] as num?) ?? 0)}'),
            subtitle: Text('${a['date']}${'${a['note'] ?? ''}'.isEmpty ? '' : ' · ${a['note']}'}'),
            trailing: Text((a['payrollId'] ?? '') == '' ? 'to take back' : 'taken back'),
          ),
      ], 'No advances given.')),
    ]);
  }

  // ---- Payroll runs ----
  Widget _runs(List<Employee> staff, Map<String, List<Map<String, Object?>>?> t, List<(String, String)> banks, PharmacySettings st) {
    final runs = [...t[payrollsTable]!]..sort((a, b) => '${b['month']}'.compareTo('${a['month']}'));
    final run = runs.where((r) => r['month'] == _month).firstOrNull;
    final lines = run == null ? const <PayLine>[] : linesOf(run);
    final tot = totalsOf(lines);
    final paid = run?['status'] == 'paid';

    Future<void> prepare() async {
      final v = await editRecord(context, title: 'Payroll for $_month', save: run == null ? 'Prepare' : 'Recalculate',
          initial: {'workingDays': run?['workingDays'] ?? 26, 'deductAbsence': run?['deductAbsence'] ?? false}, fields: const [
        FormFieldSpec('workingDays', 'Working days in the month', kind: FieldKind.number, required: true),
        FormFieldSpec('deductAbsence', 'Take unpaid absences off the basic pay', kind: FieldKind.flag),
      ]);
      if (v == null) return;
      final by = await _who();
      await _run(() => draftPayroll(_store, month: _month, staff: staff, attendance: t[attendanceTable]!, advances: t[advancesTable]!, by: by, replacing: run,
          workingDays: ((v['workingDays'] as num?) ?? 26).round(), deductAbsence: v['deductAbsence'] == true));
    }

    Future<void> pay() async {
      final v = await editRecord(context, title: 'Pay the $_month payroll', save: 'Mark as paid', initial: {'date': today(), 'bankId': cashDrawer, 'method': 'Cash'}, fields: [
        const FormFieldSpec('date', 'Paid on', kind: FieldKind.date, required: true),
        FormFieldSpec('method', 'Payment method', kind: FieldKind.choice, options: [for (final m in payMethods) (m, m)]),
        FormFieldSpec('bankId', 'Paid from', kind: FieldKind.choice, options: banks),
      ]);
      if (v == null || run == null) return;
      final by = await _who();
      await _run(() async {
        await payPayroll(_store, run, by: by, date: '${v['date']}', bankId: '${v['bankId'] ?? cashDrawer}', method: '${v['method'] ?? 'Cash'}',
            categories: t['expenseCategories']!, advances: t[advancesTable]!);
        if (mounted) say(context, 'Paid: ${st.money(tot.net)} net pay and ${st.money(tot.statutory)} PAYE & NSSF recorded as expenses');
      });
    }

    List<Map<String, Object?>> table() => [
          for (final l in lines) {'name': l.name, 'jobTitle': l.jobTitle, 'basic': l.basic, 'allowances': l.allowances, 'overtime': l.overtime, 'absence': l.absence,
            'gross': l.gross, 'paye': l.paye, 'nssfEmployee': l.nssfEmployee, 'advances': l.advances, 'net': l.net, 'nssfEmployer': l.nssfEmployer},
        ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _head([
        _monthField(),
        if (!paid) FilledButton.icon(key: const Key('prepare-payroll'), onPressed: staff.isEmpty ? null : prepare, icon: const Icon(Icons.calculate_outlined),
            label: Text(run == null ? 'Prepare payroll' : 'Recalculate')),
        if (run != null && !paid) FilledButton.tonalIcon(key: const Key('pay-payroll'), onPressed: pay, icon: const Icon(Icons.check_circle_outline), label: const Text('Mark as paid')),
        if (run != null) ...[
          OutlinedButton.icon(onPressed: () => Printing.layoutPdf(name: 'Payslips $_month', onLayout: (_) => payslipsPdf(st, _month, lines)),
              icon: const Icon(Icons.print_outlined, size: 18), label: const Text('Payslips')),
          ExportButtons(name: 'payroll-$_month', settings: st, title: 'Payroll $_month', csv: table),
        ],
        if (paid) Chip(avatar: const Icon(Icons.verified_outlined, size: 18), label: Text('Paid on ${run!['paidOn'] ?? ''}')),
      ]),
      if (run != null)
        StatGrid(children: [
          StatCard(label: 'Gross pay', value: st.money(tot.gross), sub: '${lines.length} staff'),
          StatCard(label: 'Net pay', value: st.money(tot.net), sub: 'after PAYE, NSSF and advances'),
          StatCard(label: 'PAYE', value: st.money(tot.paye)),
          StatCard(label: 'NSSF', value: st.money(tot.nssfEmployee + tot.nssfEmployer), sub: '${st.money(tot.nssfEmployee)} staff + ${st.money(tot.nssfEmployer)} employer'),
          StatCard(label: 'Cost to the pharmacy', value: st.money(tot.cost)),
        ]),
      const SizedBox(height: 8),
      Expanded(child: run == null
          ? EmptyState(staff.isEmpty ? 'Add staff first.' : 'No payroll for $_month yet: prepare it from the staff list, attendance and advances.')
          : _list([
              for (final l in lines)
                ListTile(
                  title: Text('${l.name}${l.jobTitle.isEmpty ? '' : ' · ${l.jobTitle}'}'),
                  subtitle: Text([
                    'Gross ${st.money(l.gross)}',
                    if (l.overtime > 0) 'overtime ${st.money(l.overtime)}',
                    if (l.absence > 0) '${l.unpaidDays} unpaid day(s) −${st.money(l.absence)}',
                    'PAYE ${st.money(l.paye)}', 'NSSF ${st.money(l.nssfEmployee)}',
                    if (l.advances > 0) 'advances −${st.money(l.advances)}',
                  ].join(' · ')),
                  trailing: Text(st.money(l.net), style: const TextStyle(fontWeight: FontWeight.w700)),
                  onTap: () => Printing.layoutPdf(name: 'Payslip ${l.name} $_month', onLayout: (_) => payslipsPdf(st, _month, [l])),
                ),
            ], '')),
      if (runs.length > 1 || (runs.isNotEmpty && run == null))
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(spacing: 6, runSpacing: 6, children: [
            for (final r in runs.take(12))
              ActionChip(label: Text('${r['month']} · ${r['status'] == 'paid' ? 'paid' : 'draft'}'), onPressed: () => setState(() => _month = '${r['month']}')),
          ]),
        ),
    ]);
  }
}

/// Payslips, one A5 page each.
Future<Uint8List> payslipsPdf(PharmacySettings st, String month, List<PayLine> lines) {
  final doc = pw.Document();
  for (final l in lines) {
    pw.Widget row(String a, double v, {bool bold = false, bool minus = false}) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(vertical: 2),
          child: pw.Row(children: [
            pw.Expanded(child: pw.Text(a, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null))),
            pw.Text('${minus && v > 0 ? '-' : ''}${st.money(v)}', style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
          ]),
        );
    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a5,
      margin: const pw.EdgeInsets.all(28),
      build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
        pw.Text(st.name, style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
        if (st.address.isNotEmpty) pw.Text(st.address),
        pw.SizedBox(height: 10),
        pw.Text('PAYSLIP · $month', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
        pw.Text('${l.name}${l.jobTitle.isEmpty ? '' : ' · ${l.jobTitle}'}'),
        if (l.present + l.leave + l.unpaidDays > 0) pw.Text('Days present ${l.present} · leave/sick ${l.leave}${l.unpaidDays > 0 ? ' · unpaid ${l.unpaidDays}' : ''}'),
        pw.Divider(),
        pw.Text('Earnings', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        row('Basic salary', l.basic),
        if (l.allowances > 0) row('Allowances', l.allowances),
        if (l.overtime > 0) row('Overtime (${l.overtimeHours} h)', l.overtime),
        if (l.absence > 0) row('Unpaid absence (${l.unpaidDays} day(s))', l.absence, minus: true),
        row('Gross pay', l.gross, bold: true),
        pw.SizedBox(height: 8),
        pw.Text('Deductions', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        row('PAYE', l.paye, minus: true),
        row('NSSF (5%)', l.nssfEmployee, minus: true),
        if (l.advances > 0) row('Salary advances', l.advances, minus: true),
        pw.Divider(),
        row('NET PAY', l.net, bold: true),
        pw.SizedBox(height: 6),
        pw.Text('Employer NSSF contribution (10%): ${st.money(l.nssfEmployer)}', style: const pw.TextStyle(fontSize: 9)),
        pw.Spacer(),
        pw.Row(children: [
          pw.Expanded(child: pw.Text('Employee ____________')),
          pw.Text('For ${st.name} ____________'),
        ]),
      ]),
    ));
  }
  return doc.save();
}
