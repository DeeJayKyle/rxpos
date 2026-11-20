// Tidy names (src/components/NameCheck.jsx): consistent medicine names suggested by the house style
// (core/rules/medname.dart) and, on request, by AI (/api/ai/names). Nothing is renamed until a person ticks the
// suggestions they agree with (none ticked at first) and approves; every rename is audited.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart' show cloudApiProvider;
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/medname.dart';
import '../../auth/application/session_controller.dart';

class _Row {
  _Row(this.id, this.from, this.to, this.why);
  final String id, from, why;
  String to;
  bool on = false;
}

Future<void> showNameCheck(BuildContext context) => showAppDialog<void>(context: context, builder: (_) => const _NameCheck());

class _NameCheck extends ConsumerStatefulWidget {
  const _NameCheck();
  @override
  ConsumerState<_NameCheck> createState() => _NameCheckState();
}

class _NameCheckState extends ConsumerState<_NameCheck> {
  List<_Row>? _rows;
  String _busy = '';
  int _aiFrom = 0;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const AlertDialog(content: SizedBox(height: 80, child: Center(child: CircularProgressIndicator())));
    _rows ??= [for (final s in nameSuggestions(d.products.map((p) => (id: p.id, name: p.name)))) _Row(s.id, s.from, s.to, 'house style')];
    final rows = _rows!, ticked = rows.where((r) => r.on && safeRename(r.from, r.to)).toList();
    return AlertDialog(
      key: const Key('name-check'),
      title: const Text('Tidy medicine names'),
      content: SizedBox(
        width: 640,
        height: MediaQuery.sizeOf(context).height * .6,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Suggestions for one consistent style ("Paracetamol 500mg Tablets"). Nothing changes until you tick the ones you agree with and approve. Strengths and pack numbers are never changed.'),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            if (d.features['ai'] != false)
              OutlinedButton.icon(onPressed: _busy.isNotEmpty ? null : () => _askAi(d), icon: const Icon(Icons.auto_awesome, size: 18), label: Text(_busy.isNotEmpty ? _busy : _aiFrom > 0 ? 'Ask the AI (next 60)' : 'Ask the AI (first 60)')),
            if (rows.isNotEmpty) TextButton(onPressed: () => setState(() { for (final r in rows) { r.on = true; } }), child: const Text('Tick all')),
          ]),
          const SizedBox(height: 8),
          Expanded(
            child: rows.isEmpty
                ? const Center(child: Text('The names already follow the house style.'))
                : ListView(children: [
                    for (final r in rows)
                      CheckboxListTile(
                        key: ValueKey('tidy-${r.id}'),
                        value: r.on,
                        onChanged: (v) => setState(() => r.on = v ?? false),
                        title: Text(r.from, style: const TextStyle(decoration: TextDecoration.lineThrough)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          TextFormField(initialValue: r.to, onChanged: (v) => setState(() => r.to = v), decoration: InputDecoration(isDense: true, errorText: safeRename(r.from, r.to) ? null : 'Keep every number of the name')),
                          Text(r.why, style: Theme.of(context).textTheme.bodySmall),
                        ]),
                      ),
                  ]),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        FilledButton(key: const Key('name-check-apply'), onPressed: ticked.isEmpty ? null : () => _apply(ticked), child: Text('Approve and rename ${ticked.isEmpty ? '' : ticked.length}')),
      ],
    );
  }

  Future<void> _askAi(PharmacyData d) async {
    final done = _rows!.map((r) => r.id).toSet();
    final next = d.products.skip(_aiFrom).where((p) => !done.contains(p.id)).take(60).toList();
    if (next.isEmpty) return say(context, 'The AI has looked at every medicine.');
    setState(() => _busy = 'The AI is reading ${next.length} names…');
    try {
      final r = await ref.read(cloudApiProvider).post('/api/ai/names', {'items': [for (final p in next) {'id': p.id, 'name': p.name, 'generic': p.generic, 'form': p.form}]}, timeout: const Duration(seconds: 90));
      final byId = {for (final p in next) p.id: p.name};
      final add = [
        for (final x in ((r['suggestions'] as List?) ?? const []).cast<Map>())
          if (byId['${x['id']}'] != null && !done.contains('${x['id']}') && safeRename(byId['${x['id']}']!, '${x['name']}')) _Row('${x['id']}', byId['${x['id']}']!, '${x['name']}', 'AI: ${x['why'] ?? ''}'),
      ];
      setState(() { _rows!.addAll(add); _aiFrom = d.products.indexOf(next.last) + 1; });
      if (mounted) say(context, add.isEmpty ? 'The AI found nothing to change in these names' : '${add.length} suggestion(s) from the AI: tick the ones you agree with');
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _apply(List<_Row> ticked) async {
    if (!await confirmAction(context, 'Rename ${ticked.length} medicine${ticked.length == 1 ? '' : 's'}?',
        'The new names are used everywhere (the till, reports, every device). Stock, prices and history stay as they are.', 'Approve and rename',
        effects: [for (final r in ticked.take(6)) '${r.from} → ${r.to}', if (ticked.length > 6) 'and ${ticked.length - 6} more'])) { return; }
    final who = ref.read(sessionControllerProvider).value?.userName ?? '';
    final d = await ref.read(pharmacyProvider.future);
    await ref.read(recordStoreProvider).update((db) {
      for (final r in ticked) {
        final rec = d.byId[r.id]?.toRecord();
        if (rec == null || rec['name'] != r.from) continue; // changed meanwhile: left alone
        db.put('products', {...rec, 'name': r.to.trim()});
        db.audit(who, 'Medicine renamed (approved suggestion)', '${r.from} → ${r.to.trim()}');
      }
    });
    if (!mounted) return;
    setState(() => _rows!.removeWhere(ticked.contains));
    say(context, '${ticked.length} name${ticked.length == 1 ? '' : 's'} changed');
  }
}
