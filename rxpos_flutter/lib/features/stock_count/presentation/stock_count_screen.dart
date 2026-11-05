import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_pos/presentation/camera_scan.dart';
import '../domain/stock_count.dart';

/// Stock take (src/pages/StockCount.jsx): start a count (whole pharmacy, a shelf, a formulation, expiring stock, the
/// highest value items, a random spot check or scan as you go; blind or not), count and scan, review the differences
/// and post them; the history keeps every count with its figures.
class StockCountScreen extends ConsumerStatefulWidget {
  const StockCountScreen({super.key});
  @override
  ConsumerState<StockCountScreen> createState() => _StockCountScreenState();
}

class _StockCountScreenState extends ConsumerState<StockCountScreen> {
  String? _open;

  @override
  Widget build(BuildContext context) {
    final counts = ref.watch(tableProvider('stockCounts')).value;
    final items = ref.watch(tableProvider('countItems')).value ?? const [];
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (counts == null || d == null) return const Center(child: CircularProgressIndicator());
    final here = counts.where((c) => (c['branchId'] ?? 'main') == d.branch).toList();
    final count = here.where((c) => c['id'] == _open).firstOrNull;
    if (count != null) return _CountSheet(count: count, onBack: () => setState(() => _open = null));
    final open = here.where((c) => c['status'] == 'open').toList();
    final done = here.where((c) => c['status'] != 'open').toList()..sort((a, b) => '${b['postedAt'] ?? b['date']}'.compareTo('${a['postedAt'] ?? a['date']}'));
    final n = <String, int>{};
    for (final i in items) {
      n['${i['countId']}'] = (n['${i['countId']}'] ?? 0) + 1;
    }
    final st = d.settings;
    return PageFrame(
      title: 'Stock take',
      subtitle: 'Count the shelves, then post: RxPOS stock is corrected to what you counted',
      actions: [
        if (can.contains('stock.count') || can.contains('stock.adjust'))
          FilledButton.icon(onPressed: () async {
            final id = await showDialog<String>(context: context, builder: (_) => const _NewCount());
            if (id != null) setState(() => _open = id);
          }, icon: const Icon(Icons.add), label: const Text('New stock count')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Wrap(spacing: 12, runSpacing: 8, children: [
          _Step('1', 'Start a count', 'Whole pharmacy, one shelf, a formulation, or a quick spot check'),
          _Step('2', 'Count & scan', 'Type or scan what is on the shelf. Several people can count at once'),
          _Step('3', 'Review & post', 'See shortages and extras, then post to make stock match'),
        ]),
        const SizedBox(height: 12),
        Text('In progress', style: Theme.of(context).textTheme.titleMedium),
        if (open.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No count in progress. Start one with “New stock count”.')),
        for (final c in open)
          Card(
            child: ListTile(
              title: Text('${c['name']}${c['blind'] == true ? ' · blind' : ''}'),
              subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${c['scopeLabel'] ?? ''} · started by ${c['startedBy'] ?? ''} ${_when('${c['startedAt'] ?? ''}')}'),
                const SizedBox(height: 4),
                LinearProgressIndicator(value: ((c['productIds'] as List?)?.length ?? 0) == 0 ? 0 : ((n['${c['id']}'] ?? 0) / (c['productIds'] as List).length).clamp(0, 1).toDouble()),
                Text('${n['${c['id']}'] ?? 0} of ${(c['productIds'] as List?)?.length ?? 0} counted'),
              ]),
              trailing: FilledButton.tonal(onPressed: () => setState(() => _open = c['id'] as String), child: const Text('Continue')),
            ),
          ),
        const SizedBox(height: 12),
        Text('History', style: Theme.of(context).textTheme.titleMedium),
        if (done.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('No finished counts yet')),
        for (final c in done)
          () {
            final s = c['summary'] is Map ? CountSummary.fromJson((c['summary'] as Map).cast<String, Object?>()) : null;
            return ListTile(
              title: Text('${c['name']} · ${c['status'] == 'posted' ? 'Posted' : 'Cancelled'}'),
              subtitle: Text([
                '${c['scopeLabel'] ?? ''}',
                if (c['postedAt'] != null) '${_when('${c['postedAt']}')} by ${c['postedBy'] ?? ''}',
                if (s != null) '${s.counted} counted · ${s.matched} matched · ${s.short} short · ${s.over} extra',
              ].join(' · ')),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                if (s != null) Text(st.money(s.net), style: TextStyle(fontWeight: FontWeight.w700, color: s.net < 0 ? Theme.of(context).colorScheme.error : s.net > 0 ? Colors.green.shade700 : null)),
                TextButton(onPressed: () => setState(() => _open = c['id'] as String), child: const Text('View')),
              ]),
            );
          }(),
      ]),
    );
  }
}

