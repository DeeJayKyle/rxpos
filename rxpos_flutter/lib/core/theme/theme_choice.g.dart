// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'theme_choice.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// This device's look: the standard teal or Premium UI (Midnight Pro), kept on the device like the React app's switch.

@ProviderFor(PremiumUi)
final premiumUiProvider = PremiumUiProvider._();

/// This device's look: the standard teal or Premium UI (Midnight Pro), kept on the device like the React app's switch.
final class PremiumUiProvider extends $AsyncNotifierProvider<PremiumUi, bool> {
  /// This device's look: the standard teal or Premium UI (Midnight Pro), kept on the device like the React app's switch.
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

String _$premiumUiHash() => r'0ee175a0e232df347d050f945c5bb6367e33d5ac';

/// This device's look: the standard teal or Premium UI (Midnight Pro), kept on the device like the React app's switch.

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
