// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_store.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(recordStore)
final recordStoreProvider = RecordStoreProvider._();

final class RecordStoreProvider
    extends $FunctionalProvider<RecordStore, RecordStore, RecordStore>
    with $Provider<RecordStore> {
  RecordStoreProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'recordStoreProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$recordStoreHash();

  @$internal
  @override
  $ProviderElement<RecordStore> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  RecordStore create(Ref ref) {
    return recordStore(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RecordStore value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RecordStore>(value),
    );
  }
}

String _$recordStoreHash() => r'94f2f9c54c44d4718365316641a2cb5ecb9dfe1a';