String _when(String iso) => iso.replaceFirst('T', ' ').split('.').first.replaceAll(RegExp(r':\d\d$'), '');

class _Step extends StatelessWidget {
  const _Step(this.n, this.title, this.sub);
  final String n, title, sub;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 300,
        child: ListTile(leading: CircleAvatar(child: Text(n)), title: Text(title), subtitle: Text(sub)),
      );
}

class _NewCount extends ConsumerStatefulWidget {
  const _NewCount();
  @override
  ConsumerState<_NewCount> createState() => _NewCountState();
}

class _NewCountState extends ConsumerState<_NewCount> {
  final _name = TextEditingController(text: 'Stock count ${today()}');
  CountScope _scope = CountScope.all;
  String _shelf = '', _form = '';
  int _size = 20;
  bool _blind = true;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const SizedBox();
    final stocked = d.products.where((p) => d.stockOf(p.id) != 0).toList();
    final shelves = ({for (final p in stocked) shelfOf(p)}..remove('')).toList()..sort();
    final forms = ({for (final p in stocked) p.form}..remove('')).toList()..sort();
    if (_shelf.isEmpty && shelves.isNotEmpty) _shelf = shelves.first;
    if (_form.isEmpty && forms.isNotEmpty) _form = forms.first;
    final warn = d.settings.expiryWarnDays.round();
    final pick = countScope(_scope, stocked, d.stock.batchesOf, shelf: _shelf, form: _form, size: _size, warn: warn);
    final value = pick.list.fold<double>(0, (a, p) => a + d.stock.batchesOf(p.id).fold<double>(0, (x, b) => x + (b.qty > 0 ? b.qty : 0) * (b.cost != 0 ? b.cost : p.cost)));
    Widget opt(CountScope k, String title, String sub, [Widget? extra]) => RadioListTile<CountScope>(
          value: k,
          title: Text(title),
          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(sub), if (_scope == k && extra != null) extra]),
        );
    Widget sizeBox() => SizedBox(width: 120, child: TextFormField(initialValue: '$_size', keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'How many', isDense: true),
        onChanged: (v) => setState(() => _size = int.tryParse(v) ?? 20)));
    return AlertDialog(
      title: const Text('New stock count'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
          RadioGroup<CountScope>(groupValue: _scope, onChanged: (v) => setState(() => _scope = v!), child: Column(children: [
          opt(CountScope.all, 'Full stock take', '${stocked.length} medicines in stock here, in shelf order'),
          opt(CountScope.shelf, 'One shelf / location', shelves.isEmpty ? 'Set shelves in Quick Edit to use this' : '${shelves.length} shelves set on medicines',
              shelves.isEmpty ? null : DropdownButton<String>(value: _shelf, items: [for (final x in shelves) DropdownMenuItem(value: x, child: Text(x))], onChanged: (v) => setState(() => _shelf = v!))),
          opt(CountScope.form, 'One formulation', 'e.g. all syrups or all injectables',
              forms.isEmpty ? null : DropdownButton<String>(value: _form, items: [for (final x in forms) DropdownMenuItem(value: x, child: Text(x))], onChanged: (v) => setState(() => _form = v!))),
          opt(CountScope.expiring, 'Expiring stock', 'Batches expiring within $warn days or expired'),
          opt(CountScope.value, 'Highest value items', 'Count the expensive items more often', sizeBox()),
          opt(CountScope.random, 'Random spot check', 'A quick daily check of a few items', sizeBox()),
          opt(CountScope.empty, 'Scan as you go', 'Start with an empty list; every item you scan or search is added'),
          ])),
          CheckboxListTile(value: _blind, onChanged: (v) => setState(() => _blind = v ?? false),
              title: const Text('Blind count: hide the system quantities while counting (gives honest counts; differences show at review)')),
          Text(_scope == CountScope.empty ? 'Items are added as you count them.' : '${pick.list.length} items · ${d.settings.money(value)} at cost', style: Theme.of(context).textTheme.bodySmall),
        ])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton.icon(
          onPressed: () async {
            try {
              final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
              final rec = await startCount(ref.read(recordStoreProvider), name: _name.text, scope: _scope, label: pick.label, productIds: [for (final p in pick.list) p.id],
                  user: user, blind: _blind, branchId: d.branch);
              if (context.mounted) Navigator.pop(context, rec['id'] as String);
            } on CountProblem catch (e) {
              if (context.mounted) say(context, e.message, error: true);
            }
          },
          icon: const Icon(Icons.fact_check_outlined),
          label: const Text('Start counting'),
        ),
      ],
    );
  }
}

