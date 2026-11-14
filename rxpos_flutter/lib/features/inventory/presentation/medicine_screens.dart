// Medicine List, Formulations, Quick Edit and Stock Card (src/pages/Inventory.jsx), with the pack sizes and inventory
// editors used from the lists.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/movement.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/data/device_settings.dart';
import '../../../core/presentation/data_views.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/list_controls.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/pricing.dart';
import '../../../core/rules/search.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../domain/adjust.dart';
import '../domain/medicines.dart';

Future<String> _user(WidgetRef ref) async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

/// Medicine List: every medicine's details; add / edit (prices from the markups when blank, a barcode generated when
/// none, opening stock for a new one); "Needs review" lists records with missing or inconsistent details; packs.
class MedicineListScreen extends ConsumerStatefulWidget {
  const MedicineListScreen({super.key});
  @override
  ConsumerState<MedicineListScreen> createState() => _MedicineListScreenState();
}

class _MedicineListScreenState extends ConsumerState<MedicineListScreen> {
  String _q = '';
  bool _review = false;
  final _search = TextEditingController();
  final _searchFocus = FocusNode();

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  /// The ticked medicines together (the owner's request: selection and bulk actions); every change is audited.
  Future<void> _bulkPrice(List<Product> ps, PharmacySettings s, VoidCallback done) async {
    final v = await editRecord(context, title: 'Change the retail price of ${ps.length} medicine${ps.length > 1 ? 's' : ''}', save: 'Change prices',
        fields: const [FormFieldSpec('how', 'Type +10% or -5% to raise or lower each price, or an amount (1500) for all', required: true, hint: '+10%')]);
    if (v == null || !mounted) return;
    final m = RegExp(r'^\s*([+-]?\d+(?:\.\d+)?)\s*(%?)\s*$').firstMatch('${v['how']}');
    if (m == null) return say(context, 'Type +10%, -5% or an amount', error: true);
    final n = double.parse(m[1]!), pct = m[2] == '%';
    if (!pct && !(n > 0)) return say(context, 'A price is above 0', error: true);
    final who = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await ref.read(recordStoreProvider).update((d) {
      for (final p in ps) {
        final price = pct ? markupPrice(p.price, n, s.priceRound) : n;
        if (!(price > 0) || price == p.price) continue;
        d.put('products', p.copyWith(price: price).toRecord());
        d.audit(who, 'Price changed', '${p.name}: retail ${s.money(p.price)} → ${s.money(price)} (${ps.length} changed together)');
      }
    });
    if (mounted) say(context, 'Prices changed for ${ps.length} medicine${ps.length > 1 ? 's' : ''}');
    done();
  }

