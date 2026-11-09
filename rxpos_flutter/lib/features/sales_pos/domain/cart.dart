// The sale being rung up, and turning it into a sale record with its stock movements: ported from src/pages/POS.jsx
// (add, choosePack, setCount, totals, checkout / finalize). Pure, so the rules are tested without the screen.
import '../../../core/data/json_fields.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/stock.dart';

const cashDrawer = 'cash-drawer';
const walkIn = 'walk-in';

/// A line sold by the pack: [size] units per pack at [price] per pack.
class LinePack {
  const LinePack({required this.name, required this.size, required this.price});
  final String name;
  final double size, price;
  Map<String, Object?> toJson() => {'name': name, 'size': numOut(size), 'price': numOut(price)};
  factory LinePack.fromJson(Map<String, Object?> j) =>
      LinePack(name: '${j['name']}', size: (j['size'] as num).toDouble(), price: (j['price'] as num).toDouble());
}

/// One line of the sale. [qty] is always in single units; [price] is per unit.
class CartLine {
  const CartLine({
    required this.id,
    required this.name,
    required this.price,
    required this.cost,
    required this.qty,
    required this.max,
    this.pack,
    this.rx = false,
    this.controlled = false,
    this.directions,
    this.allowExpired = false,
    this.expiredReason = '',
  });

  final String id, name;
  final double price, cost, qty, max;
  final LinePack? pack;
  final bool rx, controlled;

  /// dosage directions for the label: dose, freq, days, notes (list), patient (as the React app stores them)
  final Map<String, Object?>? directions;

  /// expired stock may be sold on this line (only with a reason, recorded in the audit log)
  final bool allowExpired;
  final String expiredReason;

  /// One step of the − / + buttons: a whole pack, or one unit.
  double get step => pack?.size ?? 1;
  double get count => qty / step;
  double get total => lineTotal(price: price, qty: qty);

  CartLine copyWith({
    double? price,
    double? qty,
    LinePack? pack,
    bool clearPack = false,
    Map<String, Object?>? directions,
    bool clearDirections = false,
    bool? allowExpired,
    String? expiredReason,
    double? max,
  }) => CartLine(
    id: id,
    name: name,
    price: price ?? this.price,
    cost: cost,
    qty: qty ?? this.qty,
    max: max ?? this.max,
    pack: clearPack ? null : (pack ?? this.pack),
    rx: rx,
    controlled: controlled,
    directions: clearDirections ? null : (directions ?? this.directions),
    allowExpired: allowExpired ?? this.allowExpired,
    expiredReason: expiredReason ?? this.expiredReason,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'price': price,
    'cost': cost,
    'qty': qty,
    'max': max,
    if (pack != null) 'pack': pack!.toJson(),
    'rx': rx,
    'controlled': controlled,
    if (directions != null) 'directions': directions,
    if (allowExpired) 'allowExpired': true,
    if (expiredReason.isNotEmpty) 'expiredReason': expiredReason,
  };
  factory CartLine.fromJson(Map<String, Object?> j) => CartLine(
    id: '${j['id']}',
    name: '${j['name']}',
    price: (j['price'] as num).toDouble(),
    cost: ((j['cost'] as num?) ?? 0).toDouble(),
    qty: (j['qty'] as num).toDouble(),
    max: ((j['max'] as num?) ?? 0).toDouble(),
    pack: j['pack'] is Map ? LinePack.fromJson((j['pack'] as Map).cast<String, Object?>()) : null,
    rx: j['rx'] == true,
    controlled: j['controlled'] == true,
    directions: (j['directions'] as Map?)?.cast<String, Object?>(),
    allowExpired: j['allowExpired'] == true,
    expiredReason: '${j['expiredReason'] ?? ''}',
  );
}

/// All remaining stock of a medicine has expired: it can be sold only with a recorded reason.
class OnlyExpiredLeft implements Exception {
  OnlyExpiredLeft(this.name);
  final String name;
  @override
  String toString() => 'All remaining $name stock has expired.';
}

