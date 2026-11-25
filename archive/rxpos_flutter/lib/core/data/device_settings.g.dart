// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_settings.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The branch this device works as (This device → Branch), kept on the device like the React app's choice. Stock,
/// sales and deliveries on this device belong to it.

@ProviderFor(DeviceBranch)
final deviceBranchProvider = DeviceBranchProvider._();

/// The branch this device works as (This device → Branch), kept on the device like the React app's choice. Stock,
/// sales and deliveries on this device belong to it.
final class DeviceBranchProvider
    extends $AsyncNotifierProvider<DeviceBranch, String> {
  /// The branch this device works as (This device → Branch), kept on the device like the React app's choice. Stock,
  /// sales and deliveries on this device belong to it.
  DeviceBranchProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceBranchProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceBranchHash();

  @$internal
  @override
  DeviceBranch create() => DeviceBranch();
}

String _$deviceBranchHash() => r'3d37d33eccaf7942a7a068aba5ef312375806435';

/// The branch this device works as (This device → Branch), kept on the device like the React app's choice. Stock,
/// sales and deliveries on this device belong to it.

abstract class _$DeviceBranch extends $AsyncNotifier<String> {
  FutureOr<String> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<String>, String>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<String>, String>,
              AsyncValue<String>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

/// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.

@ProviderFor(DeviceValue)
final deviceValueProvider = DeviceValueFamily._();

/// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.
final class DeviceValueProvider
    extends $AsyncNotifierProvider<DeviceValue, String?> {
  /// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.
  DeviceValueProvider._({
    required DeviceValueFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'deviceValueProvider',
         isAutoDispose: false,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$deviceValueHash();

  @override
  String toString() {
    return r'deviceValueProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  DeviceValue create() => DeviceValue();

  @override
  bool operator ==(Object other) {
    return other is DeviceValueProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$deviceValueHash() => r'ded7073625a3761ef3b33f05f726e9161b67a49a';

/// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.

final class DeviceValueFamily extends $Family
    with
        $ClassFamilyOverride<
          DeviceValue,
          AsyncValue<String?>,
          String?,
          FutureOr<String?>,
          String
        > {
  DeviceValueFamily._()
    : super(
        retry: null,
        name: r'deviceValueProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: false,
      );

  /// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.

  DeviceValueProvider call(String key) =>
      DeviceValueProvider._(argument: key, from: this);

  @override
  String toString() => r'deviceValueProvider';
}

/// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.

abstract class _$DeviceValue extends $AsyncNotifier<String?> {
  late final _$args = ref.$arg as String;
  String get key => _$args;

  FutureOr<String?> build(String key);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<String?>, String?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<String?>, String?>,
              AsyncValue<String?>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