  Future<void> _bulkField(List<Product> ps, String key, String label, VoidCallback done) async {
    final v = await editRecord(context, title: '$label for ${ps.length} medicine${ps.length > 1 ? 's' : ''}', fields: [FormFieldSpec(key, label, kind: key == 'reorder' ? FieldKind.number : FieldKind.text)]);
    if (v == null || !mounted) return;
    final who = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final val = key == 'reorder' ? ((v[key] as num?) ?? 0) : '${v[key] ?? ''}'.trim();
    await ref.read(recordStoreProvider).update((d) {
      for (final p in ps) {
        d.put('products', {...p.toRecord(), key: val});
      }
      d.audit(who, 'Medicines changed', '$label set to "$val" for ${ps.length}: ${ps.take(5).map((p) => p.name).join(', ')}${ps.length > 5 ? '…' : ''}');
    });
    if (mounted) say(context, '$label saved for ${ps.length}');
    done();
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null) return const Center(child: CircularProgressIndicator());
    final s = d.settings;
    final dup = duplicateBarcodes(d.products);
    final issues = d.products.where((p) => recordIssues(p, dup).isNotEmpty).length;
    var list = _q.trim().isEmpty ? d.products : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id));
    if (_review) list = list.where((p) => recordIssues(p, dup).isNotEmpty).toList();
    final manage = can.contains('medicines.manage');
    // list, board (by stock status) or gallery, kept on this device
    final view = ref.watch(deviceValueProvider('view:medicines')).value ?? 'list';
    CardData card(Product p) {
      final st = d.stockOf(p.id);
      final tone = st <= 0 ? Theme.of(context).colorScheme.error : isLowStock(p, st) ? Colors.orange.shade800 : Colors.green.shade700;
      return CardData(title: p.name, sub: [p.generic, p.strength, p.form].where((x) => x.isNotEmpty).join(' · '), value: s.money(p.price), chips: [
        ('${formatQty(st)} in stock', tone), if (p.rx) ('Rx', null), if (p.controlled) ('CD', Theme.of(context).colorScheme.error), if ('${p.raw['shelf'] ?? ''}'.isNotEmpty) ('Shelf ${p.raw['shelf']}', null),
      ], actions: [
        if (manage) ('Edit', () => editMedicine(context, ref, p)),
        ('Stock card', () => context.go('/stock-card?id=${Uri.encodeComponent(p.id)}')),
        if (manage) ('Packs (strip, box…)', () => editPacks(context, ref, p)),
      ]);
    }

    return PageFrame(
      title: 'Medicine List',
      subtitle: _review ? '$issues records need a look. Open one to fix it; nothing is changed automatically.' : '${d.products.length} medicines and items',
      actions: [
        ViewSwitch(value: view, onChanged: (v) => ref.read(deviceValueProvider('view:medicines').notifier).set(v == 'list' ? null : v)),
        SearchField(controller: _search, focusNode: _searchFocus, onChanged: (v) => setState(() => _q = v), hint: 'Medicine, generic, barcode…'),
        FilterChip(label: Text('Needs review${issues > 0 ? ' ($issues)' : ''}'), selected: _review, onSelected: (v) => setState(() => _review = v)),
        if (manage) FilledButton.icon(onPressed: () => editMedicine(context, ref, null), icon: const Icon(Icons.add), label: const Text('Add medicine')),
      ],
      child: list.isEmpty
          ? EmptyState(_review ? 'Every record looks complete' : 'No medicines match')
          : view == 'board'
          ? BoardView<Product>(items: list.take(1000).toList(), card: card, onTap: manage ? (p) => editMedicine(context, ref, p) : null,
              groups: [('out', 'Out of stock', Theme.of(context).colorScheme.error), ('low', 'Running low', Colors.orange.shade800), ('ok', 'In stock', Colors.green.shade700)],
              groupOf: (p) { final st = d.stockOf(p.id); return st <= 0 ? 'out' : isLowStock(p, st) ? 'low' : 'ok'; })
          : view == 'gallery'
          ? GalleryView<Product>(items: list, card: card, onTap: manage ? (p) => editMedicine(context, ref, p) : null)
          : () {
              final shown = list.take(400).toList();
              // the owner's request: keys, double-click, right-click and ticks, as every list (list_controls.dart)
              return ListControls(
              ids: [for (final p in shown) p.id],
              search: _searchFocus,
              onClearSearch: () => setState(() {
                _search.clear();
                _q = '';
              }),
              onEdit: manage ? (i) => editMedicine(context, ref, shown[i]) : null,
              onNew: manage ? () => editMedicine(context, ref, null) : null,
              menu: (i) => [
                if (manage) RowAction('Edit', Icons.edit_outlined, () => editMedicine(context, ref, shown[i]), keyId: 'list:edit'),
                RowAction('Stock card', Icons.receipt_long_outlined, () => context.go('/stock-card?id=${Uri.encodeComponent(shown[i].id)}')),
                if (manage) RowAction('Packs (strip, box…)', Icons.inventory_2_outlined, () => editPacks(context, ref, shown[i])),
              ],
              bulk: manage
                  ? (rows) => [
                        ('Change price…', Icons.sell_outlined, (rows, done) => _bulkPrice([for (final i in rows) shown[i]], s, done)),
                        ('Set category…', Icons.category_outlined, (rows, done) => _bulkField([for (final i in rows) shown[i]], 'category', 'Category', done)),
                        ('Set reorder level…', Icons.low_priority, (rows, done) => _bulkField([for (final i in rows) shown[i]], 'reorder', 'Reorder level', done)),
                      ]
                  : null,
              builder: (context, row) => ListView.separated(
              itemCount: shown.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = shown[i];
                final st = d.stockOf(p.id);
                final packs = p.packs.where((k) => k.name.isNotEmpty && k.size > 1);
                final rs = row(i);
                return rs.wrap(ListTile(
                  leading: manage ? rs.tickBox : null,
                  title: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (p.rx) const _Tag('Rx'),
                    if (p.raw['chronic'] == true) const _Tag('Chronic'),
                    if (p.controlled) const _Tag('CD'),
                    if (_review) for (final x in recordIssues(p, dup)) _Tag(x, warn: true),
                  ]),
                  subtitle: Text([
                    [p.generic, p.barcode].where((x) => x.isNotEmpty).join(' · '),
                    [p.strength, p.form, p.category].where((x) => x.isNotEmpty).join(' · '),
                    'Sold as ${p.unit.isEmpty ? '—' : p.unit}${packs.isEmpty ? '' : ' (${packs.map((k) => '1 ${k.name.toLowerCase()} = ${formatQty(k.size)}').join(', ')})'}',
                    'Cost ${s.money(p.cost)} · wholesale ${s.money(p.wholesale)} · retail ${s.money(p.price)}',
                  ].where((x) => x.isNotEmpty).join('\n')),
                  isThreeLine: true,
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(formatQty(st), style: TextStyle(fontWeight: FontWeight.w700, color: st <= 0 ? Theme.of(context).colorScheme.error : isLowStock(p, st) ? Colors.orange.shade800 : null)),
                    if (manage)
                      TextButton(
                        key: Key('packs-${p.id}'),
                        onPressed: () => editPacks(context, ref, p),
                        child: Text('Packs${p.packs.isEmpty ? '' : ' (${p.packs.length})'}'),
                      ),
                  ]),
                  onTap: manage ? () => editMedicine(context, ref, p) : null,
                ));
              },
            ),
            );
            }(),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.warn = false});
  final String text;
  final bool warn;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(color: warn ? Colors.amber.shade100 : Theme.of(context).colorScheme.secondaryContainer, borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: TextStyle(fontSize: 11, color: warn ? Colors.brown.shade800 : null)),
      );
}