class _CountSheet extends ConsumerStatefulWidget {
  const _CountSheet({required this.count, required this.onBack});
  final Map<String, Object?> count;
  final VoidCallback onBack;
  @override
  ConsumerState<_CountSheet> createState() => _CountSheetState();
}

class _CountSheetState extends ConsumerState<_CountSheet> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  String _q = '', _shelf = '';
  late String _tab = widget.count['status'] == 'open' ? 'todo' : 'diff';
  bool _reveal = false;
  int _limit = 150;

  Future<String> _by() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final rows = ref.watch(tableProvider('countItems')).value ?? const [];
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null) return const Center(child: CircularProgressIndicator());
    final count = widget.count;
    final st = d.settings;
    final readOnly = count['status'] != 'open';
    final blind = count['blind'] == true && !_reveal && !readOnly;
    final items = [for (final r in rows.where((r) => r['countId'] == count['id'])) CountItem.fromRecord(r)];
    final itemBy = {for (final i in items) i.productId: i};
    final listed = ((count['productIds'] as List?) ?? const []).cast<String>();
    final ids = [...listed, ...items.map((i) => i.productId).where((id) => !listed.contains(id))];
    final all = [for (final id in ids) ?d.byId[id]];
    final shelves = ({for (final p in all) shelfOf(p)}..remove('')).toList()..sort();
    final sum = summarise(listed.length, items, d.byId);
    bool hasDiff(Product p) => itemBy[p.id]?.lines.any((l) => l.diff != 0) ?? false;
    final ql = _q.trim().toLowerCase();
    final shown = all.where((p) => (_shelf.isEmpty || shelfOf(p) == _shelf) && (ql.isEmpty || '${p.name} ${p.generic} ${p.barcode}'.toLowerCase().contains(ql)) &&
        (_tab == 'all' || (_tab == 'todo' ? !itemBy.containsKey(p.id) : _tab == 'done' ? itemBy.containsKey(p.id) : itemBy.containsKey(p.id) && hasDiff(p)))).toList();
    final outside = !readOnly && ql.length > 1 ? searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).where((p) => !ids.contains(p.id)).take(6).toList() : const <Product>[];
    final pct = all.isEmpty ? 0 : (items.length / all.length * 100).round();

    Future<void> openOn(Product p) async {
      if (!ids.contains(p.id)) await addToCount(ref.read(recordStoreProvider), count, p.id);
      setState(() {
        _tab = 'all';
        _q = p.name;
        _search.text = p.name;
      });
    }

    return PageFrame(
      title: '${count['name']}',
      subtitle: '${count['scopeLabel'] ?? ''} · ${readOnly ? (count['status'] == 'posted' ? 'posted by ${count['postedBy']} ${_when('${count['postedAt']}')}' : 'cancelled') : 'started by ${count['startedBy']}'}',
      actions: [
        TextButton.icon(onPressed: widget.onBack, icon: const Icon(Icons.arrow_back), label: const Text('All counts')),
        if (count['blind'] == true && !readOnly && can.contains('stock.adjust'))
          OutlinedButton.icon(onPressed: () => setState(() => _reveal = !_reveal), icon: Icon(_reveal ? Icons.visibility_off : Icons.visibility), label: Text(_reveal ? 'Hide system qty' : 'Show system qty')),
        ExportButtons(
          name: '${count['name']}'.replaceAll(RegExp(r'[^\w-]+'), '-'),
          settings: st,
          title: '${count['name']}',
          subtitle: '${count['scopeLabel'] ?? ''} · ${all.length} items',
          csv: () => [
            for (final p in all)
              if (itemBy[p.id] == null)
                {'medicine': p.name, 'shelf': shelfOf(p), 'batch': '', 'expiry': '', 'system': readOnly || count['blind'] != true ? d.stockOf(p.id) : '', 'counted': '', 'difference': '', 'value': ''}
              else
                for (final l in itemBy[p.id]!.lines)
                  {'medicine': p.name, 'shelf': shelfOf(p), 'batch': l.batch, 'expiry': l.expiry, 'system': l.sys, 'counted': l.qty, 'difference': l.diff, 'value': lineValue(l, p), 'countedBy': itemBy[p.id]!.by},
          ],
          pdf: () => [
            PdfTable(heading: '${count['name']} – count sheet', head: ['Medicine', 'Shelf', 'Batch', 'Expiry', if (count['blind'] != true) 'System', 'Counted'], body: [
              for (final p in all)
                for (final (n, b) in <BatchStock?>[...d.stock.batchesOf(p.id).where((b) => b.qty != 0)].ifEmptyNull.indexed)
                  [n == 0 ? p.name : '', n == 0 ? shelfOf(p) : '', b?.batch ?? '', b?.expiry ?? '', if (count['blind'] != true) formatQty(b?.qty ?? 0), ''],
            ]),
          ],
        ),
        if (!readOnly)
          OutlinedButton.icon(onPressed: () async {
            if (!await confirmAction(context, 'Cancel this count?', 'Nothing is changed in stock. The counts entered so far are kept in the history.', 'Cancel count')) return;
            await cancelCount(ref.read(recordStoreProvider), count, sum, user: await _by(), branchId: d.branch);
            widget.onBack();
          }, icon: const Icon(Icons.block), label: const Text('Cancel')),
        if (!readOnly)
          FilledButton.icon(onPressed: items.isEmpty ? null : () => _review(count, items, all, sum), icon: const Icon(Icons.fact_check_outlined), label: const Text('Review & post')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Text('${items.length} of ${all.length} counted ($pct%)', style: const TextStyle(fontWeight: FontWeight.w700))),
                Text(blind ? '${sum.matched} match' : '${sum.matched} match · ${sum.short} short (${st.money(sum.shortValue)}) · ${sum.over} extra (${st.money(sum.overValue)})'),
              ]),
              const SizedBox(height: 6),
              LinearProgressIndicator(value: pct / 100),
            ]),
          ),
        ),
        if (!readOnly)
          Row(children: [
            Expanded(
              child: TextField(
                key: const Key('count-search'),
                controller: _search,
                focusNode: _searchFocus,
                autofocus: true,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.qr_code_scanner), hintText: 'Scan a barcode or type a medicine name, then Enter'),
                onChanged: (v) => setState(() => _q = v),
                onSubmitted: (_) async {
                  if (ql.isEmpty) return;
                  final code = d.byBarcode.entries.where((e) => e.key.toLowerCase() == ql).firstOrNull?.value ?? (shown.length == 1 ? shown.first : shown.isEmpty ? outside.firstOrNull : null);
                  if (code != null) await openOn(code);
                },
              ),
            ),
            if (Platform.isAndroid) ...[
              IconButton(tooltip: 'Scan to find an item', icon: const Icon(Icons.photo_camera_outlined), onPressed: () async {
                final code = await scanBarcode(context);
                final p = code == null ? null : d.byBarcode[code];
                if (p != null) await openOn(p);
              }),
              OutlinedButton.icon(onPressed: () => scanContinuous(context, title: 'Scan & count: each scan counts one pack', onCode: (code) async {
                final p = d.byBarcode[code];
                if (p == null) return null;
                await addToCount(ref.read(recordStoreProvider), count, p.id);
                final cur = (await ref.read(recordStoreProvider).get('countItems', countItemId(count['id'] as String, p.id)));
                return tallyOne(ref.read(recordStoreProvider), count: count, p: p, batches: d.stock.batchesOf(p.id), item: cur == null ? null : CountItem.fromRecord(cur), by: await _by(), branchId: d.branch);
              }), icon: const Icon(Icons.qr_code), label: const Text('Scan & count')),
            ],
          ]),
        if (outside.isNotEmpty)
          Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text("Not on this count's list. Tap to add and count it:", style: Theme.of(context).textTheme.bodySmall),
            for (final p in outside) ActionChip(avatar: const Icon(Icons.add_box_outlined, size: 16), label: Text(p.name), onPressed: () => openOn(p)),
          ]),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'todo', label: Text('To count (${all.length - items.length})')),
                  ButtonSegment(value: 'done', label: Text('Counted (${items.length})')),
                  if (!blind) ButtonSegment(value: 'diff', label: Text('Differences (${sum.short + sum.over})')),
                  const ButtonSegment(value: 'all', label: Text('All')),
                ],
                selected: {_tab == 'diff' && blind ? 'todo' : _tab},
                onSelectionChanged: (v) => setState(() {
                  _tab = v.first;
                  _limit = 150;
                }),
              ),
            ),
          ),
          if (shelves.length > 1)
            DropdownButton<String>(value: _shelf, items: [const DropdownMenuItem(value: '', child: Text('All shelves')), for (final x in shelves) DropdownMenuItem(value: x, child: Text(x))],
                onChanged: (v) => setState(() => _shelf = v ?? '')),
        ]),
        const SizedBox(height: 6),
        Expanded(
          child: shown.isEmpty
              ? EmptyState(_tab == 'todo' && all.isNotEmpty ? 'Everything here is counted 🎉 Review & post when ready.' : ql.isNotEmpty ? 'Nothing matches. Scan or type another name.' : 'Nothing here')
              : ListView.builder(
                  itemCount: (shown.length > _limit ? _limit : shown.length) + (shown.length > _limit ? 1 : 0),
                  itemBuilder: (_, i) => i == _limit
                      ? TextButton(onPressed: () => setState(() => _limit += 150), child: Text('Show more (${shown.length - _limit} left)'))
                      : _CountRow(key: ValueKey('row-${shown[i].id}-${itemBy[shown[i].id]?.at}'), count: count, p: shown[i], item: itemBy[shown[i].id], blind: blind, readOnly: readOnly, warn: st.expiryWarnDays.round()),
                ),
        ),
      ]),
    );
  }

  Future<void> _review(Map<String, Object?> count, List<CountItem> items, List<Product> all, CountSummary sum) async {
    final d = await ref.read(pharmacyProvider.future);
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    if (!mounted) return;
    final st = d.settings;
    final diffs = differences(items, d.byId);
    final zeroRows = zeroable(all, items, d.stock.batchesOf);
    final zeroCost = zeroRows.fold<double>(0, (a, z) => a + z.b.qty * (z.b.cost != 0 ? z.b.cost : z.p.cost));
    var zero = false;
    final go = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: Text('Review – ${count['name']}'),
          content: SizedBox(
            width: 620,
            child: ListView(shrinkWrap: true, children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                StatCard(label: 'Counted', value: '${sum.counted}', sub: 'of ${all.length}'),
                StatCard(label: 'Match', value: '${sum.matched}', color: Colors.green.shade700),
                StatCard(label: 'Short', value: '${sum.short}', sub: st.money(sum.shortValue), color: Theme.of(c).colorScheme.error),
                StatCard(label: 'Extra', value: '${sum.over}', sub: st.money(sum.overValue)),
              ]),
              const SizedBox(height: 8),
              Text('Differences to post', style: Theme.of(c).textTheme.titleSmall),
              if (diffs.isEmpty) const Text('Everything counted matches the system 🎉'),
              for (final r in diffs)
                ListTile(
                  dense: true,
                  title: Text('${r.p.name} · ${r.l.batch.isEmpty ? '—' : r.l.batch}${r.l.found ? ' (found)' : ''}${r.l.expiry.isEmpty ? '' : ' · exp ${r.l.expiry}'}'),
                  subtitle: Text('system ${formatQty(r.l.sys)} → counted ${formatQty(r.l.qty)} · by ${r.by}'),
                  trailing: Text('${r.l.diff > 0 ? '+' : ''}${formatQty(r.l.diff)} · ${st.money(lineValue(r.l, r.p))}', style: TextStyle(color: r.l.diff < 0 ? Theme.of(c).colorScheme.error : Colors.green.shade700)),
                ),
              if (all.length > items.length)
                CheckboxListTile(
                  value: zero,
                  onChanged: (v) => set(() => zero = v ?? false),
                  title: Text('${all.length - items.length} item${all.length - items.length > 1 ? 's were' : ' was'} not counted. They stay as they are…'),
                  subtitle: Text('…unless you tick this: not found on the shelf, set them to 0 (${st.money(zeroCost)} at cost)'),
                ),
              if (!can.contains('stock.adjust'))
                Text('A manager or pharmacist with “Stock counts, adjustments” permission posts the count.', style: TextStyle(color: Colors.orange.shade800)),
            ]),
          ),
          actions: [
            TextButton.icon(onPressed: () async => saveDownload('${count['name']}-differences.csv', [
              ...toCsv([for (final r in diffs) {'medicine': r.p.name, 'batch': r.l.batch, 'expiry': r.l.expiry, 'system': r.l.sys, 'counted': r.l.qty, 'difference': r.l.diff, 'value': lineValue(r.l, r.p), 'by': r.by}]).codeUnits,
            ]), icon: const Icon(Icons.download), label: const Text('CSV')),
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep counting')),
            if (can.contains('stock.adjust')) FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Post count')),
          ],
        ),
      ),
    );
    if (go != true || !mounted) return;
    if (!await confirmAction(context, 'Post this stock count?',
        '${diffs.length} batch quantities${zero && zeroRows.isNotEmpty ? ' and ${zeroRows.length} uncounted batches (set to 0)' : ''} will be corrected so RxPOS matches what was counted. Net change ${st.money(sum.net - (zero ? zeroCost : 0))} at cost.',
        'Post count')) {
      return;
    }
    await postCount(ref.read(recordStoreProvider), count: count, diffs: diffs, sum: sum, zero: zero ? zeroRows : const [], settings: st, user: await _by(), branchId: d.branch);
    if (!mounted) return;
    say(context, 'Stock count posted: stock now matches what was counted');
    widget.onBack();
  }
}

