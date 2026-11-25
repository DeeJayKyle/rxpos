import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'product.freezed.dart';
part 'product.g.dart';

/// A pack a medicine comes in (strip of 10, box of 100). Stock is always counted in the smallest unit.
@freezed
abstract class Pack with _$Pack {
  @JsonSerializable(converters: recordConverters)
  const factory Pack({
    @Default('') String name,
    @Default(1) double size,
    @Default(0) double price,
    @Default(0) double wholesale,
  }) = _Pack;

  factory Pack.fromJson(Map<String, Object?> json) => _$PackFromJson(json);
}

/// A medicine. `id` "cat-N" is one of the standard catalogue medicines built into the app.
@freezed
abstract class Product with _$Product {
  const Product._();

  @JsonSerializable(converters: recordConverters)
  const factory Product({
    required String id,
    @Default('') String name,
    @Default('') String generic,
    @Default('') String form,
    @Default('') String unit,
    @Default('') String barcode,
    @Default('') String category,
    @Default('') String strength,
    @Default(0) double price,
    @Default(0) double wholesale,
    @Default(0) double cost,
    @Default(0) double reorder,
    @Default(<Pack>[]) List<Pack> packs,
    @Default(false) bool rx,
    @Default(false) bool controlled,
    /// Set by the store on every save; read only here.
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    /// The record as it was read, so fields this app does not know are written back untouched.
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Product;

  factory Product.fromJson(Map<String, Object?> json) => _$ProductFromJson(json);

  factory Product.fromRecord(Map<String, Object?> rec) => Product.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());

  bool get isCatalog => RegExp(r'^cat-\d+$').hasMatch(id);
}