/// Add or edit a medicine (the Medicine List form).
Future<void> editMedicine(BuildContext context, WidgetRef ref, Product? p) async {
  final d = await ref.read(pharmacyProvider.future);
  final forms = (await ref.read(recordStoreProvider).rows('formulations')).map((f) => '${f['name']}').toList()..sort();
  final s = d.settings;
  if (!context.mounted) return;
  final v = await editRecord(context, title: p == null ? 'Add medicine' : 'Edit ${p.name}', delete: p == null ? null : 'medicine', initial: p?.toRecord() ?? {'form': 'Tablets', 'unit': 'Piece', 'reorder': 10}, fields: [
    const FormFieldSpec('name', 'Medicine name', required: true),
    const FormFieldSpec('generic', 'Generic name'),
    const FormFieldSpec('category', 'Category / class'),
    FormFieldSpec('form', 'Formulation', kind: FieldKind.choice, options: [for (final f in {...forms, if (p != null && p.form.isNotEmpty) p.form}) (f, f)]),
    const FormFieldSpec('strength', 'Strength'),
    FormFieldSpec('unit', 'Selling unit', kind: FieldKind.choice, options: [for (final u in {...sellingUnits, if (p != null && p.unit.isNotEmpty) p.unit}) (u, u)]),
    const FormFieldSpec('barcode', 'Barcode / SKU (blank = generate)'),
    const FormFieldSpec('cost', 'Cost price', kind: FieldKind.number, required: true),
    FormFieldSpec('price', 'Retail price (blank = cost +${formatQty(s.retailMarkup)}%)', kind: FieldKind.number),
    FormFieldSpec('wholesale', 'Wholesale price (blank = cost +${formatQty(s.wholesaleMarkup)}%)', kind: FieldKind.number),
    const FormFieldSpec('reorder', 'Reorder level', kind: FieldKind.number),
    const FormFieldSpec('shelf', 'Shelf / location'),
    if (p == null) ...const [
      FormFieldSpec('openingStock', 'Opening stock (quantity)', kind: FieldKind.number),
      FormFieldSpec('openingBatch', 'Opening stock batch no.'),
      FormFieldSpec('openingExpiry', 'Opening stock expiry', kind: FieldKind.date),
    ],
    const FormFieldSpec('rx', 'Prescription only (Rx)', kind: FieldKind.flag),
    const FormFieldSpec('chronic', 'Chronic medicine (refill reminders)', kind: FieldKind.flag),
    const FormFieldSpec('controlled', 'Controlled drug (register: patient & prescriber recorded at sale)', kind: FieldKind.flag),
  ]);
  if (v == null) return;
  if (identical(v, deleteRecord) && p != null) {
    final by = await _user(ref);
    await ref.read(recordStoreProvider).update((x) {
      x.del('products', p.id);
      x.audit(by, 'Medicine deleted', p.name, d.branch);
    });
    if (context.mounted) say(context, 'Medicine deleted');
    return;
  }
  try {
    final saved = await saveMedicine(ref.read(recordStoreProvider), v, before: p, all: d.products, settings: s, user: await _user(ref), branchId: d.branch);
    if (context.mounted) say(context, p == null ? '${saved['name']} added' : '${saved['name']} saved');
  } on MedicineProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

/// Pack sizes: stock is counted in the smallest unit; a pack is a number of those units with its own price.
Future<void> editPacks(BuildContext context, WidgetRef ref, Product p) async {
  final rows = [
    for (final k in p.packs.isEmpty ? const [Pack(name: 'Strip', size: 10)] : p.packs)
      (name: TextEditingController(text: k.name), size: TextEditingController(text: formatQty(k.size)), price: TextEditingController(text: k.price > 0 ? formatQty(k.price) : '')),
  ];
  final st = ref.read(settingsProvider).value ?? const PharmacySettings();
  final unit = p.unit.isEmpty ? 'Unit' : p.unit;
  final ok = await showAppDialog<bool>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) => AlertDialog(
        title: Text('Pack sizes – ${p.name}'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Stock is counted in ${unit}s (${st.money(p.price)} each). Add the packs you sell or receive, e.g. Strip = 10, Box = 100. '
                'Leave the price blank for ${unit.toLowerCase()} price × size.', style: Theme.of(c).textTheme.bodySmall),
            for (var n = 0; n < rows.length; n++)
              Row(children: [
                Expanded(flex: 3, child: TextField(key: Key('pack-name-$n'), controller: rows[n].name, decoration: const InputDecoration(labelText: 'Pack name', hintText: 'Strip / Box / Bottle'))),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: TextField(key: Key('pack-size-$n'), controller: rows[n].size, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: '${unit}s in it'))),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: TextField(controller: rows[n].price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Pack price'))),
                IconButton(tooltip: 'Remove pack', icon: const Icon(Icons.close), onPressed: () => set(() => rows.removeAt(n))),
              ]),
            Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: () => set(() => rows.add((name: TextEditingController(), size: TextEditingController(), price: TextEditingController()))), child: const Text('+ Add pack'))),
          ])),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save packs')),
        ],
      ),
    ),
  );
  if (ok != true) return;
  try {
    final d = await ref.read(pharmacyProvider.future);
    await savePacks(ref.read(recordStoreProvider), p, [for (final r in rows) (name: r.name.text, size: r.size.text, price: r.price.text)], user: await _user(ref), branchId: d.branch);
    if (context.mounted) say(context, '${p.name}: pack sizes saved');
  } on MedicineProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

