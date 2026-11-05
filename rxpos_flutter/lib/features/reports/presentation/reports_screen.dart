import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../sales_history/presentation/sales_lines.dart';
import '../domain/reports.dart';

/// Reports: for a date range, the profit summary and sales by day, payment method, medicine and cashier; print as PDF.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});
  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _from = '${today().substring(0, 7)}-01', _to = today();
  String _by = 'medicine';

  @override
  Widget build(BuildContext context) {
    final sales = ref.watch(tableProvider('sales')).value;
    final expenses = ref.watch(tableProvider('expenses')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (sales == null || expenses == null) return const Center(child: CircularProgressIndicator());
    final r = report(sales.map(Sale.fromRecord), expenses, from: _from, to: _to);
    final lines = (switch (_by) { 'day' => r.byDay, 'method' => r.byMethod, 'cashier' => r.byCashier, _ => r.byMedicine }).values.toList()
      ..sort((a, b) => _by == 'day' ? b.key.compareTo(a.key) : b.amount.compareTo(a.amount));
    Widget range(String label, String value, ValueChanged<String> set) => SizedBox(width: 130,
        child: TextFormField(initialValue: value, decoration: InputDecoration(labelText: label, isDense: true), onChanged: (v) { if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v.trim())) setState(() => set(v.trim())); }));
    return PageFrame(
      title: 'Reports',
      subtitle: '$_from to $_to',
      actions: [
        range('From', _from, (v) => _from = v),
        range('To', _to, (v) => _to = v),
        OutlinedButton.icon(onPressed: () => Printing.layoutPdf(onLayout: (_) => _pdf(r, lines, st)), icon: const Icon(Icons.print_outlined), label: const Text('Print / PDF')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          StatCard(label: 'Sales', value: st.money(r.sales), sub: '${r.count} sales · discounts ${st.money(r.discounts)}'),
          StatCard(label: 'Cost of goods', value: st.money(r.cogs)),
          StatCard(label: 'Gross profit', value: st.money(r.grossProfit), sub: 'sales − tax − cost of goods', color: Colors.deepPurple),
          StatCard(label: 'Expenses', value: st.money(r.expenses)),
          StatCard(label: 'Net profit', value: st.money(r.netProfit), color: r.netProfit < 0 ? Theme.of(context).colorScheme.error : Colors.green.shade700),
          StatCard(label: 'Refunds', value: st.money(r.refundTotal), sub: '${r.refunds} refunded'),
          if (r.tax > 0) StatCard(label: 'Tax', value: st.money(r.tax)),
          if (r.credit > 0) StatCard(label: 'Sold on credit', value: st.money(r.credit)),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 6, children: [
          for (final (k, l) in const [('medicine', 'By medicine'), ('day', 'By day'), ('method', 'By payment'), ('cashier', 'By cashier'), ('lines', 'Sales lines')])
            ChoiceChip(label: Text(l), selected: _by == k, onSelected: (_) => setState(() => _by = k)),
        ]),
        const SizedBox(height: 8),
        if (_by == 'lines') SalesLinesView(key: ValueKey('$_from|$_to'), from: _from, to: _to)
        else if (lines.isEmpty) const Text('No sales in this period.'),
        if (_by != 'lines')
        for (final l in lines)
          ListTile(dense: true, title: Text(l.key.isEmpty ? '—' : l.key),
              subtitle: Text(_by == 'medicine' ? '${formatQty(l.qty)} sold · profit ${st.money(l.profit)}' : '${l.sales} sales${_by == 'method' ? '' : ' · profit ${st.money(l.profit)}'}'),
              trailing: Text(st.money(l.amount), style: const TextStyle(fontWeight: FontWeight.w700))),
      ]),
    );
  }

  Future<List<int>> _pdfBytes(Report r, List<Line> lines, PharmacySettings st) async {
    final doc = pw.Document();
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      build: (_) => [
        pw.Text('${st.name} – report $_from to $_to', style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 8),
        pw.TableHelper.fromTextArray(data: [
          ['Sales', st.money(r.sales)], ['Cost of goods', st.money(r.cogs)], ['Gross profit', st.money(r.grossProfit)],
          ['Expenses', st.money(r.expenses)], ['Net profit', st.money(r.netProfit)], ['Refunds', st.money(r.refundTotal)],
        ]),
        pw.SizedBox(height: 12),
        pw.TableHelper.fromTextArray(headers: ['', 'Quantity', 'Amount', 'Profit'],
            data: [for (final l in lines) [l.key, formatQty(l.qty), st.money(l.amount), st.money(l.profit)]]),
      ],
    ));
    return doc.save();
  }

  Future<Uint8List> _pdf(Report r, List<Line> lines, PharmacySettings st) async => Uint8List.fromList(await _pdfBytes(r, lines, st));
}
