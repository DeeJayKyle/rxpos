// Correcting a past sale (src/pages/Sales.jsx SaleEditor): lines, quantities, prices, client, payment, discount, with a
// reason. Extra units are taken first-expiry-first-out; units given back return to the batches they came from (last
// first); removed lines go back entirely. The sale keeps every change ("edits": who, when, why, before and after) and
// the audit log says so. A sale copied from another system is corrected as a record only: stock is not touched.
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';

class SaleEditProblem implements Exception {
  SaleEditProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

/// A line of the sale being corrected.
class EditLine {
  const EditLine({required this.id, required this.name, required this.price, required this.qty, this.cost = 0, this.original});
  final String id, name;
  final double price, qty, cost;
  /// the line as it was sold (null for a line added now)
  final SaleItem? original;
  EditLine copyWith({double? price, double? qty}) => EditLine(id: id, name: name, price: price ?? this.price, qty: qty ?? this.qty, cost: cost, original: original);
}

/// What a sale looked like, for the edit history (the React app's saleSnapshot).
Map<String, Object?> saleSnapshot({required double total, required String payment, required double discount, required String customer, required List<SaleItem> items}) => {
  'total': total, 'payment': payment, 'discount': discount, 'customer': customer,
  'items': items.map((i) => '${formatQty(i.qty)}× ${i.name} @ ${formatQty(i.price)}').join(', '),
};

Map<String, Object?> snapshotOf(Sale s) => saleSnapshot(total: s.total, payment: s.payment, discount: s.discount, customer: s.customerName, items: s.items);

/// Save the corrected sale. [methodType] is the payment method's type (cash, credit, …); [paid] counts only on credit.
Future<Map<String, Object?>> editSale(RecordStore store, Sale sale, {required List<EditLine> lines, required String customerId,
    required String customerName, required String payment, required String methodType, required double discount, double? paid,
    required String reason, required String user, String role = '', required StockView stock, required PharmacySettings settings, DateTime? now}) async {
  if (!lines.any((l) => l.qty > 0)) throw SaleEditProblem('A sale needs at least one item. To cancel the whole sale, refund it.');
  if (reason.trim().isEmpty) throw SaleEditProblem('Say why the sale is being changed');
  if (sale.status == 'refunded') throw SaleEditProblem('${sale.number} was refunded and cannot be changed');
  final br = sale.branchId.isEmpty ? mainBranch : sale.branchId;
  final recordOnly = '${sale.raw['imported'] ?? ''}'.isNotEmpty;
  if (!recordOnly) {
    for (final l in lines) {
      final extra = l.qty.roundToDouble() - (l.original?.qty ?? 0);
      final have = stock.batchesOf(l.id, atBranch: br).fold<double>(0, (a, b) => a + (b.qty > 0 ? b.qty : 0));
      if (extra > have) throw SaleEditProblem('Only ${formatQty(have)} more ${l.name} in stock');
    }
  }
  final base = sale.subtotal - sale.discount;
  final rate = sale.tax > 0 && base > 0 ? sale.tax / base : 0.0;
  final subtotal = lines.fold<double>(0, (a, l) => a + l.qty.roundToDouble() * l.price);
  final disc = discount.clamp(0, subtotal).toDouble();
  final tax = (subtotal - disc) * rate;
  final total = subtotal - disc + tax;
  return store.update((d) {
    final old = {for (final i in sale.items) i.id: i};
    final items = <SaleItem>[];
    for (final l in lines) {
      final o = old[l.id];
      final q0 = o?.qty ?? 0, q1 = l.qty < 0 ? 0.0 : l.qty.roundToDouble();
      var alloc = [...?o?.alloc];
      if (recordOnly) {
        // history only
      } else if (q1 > q0) {
        final List<Allocation> taken;
        try {
          taken = allocate(stock.batchesOf(l.id, atBranch: br), q1 - q0, now: now);
        } on NotEnoughStock catch (e) {
          throw SaleEditProblem('${l.name}: $e'); // e.g. the only stock left has expired
        }
        for (final a in taken) {
          d.move(productId: l.id, qty: -a.qty, type: 'Sale edit', ref: sale.number, user: user, batchId: a.batchId, branchId: br);
          final same = alloc.indexWhere((x) => x.batchId == a.batchId);
          if (same >= 0) {
            alloc[same] = alloc[same].copyWith(qty: alloc[same].qty + a.qty);
          } else {
            alloc.add(Allocation(batchId: a.batchId, qty: a.qty, batch: a.batch, expiry: a.expiry));
          }
        }
      } else if (q1 < q0) {
        var back = q0 - q1;
        if (alloc.isEmpty) {
          d.move(productId: l.id, qty: back, type: 'Sale edit', ref: sale.number, user: user, branchId: br);
          back = 0;
        }
        for (var k = alloc.length - 1; k >= 0 && back > 0; k--) {
          final take = alloc[k].qty < back ? alloc[k].qty : back;
          d.move(productId: l.id, qty: take, type: 'Sale edit', ref: sale.number, user: user, batchId: alloc[k].batchId, branchId: br);
          alloc[k] = alloc[k].copyWith(qty: alloc[k].qty - take);
          back -= take;
        }
        alloc = alloc.where((a) => a.qty > 0).toList();
      }
      if (q1 > 0) {
        final pack = o?.pack;
        items.add((o ?? SaleItem(id: l.id, name: l.name, cost: l.cost)).copyWith(
            qty: q1, price: l.price, alloc: alloc,
            pack: pack == null ? null : pack.copyWith(count: q1 / pack.size, price: double.parse((l.price * pack.size).toStringAsFixed(settings.decimalPlaces)))));
      }
      old.remove(l.id);
    }
    if (!recordOnly) {
      for (final o in old.values) {
        final parts = o.alloc.isNotEmpty ? [for (final a in o.alloc) (a.batchId, a.qty)] : [(null, o.qty)];
        for (final (batchId, qty) in parts) {
          d.move(productId: o.id, qty: qty, type: 'Sale edit', ref: sale.number, user: user, batchId: batchId, branchId: br);
        }
      }
    }
    final paidNow = methodType == 'credit' ? ((paid ?? 0).clamp(0, total)).toDouble() : total;
    final tendered = methodType == 'cash' ? (sale.tendered > total ? sale.tendered : total) : paidNow;
    final edits = [...((sale.raw['edits'] as List?) ?? const [])];
    edits.add({
      'at': d.now, 'by': user, 'role': role, 'reason': reason.trim(), 'recordOnly': recordOnly, 'before': snapshotOf(sale),
      'after': saleSnapshot(total: total, payment: payment, discount: disc, customer: customerName, items: items),
    });
    final rec = {
      ...sale.toRecord(),
      'items': [for (final i in items) i.toJson()], 'subtotal': subtotal, 'discount': disc, 'tax': tax, 'total': total, 'payment': payment,
      'paid': paidNow, 'tendered': tendered, 'customerId': customerId, 'customerName': customerName, 'editedBy': user, 'editedAt': d.now, 'edits': edits,
    };
    d.put('sales', rec);
    d.audit(user, 'Sale edited', '${sale.number}: ${settings.money(sale.total)} → ${settings.money(total)} (${reason.trim()})', br);
    return rec;
  });
}

/// One change in a sale's history, newest first (older records without before/after are filled from the next change).
class SaleChange {
  const SaleChange({required this.by, required this.role, required this.at, required this.reason, required this.recordOnly, this.before, this.after});
  final String by, role, at, reason;
  final bool recordOnly;
  final Map<String, Object?>? before, after;
  bool changed(String k) => before != null && after != null && before![k] != null && after![k] != null && '${before![k]}' != '${after![k]}';
}

List<SaleChange> editHistory(Sale sale) {
  final edits = [for (final e in (sale.raw['edits'] as List?) ?? const []) (e as Map).cast<String, Object?>()];
  final out = <SaleChange>[];
  for (var n = 0; n < edits.length; n++) {
    final x = edits[n];
    Map<String, Object?>? m(Object? v) => v is Map ? v.cast<String, Object?>() : null;
    final before = m(x['before']) ?? (x['oldTotal'] != null ? {'total': x['oldTotal']} : null);
    final after = m(x['after']) ?? (n + 1 < edits.length ? m(edits[n + 1]['before']) : null) ?? (x['newTotal'] != null ? {'total': x['newTotal']} : n == edits.length - 1 ? snapshotOf(sale) : null);
    out.add(SaleChange(by: '${x['by'] ?? 'Unknown'}', role: '${x['role'] ?? ''}', at: '${x['at'] ?? ''}', reason: '${x['reason'] ?? ''}',
        recordOnly: x['recordOnly'] == true, before: before, after: after));
  }
  return out.reversed.toList();
}

/// Every sold line (refunded sales left out) with its share of the sale's discount, its cost and profit (Reports →
/// Sales lines, src/pages/SalesLines.jsx saleLines).
class SoldLine {
  const SoldLine({required this.saleId, required this.number, required this.date, required this.customer, required this.cashier, required this.payment,
      required this.type, required this.name, required this.generic, required this.productId, required this.qty, required this.amount, required this.cost});
  final String saleId, number, date, customer, cashier, payment, type, name, generic, productId;
  final double qty, amount, cost;
  double get profit => amount - cost;
}

List<SoldLine> saleLines(Iterable<Sale> sales, Map<String, String> genericOf) => [
      for (final s in sales)
        if (s.status != 'refunded')
          for (final i in s.items)
            () {
              final gross = s.items.fold<double>(0, (a, x) => a + x.qty * x.price);
              final keep = gross > 0 ? (1 - s.discount / gross).clamp(0, 1).toDouble() : 1.0;
              return SoldLine(saleId: s.id, number: s.number, date: s.date, customer: s.customerName.isEmpty ? 'Walk-in' : s.customerName, cashier: s.cashier,
                  payment: s.payment, type: s.type.isEmpty ? 'retail' : s.type, name: i.name, generic: genericOf[i.id] ?? '', productId: i.id, qty: i.qty,
                  amount: i.qty * i.price * keep, cost: i.qty * i.cost);
            }(),
    ];