/// Formulations (Tablets, Syrups…): add, edit, how many medicines use each.
class FormulationsScreen extends ConsumerWidget {
  const FormulationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tableProvider('formulations')).value;
    final d = ref.watch(pharmacyProvider).value;
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final count = <String, int>{};
    for (final p in [...?d?.products]) {
      count[p.form] = (count[p.form] ?? 0) + 1;
    }
    final list = [...rows]..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    Future<void> edit(Map<String, Object?>? f) async {
      final v = await editRecord(context, title: f == null ? 'Add formulation' : 'Edit ${f['name']}', initial: f ?? const {}, delete: f == null ? null : 'formulation', fields: const [
        FormFieldSpec('name', 'Name', required: true),
        FormFieldSpec('description', 'Description', kind: FieldKind.multiline),
      ]);
      if (v == null) return;
      if (identical(v, deleteRecord) && f != null) {
        await ref.read(recordStoreProvider).update((x) => x.del('formulations', '${f['id']}'));
        if (context.mounted) say(context, 'Formulation deleted');
        return;
      }
      await ref.read(recordStoreProvider).update((x) => x.put('formulations', {...?f, ...v, 'id': f?['id'] ?? uid()}));
    }

    return PageFrame(
      title: 'Formulations',
      subtitle: '${list.length} formulations',
      actions: [FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.add), label: const Text('Add formulation'))],
      child: ListView(children: [
        for (final f in list)
          ListTile(
            title: Text('${f['name']}'),
            subtitle: '${f['description'] ?? ''}'.isEmpty ? null : Text('${f['description']}'),
            trailing: Text('${count['${f['name']}'] ?? 0} medicines'),
            onTap: () => edit(f),
          ),
      ]),
    );
  }
}

