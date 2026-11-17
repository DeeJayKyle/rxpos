// The refund sheet (src/components/RefundSheet.jsx): before a refund, one sheet shows each line and the batch its
// stock goes back to (a kit: each of its medicines), the money going back and how, whether the sale is in a closed
// day, and asks why. Returns the reason, or null when the sale is kept.
import 'package:flutter/material.dart';

import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/kits.dart';
import '../../../core/rules/money.dart';
import '../domain/refund.dart';

Future<String?> showRefundSheet(BuildContext context, Sale sale, PharmacySettings st, {List<Map<String, Object?>> batches = const [], bool closedDay = false}) =>
    showAppDialog<String>(context: context, builder: (_) => RefundSheet(sale: sale, settings: st, batches: batches, closedDay: closedDay));

class RefundSheet extends StatefulWidget {
  const RefundSheet({super.key, required this.sale, required this.settings, this.batches = const [], this.closedDay = false});
  final Sale sale;
  final PharmacySettings settings;
  final List<Map<String, Object?>> batches;
  final bool closedDay;
  @override
  State<RefundSheet> createState() => _RefundSheetState();
}

class _RefundSheetState extends State<RefundSheet> {
  String? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String _batch(String? id) => id == null ? 'no batch' : '${widget.batches.where((b) => b['id'] == id).firstOrNull?['batch'] ?? 'batch'}';

  String get _why => _reason == 'Other' ? _note.text.trim() : [?_reason, if (_note.text.trim().isNotEmpty) _note.text.trim()].join(': ');
  bool get _ready => _reason != null && (_reason != 'Other' || _note.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    final s = widget.sale, st = widget.settings, t = Theme.of(context);
    String money(num n) => st.money(n);
    final m = refundMoney(s);
    final raw = rawSaleItems(s.raw);
    return AlertDialog(
      title: Text('Refund ${s.number}'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('${s.customerName.isEmpty ? 'Walk-in' : s.customerName} · sold by ${s.cashier}', style: t.textTheme.bodySmall),
          if (widget.closedDay)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(children: [
                Icon(Icons.warning_amber_rounded, color: t.colorScheme.error, size: 18),
                const SizedBox(width: 6),
                Expanded(child: Text('This sale is in a closed day. The refund counts today, and the owner sees it among the sales to check.', style: TextStyle(color: t.colorScheme.error))),
              ]),
            ),
          const Divider(),
          for (final (n, i) in s.items.indexed) ...[
            Row(children: [
              Expanded(child: Text('${i.name} × ${formatQty(i.qty)}', style: const TextStyle(fontWeight: FontWeight.w600))),
              Text(money(i.price * i.qty)),
            ]),
            Padding(
              padding: const EdgeInsets.only(left: 12, bottom: 6),
              child: Text(
                'Back to stock: ${switch (n < raw.length ? kitStockParts(raw[n]) : null) {
                  final kit? => [for (final (_, batchId, qty) in kit) '${formatQty(qty)} · ${_batch(batchId)}'].join(', '),
                  null => i.alloc.isEmpty ? '${formatQty(i.qty)} · no batch' : [for (final a in i.alloc) '${formatQty(a.qty)} · ${a.batch.isNotEmpty ? a.batch : _batch(a.batchId)}'].join(', '),
                }}',
                style: t.textTheme.bodySmall,
              ),
            ),
          ],
          const Divider(),
          Row(children: [const Expanded(child: Text('Sale total')), Text(money(s.total))]),
          Row(children: [
            const Expanded(child: Text('Money back to the customer', style: TextStyle(fontWeight: FontWeight.w800))),
            Text(money(m.back), style: const TextStyle(fontWeight: FontWeight.w800)),
          ]),
          if (m.unpaid > 0.005) Row(children: [const Expanded(child: Text('Unpaid balance cancelled')), Text(money(m.unpaid))]),
          if (m.insurer > 0.005) Row(children: [const Expanded(child: Text('No longer billed to the insurer')), Text(money(m.insurer))]),
          const SizedBox(height: 6),
          Text(refundHow(s, m.back, money), style: t.textTheme.bodySmall),
          Text('Every item goes back into stock, in the batch it came from.', style: t.textTheme.bodySmall),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('refund-reason'),
            initialValue: _reason,
            decoration: const InputDecoration(labelText: 'Why is it refunded?'),
            items: [for (final r in refundReasons) DropdownMenuItem(value: r, child: Text(r))],
            onChanged: (v) => setState(() => _reason = v),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _note,
            maxLength: 200,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: _reason == 'Other' ? 'Say why' : 'Note (optional)'),
          ),
        ])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep the sale')),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: t.colorScheme.error, foregroundColor: t.colorScheme.onError),
          onPressed: _ready ? () => Navigator.pop(context, _why) : null,
          icon: const Icon(Icons.undo),
          label: Text('Refund ${money(m.back)}'),
        ),
      ],
    );
  }
}
