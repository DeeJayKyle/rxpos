// Kits (1.10, the React app's src/pages/Kits.jsx): build a kit from medicines in stock (and service lines such as a
// testing fee) and sell it at the till as one item. A kit is a recipe (core/rules/kits.dart): no stock of its own; each
// sale takes its medicines from their own batches. Its cost is the live sum of what it holds, its price their retail
// prices added up unless a price is set. Each kit has an icon, a colour and a warning (that the cashier may have to
// tick before charging). Ready-made kits are matched to this pharmacy's own medicines by name. The records are the
// React app's, field for field.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/json_fields.dart' show numOut;
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart' show sellable;
import '../../../core/rules/ids.dart';
import '../../../core/rules/kits.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../../inventory/domain/medicines.dart' show newInternalBarcode;
import 'kit_widgets.dart';

class KitsScreen extends ConsumerStatefulWidget {
  const KitsScreen({super.key});
  @override
  ConsumerState<KitsScreen> createState() => _KitsScreenState();
}

class _KitsScreenState extends ConsumerState<KitsScreen> {
  int _days = 30;

  Future<String> _by() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider);
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final sales = ref.watch(tableProvider('sales')).value ?? const [];
    final edit = can.contains('medicines.manage');
    final t = Theme.of(context);
    return data.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('$e')),
      data: (d) {
        final st = d.settings;
        String fmt(num v) => formatMoney(v, currency: st.currency, decimals: st.decimalPlaces);
        final views = [for (final k in d.kits) d.kitNow(k)];
        // kit sales over the chosen days: kits sold, takings and profit from the components' costs
        final since = DateTime.now().subtract(Duration(days: _days)).toIso8601String();
        final sold = <String, ({double n, double takings, double profit, int swaps})>{};
        for (final s in sales) {
          if (s['status'] == 'refunded' || '${s['date']}'.compareTo(since) < 0) continue;
          for (final i in rawSaleItems(s)) {
            if (i['kit'] is! Map) continue;
            final q = (i['qty'] as num?)?.toDouble() ?? 0, p = (i['price'] as num?)?.toDouble() ?? 0, c = (i['cost'] as num?)?.toDouble() ?? 0;
            final x = sold['${i['id']}'] ?? (n: 0.0, takings: 0.0, profit: 0.0, swaps: 0);
            final sw = ((i['kit'] as Map)['components'] as List? ?? const []).whereType<Map>().any((c) => '${c['swappedFrom'] ?? ''}'.isNotEmpty);
            sold['${i['id']}'] = (n: x.n + q, takings: x.takings + q * p, profit: x.profit + q * (p - c), swaps: x.swaps + (sw ? 1 : 0));
          }
        }
        return PageFrame(
          title: 'Kits',
          subtitle: '${d.kits.length} kit${d.kits.length == 1 ? '' : 's'} · sold at the till as one item, from their medicines\' stock',
          actions: [
            if (edit) OutlinedButton.icon(key: const Key('kit-template'), onPressed: () => _pickTemplate(d), icon: const Icon(Icons.auto_awesome, size: 18), label: const Text('Ready-made kit')),
            if (edit) FilledButton.icon(key: const Key('kit-new'), onPressed: () => _edit(d, null), icon: const Icon(Icons.add), label: const Text('New kit')),
          ],
          child: ListView(children: [
            Text('A kit is a list of medicines (and services such as a testing fee) sold together. It has no stock of its own: the till shows how many can be made '
                'from what is on the shelf, and each sale takes every medicine from its own batches.', style: t.textTheme.bodySmall),
            const SizedBox(height: 12),
            if (views.isEmpty) const Padding(padding: EdgeInsets.all(24), child: EmptyState('No kits yet. Build one from medicines in stock, or start from a ready-made kit.')),
            Wrap(spacing: 12, runSpacing: 12, children: [
              for (final v in views) _KitCard(v: v, fmt: fmt, sold: sold[v.id], days: _days, edit: edit,
                  onEdit: () => _edit(d, v.rec), onToggle: () => _toggle(v), onDelete: () => _delete(v), onLabel: () => context.go('/labels?kit=${v.id}')),
            ]),
            if (views.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text('Kit sales', style: t.textTheme.titleMedium)),
                  DropdownButton<int>(value: _days, items: [for (final n in const [7, 30, 90, 365]) DropdownMenuItem(value: n, child: Text('Last $n days'))], onChanged: (v) => setState(() => _days = v!)),
                ]),
                if (sold.isEmpty) const Text('No kits sold in this period'),
                for (final v in views)
                  if (sold[v.id] != null)
                    Row(children: [
                      Expanded(child: Text(v.name)),
                      SizedBox(width: 60, child: Text(formatQty(sold[v.id]!.n), textAlign: TextAlign.right)),
                      SizedBox(width: 120, child: Text(fmt(sold[v.id]!.takings), textAlign: TextAlign.right)),
                      SizedBox(width: 120, child: Text(fmt(sold[v.id]!.profit), textAlign: TextAlign.right)),
                    ]),
                const SizedBox(height: 6),
                Text("Profit is the kit's price less what its medicines cost when it was sold.", style: t.textTheme.bodySmall),
              ]))),
            ],
          ]),
        );
      },
    );
  }

  Future<void> _toggle(KitView v) async {
    final by = await _by();
    final on = v.rec['active'] == false;
    await ref.read(recordStoreProvider).update((x) {
      x.put('products', {...v.rec, 'active': on});
      x.audit(by, on ? 'Kit switched on' : 'Kit switched off', v.name);
    });
  }

  Future<void> _delete(KitView v) async {
    if (!await confirmAction(context, 'Delete ${v.name}?', 'The kit is no longer sold. Its past sales, and the stock its medicines used, stay as they are.', 'Delete kit')) return;
    final by = await _by();
    await ref.read(recordStoreProvider).update((x) {
      x.del('products', v.id);
      x.audit(by, 'Kit deleted', v.name);
    });
    if (mounted) say(context, '${v.name} deleted');
  }

  Future<void> _pickTemplate(PharmacyData d) async {
    final t = await showAppDialog<int>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Start from a ready-made kit'),
        content: SizedBox(
          width: 460,
          child: ListView(shrinkWrap: true, children: [
            const Text('Each line is matched to your own medicines by name; check them before saving.'),
            for (final (i, k) in kitTemplates.indexed)
              ListTile(
                key: Key('template-${k.key}'),
                leading: KitIcon(icon: k.icon, color: k.color),
                title: Row(children: [Flexible(child: Text(k.name)), KitBadge(color: k.color)]),
                subtitle: Text(k.items.map((x) => '${formatQty(x.qty)} × ${x.find.first}').join(' · ')),
                onTap: () => Navigator.pop(c, i),
              ),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel'))],
      ),
    );
    if (t == null) return;
    final k = kitTemplates[t];
    final lines = matchTemplate(k.items, [for (final p in d.products) (id: p.id, name: p.name, generic: p.generic, inStock: d.stockOf(p.id) > 0)]);
    final missing = [for (final x in lines) if (x.productId.isEmpty) x.looking];
    if (missing.isNotEmpty && mounted) say(context, 'Not found in your medicines: ${missing.join(', ')}. Choose them, or remove those lines.');
    await _edit(d, null, draft: {
      'name': k.name, 'kit': {'icon': k.icon, 'color': k.color, 'warning': k.warning, 'ack': k.ack,
        'items': [for (final x in lines) {'productId': x.productId, 'qty': numOut(x.qty), if (x.productId.isEmpty) 'looking': x.looking}]},
    });
  }

  Future<void> _edit(PharmacyData d, Map<String, Object?>? rec, {Map<String, Object?>? draft}) async {
    final saved = await showAppDialog<bool>(context: context, builder: (_) => _KitEditor(data: d, rec: rec, draft: draft, by: _by));
    if (saved == true && mounted) say(context, 'Kit saved');
  }
}

