// What clients owe and what the pharmacy owes suppliers (src/store.jsx customerBalance / supplierBalance), and
// recording a payment (src/pages/Finance.jsx PaymentModal).
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/rules/ids.dart';

double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

/// Credit sales not yet paid, less payments received.
double customerBalance(String id, Iterable<Sale> sales, Iterable<Map<String, Object?>> payments) {
  final credit = sales.where((s) => s.customerId == id && s.status != 'refunded').fold(0.0, (a, s) => a + s.balance); // an insurer's share is not the client's debt (step 22)
  final paid = payments.where((p) => p['kind'] == 'customer' && p['partyId'] == id).fold(0.0, (a, p) => a + _num(p['amount']));
  return credit - paid;
}

/// Purchases not yet paid, less later payments and credit notes for returns.
double supplierBalance(String id, Iterable<Purchase> purchases, Iterable<Map<String, Object?>> payments, Iterable<Map<String, Object?>> returns) {
  final owed = purchases.where((p) => p.supplierId == id).fold(0.0, (a, p) => a + (p.total - p.paid));
  final paid = payments.where((p) => p['kind'] == 'supplier' && p['partyId'] == id).fold(0.0, (a, p) => a + _num(p['amount']));
  final credits = returns.where((r) => r['supplierId'] == id && r['settle'] == 'credit').fold(0.0, (a, r) => a + _num(r['total']));
  return owed - paid - credits;
}

/// A payment from a client (kind 'customer') or to a supplier (kind 'supplier').
Future<Map<String, Object?>> recordPayment(RecordStore store, {required String kind, required String partyId, required double amount,
    required String date, String method = 'Cash', String bankId = 'cash-drawer', String note = '', required String by}) {
  if (!(amount > 0)) throw ArgumentError('The amount must be above 0');
  return store.update((d) => d.put('payments', {'id': uid(), 'date': date, 'amount': amount == amount.roundToDouble() ? amount.toInt() : amount,
    'method': method, 'bankId': bankId, if (note.isNotEmpty) 'note': note, 'kind': kind, 'partyId': partyId, 'by': by}));
}
