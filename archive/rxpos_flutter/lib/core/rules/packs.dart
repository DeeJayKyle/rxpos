// Packs (strip, box, bottle…), ported from src/packs.js. Stock is always counted in the medicine's smallest unit.
import '../entities/product.dart';
import '../entities/settings.dart';

/// A medicine's real packs (named, more than one unit).
List<Pack> packsOf(Product p) => p.packs.where((k) => k.name.isNotEmpty && k.size > 1).toList();

/// "The pack": the medicine's largest pack (a box of 100 rather than a strip of 10).
Pack? mainPack(Product p) {
  Pack? best;
  for (final k in packsOf(p)) {
    if (best == null || k.size > best.size) best = k;
  }
  return best;
}

bool receiveInPacks(PharmacySettings s) => s.receiveUnit == 'pack';

bool sellInPacks(PharmacySettings s, {required bool wholesale}) =>
    (wholesale ? s.sellUnitWholesale : s.sellUnitRetail) == 'pack';

/// Price of one pack: its own retail or wholesale price if set, else the unit price × units in the pack.
double packPrice(Pack k, double unitPrice, {required bool wholesale}) {
  final own = wholesale ? k.wholesale : k.price;
  return own > 0 ? own : unitPrice * k.size;
}
