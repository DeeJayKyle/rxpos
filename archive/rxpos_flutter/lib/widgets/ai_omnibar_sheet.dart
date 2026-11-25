// The AI half of the Ctrl+K / Cmd+K omnibar (the web app's components/AiOmnibar.jsx). The search itself stays offline
// and instant in core/presentation/top_bar.dart (CommandPalette: pages, medicines from the local SQLite/Drift store,
// customers, receipts); once three letters are typed it offers three AI rows that open this sheet, which calls
// POST /api/ai/copilot:
//   command   "add 2 strips of paracetamol" → staged on the till; "open add stock" → that page
//   ask       "what expires before March?" → an answer from facts worked out on this device (no customers or money)
//   diagnose  "sync stuck" → plain-English causes, and the System Doctor on This device for the repairs
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/data/pharmacy_providers.dart';
import '../core/network/cloud_api.dart';
import '../features/sales_pos/application/sale_controller.dart';
import '../features/stock/presentation/invoice_scan.dart' show matchProduct;
import '../features/sync_status/application/sync_controller.dart';
import '../theme/rxpos_theme.dart';

/// The three things the AI can do with what was typed
enum AiMode { command, ask, diagnose }

/// Facts about the stock for an owner's question (src/components/aiFacts.js): names, batches, dates, quantities.
Map<String, Object?> ownerFacts(PharmacyData d, List<Map<String, Object?>> sales) {
  final today = DateTime.now();
  final expiring = <Map<String, Object?>>[];
  for (final p in d.products) {
    for (final b in d.stock.batchesOf(p.id)) {
      final e = DateTime.tryParse(b.expiry);
      if (b.qty <= 0 || e == null) continue;
      final days = e.difference(DateTime(today.year, today.month, today.day)).inDays;
      if (days <= 180) expiring.add({'name': p.name, 'batch': b.batch, 'expiry': b.expiry, 'days': days, 'qty': b.qty, 'valueUGX': (b.qty * (b.cost == 0 ? p.cost : b.cost)).round()});
    }
  }
  expiring.sort((a, b) => (a['days'] as int).compareTo(b['days'] as int));
  final since = today.subtract(const Duration(days: 90)).toIso8601String();
  final sold = <String>{
    for (final s in sales)
      if ('${s['date'] ?? ''}'.compareTo(since) >= 0 && s['status'] != 'refunded')
        for (final it in ((s['items'] as List?) ?? const []).cast<Map>()) '${it['id']}',
  };
  final dead = [
    for (final p in d.products)
      if (d.stockOf(p.id) > 0 && !sold.contains(p.id)) {'name': p.name, 'qty': d.stockOf(p.id), 'valueUGX': (d.stockOf(p.id) * p.cost).round()},
  ]..sort((a, b) => (b['valueUGX'] as int).compareTo(a['valueUGX'] as int));
  final low = [
    for (final p in d.products)
      if (p.reorder > 0 && d.stockOf(p.id) <= p.reorder) {'name': p.name, 'stock': d.stockOf(p.id), 'reorderLevel': p.reorder},
  ];
  return {
    'today': today.toIso8601String().substring(0, 10), 'currency': 'UGX', 'medicines': d.products.length,
    'expiringWithin180d': expiring.take(25).toList(), 'deadStock90d': dead.take(25).toList(), 'lowStock': low.take(30).toList(),
  };
}

/// Run [text] through the AI copilot and show what came back (or act on it).
Future<void> showAiOmnibarSheet(BuildContext context, {required AiMode mode, required String text}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _AiSheet(mode: mode, text: text),
    );

class _AiSheet extends ConsumerStatefulWidget {
  const _AiSheet({required this.mode, required this.text});
  final AiMode mode;
  final String text;
  @override
  ConsumerState<_AiSheet> createState() => _AiSheetState();
}

