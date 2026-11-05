// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sync_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Whether sync runs on its own (timers, after each change). Tests switch it off and call [SyncController.runNow].

@ProviderFor(syncAutomatically)
final syncAutomaticallyProvider = SyncAutomaticallyProvider._();

/// Whether sync runs on its own (timers, after each change). Tests switch it off and call [SyncController.runNow].

final class SyncAutomaticallyProvider
    extends $FunctionalProvider<bool, bool, bool>
    with $Provider<bool> {
  /// Whether sync runs on its own (timers, after each change). Tests switch it off and call [SyncController.runNow].
  SyncAutomaticallyProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'syncAutomaticallyProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$syncAutomaticallyHash();

  @$internal
  @override
  $ProviderElement<bool> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  bool create(Ref ref) {
    return syncAutomatically(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<bool>(value),
    );
  }
}

String _$syncAutomaticallyHash() => r'b7676e1d18fd986cf7707fc9580a77f176a4cba7';

@ProviderFor(syncEngine)
final syncEngineProvider = SyncEngineProvider._();

final class SyncEngineProvider
    extends $FunctionalProvider<SyncEngine, SyncEngine, SyncEngine>
    with $Provider<SyncEngine> {
  SyncEngineProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'syncEngineProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$syncEngineHash();

  @$internal
  @override
  $ProviderElement<SyncEngine> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SyncEngine create(Ref ref) {
    return syncEngine(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SyncEngine value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SyncEngine>(value),
    );
  }
}

String _$syncEngineHash() => r'348cae9e5ca6f5d28246aa8bd09b1ca7dd35a7ed';

/// Runs sync: about every 5 s while the app is in use (60 s in the background), straight after every change, at once
/// when the app comes back to the front, and after a failure with growing pauses (1 s doubling to 60 s, ± half).

@ProviderFor(SyncController)
final syncControllerProvider = SyncControllerProvider._();

/// Runs sync: about every 5 s while the app is in use (60 s in the background), straight after every change, at once
/// when the app comes back to the front, and after a failure with growing pauses (1 s doubling to 60 s, ± half).
final class SyncControllerProvider
    extends $NotifierProvider<SyncController, SyncStatus> {
  /// Runs sync: about every 5 s while the app is in use (60 s in the background), straight after every change, at once
  /// when the app comes back to the front, and after a failure with growing pauses (1 s doubling to 60 s, ± half).
  SyncControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'syncControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$syncControllerHash();

  @$internal
  @override
  SyncController create() => SyncController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SyncStatus value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SyncStatus>(value),
    );
  }
}

String _$syncControllerHash() => r'854d71d5df5e05533e48a14b0ca90804d443baeb';

/// Runs sync: about every 5 s while the app is in use (60 s in the background), straight after every change, at once
/// when the app comes back to the front, and after a failure with growing pauses (1 s doubling to 60 s, ± half).

abstract class _$SyncController extends $Notifier<SyncStatus> {
  SyncStatus build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<SyncStatus, SyncStatus>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<SyncStatus, SyncStatus>,
              SyncStatus,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
