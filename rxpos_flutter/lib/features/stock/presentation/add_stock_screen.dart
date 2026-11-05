import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../domain/delivery.dart';

/// Add Stock: receive a delivery like a supplier's invoice. Each line is received in the medicine's largest pack when
/// the pharmacy receives in packs (Settings → Receipts & stock), and can be switched to single units.
class AddStockScreen extends ConsumerStatefulWidget {
  const AddStockScreen({super.key});

  @override
  ConsumerState<AddStockScreen> createState() => _AddStockScreenState();
}

class _AddStockScreenState extends ConsumerState<AddStockScreen> {
  var _lines = <DeliveryLine>[];
  String? _supplierId;
  final _invoice = TextEditingController(), _notes = TextEditingController(), _paid = TextEditingController();
  String _date = today();
  bool _busy = false;

  void _say(String m, {bool error = false}) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m), backgroundColor: error ? Theme.of(context).colorScheme.error : null));

  DeliveryLine _lineFor(Product p, PharmacyData d) {
    final k = receiveInPacks(d.settings) ? mainPack(p) : null;
    return DeliveryLine(productId: p.id, qty: 1, recvPack: k?.name ?? '', recvSize: k?.size ?? 1, unitCost: p.cost * (k?.size ?? 1));
  }

  Future<void> _pick(PharmacyData d, [int? replace]) async {
    final picked = await showDialog<Object>(context: context, builder: (_) => _MedicinePicker(data: d));
    if (picked == null) return;
    final line = picked is Product ? _lineFor(picked, d) : DeliveryLine(newName: '$picked', qty: 1);
    setState(() => replace == null ? _lines = [..._lines, line] : _lines[replace] = line);
  }

  Future<void> _receive(PharmacyData d) async {
    final session = await ref.read(sessionControllerProvider.future);
    final supplier = d.suppliers.where((s) => s.id == _supplierId).firstOrNull;
    setState(() => _busy = true);
    try {
      final rec = await receiveDelivery(ref.read(recordStoreProvider), lines: _lines, products: d.byId, settings: d.settings,
          receivedBy: session?.userName ?? '', supplierId: supplier?.id ?? '', supplierName: supplier?.name ?? '',
          invoice: _invoice.text, notes: _notes.text, date: _date, branchId: d.branch, paid: _paid.text.trim().isEmpty ? null : double.tryParse(_paid.text.replaceAll(',', '')));
      if (!mounted) return;
      _say('Received ${_lines.length} item${_lines.length == 1 ? '' : 's'} (${rec['number']})');
      setState(() {
        _lines = [];
        _invoice.clear();
        _notes.clear();
        _paid.clear();
      });
    } on DeliveryProblem catch (e) {
      _say(e.message, error: true);
    } catch (e) {
      _say('The delivery was NOT received: $e Nothing was added to stock; the lines are still here to try again.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider);
    final th = Theme.of(context);
    return data.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('$e')),
      data: (d) {
        final st = d.settings;
        String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
        final total = deliveryTotal(_lines);
        return ListView(padding: const EdgeInsets.all(16), children: [
          Text('Add Stock', style: th.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Wrap(spacing: 16, runSpacing: 12, children: [
                SizedBox(width: 280, child: DropdownButtonFormField<String>(
                  initialValue: _supplierId, decoration: const InputDecoration(labelText: 'Supplier'),
                  items: [for (final s in d.suppliers) DropdownMenuItem(value: s.id, child: Text(s.name))],
                  onChanged: (v) => setState(() => _supplierId = v),
                )),
                SizedBox(width: 200, child: TextField(controller: _invoice, decoration: const InputDecoration(labelText: 'Invoice no.'))),
                SizedBox(width: 170, child: TextFormField(
                  initialValue: _date, decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)'),
                  onChanged: (v) => _date = v.trim(),
                )),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(children: [
              for (var i = 0; i < _lines.length; i++) _LineEditor(
                key: ObjectKey(_lines[i].productId ?? 'new-$i'),
                line: _lines[i], data: d, number: i + 1,
                onChanged: (l) => setState(() => _lines[i] = l),
                onRemove: () => setState(() => _lines.removeAt(i)),
                onRepick: () => _pick(d, i),
              ),
              ListTile(leading: const Icon(Icons.add), title: const Text('Add a medicine'), onTap: () => _pick(d)),
            ]),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Wrap(spacing: 16, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
                SizedBox(width: 320, child: TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Remarks (optional)'))),
                SizedBox(width: 200, child: TextField(controller: _paid, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Amount paid now', hintText: fmt(total)))),
                Text('Total ${fmt(total)}', style: th.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                FilledButton.icon(
                  onPressed: _busy || _lines.isEmpty ? null : () => _receive(d),
                  icon: const Icon(Icons.inventory_2_outlined),
                  label: Text(_busy ? 'Receiving…' : 'Receive stock'),
                ),
              ]),
            ),
          ),
        ]);
      },
    );
  }
}

class _LineEditor extends StatelessWidget {
  const _LineEditor({super.key, required this.line, required this.data, required this.number, required this.onChanged, required this.onRemove, required this.onRepick});
  final DeliveryLine line;
  final PharmacyData data;
  final int number;
  final ValueChanged<DeliveryLine> onChanged;
  final VoidCallback onRemove, onRepick;

  @override
  Widget build(BuildContext context) {
    final p = line.productId == null ? null : data.byId[line.productId];
    final packs = p == null ? const <Pack>[] : packsOf(p);
    final unit = (p?.unit.isNotEmpty ?? false) ? p!.unit : 'Unit';
    double num0(String v) => double.tryParse(v.replaceAll(',', '')) ?? 0;
    Widget field(String label, String initial, ValueChanged<String> f, {double w = 110, bool number = true}) => SizedBox(
          width: w,
          child: TextFormField(initialValue: initial, decoration: InputDecoration(labelText: label, isDense: true),
              keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text, onChanged: f),
        );
    String n(double v) => v == 0 ? '' : (v == v.roundToDouble() ? '${v.toInt()}' : '$v');
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      child: Wrap(spacing: 10, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text('$number', style: const TextStyle(fontWeight: FontWeight.w700)),
        SizedBox(
          width: 240,
          child: InkWell(
            onTap: onRepick,
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Medicine', isDense: true),
              child: Text(p?.name ?? (line.newName.isEmpty ? 'Choose…' : 'New: ${line.newName}'), overflow: TextOverflow.ellipsis),
            ),
          ),
        ),
        field('Qty', n(line.qty), (v) => onChanged(line.copyWith(qty: num0(v))), w: 80),
        if (packs.isNotEmpty)
          DropdownButton<String>(
            value: line.recvSize > 1 ? line.recvPack : '',
            items: [DropdownMenuItem(value: '', child: Text('${unit}s')), for (final k in packs) DropdownMenuItem(value: k.name, child: Text('${k.name}s of ${formatQty(k.size)}'))],
            onChanged: (v) {
              final k = packs.where((x) => x.name == v).firstOrNull;
              final size = k?.size ?? 1;
              onChanged(line.copyWith(recvPack: k?.name ?? '', recvSize: size, unitCost: line.baseCost * size)); // same cost per unit
            },
          ),
        field(line.recvSize > 1 ? 'Cost per ${line.recvPack.toLowerCase()}' : 'Unit cost', n(line.unitCost), (v) => onChanged(line.copyWith(unitCost: num0(v))), w: 130),
        field('Retail price / ${unit.toLowerCase()}', n(line.price == 0 ? (p?.price ?? 0) : line.price), (v) => onChanged(line.copyWith(price: num0(v))), w: 140),
        field('Batch', line.batch, (v) => onChanged(line.copyWith(batch: v)), w: 110, number: false),
        field('Expiry (YYYY-MM-DD)', line.expiry, (v) => onChanged(line.copyWith(expiry: v.trim())), w: 150, number: false),
        if (line.recvSize > 1) Text('= ${formatQty(line.units)} ${unit.toLowerCase()}s', style: Theme.of(context).textTheme.bodySmall),
        IconButton(onPressed: onRemove, icon: const Icon(Icons.close), tooltip: 'Remove line'),
      ]),
    );
  }
}

/// Choose a medicine by typing (in-stock first), or add a new one by name.
class _MedicinePicker extends StatefulWidget {
  const _MedicinePicker({required this.data});
  final PharmacyData data;
  @override
  State<_MedicinePicker> createState() => _MedicinePickerState();
}

class _MedicinePickerState extends State<_MedicinePicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final found = searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(50).toList();
    return AlertDialog(
      title: TextField(autofocus: true, decoration: const InputDecoration(hintText: 'Search medicine…', prefixIcon: Icon(Icons.search)), onChanged: (v) => setState(() => _q = v)),
      content: SizedBox(
        width: 480, height: 420,
        child: ListView(children: [
          for (final p in found)
            ListTile(title: Text(p.name), subtitle: Text(p.generic), trailing: Text(d.stockOf(p.id) > 0 ? '${formatQty(d.stockOf(p.id))} in stock' : 'none in stock'),
                onTap: () => Navigator.pop(context, p)),
          if (_q.trim().length >= 2)
            ListTile(leading: const Icon(Icons.add), title: Text('New medicine: "${_q.trim()}"'), onTap: () => Navigator.pop(context, _q.trim())),
        ]),
      ),
    );
  }
}