class _KitCard extends StatelessWidget {
  const _KitCard({required this.v, required this.fmt, required this.sold, required this.days, required this.edit, required this.onEdit, required this.onToggle,
      required this.onDelete, required this.onLabel});
  final KitView v;
  final String Function(num) fmt;
  final ({double n, double takings, double profit, int swaps})? sold;
  final int days;
  final bool edit;
  final VoidCallback onEdit, onToggle, onDelete, onLabel;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context), c = kitColor(v.color);
    final off = v.rec['active'] == false;
    final short = kitShortText(v);
    Widget fig(String label, String value, {Color? color}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: t.textTheme.bodySmall),
      Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
    ]);
    return SizedBox(
      width: 340,
      child: Opacity(
        opacity: off ? .65 : 1,
        child: Card(
          key: Key('kitcard-${v.id}'),
          color: Color.alphaBlend(c.withValues(alpha: .06), t.colorScheme.surface),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: c.withValues(alpha: .5))),
          child: Container(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c, width: 5))),
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                KitIcon(icon: v.icon, color: v.color, size: 18),
                const SizedBox(width: 8),
                Flexible(child: Text(v.name, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                KitBadge(color: v.color),
                if (off) const Padding(padding: EdgeInsets.only(left: 6), child: Chip(label: Text('Off'), visualDensity: VisualDensity.compact)),
              ]),
              const SizedBox(height: 6),
              for (final x in v.components)
                Text('${formatQty(x.qty)} × ${x.missing ? 'a deleted medicine' : x.name}  (${formatQty(x.have)} in stock)', style: t.textTheme.bodySmall?.copyWith(color: x.missing ? t.colorScheme.error : null)),
              for (final s in v.services) Text('${s.name} · ${fmt(s.price)}', style: t.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic)),
              const SizedBox(height: 8),
              Wrap(spacing: 18, runSpacing: 6, children: [
                fig('Can make', v.canMake == null ? 'any' : '${v.canMake}', color: v.canMake == 0 ? t.colorScheme.error : (v.canMake ?? 99) <= 3 ? Colors.orange.shade800 : null),
                fig('Cost', fmt(v.cost)),
                fig((v.kit['price'] as num? ?? 0) > 0 ? 'Price (fixed)' : 'Price', fmt(v.price)),
                fig('Margin', v.margin == null ? '—' : '${v.margin}%', color: (v.margin ?? 0) < 0 ? t.colorScheme.error : null),
              ]),
              if (short.isNotEmpty && (v.canMake ?? 99) <= 3) Padding(padding: const EdgeInsets.only(top: 6), child: Text('⚠ $short', style: TextStyle(color: Colors.orange.shade900, fontSize: 12.5))),
              if (v.warning.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('⚠ ${v.warning}${v.ack ? ' (the cashier ticks it before charging)' : ''}', style: t.textTheme.bodySmall)),
              const SizedBox(height: 4),
              Text(
                '${sold == null ? 'None sold in the last $days days' : 'Last $days days: ${formatQty(sold!.n)} sold · ${fmt(sold!.takings)} · profit ${fmt(sold!.profit)}${sold!.swaps > 0 ? ' · ${sold!.swaps} with a swap' : ''}'}'
                '${v.expiry.isNotEmpty ? ' · earliest expiry ${v.expiry}' : ''}',
                style: t.textTheme.bodySmall,
              ),
              if (edit)
                Wrap(spacing: 4, children: [
                  TextButton.icon(key: Key('kit-edit-${v.id}'), onPressed: onEdit, icon: const Icon(Icons.edit, size: 16), label: const Text('Edit')),
                  TextButton.icon(onPressed: onLabel, icon: const Icon(Icons.qr_code_2, size: 16), label: const Text('Label')),
                  TextButton.icon(onPressed: onToggle, icon: const Icon(Icons.power_settings_new, size: 16), label: Text(off ? 'Switch on' : 'Switch off')),
                  IconButton(tooltip: 'Delete ${v.name}', onPressed: onDelete, icon: Icon(Icons.delete_outline, color: t.colorScheme.error)),
                ]),
            ]),
          ),
        ),
      ),
    );
  }
}

