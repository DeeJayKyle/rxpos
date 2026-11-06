// Proformas (quotations), as the React till saves them: the lines and totals of a sale that was not charged.
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/ids.dart';
import '../../sales_pos/domain/cart.dart';

Future<Map<String, Object?>> saveProforma(RecordStore store, {required List<CartLine> cart, required double discount, required PharmacySettings settings,
    required bool wholesale, required String customerId, required String customerName, required String by}) {
  if (cart.isEmpty) throw CartProblem('The sale is empty');
  final t = totalsOf(cart, discount: discount, settings: settings);
  return store.update((d) => d.put('proformas', {
        'id': uid(), 'number': docNumber('PF'), 'date': d.now, 'type': wholesale ? 'wholesale' : 'retail', 'status': 'Open',
        'items': [for (final l in cart) {'id': l.id, 'name': l.name, 'price': l.price, 'cost': l.cost, 'qty': l.qty}],
        'subtotal': t.subtotal, 'discount': t.discount, 'tax': t.tax, 'total': t.total, 'customerId': customerId, 'customerName': customerName, 'createdBy': by,
      }));
}
