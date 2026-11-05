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