/// New kit / edit kit (src/pages/Kits.jsx KitEditor)
class _KitEditor extends ConsumerStatefulWidget {
  const _KitEditor({required this.data, required this.rec, required this.draft, required this.by});
  final PharmacyData data;
  final Map<String, Object?>? rec, draft;
  final Future<String> Function() by;
  @override
  ConsumerState<_KitEditor> createState() => _KitEditorState();
}

class _KitEditorState extends ConsumerState<_KitEditor> {
  late final Map<String, Object?> _src = widget.rec ?? widget.draft ?? const {};
  late final Map<String, Object?> _k0 = _src['kit'] is Map ? (_src['kit'] as Map).cast<String, Object?>() : const {};
  late final _name = TextEditingController(text: '${_src['name'] ?? ''}');
  late final _barcode = TextEditingController(text: '${_src['barcode'] ?? ''}');
  late final _price = TextEditingController(text: (_k0['price'] as num? ?? 0) > 0 ? '${_k0['price']}' : '');
  late final _wholesale = TextEditingController(text: (_k0['wholesale'] as num? ?? 0) > 0 ? '${_k0['wholesale']}' : '');
  late final _warning = TextEditingController(text: '${_k0['warning'] ?? ''}');
  late String _icon = '${_k0['icon'] ?? 'test-tube'}', _color = '${_k0['color'] ?? kitColors.first}';
  late bool _ack = _k0['ack'] == true, _active = _src['active'] != false;
  late final List<Map<String, Object?>> _items = [
    for (final x in (_k0['items'] is List ? (_k0['items'] as List).whereType<Map>() : const <Map>[])) {...x.cast<String, Object?>(), 'key': uid()},
    if (_k0['items'] is! List) {'key': uid(), 'productId': '', 'qty': 1},
  ];