/// Quick Edit: prices, reorder levels, shelf and barcodes of the medicines in stock, in a grid; save many at once.
class QuickEditScreen extends ConsumerStatefulWidget {
  const QuickEditScreen({super.key});
  @override
  ConsumerState<QuickEditScreen> createState() => _QuickEditScreenState();
}

class _QuickEditScreenState extends ConsumerState<QuickEditScreen> {
  String _q = '';
  final _edits = <String, Map<String, String>>{};
  int _round = 0;

  static const _cols = [('cost', 'Cost', true), ('wholesale', 'Wholesale', true), ('price', 'Retail', true), ('reorder', 'Reorder', true), ('shelf', 'Shelf', false), ('barcode', 'Barcode', false)];

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final s = d.settings;
    final stocked = d.products.where((p) => d.stockOf(p.id) > 0).toList();
    final rows = (_q.trim().isEmpty ? stocked : searchProducts(stocked, _q, stockOf: (p) => d.stockOf(p.id))).take(300).toList();
    String val(Product p, String k) => _edits[p.id]?[k] ?? switch (k) {
          'cost' => formatQty(p.cost), 'wholesale' => formatQty(p.wholesale), 'price' => formatQty(p.price), 'reorder' => formatQty(p.reorder),
          'barcode' => p.barcode, _ => '${p.raw[k] ?? ''}',
        };
    final n = _edits.length;
    return PageFrame(
      title: 'Quick Edit',
      subtitle: '${stocked.length} medicines in stock · edit many prices at once, then save',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v)),
        OutlinedButton.icon(onPressed: () async {
          final made = await fillBarcodes(ref.read(recordStoreProvider), d.products.where((p) => !p.isCatalog).toList());
          if (context.mounted) say(context, made == 0 ? 'Every medicine already has a barcode' : 'Generated $made barcodes');
        }, icon: const Icon(Icons.qr_code), label: const Text('Generate missing barcodes')),
        OutlinedButton.icon(onPressed: n == 0 ? null : () => setState(() {
          _edits.clear();
          _round++;
        }), icon: const Icon(Icons.undo), label: const Text('Discard')),
        FilledButton.icon(
          onPressed: n == 0 ? null : () async {
            await quickEdit(ref.read(recordStoreProvider), d.byId, Map.of(_edits), settings: s, user: await _user(ref), branchId: d.branch);
            if (!context.mounted) return;
            say(context, '$n medicine${n == 1 ? '' : 's'} updated');
            setState(() {
              _edits.clear();
              _round++;
            });
          },
          icon: const Icon(Icons.save),
          label: Text('Save ${n == 0 ? '' : '$n '}change${n == 1 ? '' : 's'}'),
        ),
      ],
      child: rows.isEmpty
          ? EmptyState(stocked.isEmpty ? 'No medicines in stock yet. Receive stock with Add Stock first.' : 'Nothing matches')
          : ListView.builder(
              itemCount: rows.length,
              itemBuilder: (_, i) {
                final p = rows[i];
                final price = double.tryParse(val(p, 'price')) ?? 0, cost = double.tryParse(val(p, 'cost')) ?? 0;
                return Container(
                  color: _edits.containsKey(p.id) ? Colors.amber.withValues(alpha: .12) : null,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    SizedBox(width: 220, child: Text('${p.name}\n${formatQty(d.stockOf(p.id))} in stock', style: const TextStyle(fontSize: 13))),
                    for (final (k, label, numeric) in _cols)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: TextFormField(
                            key: Key('qe-$k-${p.id}-$_round'),
                            initialValue: val(p, k),
                            keyboardType: numeric ? const TextInputType.numberWithOptions(decimal: true) : null,
                            decoration: InputDecoration(labelText: label, isDense: true),
                            onChanged: (v) => setState(() => (_edits[p.id] ??= {})[k] = v),
                          ),
                        ),
                      ),
                    SizedBox(width: 90, child: Text(price > 0 ? '${((price - cost) / price * 100).round()}%\n${s.money(price - cost)}' : '—', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12))),
                  ]),
                );
              },
            ),
    );
  }
}

