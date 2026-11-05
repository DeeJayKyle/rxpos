// Receiving a delivery (Add Stock), ported from src/pages/Purchases.jsx save(): checks, new medicines, batches, stock
// movements, new costs and prices, the delivery record and the audit line, all in ONE transaction.
import 'dart:math';

import '../../../core/data/json_fields.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/pricing.dart';
import '../../../core/rules/stock.dart';

/// One line of a delivery as typed. [qty] is in what was received ([recvSize] units each: a box of 100, or 1);
/// [unitCost] is per received unit or pack; [price] is the new retail price per single unit (0: keep the current one).
class DeliveryLine {
  const DeliveryLine({this.productId, this.newName = '', this.qty = 0, this.recvPack = '', this.recvSize = 1, this.unitCost = 0,
      this.price = 0, this.batch = '', this.expiry = '', this.form = 'Others'});

  /// null: a medicine not in the list yet, named [newName]
  final String? productId;
  final String newName, recvPack, batch, expiry, form;
  final double qty, recvSize, unitCost, price;

  bool get isNew => productId == null;
  /// cost of one single unit (a box's cost divided by the units in it)
  double get baseCost => unitCost / (recvSize > 0 ? recvSize : 1);
  double get units => qty * (recvSize > 0 ? recvSize : 1);
  double get total => qty * unitCost;

  DeliveryLine copyWith({String? productId, String? newName, double? qty, String? recvPack, double? recvSize, double? unitCost,
          double? price, String? batch, String? expiry}) =>
      DeliveryLine(productId: productId ?? this.productId, newName: newName ?? this.newName, qty: qty ?? this.qty,
          recvPack: recvPack ?? this.recvPack, recvSize: recvSize ?? this.recvSize, unitCost: unitCost ?? this.unitCost,
          price: price ?? this.price, batch: batch ?? this.batch, expiry: expiry ?? this.expiry, form: form);
}