  double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

  Map<String, Object?> _kit() => {
    'items': [
      for (final i in _items)
        if (i['service'] == true) {'service': true, 'name': '${i['name'] ?? ''}'.trim(), 'price': numOut(_n(i['price'])), 'cost': numOut(_n(i['cost']))}
        else {'productId': '${i['productId'] ?? ''}', 'qty': numOut(_n(i['qty']))},
    ],
    'icon': _icon, 'color': _color, 'warning': _warning.text.trim(), 'ack': _ack && _warning.text.trim().isNotEmpty,
    'price': numOut(_n(_price.text)), 'wholesale': numOut(_n(_wholesale.text)),
  };

  Future<void> _save(KitView v) async {
    final d = widget.data;
    final name = _name.text.trim();
    void no(String m) => say(context, m, error: true);
    if (name.isEmpty) return no('Give the kit a name');
    final stock = _items.where((i) => i['service'] != true).toList();
    if (stock.any((i) => '${i['productId'] ?? ''}'.isEmpty)) return no('Choose the medicine on every line, or remove the empty lines');
    if (stock.any((i) => !(_n(i['qty']) > 0))) return no('Every medicine needs a quantity of at least 1');
    if (_items.any((i) => i['service'] == true && '${i['name'] ?? ''}'.trim().isEmpty)) return no('Name every service line (e.g. Testing fee)');
    if (stock.isEmpty && !_items.any((i) => i['service'] == true)) return no('A kit needs at least one medicine');
    if ({for (final i in stock) i['productId']}.length < stock.length) return no('A medicine is on two lines: put the whole quantity on one line');
    final id = '${widget.rec?['id'] ?? ''}'.isEmpty ? uid() : '${widget.rec!['id']}';
    final all = [...d.products.map((p) => (id: p.id, name: p.name, barcode: p.barcode)), for (final k in d.kits) (id: '${k['id']}', name: '${k['name'] ?? ''}', barcode: '${k['barcode'] ?? ''}')];
    if (all.any((p) => p.id != id && p.name.trim().toLowerCase() == name.toLowerCase())) return no('There is already a medicine or kit called $name');
    final code = _barcode.text.trim();
    if (code.isNotEmpty && all.any((p) => p.id != id && p.barcode == code)) return no('The barcode $code is already used');
    if (v.price < v.cost && !await confirmAction(context, 'Below cost', "The kit's price ${v.price} is less than what its medicines cost (${v.cost}). Save it anyway?", 'Save')) return;
    final barcode = code.isNotEmpty ? code : '${widget.rec?['barcode'] ?? ''}'.isNotEmpty ? '${widget.rec!['barcode']}' : newInternalBarcode({for (final p in all) p.barcode});
    final by = await widget.by();
    final generic = 'Kit: ${[for (final c in v.components) c.name, for (final s in v.services) s.name].join(', ')}';
    await ref.read(recordStoreProvider).update((x) {
      // price, cost and wholesale are kept on the record too (as worked out now), as the React app keeps them
      x.put('products', {
        ...?widget.rec, 'id': id, 'name': name, 'kit': _kit(), 'active': _active, 'barcode': barcode, 'form': 'Kit', 'unit': 'Kit', 'generic': generic,
        'price': numOut(v.price), 'wholesale': numOut(v.wholesale), 'cost': numOut(v.cost), 'reorder': 0, 'rx': v.rx,
        if (widget.rec?['createdAt'] == null) 'createdAt': x.now,
      });
      x.audit(by, widget.rec == null ? 'Kit created' : 'Kit changed',
          '$name: ${[for (final c in v.components) '${formatQty(c.qty)} × ${c.name}', for (final s in v.services) s.name].join(', ')} · price ${v.price}${_n(_price.text) > 0 ? ' (fixed)' : ''}');
    });
    if (mounted) Navigator.pop(context, true);
  }