class _AiSheetState extends ConsumerState<_AiSheet> {
  bool _busy = true;
  String _answer = '', _error = '';
  List<Map> _reorder = const [];
  List<String> _repairs = const [];

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    final api = ref.read(cloudApiProvider);
    try {
      switch (widget.mode) {
        case AiMode.command:
          final r = await api.post('/api/ai/copilot', {'mode': 'command', 'text': widget.text});
          if (r['error'] != null) throw Exception('${r['error']}');
          if (r['action'] == 'ADD_ITEMS') {
            final d = await ref.read(pharmacyProvider.future);
            final items = [
              for (final it in ((r['items'] as List?) ?? const []).cast<Map>())
                (product: matchProduct('${it['name']}', d.products, d.stockOf), name: '${it['name']}', qty: (it['qty'] as num?)?.toInt() ?? 1, unit: '${it['unit'] ?? 'tablet'}'),
            ];
            final done = await ref.read(saleControllerProvider(false).notifier).stage(items);
            if (!mounted) return;
            final router = GoRouter.of(context);
            Navigator.pop(context);
            router.go('/pos');
            if (done.missed.isNotEmpty) _snack(router, 'Added ${done.added}; not found or out of stock: ${done.missed.join(', ')}');
            return;
          }
          if (r['action'] == 'NAVIGATE') {
            if (!mounted) return;
            final router = GoRouter.of(context);
            Navigator.pop(context);
            router.go('${r['to']}');
            return;
          }
          setState(() => _answer = '${r['reply'] ?? ''}');
        case AiMode.ask:
          final d = await ref.read(pharmacyProvider.future);
          final sales = await ref.read(tableProvider('sales').future);
          final r = await api.post('/api/ai/copilot', {'mode': 'ask', 'text': widget.text, 'facts': ownerFacts(d, sales)});
          if (r['error'] != null) throw Exception('${r['error']}');
          setState(() {
            _answer = '${r['answer'] ?? ''}';
            _reorder = ((r['reorder'] as List?) ?? const []).cast<Map>();
          });
        case AiMode.diagnose:
          final s = ref.read(syncControllerProvider);
          final r = await api.post('/api/ai/copilot', {
            'mode': 'diagnose', 'text': widget.text,
            'telemetry': {'app': 'flutter', 'syncState': s.state.name, 'changesWaiting': s.pending, 'changesRefused': s.rejected, 'syncError': s.error},
          });
          if (r['error'] != null) throw Exception('${r['error']}');
          setState(() {
            _answer = ['${r['summary'] ?? ''}', for (final c in (r['causes'] as List?) ?? const []) '• $c'].join('\n');
            _repairs = [for (final a in (r['actions'] as List?) ?? const []) '$a'];
          });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(GoRouter router, String message) {
    final ctx = router.routerDelegate.navigatorKey.currentContext;
    if (ctx != null) ScaffoldMessenger.maybeOf(ctx)?.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(switch (widget.mode) { AiMode.command => 'DO IT', AiMode.ask => 'ASK ABOUT THE STOCK', AiMode.diagnose => 'DIAGNOSE THIS DEVICE' }, style: microLabel(context)),
        const SizedBox(height: 4),
        Text('“${widget.text}”', style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 14),
        if (_busy) const Row(children: [SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)), SizedBox(width: 12), Text('Thinking…')]),
        if (_error.isNotEmpty) Text(_error, style: TextStyle(color: t.colorScheme.error)),
        if (_answer.isNotEmpty) Text(_answer, style: const TextStyle(height: 1.45)),
        if (_reorder.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('REORDER DRAFT', style: microLabel(context)),
          for (final r in _reorder) Row(children: [Expanded(child: Text('${r['name']}')), Text('${r['qty']}', style: tabular(const TextStyle(fontWeight: FontWeight.w700)))]),
          const SizedBox(height: 8),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, kMinTouch)), onPressed: () { final r = GoRouter.of(context); Navigator.pop(context); r.go('/reorder'); }, child: const Text('Open Reorder')),
        ],
        if (_repairs.isNotEmpty) ...[
          const SizedBox(height: 12),
          OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, kMinTouch)), onPressed: () { final r = GoRouter.of(context); Navigator.pop(context); r.go('/device'); }, child: Text('Open the System Doctor (${_repairs.length} fix${_repairs.length == 1 ? '' : 'es'})')),
        ],
      ]),
    );
  }
}
