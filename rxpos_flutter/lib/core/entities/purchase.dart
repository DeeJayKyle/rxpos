import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'purchase.freezed.dart';
part 'purchase.g.dart';

/// A delivery line received by the pack: [count] packs of [size] at [cost] each.
@freezed
abstract class PurchasePack with _$PurchasePack {
  @JsonSerializable(converters: recordConverters)
  const factory PurchasePack({
    @Default('') String name,
    @Default(1) double size,
    @Default(0) double count,
    @Default(0) double cost,
  }) = _PurchasePack;

  factory PurchasePack.fromJson(Map<String, Object?> json) => _$PurchasePackFromJson(json);
}

/// One delivery line. [qty] is in single units and [cost] is per unit.
@freezed
abstract class PurchaseItem with _$PurchaseItem {
  @JsonSerializable(converters: recordConverters)
  const factory PurchaseItem({
    @Default('') String productId,
    @Default('') String name,
    @Default(0) double qty,
    @Default(0) double cost,
    @Default('') String batch,
    @Default('') String expiry,
    String? batchId,
    PurchasePack? pack,
    @Default(false) bool added,
  }) = _PurchaseItem;

  factory PurchaseItem.fromJson(Map<String, Object?> json) => _$PurchaseItemFromJson(json);
}

/// A delivery received (goods received note).
@freezed
abstract class Purchase with _$Purchase {
  const Purchase._();

  @JsonSerializable(converters: recordConverters)
  const factory Purchase({
    required String id,
    @Default('') String number,
    @Default('') String supplierId,
    @Default('') String supplierName,
    @Default('') String invoice,
    @Default('') String notes,
    @Default('') String date,
    @Default('') String receivedBy,
    @Default(0) double total,
    @Default(0) double paid,
    @Default('') String bankId,
    @Default('main') String branchId,
    @Default(<PurchaseItem>[]) List<PurchaseItem> items,
    @Default(false) bool scanned,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Purchase;

  factory Purchase.fromJson(Map<String, Object?> json) => _$PurchaseFromJson(json);

  factory Purchase.fromRecord(Map<String, Object?> rec) => Purchase.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