  Future<void> _pickMedicine(Map<String, Object?> line) async {
    final d = widget.data;
    var q = '';
    final id = await showAppDialog<String>(
      context: context,
      builder: (c) => StatefulBuilder(builder: (c, set) {
        final list = (q.trim().isEmpty ? d.products : searchProducts(d.products, q, stockOf: (p) => d.stockOf(p.id))).take(30).toList();
        return AlertDialog(
          title: Text(line['looking'] != null ? 'Choose: ${line['looking']}' : 'Choose a medicine'),
          content: SizedBox(width: 460, height: 420, child: Column(children: [
            TextField(key: const Key('kit-med-search'), autofocus: true, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search medicine…'), onChanged: (v) => set(() => q = v)),
            Expanded(child: ListView(children: [
              for (final p in list)
                ListTile(key: Key('kit-med-${p.id}'), dense: true, title: Text(p.name), subtitle: Text('${formatQty(sellable(d.stock.batchesOf(p.id)))} in stock'), onTap: () => Navigator.pop(c, p.id)),
            ])),
          ])),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel'))],
        );
      }),
    );
    if (id != null) setState(() => line..['productId'] = id..remove('looking'));
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data, t = Theme.of(context), st = d.settings;
    String fmt(num v) => formatMoney(v, currency: st.currency, decimals: st.decimalPlaces);
    final v = d.kitNow({'id': widget.rec?['id'] ?? 'new', 'name': _name.text, 'kit': _kit()});
    return AlertDialog(
      title: Text(widget.rec == null ? 'New kit' : 'Edit kit ${widget.rec!['name']}'),
      content: SizedBox(
        width: 720,
        child: ListView(shrinkWrap: true, children: [
          Wrap(spacing: 12, runSpacing: 8, children: [
            SizedBox(width: 340, child: TextField(key: const Key('kit-name'), controller: _name, decoration: const InputDecoration(labelText: 'Kit name', hintText: 'e.g. HIV Test Kit'), onChanged: (_) => setState(() {}))),
            SizedBox(width: 300, child: TextField(controller: _barcode, decoration: const InputDecoration(labelText: 'Barcode (blank = made for you)'))),
          ]),
          const SizedBox(height: 10),
          Text('Icon', style: t.textTheme.labelLarge),
          Wrap(spacing: 6, children: [
            for (final ic in kitIcons)
              ChoiceChip(key: Key('kit-icon-$ic'), selected: _icon == ic, label: Icon(kitIconData[ic], size: 18), tooltip: ic.replaceAll('-', ' '), onSelected: (_) => setState(() => _icon = ic)),
          ]),
          const SizedBox(height: 8),
          Text('Colour', style: t.textTheme.labelLarge),
          Wrap(spacing: 6, children: [
            for (final c in kitColors)
              InkWell(
                key: Key('kit-colour-$c'),
                onTap: () => setState(() => _color = c),
                child: Container(width: 30, height: 30, decoration: BoxDecoration(color: kitColor(c), shape: BoxShape.circle,
                    border: Border.all(color: _color == c ? t.colorScheme.onSurface : Colors.transparent, width: 3))),
              ),
          ]),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(border: Border(left: BorderSide(color: kitColor(_color), width: 5))),
            padding: const EdgeInsets.only(left: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('In the kit', style: t.textTheme.titleSmall),
              for (final i in _items)
                i['service'] == true
                    ? Row(key: ValueKey(i['key']), children: [
                        const Icon(Icons.build_outlined, size: 16),
                        const SizedBox(width: 6),
                        Expanded(child: TextFormField(initialValue: '${i['name'] ?? ''}', decoration: const InputDecoration(hintText: 'Service, e.g. Testing fee'), onChanged: (x) => setState(() => i['name'] = x))),
                        SizedBox(width: 100, child: TextFormField(initialValue: _n(i['price']) > 0 ? '${i['price']}' : '', keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Price'), onChanged: (x) => setState(() => i['price'] = x))),
                        SizedBox(width: 100, child: TextFormField(initialValue: _n(i['cost']) > 0 ? '${i['cost']}' : '', keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Cost'), onChanged: (x) => setState(() => i['cost'] = x))),
                        IconButton(tooltip: 'Remove line', onPressed: () => setState(() => _items.remove(i)), icon: const Icon(Icons.delete_outline)),
                      ])
                    : Row(key: ValueKey(i['key']), children: [
                        Expanded(child: OutlinedButton(
                          key: Key('kit-line-${_items.indexOf(i)}'),
                          onPressed: () => _pickMedicine(i),
                          child: Align(alignment: Alignment.centerLeft, child: Text(
                            d.byId['${i['productId']}']?.name ?? (i['looking'] != null ? 'Not found: “${i['looking']}”, choose…' : 'Choose a medicine…'),
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: d.byId['${i['productId']}'] == null && i['looking'] != null ? Colors.orange.shade900 : null),
                          )),
                        )),
                        SizedBox(width: 70, child: TextFormField(initialValue: '${i['qty'] ?? 1}', keyboardType: TextInputType.number, textAlign: TextAlign.center,
                            decoration: const InputDecoration(labelText: 'Qty'), onChanged: (x) => setState(() => i['qty'] = x))),
                        SizedBox(width: 110, child: Text(d.byId['${i['productId']}'] == null ? '' : '${formatQty(sellable(d.stock.batchesOf('${i['productId']}')))} in stock', textAlign: TextAlign.right, style: t.textTheme.bodySmall)),
                        IconButton(tooltip: 'Remove line', onPressed: () => setState(() => _items.remove(i)), icon: const Icon(Icons.delete_outline)),
                      ]),
              Wrap(spacing: 6, children: [
                TextButton.icon(key: const Key('kit-add-med'), onPressed: () => setState(() => _items.add({'key': uid(), 'productId': '', 'qty': 1})), icon: const Icon(Icons.add, size: 16), label: const Text('Add a medicine')),
                TextButton.icon(onPressed: () => setState(() => _items.add({'key': uid(), 'service': true, 'name': '', 'price': '', 'cost': ''})), icon: const Icon(Icons.build_outlined, size: 16), label: const Text('Add a service (not stock)')),
              ]),
            ]),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 20, children: [
            Text('Can make now: ${v.canMake ?? 'any'}'),
            Text('Cost (live): ${fmt(v.cost)}'),
            Text('Retail prices added up: ${fmt(v.listPrice)}'),
            Text('Margin: ${v.margin == null ? '—' : '${v.margin}%'}', style: TextStyle(color: (v.margin ?? 0) < 0 ? t.colorScheme.error : null)),
          ]),
          Wrap(spacing: 12, children: [
            SizedBox(width: 340, child: TextField(key: const Key('kit-price'), controller: _price, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Kit price (blank = the prices added up)', hintText: '${v.listPrice}'), onChanged: (_) => setState(() {}))),
            SizedBox(width: 300, child: TextField(controller: _wholesale, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Wholesale price (blank = as retail)'), onChanged: (_) => setState(() {}))),
          ]),
          TextField(key: const Key('kit-warning'), controller: _warning, maxLines: 2, decoration: const InputDecoration(labelText: 'Warning shown at the till (optional)', hintText: 'e.g. Pre-test counselling first; give the result in private'), onChanged: (_) => setState(() {})),
          CheckboxListTile(key: const Key('kit-ack'), contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, value: _ack,
              onChanged: _warning.text.trim().isEmpty ? null : (x) => setState(() => _ack = x == true),
              title: const Text('The cashier must tick that the client was told before charging (written to the audit log)')),
          CheckboxListTile(contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, value: _active, onChanged: (x) => setState(() => _active = x == true), title: const Text('Sold at the till')),
          if (v.rx || v.controlled)
            Text('⚠ Holds ${v.controlled ? 'a controlled drug: the register is filled in at the till' : 'a prescription-only medicine: the till asks for the prescription'}.', style: t.textTheme.bodySmall),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(key: const Key('kit-save'), onPressed: () => _save(v), child: const Text('Save kit')),
      ],
    );
  }
}