/// Why something cannot be done (shown to the cashier as it is).
class CartProblem implements Exception {
  CartProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

double priceOf(Product p, {required bool wholesale}) => wholesale && p.wholesale > 0 ? p.wholesale : p.price;

/// Add one of [p] (one more unit or pack if it is already in the sale). Retail starts in units and wholesale in
/// whole packs, as the pharmacy chose (Settings → Receipts & stock), when a whole pack is in stock.
/// [sellable] is the stock that has not expired; past it, [expiredReason] must be given (the pharmacist's reason).
List<CartLine> addToCart(
  List<CartLine> cart,
  Product p, {
  required double stock,
  required bool wholesale,
  required PharmacySettings settings,
  double? sellable,
  String? expiredReason,
}) {
  final i = cart.indexWhere((l) => l.id == p.id);
  final inCart = i >= 0 ? cart[i] : null;
  final allowed = (inCart?.allowExpired ?? false) || (expiredReason ?? '').trim().isNotEmpty;
  if (!allowed && sellable != null && (inCart?.qty ?? 0) >= sellable && stock > (inCart?.qty ?? 0)) throw OnlyExpiredLeft(p.name);
  CartLine mark(CartLine l) => allowed && !l.allowExpired ? l.copyWith(allowExpired: true, expiredReason: expiredReason!.trim()) : l;
  if (i >= 0) {
    final l = cart[i];
    if (l.qty + l.step > stock) throw CartProblem('Only ${formatQty(stock)} ${p.unit.isEmpty ? 'units' : '${p.unit.toLowerCase()}s'} of ${p.name} in stock');
    return [...cart]..[i] = mark(l.copyWith(qty: l.qty + l.step));
  }
  if (stock <= 0) throw CartProblem('${p.name} is out of stock');
  final unit = priceOf(p, wholesale: wholesale);
  final k = sellInPacks(settings, wholesale: wholesale) ? mainPack(p) : null;
  final first = CartLine(id: p.id, name: p.name, price: unit, cost: p.cost, qty: 1, max: stock, rx: p.rx, controlled: p.controlled);
  if (k != null && k.size <= stock) {
    final pp = packPrice(k, unit, wholesale: wholesale);
    return [
      ...cart,
      mark(
        first.copyWith(
          pack: LinePack(name: k.name, size: k.size, price: pp),
          price: pp / k.size,
          qty: k.size,
        ),
      ),
    ];
  }
  return [...cart, mark(first)];
}

/// Set a line to [count] units or packs (kept between 1 and what is in stock).
CartLine setCount(CartLine l, double count) {
  final most = (l.max / l.step).floorToDouble();
  if (count > most) {
    throw CartProblem('Only ${formatQty(most)} ${l.pack != null ? '${l.pack!.name.toLowerCase()}${most == 1 ? '' : 's'}' : 'in stock'} in stock');
  }
  return l.copyWith(qty: (count < 1 ? 1 : count.roundToDouble()) * l.step);
}

/// Sell a line by [pack] (a pack of the medicine) or by single units (null).
CartLine choosePack(CartLine l, Product p, Pack? pack, {required bool wholesale}) {
  final unit = priceOf(p, wholesale: wholesale);
  if (pack == null) return l.copyWith(clearPack: true, price: unit, qty: l.qty < l.max ? l.qty : l.max);
  if (pack.size > l.max) throw CartProblem('Not a whole ${pack.name.toLowerCase()} in stock (${formatQty(l.max)} left)');
  final pp = packPrice(pack, unit, wholesale: wholesale);
  return l.copyWith(
    pack: LinePack(name: pack.name, size: pack.size, price: pp),
    price: pp / pack.size,
    qty: pack.size,
  );
}

/// The sale's figures, each rounded once (src/pages/POS.jsx).
class Totals {
  const Totals({required this.subtotal, required this.discount, required this.tax, required this.total});
  final double subtotal, discount, tax, total;
}

Totals totalsOf(List<CartLine> cart, {required double discount, required PharmacySettings settings}) {
  final d = settings.decimalPlaces;
  final subtotal = cartSubtotal([for (final l in cart) (price: l.price, qty: l.qty, discount: 0)], d);
  final disc = [round(discount, d), subtotal].reduce((a, b) => a < b ? a : b);
  final tax = taxOf(subtotal - disc, settings.taxRate, decimals: d);
  return Totals(subtotal: subtotal, discount: disc, tax: tax, total: round(subtotal - disc + tax, d));
}

/// The controlled-drugs register entry for a sale (patient, prescriber and prescription).
class ControlledEntry {
  const ControlledEntry({required this.patient, this.idNo = '', required this.prescriber, this.prescriberReg = '', this.rxNo = ''});
  final String patient, idNo, prescriber, prescriberReg, rxNo;
  Map<String, Object?> toJson() => {'patient': patient, 'idNo': idNo, 'prescriber': prescriber, 'prescriberReg': prescriberReg, 'rxNo': rxNo};
}

/// Everything about how the sale is paid and who it is for.
class Checkout {
  const Checkout({
    required this.method,
    this.tendered,
    this.customerId = walkIn,
    this.customerName = 'Walk-in Customer',
    this.discount = 0,
    this.controlled,
    this.momoRef,
    this.momo,
    this.rxChecked = false,
  });
  final PaymentMethod method;
  final double? tendered;
  final String customerId, customerName;
  final double discount;
  final ControlledEntry? controlled;

