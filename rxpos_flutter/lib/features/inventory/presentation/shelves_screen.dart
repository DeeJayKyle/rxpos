// Shelves: which medicines sit on which shelf, so they are quick to find when dispensing (the shelf shows on the till).
// Medicines are picked one by one or a whole group at a time (a pharmacological class, a therapeutic area or a dosage
// form) and put on a shelf. It writes each medicine's "Shelf / location", the same field as the React app.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/medicine_groups.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/drug_class.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../domain/medicines.dart';

class ShelvesScreen extends ConsumerStatefulWidget {
  const ShelvesScreen({super.key});
  @override
  ConsumerState<ShelvesScreen> createState() => _ShelvesScreenState();
}

class _ShelvesScreenState extends ConsumerState<ShelvesScreen> {
  String _q = '', _shelf = '';
  bool _all = false;
  final _picked = <String>{};
  final _folded = <String>{};

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null) return const Center(child: CircularProgressIndicator());
    final edit = can.contains('medicines.manage');
    // the pharmacy's own medicines and any with stock here (the standard catalogue's 9,000+ others only when asked)
    final mine = d.products.where((p) => _all || !p.isCatalog || d.stockOf(p.id) > 0 || shelfLabel(p).isNotEmpty).toList();
    final shelves = <String, int>{};
    for (final p in mine) {
      final s = shelfLabel(p);
      if (s.isNotEmpty) shelves[s] = (shelves[s] ?? 0) + 1;
    }
    final names = shelves.keys.toList()..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    final unshelved = mine.where((p) => shelfLabel(p).isEmpty).length;
    var list = _q.trim().isEmpty ? mine : searchProducts(mine, _q, stockOf: (p) => d.stockOf(p.id)).toList();
    if (_shelf == '-') {
      list = list.where((p) => shelfLabel(p).isEmpty).toList();
    } else if (_shelf.isNotEmpty) {
      list = list.where((p) => shelfLabel(p) == _shelf).toList();
    }
    final order = medicineOrderOf(ref);
    final rows = groupedRows(list.take(1500), order == MedicineOrder.name ? MedicineOrder.shelf : order, _folded);
    final byId = {for (final p in list) p.id: p};
    final picked = [for (final id in _picked) ?byId[id]];

    return PageFrame(
      title: 'Shelves',
      subtitle: '${names.length} shelves · $unshelved medicines without a shelf · the shelf shows on the till to find a medicine fast',
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Medicine, generic, barcode…'),
        ExportButtons(
          name: 'shelves',
          settings: d.settings,
          title: 'Shelf list',
          subtitle: '${list.length} medicines',
          csv: () => [
            for (final (g, ps) in groupMedicines(list, MedicineOrder.shelf))
              for (final p in ps) {'shelf': g, 'medicine': p.name, 'generic': p.generic, 'form': p.form, 'class': drugClassOf(p).cls, 'inStock': d.stockOf(p.id)},
          ],
          pdf: () => [
            PdfTable(heading: 'Shelf list', head: ['Shelf', 'Medicine', 'Form', 'Class', 'In stock'], body: [
              for (final (g, ps) in groupMedicines(list, MedicineOrder.shelf))
                for (final (n, p) in ps.indexed) [n == 0 ? g : '', p.name, p.form, drugClassOf(p).cls, formatQty(d.stockOf(p.id))],
            ]),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          ChoiceChip(label: Text('All (${mine.length})'), selected: _shelf.isEmpty, onSelected: (_) => setState(() => _shelf = '')),
          ChoiceChip(key: const Key('shelf-none'), label: Text('No shelf ($unshelved)'), selected: _shelf == '-', onSelected: (_) => setState(() => _shelf = '-')),
          for (final s in names) ChoiceChip(key: Key('shelf-$s'), avatar: const Icon(Icons.shelves, size: 16), label: Text('$s (${shelves[s]})'), selected: _shelf == s, onSelected: (_) => setState(() => _shelf = s)),
          const MedicineOrderMenu(),
          FilterChip(label: const Text('Include the whole catalogue'), selected: _all, onSelected: (v) => setState(() => _all = v)),
        ]),
        const SizedBox(height: 6),
        if (edit)
          AnimatedSize(
            duration: const Duration(milliseconds: 150),
            child: picked.isEmpty
                ? Text('Tick medicines, or use the shelf button on a group, to put them on a shelf.', style: Theme.of(context).textTheme.bodySmall)
                : Card(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text('${picked.length} ticked', style: const TextStyle(fontWeight: FontWeight.w700)),
                        FilledButton.icon(key: const Key('shelf-put'), onPressed: () => _put(picked, names), icon: const Icon(Icons.shelves), label: const Text('Put on a shelf…')),
                        OutlinedButton(onPressed: () => _save(picked, ''), child: const Text('Take off the shelf')),
                        TextButton(onPressed: () => setState(_picked.clear), child: const Text('Untick all')),
                      ]),
                    ),
                  ),
          ),
        const SizedBox(height: 6),
        Expanded(
          child: rows.isEmpty
              ? const EmptyState('No medicines here')
              : ListView.builder(
                  itemCount: rows.length,
                  itemBuilder: (_, i) {
                    final row = rows[i];
                    if (row is GroupHeading) {
                      final members = list.where((p) => groupOf(p, order == MedicineOrder.name ? MedicineOrder.shelf : order) == row.name).toList();
                      return GroupHeadingTile(
                        heading: row,
                        onToggle: () => setState(() => _folded.contains(row.name) ? _folded.remove(row.name) : _folded.add(row.name)),
                        trailing: !edit
                            ? null
                            : Row(mainAxisSize: MainAxisSize.min, children: [
                                IconButton(tooltip: 'Tick all in ${row.name}', visualDensity: VisualDensity.compact, icon: const Icon(Icons.done_all, size: 18),
                                    onPressed: () => setState(() => _picked.addAll(members.map((p) => p.id)))),
                                if (order != MedicineOrder.shelf && order != MedicineOrder.name)
                                  IconButton(key: Key('shelf-group-${row.name}'), tooltip: 'Put all of ${row.name} on a shelf', visualDensity: VisualDensity.compact,
                                      icon: const Icon(Icons.shelves, size: 18), onPressed: () => _put(members, names, what: row.name)),
                              ]),
                      );
                    }
                    final p = (row as GroupedMedicine).p;
                    final c = drugClassOf(p);
                    final shelf = shelfLabel(p);
                    return CheckboxListTile(
                      key: Key('shelf-med-${p.id}'),
                      value: _picked.contains(p.id),
                      onChanged: edit ? (v) => setState(() => v == true ? _picked.add(p.id) : _picked.remove(p.id)) : null,
                      controlAffinity: ListTileControlAffinity.leading,
                      dense: true,
                      title: Text(p.name),
                      subtitle: Text([p.form, if (c.cls != unclassified) c.cls, c.area].where((x) => x.isNotEmpty).join(' · ')),
                      secondary: shelf.isEmpty ? null : Chip(avatar: const Icon(Icons.shelves, size: 14), label: Text(shelf), visualDensity: VisualDensity.compact),
                    );
                  },
                ),
        ),
      ]),
    );
  }

  /// Ask which shelf (one of [names] or a new one), then put [ps] on it.
  Future<void> _put(List<Product> ps, List<String> names, {String what = ''}) async {
    final ctl = TextEditingController();
    final shelf = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Put ${what.isNotEmpty ? 'all of $what' : '${ps.length} medicine${ps.length == 1 ? '' : 's'}'} on a shelf'),
        content: SizedBox(
          width: 420,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(key: const Key('shelf-name'), controller: ctl, autofocus: true, decoration: const InputDecoration(labelText: 'Shelf', hintText: 'e.g. A1, Fridge, Antibiotics bay'),
                onSubmitted: (v) => Navigator.pop(c, v)),
            if (names.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('Or one already in use:', style: Theme.of(c).textTheme.bodySmall),
              const SizedBox(height: 4),
              Wrap(spacing: 6, runSpacing: 6, children: [for (final n in names) ActionChip(label: Text(n), onPressed: () => Navigator.pop(c, n))]),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, ctl.text), child: const Text('Put on shelf')),
        ],
      ),
    );
    if (shelf == null || shelf.trim().isEmpty) return;
    await _save(ps, shelf, what: what);
  }

  Future<void> _save(List<Product> ps, String shelf, {String what = ''}) async {
    final d = await ref.read(pharmacyProvider.future);
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final n = await assignShelf(ref.read(recordStoreProvider), ps, shelf, what: what, user: user, branchId: d.branch);
    if (!mounted) return;
    setState(_picked.clear);
    say(context, shelf.trim().isEmpty ? '$n taken off their shelf' : '$n put on shelf ${shelf.trim()}');
  }
}
