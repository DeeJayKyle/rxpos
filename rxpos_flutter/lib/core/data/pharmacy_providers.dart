import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../entities/batch.dart';
import '../entities/draft.dart';
import '../entities/movement.dart';
import '../entities/party.dart';
import '../entities/product.dart';
import '../entities/settings.dart';
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
      required this.suppliers, required this.drafts, required this.features, this.branch = mainBranch});

  final PharmacySettings settings;
  final List<Product> products;
  final StockView stock;
  final List<Customer> customers;
  final List<Supplier> suppliers;
  final List<Draft> drafts;
  final Map<String, bool> features;
  /// the branch this device works as
  final String branch;

  late final Map<String, Product> byId = {for (final p in products) p.id: p};
  late final Map<String, Product> byBarcode = {for (final p in products) if (p.barcode.isNotEmpty) p.barcode: p};

  double stockOf(String id) => stock.stockOf(id);

  /// Payment methods in use (Mobile Money only when the pharmacy has it).
  List<PaymentMethod> get methods => settings.methods.where((m) => m.type != 'momo' || features['momo'] != false).toList();
}

@riverpod
Future<PharmacyData> pharmacy(Ref ref) async {
  final settings = await ref.watch(settingsProvider.future);
  final branch = await ref.watch(deviceBranchProvider.future);
  final own = (await ref.watch(tableProvider('products').future)).map(Product.fromRecord).toList();
  final license = await ref.watch(tableProvider('license').future);
  final features = featureSet((license.firstOrNull?['features'] as Map?)?.cast<String, Object?>());
  final hidden = {for (final h in await ref.watch(tableProvider('catalogHidden').future)) '${h['id']}'};
  final cat = features['catalog'] == false ? const <Product>[] : await ref.watch(catalogProvider.future);
  final products = withCatalog(own, cat, hidden: hidden, on: features['catalog'] != false)..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  final movements = (await ref.watch(tableProvider('movements').future)).map(Movement.fromRecord);
  final batches = (await ref.watch(tableProvider('batches').future)).map(Batch.fromRecord);
  final customers = (await ref.watch(tableProvider('customers').future)).map(Customer.fromRecord).toList()
    ..sort((a, b) => a.id == 'walk-in' ? -1 : b.id == 'walk-in' ? 1 : a.name.compareTo(b.name));
  return PharmacyData(
    settings: settings,
    products: products,
    stock: StockView(products: products, batches: batches, index: StockIndex.of(movements), branch: branch),
    branch: branch,
    customers: customers,
    suppliers: (await ref.watch(tableProvider('suppliers').future)).map(Supplier.fromRecord).toList()..sort((a, b) => a.name.compareTo(b.name)),
    drafts: (await ref.watch(tableProvider('drafts').future)).map(Draft.fromRecord).where((x) => (x.branchId.isEmpty ? mainBranch : x.branchId) == branch).toList()..sort((a, b) => b.order.compareTo(a.order)),
    features: features,
  );
}

/// The pharmacy's branding from its licence (logo, which colour themes it may use, the default theme).
final brandingProvider = Provider.autoDispose<Map<String, Object?>?>((ref) => (ref.watch(tableProvider('license')).value?.firstOrNull?['branding'] as Map?)?.cast<String, Object?>());