/// One medicine on the count: a box per batch (blank = not counted), ± steppers, "Matches system", a batch found on
/// the shelf, clear the count.
class _CountRow extends ConsumerStatefulWidget {
  const _CountRow({super.key, required this.count, required this.p, required this.item, required this.blind, required this.readOnly, required this.warn});
  final Map<String, Object?> count;
  final Product p;
  final CountItem? item;
  final bool blind, readOnly;
  final int warn;
  @override
  ConsumerState<_CountRow> createState() => _CountRowState();
}

class _CountRowState extends ConsumerState<_CountRow> {
  final _ctl = <String, TextEditingController>{};
  bool _adding = false;
  final _fb = TextEditingController(), _fe = TextEditingController(), _fq = TextEditingController();

  Future<void> _commit({Map<String, String> patch = const {}, List<CountLine> extra = const []}) async {
    final d = await ref.read(pharmacyProvider.future);
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await saveCount(ref.read(recordStoreProvider), count: widget.count, product: widget.p, batches: d.stock.batchesOf(widget.p.id), item: widget.item,
        typed: {for (final e in _ctl.entries) e.key: e.value.text, ...patch}, extra: extra, by: user, branchId: d.branch);
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const SizedBox();
    final p = widget.p;
    final th = Theme.of(context);
    final rows = countRows(p, d.stock.batchesOf(p.id), widget.item);
    for (final r in rows) {
      _ctl.putIfAbsent(r.key, () => TextEditingController(text: r.saved == null || r.saved!.skipped ? '' : formatQty(r.saved!.qty)));
    }
    final counted = widget.item != null;
    final diffs = widget.item?.lines ?? const <CountLine>[];
    final diff = diffs.fold<double>(0, (a, l) => a + l.diff);
    final sys = rows.fold<double>(0, (a, r) => a + r.sysNow);
    final badge = !counted
        ? null
        : widget.blind
            ? const Chip(label: Text('Counted'), visualDensity: VisualDensity.compact)
            : diffs.every((l) => l.diff == 0)
                ? const Chip(label: Text('Matches'), visualDensity: VisualDensity.compact)
                : Chip(label: Text('${diff > 0 ? '+' : ''}${formatQty(diff)}'), backgroundColor: diff < 0 ? th.colorScheme.errorContainer : Colors.amber.shade100, visualDensity: VisualDensity.compact);
    return Card(
      color: counted ? (diffs.any((l) => l.diff != 0) && !widget.blind ? Colors.amber.withValues(alpha: .08) : Colors.green.withValues(alpha: .06)) : null,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text([p.form, if (shelfOf(p).isNotEmpty) 'shelf ${shelfOf(p)}', p.barcode].where((x) => x.isNotEmpty).join(' · '), style: th.textTheme.bodySmall),
            ])),
            if (!widget.blind) Padding(padding: const EdgeInsets.only(right: 8), child: Text('System ${formatQty(sys)}')),
            ?badge,
          ]),
          for (final r in rows)
            Row(children: [
              Expanded(
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: 'Batch ${r.batch.isEmpty ? '—' : r.batch}${r.saved?.found == true ? ' (found)' : ''}'),
                  if (r.expiry.isNotEmpty)
                    TextSpan(text: ' · exp ${r.expiry}', style: TextStyle(color: daysUntil(r.expiry) < 0 ? th.colorScheme.error : daysUntil(r.expiry) <= widget.warn ? Colors.orange.shade800 : null)),
                  if (!widget.blind && rows.length > 1) TextSpan(text: ' · system ${formatQty(r.sysNow)}'),
                ]), style: th.textTheme.bodySmall),
              ),
              if (widget.readOnly)
                Text(r.saved == null ? '—' : formatQty(r.saved!.qty), style: const TextStyle(fontWeight: FontWeight.w700))
              else ...[
                IconButton(tooltip: 'One less', icon: const Icon(Icons.remove), onPressed: () {
                  final v = ((double.tryParse(_ctl[r.key]!.text) ?? 0) - 1).clamp(0, double.infinity);
                  _ctl[r.key]!.text = formatQty(v);
                  _commit();
                }),
                SizedBox(
                  width: 80,
                  child: TextField(
                    key: Key('count-${p.id}-${r.key}'),
                    controller: _ctl[r.key],
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(hintText: 'Count', isDense: true),
                    onSubmitted: (_) => _commit(),
                    onTapOutside: (_) {
                      final saved = r.saved == null || r.saved!.skipped ? '' : formatQty(r.saved!.qty);
                      if (_ctl[r.key]!.text != saved) _commit();
                    },
                  ),
                ),
                IconButton(tooltip: 'One more', icon: const Icon(Icons.add), onPressed: () {
                  _ctl[r.key]!.text = formatQty((double.tryParse(_ctl[r.key]!.text) ?? 0) + 1);
                  _commit();
                }),
              ],
            ]),
          if (rows.isEmpty && !_adding) Text('No batch recorded here. If it is on the shelf, add the batch you find.', style: th.textTheme.bodySmall),
          if (!widget.readOnly)
            Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (!widget.blind && rows.isNotEmpty)
                TextButton.icon(onPressed: () => _commit(patch: {for (final r in rows) r.key: formatQty(r.sysNow < 0 ? 0 : r.sysNow)}), icon: const Icon(Icons.check, size: 16), label: const Text('Matches system')),
              if (!_adding) TextButton.icon(onPressed: () => setState(() => _adding = true), icon: const Icon(Icons.add_box_outlined, size: 16), label: const Text('Found another batch')),
              if (counted) TextButton.icon(onPressed: () => clearCount(ref.read(recordStoreProvider), widget.count, p.id), icon: const Icon(Icons.delete_outline, size: 16), label: const Text('Clear count')),
              if (counted) Text('by ${widget.item!.by}', style: th.textTheme.bodySmall),
            ]),
          if (_adding)
            Row(children: [
              Expanded(child: TextField(controller: _fb, decoration: const InputDecoration(labelText: 'Batch no.', isDense: true))),
              const SizedBox(width: 6),
              Expanded(child: TextField(controller: _fe, decoration: const InputDecoration(labelText: 'Expiry', hintText: 'YYYY-MM-DD', isDense: true))),
              const SizedBox(width: 6),
              SizedBox(width: 80, child: TextField(controller: _fq, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Qty', isDense: true))),
              TextButton(onPressed: () async {
                try {
                  final l = foundBatch(batch: _fb.text, expiry: _fe.text, qty: double.tryParse(_fq.text) ?? 0, cost: p.cost);
                  await _commit(extra: [l]);
                  setState(() => _adding = false);
                } on CountProblem catch (e) {
                  if (context.mounted) say(context, e.message, error: true);
                }
              }, child: const Text('Add')),
              TextButton(onPressed: () => setState(() => _adding = false), child: const Text('Cancel')),
            ]),
        ]),
      ),
    );
  }
}

extension on List<BatchStock?> {
  List<BatchStock?> get ifEmptyNull => isEmpty ? [null] : this;
}
