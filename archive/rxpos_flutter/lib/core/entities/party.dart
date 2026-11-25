import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'party.freezed.dart';
part 'party.g.dart';

/// A client. The built-in walk-in customer has id 'walk-in'.
@freezed
abstract class Customer with _$Customer {
  const Customer._();

  @JsonSerializable(converters: recordConverters)
  const factory Customer({
    required String id,
    @Default('') String name,
    @Default('') String phone,
    @Default('') String allergies,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Customer;

  factory Customer.fromJson(Map<String, Object?> json) => _$CustomerFromJson(json);

  factory Customer.fromRecord(Map<String, Object?> rec) => Customer.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}

/// A supplier medicines are bought from.
@freezed
abstract class Supplier with _$Supplier {
  const Supplier._();

  @JsonSerializable(converters: recordConverters)
  const factory Supplier({
    required String id,
    @Default('') String name,
    @Default('') String contact,
    @Default('') String phone,
    @Default('') String email,
    @Default('') String address,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Supplier;

  factory Supplier.fromJson(Map<String, Object?> json) => _$SupplierFromJson(json);

  factory Supplier.fromRecord(Map<String, Object?> rec) => Supplier.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
