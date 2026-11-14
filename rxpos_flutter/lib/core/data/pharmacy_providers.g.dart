// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pharmacy_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// A table's records, live (every saved action and every sync updates it).

@ProviderFor(table)
final tableProvider = TableFamily._();

/// A table's records, live (every saved action and every sync updates it).

final class TableProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Map<String, Object?>>>,
          List<Map<String, Object?>>,
          Stream<List<Map<String, Object?>>>
        >
    with
        $FutureModifier<List<Map<String, Object?>>>,
        $StreamProvider<List<Map<String, Object?>>> {
  /// A table's records, live (every saved action and every sync updates it).
  TableProvider._({
    required TableFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'tableProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$tableHash();

  @override
  String toString() {
    return r'tableProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $StreamProviderElement<List<Map<String, Object?>>> $createElement(
    $ProviderPointer pointer,
  ) => $StreamProviderElement(pointer);

  @override
  Stream<List<Map<String, Object?>>> create(Ref ref) {
    final argument = this.argument as String;
    return table(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is TableProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$tableHash() => r'597a4b2a81bc23eaa417fb512659a45bcf260eb8';

/// A table's records, live (every saved action and every sync updates it).

final class TableFamily extends $Family
    with $FunctionalFamilyOverride<Stream<List<Map<String, Object?>>>, String> {
  TableFamily._()
    : super(
        retry: null,
        name: r'tableProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// A table's records, live (every saved action and every sync updates it).

  TableProvider call(String t) => TableProvider._(argument: t, from: this);

  @override
  String toString() => r'tableProvider';
}

/// The pharmacy's settings with this device's own overrides of the pharmacy's details (Settings → Pharmacy). [raw]
/// stays the shared record; save settings from [RecordStore.settingsRecord] so overrides never reach other devices.

@ProviderFor(settings)
final settingsProvider = SettingsProvider._();

/// The pharmacy's settings with this device's own overrides of the pharmacy's details (Settings → Pharmacy). [raw]
/// stays the shared record; save settings from [RecordStore.settingsRecord] so overrides never reach other devices.

final class SettingsProvider
    extends
        $FunctionalProvider<
          AsyncValue<PharmacySettings>,
          PharmacySettings,
          Stream<PharmacySettings>
        >
    with $FutureModifier<PharmacySettings>, $StreamProvider<PharmacySettings> {
  /// The pharmacy's settings with this device's own overrides of the pharmacy's details (Settings → Pharmacy). [raw]
  /// stays the shared record; save settings from [RecordStore.settingsRecord] so overrides never reach other devices.
  SettingsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'settingsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$settingsHash();

  @$internal
  @override
  $StreamProviderElement<PharmacySettings> $createElement(
    $ProviderPointer pointer,
  ) => $StreamProviderElement(pointer);

  @override
  Stream<PharmacySettings> create(Ref ref) {
    return settings(ref);
  }
}

String _$settingsHash() => r'c263487333333458b7bfc137380d068a8ec560bd';

/// The built-in catalogue (9,710 medicines), loaded once.

@ProviderFor(catalog)
final catalogProvider = CatalogProvider._();

/// The built-in catalogue (9,710 medicines), loaded once.

final class CatalogProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<Product>>,
          List<Product>,
          FutureOr<List<Product>>
        >
    with $FutureModifier<List<Product>>, $FutureProvider<List<Product>> {
  /// The built-in catalogue (9,710 medicines), loaded once.
  CatalogProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'catalogProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$catalogHash();

  @$internal
  @override
  $FutureProviderElement<List<Product>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<Product>> create(Ref ref) {
    return catalog(ref);
  }
}

String _$catalogHash() => r'd539c1d81e27bf56c7869bbe66050346607f3e84';

@ProviderFor(pharmacy)
final pharmacyProvider = PharmacyProvider._();

final class PharmacyProvider
    extends
        $FunctionalProvider<
          AsyncValue<PharmacyData>,
          PharmacyData,
          FutureOr<PharmacyData>
        >
    with $FutureModifier<PharmacyData>, $FutureProvider<PharmacyData> {
  PharmacyProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pharmacyProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pharmacyHash();

  @$internal
  @override
  $FutureProviderElement<PharmacyData> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<PharmacyData> create(Ref ref) {
    return pharmacy(ref);
  }
}

String _$pharmacyHash() => r'4c3430fe45d40c4a14cce04762e834d643dd9006';