/// Stock Card: every movement of a medicine at this branch with the running balance; count or adjust a batch.
class StockCardScreen extends ConsumerStatefulWidget {
  const StockCardScreen({super.key, this.productId = ''});
  final String productId;
  @override
  ConsumerState<StockCardScreen> createState() => _StockCardScreenState();
}

class _StockCardScreenState extends ConsumerState<StockCardScreen> {
  late String _id = widget.productId;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final moves = ref.watch(tableProvider('movements')).value;
    final batchRows = ref.watch(tableProvider('batches')).value ?? const [];
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null || moves == null) return const Center(child: CircularProgressIndicator());
    final stocked = d.products.where((p) => d.stockOf(p.id) > 0).toList();
    if (_id.isEmpty && stocked.isNotEmpty) _id = stocked.first.id;
    final p = d.byId[_id];
    final options = (_q.trim().isEmpty ? stocked : searchProducts(stocked, _q, stockOf: (x) => d.stockOf(x.id))).take(300).toList();
    if (p != null && !options.any((x) => x.id == p.id)) options.insert(0, p);
    final names = {for (final b in batchRows) if (b['productId'] == _id) '${b['id']}': '${b['batch']}'};
    final lines = stockCard(moves.map(Movement.fromRecord), _id, d.branch).reversed.take(500).toList();
    final warn = d.settings.expiryWarnDays.round();
    return PageFrame(
      title: 'Stock Card',
      subtitle: '${stocked.length} medicines in stock',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Find medicine…', width: 220),
        if (options.isNotEmpty)
          SizedBox(
            width: 260,
            child: DropdownButton<String>(
              key: const Key('stock-card-medicine'),
              isExpanded: true,
              value: options.any((x) => x.id == _id) ? _id : null,
              items: [for (final x in options) DropdownMenuItem(value: x.id, child: Text(x.name, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _id = v ?? _id),
            ),
          ),
        if (p != null && d.stockOf(p.id) > 0 && can.contains('stock.adjust'))
          FilledButton.icon(onPressed: () => adjustDialog(context, ref, p), icon: const Icon(Icons.tune), label: const Text('Count / adjust')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (p != null)
          StatGrid(children: [
            StatCard(label: 'In stock here', value: formatQty(d.stockOf(p.id)), sub: p.unit.isEmpty ? 'units' : p.unit),
            for (final b in d.stock.batchesOf(p.id).where((b) => b.qty != 0).take(3))
              StatCard(label: 'Batch ${b.batch}', value: formatQty(b.qty), sub: 'Expires ${b.expiry.isEmpty ? '—' : b.expiry}',
                  color: b.expiry.isNotEmpty && daysUntil(b.expiry) < 0 ? Theme.of(context).colorScheme.error : b.expiry.isNotEmpty && daysUntil(b.expiry) <= warn ? Colors.orange.shade800 : null),
          ]),
        const SizedBox(height: 8),
        Expanded(
          child: lines.isEmpty
              ? const EmptyState('No stock movements at this branch')
              : ListView.separated(
                  itemCount: lines.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final (m, bal) = lines[i];
                    return ListTile(
                      dense: true,
                      title: Text('${m.type}${m.ref.isEmpty ? '' : ' · ${m.ref}'}${m.note.isEmpty ? '' : ' (${m.note})'}'),
                      subtitle: Text('${m.date.replaceFirst('T', ' ').split('.').first} · batch ${m.batchId == null ? '—' : names[m.batchId] ?? '—'} · ${m.user}'),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(m.qty > 0 ? 'In ${formatQty(m.qty)}' : 'Out ${formatQty(-m.qty)}', style: TextStyle(color: m.qty > 0 ? Colors.green.shade700 : Theme.of(context).colorScheme.error)),
                        Text('Balance ${formatQty(bal)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

/// Count, add or remove stock of one medicine (with a reason).
Future<void> adjustDialog(BuildContext context, WidgetRef ref, Product p) async {
  final d = await ref.read(pharmacyProvider.future);
  final batches = d.stock.batchesOf(p.id);
  if (!context.mounted) return;
  final opts = [for (final b in batches) (b.id, '${b.batch} · exp ${b.expiry.isEmpty ? '—' : b.expiry} · ${formatQty(b.qty)} in stock'), ('new', '+ New batch…')];
  final v = await editRecord(context, title: 'Count / adjust – ${p.name}', save: 'Save', initial: {
    'mode': 'count', 'batchId': batches.where((b) => b.qty > 0).firstOrNull?.id ?? (batches.isEmpty ? 'new' : batches.first.id),
  }, fields: [
    const FormFieldSpec('mode', 'What to do', kind: FieldKind.choice, required: true, options: [('count', 'Physical count: set to what is on the shelf'), ('add', 'Add'), ('remove', 'Remove')]),
    FormFieldSpec('batchId', 'Batch', kind: FieldKind.choice, required: true, options: opts),
    const FormFieldSpec('qty', 'Quantity (counted, added or removed)', kind: FieldKind.number, required: true),
    const FormFieldSpec('reason', 'Reason', required: true, hint: 'e.g. damaged, stock take, sample'),
    const FormFieldSpec('newBatch', 'New batch number (only for a new batch)'),
    const FormFieldSpec('newExpiry', 'New batch expiry (only for a new batch)', kind: FieldKind.date),
  ]);
  if (v == null) return;
  final qty = (v['qty'] as num).toDouble();
  try {
    final diff = await adjustStock(ref.read(recordStoreProvider), product: p, batches: batches, mode: AdjustMode.values.byName(v['mode'] as String),
        batchId: v['batchId'] as String, counted: qty, qty: qty, reason: '${v['reason']}', user: await _user(ref), branchId: d.branch,
        newBatch: '${v['newBatch'] ?? ''}', newExpiry: '${v['newExpiry'] ?? ''}');
    if (context.mounted) say(context, diff == 0 ? 'No change' : 'Stock updated (${diff > 0 ? '+' : ''}${formatQty(diff)})');
  } on AdjustProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

/// Edit a medicine's details and its batches here (number, expiry, actual quantity) in one place (inventory.edit).
Future<void> inventoryEditor(BuildContext context, WidgetRef ref, Product p) async {
  final d = await ref.read(pharmacyProvider.future);
  if (!context.mounted) return;
  final f = {
    for (final (k, v) in [('name', p.name), ('generic', p.generic), ('form', p.form), ('shelf', '${p.raw['shelf'] ?? ''}'), ('cost', formatQty(p.cost)),
      ('wholesale', formatQty(p.wholesale)), ('price', formatQty(p.price)), ('reorder', formatQty(p.reorder))])
      k: TextEditingController(text: v),
  };
  const labels = {'name': 'Name', 'generic': 'Generic name', 'form': 'Formulation', 'shelf': 'Shelf / location', 'cost': 'Cost price', 'wholesale': 'Wholesale price', 'price': 'Retail price', 'reorder': 'Reorder level'};
  final rows = [
    for (final b in d.stock.batchesOf(p.id).where((b) => b.qty != 0))
      (b: b, batch: TextEditingController(text: b.batch), expiry: TextEditingController(text: b.expiry), qty: TextEditingController(text: formatQty(b.qty))),
  ];
  final reason = TextEditingController();
  final ok = await showAppDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('Edit ${p.name}'),
      content: SizedBox(
        width: 620,
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(spacing: 10, runSpacing: 4, children: [
            for (final e in f.entries) SizedBox(width: 190, child: TextField(key: Key('inv-${e.key}'), controller: e.value, decoration: InputDecoration(labelText: labels[e.key]))),
          ]),
          const SizedBox(height: 12),
          Text('Batches at this branch', style: Theme.of(c).textTheme.titleSmall),
          if (rows.isEmpty) const Text('No stock at this branch. Use Add Stock to receive it.'),
          for (final r in rows)
            Row(children: [
              Expanded(child: TextField(controller: r.batch, enabled: !r.b.legacy, decoration: const InputDecoration(labelText: 'Batch no.'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: r.expiry, enabled: !r.b.legacy, decoration: const InputDecoration(labelText: 'Expiry', hintText: 'YYYY-MM-DD'))),
              const SizedBox(width: 8),
              SizedBox(width: 90, child: Text('System ${formatQty(r.b.qty)}')),
              SizedBox(width: 90, child: TextField(key: Key('inv-qty-${r.b.id}'), controller: r.qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Actual qty'))),
            ]),
          TextField(key: const Key('inv-reason'), controller: reason, decoration: const InputDecoration(labelText: 'Reason for quantity changes (kept in the audit log)', hintText: 'e.g. stock take, damaged, found extra')),
        ])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await inventoryEdit(ref.read(recordStoreProvider), p, {for (final e in f.entries) e.key: e.value.text.trim()},
        [for (final r in rows) BatchEdit(r.b, batch: r.batch.text, expiry: r.expiry.text.trim(), qty: double.tryParse(r.qty.text.trim()) ?? r.b.qty)],
        reason: reason.text, settings: d.settings, user: await _user(ref), branchId: d.branch);
    if (context.mounted) say(context, '${f['name']!.text.trim()} saved');
  } on MedicineProblem catch (e) {
    if (context.mounted) say(context, e.message, error: true);
  }
}

/// The CSV of the inventory: one row per batch in stock (as the React app's).
List<Map<String, Object?>> inventoryCsv(Iterable<Product> rows, PharmacyData d) => [
      for (final p in rows)
        for (final b in d.stock.batchesOf(p.id).where((b) => b.qty != 0))
          {'name': p.name, 'generic': p.generic, 'form': p.form, 'batch': b.batch, 'expiry': b.expiry, 'qty': b.qty, 'cost': b.cost != 0 ? b.cost : p.cost, 'price': p.price,
            'value': b.qty * (b.cost != 0 ? b.cost : p.cost)},
    ];

/// For the PDF of the inventory list.
PdfTable inventoryTable(Iterable<Product> rows, PharmacyData d, PharmacySettings s) => PdfTable(
      head: const ['Medicine', 'Form', 'Shelf', 'Reorder at', 'In stock', 'Value (cost)'],
      numeric: const [3, 4, 5],
      body: [
        for (final p in rows)
          [p.name, p.form, '${p.raw['shelf'] ?? ''}', formatQty(p.reorder), formatQty(d.stockOf(p.id)), s.money(batchValue(p, d.stock.batchesOf(p.id)).value)],
      ],
    );
