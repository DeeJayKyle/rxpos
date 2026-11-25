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

/// A manager's approval for a big refund (2026-11-18): who may approve, and a check of their PIN or password.
class RefundApproval {
  const RefundApproval({required this.limit, required this.approvers, required this.verify});
  final double limit;
  final List<(String id, String name)> approvers;
  final Future<bool> Function(String userId, String secret) verify;
}

/// The reason, and the manager who approved it (empty when none was needed); null when the sale is kept.
typedef RefundChoice = ({String why, String approvedBy});

Future<RefundChoice?> showRefundSheet(BuildContext context, Sale sale, PharmacySettings st, {List<Map<String, Object?>> batches = const [], bool closedDay = false, RefundApproval? approval}) =>
    showAppDialog<RefundChoice>(context: context, builder: (_) => RefundSheet(sale: sale, settings: st, batches: batches, closedDay: closedDay, approval: approval));

class RefundSheet extends StatefulWidget {
  const RefundSheet({super.key, required this.sale, required this.settings, this.batches = const [], this.closedDay = false, this.approval});
  final Sale sale;
  final PharmacySettings settings;
  final List<Map<String, Object?>> batches;
  final bool closedDay;
  final RefundApproval? approval;
  @override
  State<RefundSheet> createState() => _RefundSheetState();
}

class _RefundSheetState extends State<RefundSheet> {
  String? _reason, _approver, _approveErr;
  bool _busy = false;
  final _note = TextEditingController(), _secret = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _go() async {
    final a = widget.approval;
    if (a == null) return Navigator.pop(context, (why: _why, approvedBy: ''));
    final who = a.approvers.where((x) => x.$1 == _approver).firstOrNull;
    if (who == null || _secret.text.isEmpty) return setState(() => _approveErr = 'Choose the manager and enter their PIN or password.');
    setState(() => _busy = true);
    final ok = await a.verify(who.$1, _secret.text).catchError((_) => false);
    if (!mounted) return;
    if (!ok) {
      _secret.clear();
      return setState(() {
        _busy = false;
        _approveErr = 'That PIN or password is not right for ${who.$2}.';
      });
    }
    Navigator.pop(context, (why: _why, approvedBy: who.$2));
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
            Text(money(m.back), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
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
          if (widget.approval case final a?) ...[
            const SizedBox(height: 8),
            Text('A manager must approve a refund over ${money(a.limit)}', key: const Key('refund-approve'), style: const TextStyle(fontWeight: FontWeight.w700)),
            if (a.approvers.isEmpty)
              Text('This pharmacy has no other manager to approve it. Ask a manager to do the refund.', style: t.textTheme.bodySmall)
            else ...[
              DropdownButtonFormField<String>(
                key: const Key('refund-approver'),
                initialValue: _approver,
                decoration: const InputDecoration(labelText: 'Manager'),
                items: [for (final (id, name) in a.approvers) DropdownMenuItem(value: id, child: Text(name))],
                onChanged: (v) => setState(() {
                  _approver = v;
                  _approveErr = null;
                }),
              ),
              TextField(
                key: const Key('refund-secret'),
                controller: _secret,
                obscureText: true,
                onChanged: (_) => setState(() => _approveErr = null),
                decoration: const InputDecoration(labelText: 'Their PIN or password'),
              ),
            ],
            if (_approveErr != null) Text(_approveErr!, style: TextStyle(color: t.colorScheme.error)),
          ],
        ])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep the sale')),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: t.colorScheme.error, foregroundColor: t.colorScheme.onError),
          onPressed: _ready && !_busy && (widget.approval == null || widget.approval!.approvers.isNotEmpty) ? _go : null,
          icon: const Icon(Icons.undo),
          label: Text('Refund ${money(m.back)}'),
        ),
      ],
    );
  }
}
