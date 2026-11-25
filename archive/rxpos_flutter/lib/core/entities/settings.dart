import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'settings.freezed.dart';
part 'settings.g.dart';

/// A way to be paid. [type] is 'cash' | 'momo' | 'credit' | 'other'.
@freezed
abstract class PaymentMethod with _$PaymentMethod {
  @JsonSerializable(converters: recordConverters)
  const factory PaymentMethod({required String id, @Default('') String name, @Default('other') String type}) = _PaymentMethod;

  factory PaymentMethod.fromJson(Map<String, Object?> json) => _$PaymentMethodFromJson(json);
}

/// The defaults every pharmacy starts with (src/store.jsx DEFAULT_PAYMENT_METHODS).
const defaultPaymentMethods = [
  PaymentMethod(id: 'cash', name: 'Cash', type: 'cash'),
  PaymentMethod(id: 'momo', name: 'Mobile Money', type: 'momo'),
  PaymentMethod(id: 'card', name: 'Card', type: 'other'),
  PaymentMethod(id: 'bank', name: 'Bank Transfer', type: 'other'),
  PaymentMethod(id: 'insurance', name: 'Insurance', type: 'other'),
  PaymentMethod(id: 'credit', name: 'Credit', type: 'credit'),
];

/// The pharmacy's settings the till and Add Stock use (the record has many more; they are kept untouched).
@freezed
abstract class PharmacySettings with _$PharmacySettings {
  const PharmacySettings._();

  @JsonSerializable(converters: recordConverters)
  const factory PharmacySettings({
    @Default('My Pharmacy') String name,
    @Default('') String phone,
    @Default('') String address,
    @Default('UGX') String currency,
    @Default(0) double decimals,
    @Default('en-UG') String locale,
    @Default(0) double taxRate,
    @Default(false) bool taxInclusive,
    @Default(50) double retailMarkup,
    @Default(25) double wholesaleMarkup,
    @Default(0) double priceRound,
    @Default(90) double expiryWarnDays,
    /// 'off' | 'optional' | 'required': whether the till asks for the client
    @Default('optional') String clientCapture,
    /// packs: 'pack' | 'unit' (src/packs.js)
    @Default('pack') String receiveUnit,
    @Default('unit') String sellUnitRetail,
    @Default('pack') String sellUnitWholesale,
    @Default(<PaymentMethod>[]) List<PaymentMethod> paymentMethods,
    @Default(false) bool autoPrint,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _PharmacySettings;

  factory PharmacySettings.fromJson(Map<String, Object?> json) => _$PharmacySettingsFromJson(json);

  factory PharmacySettings.fromRecord(Map<String, Object?> rec) => PharmacySettings.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());

  /// The payment methods in use (the defaults when the pharmacy has none of its own).
  List<PaymentMethod> get methods => paymentMethods.isEmpty ? defaultPaymentMethods : paymentMethods;

  int get decimalPlaces => decimals.round();
}