class DeliveryProblem implements Exception {
  DeliveryProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

double deliveryTotal(List<DeliveryLine> lines) => lines.fold(0.0, (a, l) => a + l.total);

String _clean(String s) => s.trim().replaceAll(RegExp(r'\s+'), ' ');

/// Receive the delivery. Returns the delivery record. Throws [DeliveryProblem] with what to fix (nothing is saved).
Future<Map<String, Object?>> receiveDelivery(RecordStore store, {required List<DeliveryLine> lines, required Map<String, Product> products,
    required PharmacySettings settings, required String receivedBy, String supplierId = '', String supplierName = '',
    String invoice = '', String notes = '', String? date, double? paid, String bankId = 'cash-drawer', String branchId = mainBranch, DateTime? now}) async {
  final use = lines.where((l) => (l.productId != null || l.newName.trim().isNotEmpty) && l.qty > 0).toList();
  if (use.isEmpty) throw DeliveryProblem('Add at least one medicine');
  if (lines.any((l) => (l.productId != null || l.newName.trim().isNotEmpty) && !(l.qty > 0))) {
    throw DeliveryProblem('Every line needs a quantity above 0 (or remove the line)');
  }
  final freshIds = <String, String>{};
  for (final l in use.where((x) => x.isNew)) {
    final name = _clean(l.newName);
    if (name.length < 2) throw DeliveryProblem('Type the name of the new medicine');
    final dup = products.values.where((p) => p.name.trim().toLowerCase() == name.toLowerCase()).firstOrNull;
    if (dup != null) throw DeliveryProblem('"${dup.name}" is already in your medicine list. Choose it from the list instead of adding it again.');
    if (!(l.price > 0)) throw DeliveryProblem('Enter a retail price for $name');
    freshIds.putIfAbsent(name.toLowerCase(), uid);
  }
  String nameOf(DeliveryLine l) => l.isNew ? _clean(l.newName) : (products[l.productId]?.name ?? '');
  String idOf(DeliveryLine l) => l.isNew ? freshIds[_clean(l.newName).toLowerCase()]! : l.productId!;
  for (final l in use) {
    if (l.expiry.isEmpty) throw DeliveryProblem('Enter the expiry date for ${nameOf(l)} (needed for first-expiry-first-out)');
    if (daysUntil(l.expiry, now: now) < 0) throw DeliveryProblem('${nameOf(l)}: the expiry date ${l.expiry} has already passed. Check the date on the pack.');
  }
  final total = round(deliveryTotal(use), settings.decimalPlaces);
  final paidNow = paid == null ? total : max(0.0, min(paid, total));
  final number = 'GRN${(now ?? DateTime.now()).millisecondsSinceEpoch.toRadixString(36).toUpperCase().substring(2)}';
  return store.update((d) async {
    final purchase = <String, Object?>{
      'id': uid(), 'number': number, 'supplierId': supplierId, 'supplierName': supplierName.isEmpty ? '—' : supplierName,
      'invoice': invoice.trim(), 'notes': notes.trim(), 'date': date ?? today(now), 'receivedBy': receivedBy,
      'total': numOut(total), 'paid': numOut(paidNow), 'bankId': bankId, 'branchId': branchId,
      'items': [
        for (final l in use)
          {
            'productId': idOf(l), 'name': nameOf(l), 'qty': numOut(l.units), 'cost': numOut(l.baseCost), 'batch': l.batch.trim(), 'expiry': l.expiry,
            if (l.isNew) 'added': true,
            if (l.recvSize > 1) 'pack': {'name': l.recvPack, 'size': numOut(l.recvSize), 'count': numOut(l.qty), 'cost': numOut(l.unitCost)},
          },
      ],
    };
    final used = {for (final p in products.values) if (p.barcode.isNotEmpty) p.barcode};
    final created = <String>{};
    for (final l in use.where((x) => x.isNew)) {
      final id = idOf(l);
      if (!created.add(id)) continue;
      final rnd = Random.secure();
      String code;
      do {
        code = '20${rnd.nextInt(1 << 30).toString().padLeft(10, '0').substring(0, 10)}';
      } while (used.contains(code));
      used.add(code);
      d.put('products', {'id': id, 'name': nameOf(l), 'generic': '', 'form': l.form, 'unit': 'Unit', 'price': numOut(l.price),
        'wholesale': numOut(markupPrice(l.baseCost, settings.wholesaleMarkup, settings.priceRound) > 0 ? markupPrice(l.baseCost, settings.wholesaleMarkup, settings.priceRound) : l.price),
        'cost': numOut(l.baseCost), 'reorder': 0, 'barcode': code});
      d.audit(receivedBy, 'Medicine added', '${nameOf(l)} (on receiving $number)', branchId);
    }
    final items = (purchase['items'] as List).cast<Map<String, Object?>>();
    for (var n = 0; n < use.length; n++) {
      final l = use[n];
      final id = idOf(l);
      final b = await d.addBatch(productId: id, batch: l.batch, expiry: l.expiry, cost: l.baseCost);
      items[n]['batchId'] = b['id'];
      d.move(productId: id, qty: l.units, type: 'Purchase', ref: invoice.trim().isEmpty ? number : invoice.trim(), user: receivedBy, batchId: b['id'] as String, branchId: branchId);
      final p = products[id];
      if (p == null) continue; // a new medicine: created above with this cost and price
      final price = l.price > 0 ? l.price : p.price;
      if (l.baseCost != p.cost || price != p.price) {
        d.put('products', p.copyWith(cost: l.baseCost != 0 ? l.baseCost : p.cost, price: price).toRecord());
        if (price != p.price) {
          d.audit(receivedBy, 'Price changed', '${p.name}: ${formatMoney(p.price, currency: settings.currency)} → ${formatMoney(price, currency: settings.currency)} (on receiving)', branchId);
        }
      }
    }
    final rec = d.put('purchases', purchase);
    d.audit(receivedBy, 'Stock received',
        '$number from ${purchase['supplierName']}: ${use.length} lines, ${formatMoney(total, currency: settings.currency, decimals: settings.decimalPlaces)}${created.isNotEmpty ? ', ${created.length} new medicine${created.length > 1 ? 's' : ''}' : ''}',
        branchId);
    return rec;
  });
}
