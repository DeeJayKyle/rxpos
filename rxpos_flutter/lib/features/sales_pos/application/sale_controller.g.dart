// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sale_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(SaleController)
final saleControllerProvider = SaleControllerFamily._();

final class SaleControllerProvider
    extends $NotifierProvider<SaleController, SaleState> {
  SaleControllerProvider._({
    required SaleControllerFamily super.from,
    required bool super.argument,
  }) : super(
         retry: null,
         name: r'saleControllerProvider',
         isAutoDispose: false,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$saleControllerHash();

  @override
  String toString() {
    return r'saleControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  SaleController create() => SaleController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SaleState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SaleState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is SaleControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$saleControllerHash() => r'646a3be144f4fa8a5381a0f7865c1622954bf170';

final class SaleControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          SaleController,
          SaleState,
          SaleState,
          SaleState,
          bool
        > {
  SaleControllerFamily._()
    : super(
        retry: null,
        name: r'saleControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: false,
      );

  SaleControllerProvider call(bool wholesale) =>
      SaleControllerProvider._(argument: wholesale, from: this);

  @override
  String toString() => r'saleControllerProvider';
}

abstract class _$SaleController extends $Notifier<SaleState> {
  late final _$args = ref.$arg as bool;
  bool get wholesale => _$args;

  SaleState build(bool wholesale);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<SaleState, SaleState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<SaleState, SaleState>,
              SaleState,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
