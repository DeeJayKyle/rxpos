import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../entities/batch.dart';
import '../entities/draft.dart';
import '../entities/party.dart';
import '../entities/product.dart';
import '../entities/settings.dart';
import '../rules/balances.dart';
import '../rules/gs1.dart';
import '../rules/fefo.dart' show sellable;
import '../rules/kits.dart';
import '../rules/permissions.dart';
import '../rules/stock.dart';
import 'catalog.dart';
import 'device_settings.dart';
import '../rules/pharmacy_settings.dart';
import 'record_store.dart';

part 'pharmacy_providers.g.dart';

/// A table's records, live (every saved action and every sync updates it).
@riverpod
Stream<List<Map<String, Object?>>> table(Ref ref, String t) => ref.watch(recordStoreProvider).watch(t);

/// Step 13: stock per branch and batch, added up by SQLite (RecordStore.watchStock) instead of decoding every movement.
final stockIndexProvider = StreamProvider<StockIndex>((ref) => ref.watch(recordStoreProvider).watchStock());

/// Faster sync, stage 4: the cloud's brought-forward figures on a device keeping recent history (null: no window, the
/// balances are the plain sums). Pass it to customerBalance, supplierBalance, insurerBalance, accountBalances, loanBalance.
final balanceWindowProvider = StreamProvider<BalanceWindow?>((ref) => ref.watch(recordStoreProvider).watchBalanceWindow());

/// The pharmacy's settings with this device's own overrides of the pharmacy's details (Settings → Pharmacy). [raw]
/// stays the shared record; save settings from [RecordStore.settingsRecord] so overrides never reach other devices.
@Riverpod(keepAlive: true)
Stream<PharmacySettings> settings(Ref ref) async* {
  final over = readOverrides(await ref.watch(deviceValueProvider(overridesKey).future));
  yield* ref.watch(recordStoreProvider).watchSettings().map((s) => over.isEmpty ? s : PharmacySettings.fromRecord({...s.raw, ...over}).copyWith(raw: s.raw));
}

/// The built-in catalogue (9,710 medicines), loaded once.
@Riverpod(keepAlive: true)
Future<List<Product>> catalog(Ref ref) => loadCatalog();

/// The pharmacy as the till and Add Stock see it.
class PharmacyData {
  PharmacyData({required this.settings, required this.products, required this.stock, required this.customers,
      required this.suppliers, required this.drafts, required this.features, this.branch = mainBranch, this.kits = const [],
      Map<String, Product>? byId, Map<String, Product>? byBarcode})
      // ignore: prefer_initializing_formals (a named parameter cannot be private)
      : _byId = byId, _byBarcode = byBarcode;
  final Map<String, Product>? _byId, _byBarcode;

  final PharmacySettings settings;
  final List<Product> products;
  final StockView stock;
  final List<Customer> customers;
  final List<Supplier> suppliers;
  final List<Draft> drafts;
  final Map<String, bool> features;
  /// the branch this device works as
  final String branch;

  late final Map<String, Product> byId = _byId ?? {for (final p in products) p.id: p};
  /// 1.10 kits (core/rules/kits.dart): their stored records, kept out of [products] (they have no stock of their own)
  final List<Map<String, Object?>> kits;
  late final _kitMeds = {
    for (final p in products)
      p.id: (name: p.name, cost: p.cost, price: p.price, wholesale: p.wholesale, rx: p.rx, controlled: p.controlled,
          expiry: stock.batchesOf(p.id).where((b) => b.qty > 0 && b.expiry.isNotEmpty).map((b) => b.expiry).firstOrNull ?? ''),
  };
  /// A kit as it can be sold now: made from stock that has not expired, with this sale's [swaps]
  KitView kitNow(Map<String, Object?> rec, {Map<String, String> swaps = const {}}) => kitView(rec, _kitMeds, (id) => sellable(stock.batchesOf(id)), swaps: swaps);
  /// The kits on the till (switched on), as they are now
  late final List<KitView> tillKits = [for (final k in kits) if (kitActive(k)) kitNow(k)];
  late final Map<String, Product> byBarcode = _byBarcode ?? {for (final p in products) if (p.barcode.isNotEmpty) p.barcode: p};
  /// step 21: the medicine whose barcode is this product number (a GTIN-14 from a pack's 2D code, or its EAN-13)
  Product? byGtin(String gtin) => products.where((p) => sameGtin(p.barcode, gtin)).firstOrNull;

  double stockOf(String id) => stock.stockOf(id);

