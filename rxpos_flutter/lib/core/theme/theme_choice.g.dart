// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'theme_choice.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The Premium UI switch (src/App.jsx PremiumToggle): Midnight Pro on this device.

@ProviderFor(PremiumUi)
final premiumUiProvider = PremiumUiProvider._();

/// The Premium UI switch (src/App.jsx PremiumToggle): Midnight Pro on this device.
final class PremiumUiProvider extends $AsyncNotifierProvider<PremiumUi, bool> {
  /// The Premium UI switch (src/App.jsx PremiumToggle): Midnight Pro on this device.
  PremiumUiProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'premiumUiProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$premiumUiHash();

  @$internal
  @override
  PremiumUi create() => PremiumUi();
}

String _$premiumUiHash() => r'c7c7efaff6cc38951d84a572faa2ba0440fa11f2';

/// The Premium UI switch (src/App.jsx PremiumToggle): Midnight Pro on this device.

abstract class _$PremiumUi extends $AsyncNotifier<bool> {
  FutureOr<bool> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<bool>, bool>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<bool>, bool>,
              AsyncValue<bool>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