  /// typed by staff from the customer's message (recorded as "manual")
  final String? momoRef;

  /// confirmed by the network after a payment request to the customer's phone: provider, phone, ref, txid
  final Map<String, Object?>? momo;
  final bool rxChecked;
}

/// Check the sale can be completed; throws [CartProblem] with what to fix (src/pages/POS.jsx checkout()).
void checkCheckout(List<CartLine> cart, Checkout c, Totals t, {required PharmacySettings settings}) {
  if (cart.isEmpty) throw CartProblem('The sale is empty');
  final type = c.method.type;
  if (type == 'credit' && c.customerId == walkIn) throw CartProblem('Select a registered customer for a credit sale');
  if (settings.clientCapture == 'required' && c.customerId == walkIn) throw CartProblem('Choose or add the client for this sale');
  if (type == 'cash' && c.tendered != null && c.tendered! < t.total) throw CartProblem('Amount tendered is less than the total');
  if (cart.any((l) => l.controlled) && c.controlled == null) throw CartProblem('Fill in the controlled-drugs register for this sale');
  if (cart.any((l) => l.rx) && !cart.any((l) => l.controlled) && !c.rxChecked) throw CartProblem('Confirm that a valid prescription was checked');
  if (type == 'momo' && c.momo == null && (c.momoRef ?? '').trim().isEmpty) {
    throw CartProblem('Type the Mobile Money transaction ID from the customer\'s message');
  }
}

/// Save the sale: the sale record, a stock movement per batch taken (first expiry first out) and an audit line for a
/// discount, in ONE transaction (records written exactly as the React app writes them).
Future<Map<String, Object?>> completeSale(
  RecordStore store, {
  required List<CartLine> cart,
  required Checkout c,
  required PharmacySettings settings,
  required StockView stock,
  required bool wholesale,
  required String cashier,
  String branchId = mainBranch,
  DateTime? now,
  void Function(Edit d, Map<String, Object?> sale)? also,
  String? proformaId,
}) async {
  final t = totalsOf(cart, discount: c.discount, settings: settings);
  checkCheckout(cart, c, t, settings: settings);
  // The stock may have changed since a line was added (another device's sale arrived by sync, a held sale resumed
  // later): a sale can't go beyond the stock this device knows of. Checked per medicine, before anything is saved.
  final want = <String, double>{};
  for (final l in cart) {
    want[l.id] = (want[l.id] ?? 0) + l.qty;
  }
  for (final e in want.entries) {
    final l = cart.firstWhere((x) => x.id == e.key);
    final have = sellable(stock.batchesOf(e.key, atBranch: branchId), allowExpired: cart.any((x) => x.id == e.key && x.allowExpired), now: now);
    if (e.value > have + stockTolerance) throw CartProblem('Only ${formatQty(have)} ${l.name} in stock here: lower the quantity or remove it.');
  }
  final type = c.method.type;
  final credit = type == 'credit';
  final paid = credit ? [c.tendered ?? 0, t.total].reduce((a, b) => a < b ? a : b) : t.total;
  return store.update((d) {
    final number = docNumber('R', now: now);
    final items = [
      for (final l in cart)
        {
          'id': l.id,
          'name': l.name,
          'price': numOut(l.price),
          'cost': numOut(l.cost),
          'qty': numOut(l.qty),
          if (l.controlled) 'controlled': true,
          if (l.directions != null) 'directions': l.directions,
          if (l.pack != null)
            'pack': {'name': l.pack!.name, 'size': numOut(l.pack!.size), 'count': numOut(l.qty / l.pack!.size), 'price': numOut(l.price * l.pack!.size)},
          'alloc': [
            for (final a in allocate(
              stock.batchesOf(l.id, atBranch: branchId),
              l.qty,
              allowExpired: l.allowExpired,
              now: now,
            ))
              {'batchId': a.batchId, 'qty': numOut(a.qty), 'batch': a.batch, 'expiry': a.expiry},
          ],
        },
    ];
    final sale = d.put('sales', {
      'id': uid(),
      'number': number,
      'date': d.now,
      'type': wholesale ? 'wholesale' : 'retail',
      'branchId': branchId,
      'items': items,
      'subtotal': numOut(t.subtotal),
      'discount': numOut(t.discount),
      'tax': numOut(t.tax),
      'total': numOut(t.total),
      'payment': c.method.name,
      'paid': numOut(paid),
      'tendered': numOut(type == 'cash' ? (c.tendered ?? t.total) : paid),
      'bankId': type == 'cash' || credit ? cashDrawer : ((settings.raw['nonCashBankId'] as String?) ?? cashDrawer),
      'customerId': c.customerId,
      'customerName': c.customerName,
      'cashier': cashier,
      'status': 'completed',
      if (c.controlled != null) 'controlled': c.controlled!.toJson(),
      if (type == 'momo')
        'momo': c.momo != null ? (c.momo!['manual'] == true ? c.momo! : {...c.momo!, 'confirmed': true}) : {'txid': c.momoRef!.trim(), 'manual': true},
      if (cart.any((l) => l.allowExpired)) 'expiredOverride': true,
      // the cloud does not flag a proforma's discount and prices: they were set by whoever made the quotation
      'proformaId': ?proformaId,
    });
    for (final i in items) {
      for (final a in (i['alloc'] as List).cast<Map<String, Object?>>()) {
        d.move(
          productId: i['id'] as String,
          qty: -(a['qty'] as num).toDouble(),
          type: 'Sale',
          ref: number,
          user: cashier,
          batchId: a['batchId'] as String?,
          branchId: branchId,
        );
      }
    }
    also?.call(d, sale);
    final expired = cart.where((l) => l.allowExpired).toList();
    if (expired.isNotEmpty) {
      d.audit(
        cashier,
        'Expired stock sold',
        '$number: ${expired.map((l) => '${l.name} (${l.expiredReason.isEmpty ? 'no reason given' : l.expiredReason})').join('; ')}',
        branchId,
      );
    }
    if (t.discount > 0) {
      d.audit(cashier, 'Discount given', '$number: ${formatMoney(t.discount, currency: settings.currency, decimals: settings.decimalPlaces)}', branchId);
    }
    return sale;
  });
}

/// Pack helpers used by the screen.
List<Pack> sellablePacks(Product p) => packsOf(p);