  /// Payment methods in use (Mobile Money only when the pharmacy has it).
  List<PaymentMethod> get methods => settings.methods.where((m) => m.type != 'momo' || features['momo'] != false).toList();
}

/// The medicine list with its lookups (1.14.1, speed): the pharmacy's own medicines merged with the built-in catalogue,
/// sorted by name. Worked out only when medicines, the hidden catalogue entries or the licence change, never because of
/// a sale (a sale changes stock, not medicines), so the till does not decode, merge and sort ~12,700 medicines each time.
class MedicineList {
  MedicineList({required this.products, required this.kits, required this.features});
  final List<Product> products;
  final List<Map<String, Object?>> kits;
  final Map<String, bool> features;
  late final Map<String, Product> byId = {for (final p in products) p.id: p};
  late final Map<String, Product> byBarcode = {for (final p in products) if (p.barcode.isNotEmpty) p.barcode: p};
}

final medicineListProvider = FutureProvider<MedicineList>((ref) async {
  // kits (1.10.0) are recipes sold by the React app, not stock: kept out of this app's medicine lists (rules/kits.dart)
  final rows = await ref.watch(tableProvider('products').future);
  final own = rows.where((r) => !isKitRecord(r)).map(Product.fromRecord).toList();
  final kits = rows.where(isKitRecord).toList()..sort((a, b) => '${a['name']}'.toLowerCase().compareTo('${b['name']}'.toLowerCase()));
  final license = await ref.watch(tableProvider('license').future);
  final features = featureSet((license.firstOrNull?['features'] as Map?)?.cast<String, Object?>());
  final hidden = {for (final h in await ref.watch(tableProvider('catalogHidden').future)) '${h['id']}'};
  final cat = features['catalog'] == false ? const <Product>[] : await ref.watch(catalogProvider.future);
  // sorted by name, lower case worked out once per medicine (not twice per comparison: ~350,000 for 12,700 medicines)
  final merged = withCatalog(own, cat, hidden: hidden, on: features['catalog'] != false);
  final keyed = [for (final p in merged) (p.name.toLowerCase(), p)]..sort((a, b) => a.$1.compareTo(b.$1));
  return MedicineList(products: [for (final k in keyed) k.$2], kits: kits, features: features);
});

/// The batches by medicine, worked out when batches change (receiving stock), not on every sale (1.14.1, speed)
final batchesByProductProvider = FutureProvider<Map<String, List<Batch>>>(
    (ref) async => StockView.groupBatches((await ref.watch(tableProvider('batches').future)).map(Batch.fromRecord)));

/// Clients (walk-in first, then A–Z) and suppliers (A–Z), worked out when they change, not on every sale (1.14.1)
final customerListProvider = FutureProvider<List<Customer>>((ref) async => (await ref.watch(tableProvider('customers').future)).map(Customer.fromRecord).toList()
  ..sort((a, b) => a.id == 'walk-in' ? -1 : b.id == 'walk-in' ? 1 : a.name.compareTo(b.name)));
final supplierListProvider = FutureProvider<List<Supplier>>(
    (ref) async => (await ref.watch(tableProvider('suppliers').future)).map(Supplier.fromRecord).toList()..sort((a, b) => a.name.compareTo(b.name)));

@riverpod
Future<PharmacyData> pharmacy(Ref ref) async {
  final settings = await ref.watch(settingsProvider.future);
  final branch = await ref.watch(deviceBranchProvider.future);
  final meds = await ref.watch(medicineListProvider.future);
  final stockIndex = await ref.watch(stockIndexProvider.future);
  final batches = await ref.watch(batchesByProductProvider.future);
  return PharmacyData(
    settings: settings,
    products: meds.products,
    byId: meds.byId,
    byBarcode: meds.byBarcode,
    stock: StockView(products: const [], batches: const [], index: stockIndex, branch: branch, productsById: meds.byId, batchesByProduct: batches),
    branch: branch,
    customers: await ref.watch(customerListProvider.future),
    suppliers: await ref.watch(supplierListProvider.future),
    drafts: (await ref.watch(tableProvider('drafts').future)).map(Draft.fromRecord).where((x) => (x.branchId.isEmpty ? mainBranch : x.branchId) == branch).toList()..sort((a, b) => b.order.compareTo(a.order)),
    features: meds.features,
    kits: meds.kits,
  );
}

/// The pharmacy's branding from its licence (logo, which colour themes it may use, the default theme).
final brandingProvider = Provider.autoDispose<Map<String, Object?>?>((ref) => (ref.watch(tableProvider('license')).value?.firstOrNull?['branding'] as Map?)?.cast<String, Object?>());
