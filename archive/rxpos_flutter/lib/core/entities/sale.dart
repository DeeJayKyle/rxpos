import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';
import '../rules/insurance.dart';

part 'sale.freezed.dart';
part 'sale.g.dart';

/// The part of a sale line taken from one batch (first expiry first out).
@freezed
abstract class Allocation with _$Allocation {
  @JsonSerializable(converters: recordConverters)
  const factory Allocation({
    String? batchId,
    @Default(0) double qty,
    @Default('') String batch,
    @Default('') String expiry,
  }) = _Allocation;

  factory Allocation.fromJson(Map<String, Object?> json) => _$AllocationFromJson(json);
}

/// A line sold by the pack: [count] packs of [size] units at [price] each.
@freezed
abstract class SalePack with _$SalePack {
  @JsonSerializable(converters: recordConverters)
  const factory SalePack({
    @Default('') String name,
    @Default(1) double size,
    @Default(0) double count,
    @Default(0) double price,
  }) = _SalePack;

  factory SalePack.fromJson(Map<String, Object?> json) => _$SalePackFromJson(json);
}

/// One line of a sale. [id] is the medicine's id; [qty] is in single units; [price] is per unit.
@freezed
abstract class SaleItem with _$SaleItem {
  @JsonSerializable(converters: recordConverters)
  const factory SaleItem({
    @Default('') String id,
    @Default('') String name,
    @Default(0) double price,
    @Default(0) double cost,
    @Default(0) double qty,
    @Default(0) double discount,
    @Default(false) bool controlled,
    SalePack? pack,
    @Default(<Allocation>[]) List<Allocation> alloc,
    /// dosage directions as written by the React app (kept as they are)
    Map<String, Object?>? directions,
  }) = _SaleItem;

  factory SaleItem.fromJson(Map<String, Object?> json) => _$SaleItemFromJson(json);
}

/// A completed (or refunded) sale.
@freezed
abstract class Sale with _$Sale {
  const Sale._();

  @JsonSerializable(converters: recordConverters)
  const factory Sale({
    required String id,
    @Default('') String number,
    @Default('') String date,
    /// 'retail' | 'wholesale'
    @Default('retail') String type,
    @Default('main') String branchId,
    @Default(<SaleItem>[]) List<SaleItem> items,
    @Default(0) double subtotal,
    @Default(0) double discount,
    @Default(0) double tax,
    @Default(0) double total,
    @Default('') String payment,
    @Default(0) double paid,
    @Default(0) double tendered,
    @Default('') String bankId,
    @Default('walk-in') String customerId,
    @Default('') String customerName,
    @Default('') String cashier,
    @Default('completed') String status,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Sale;

  factory Sale.fromJson(Map<String, Object?> json) => _$SaleFromJson(json);

  factory Sale.fromRecord(Map<String, Object?> rec) => Sale.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());

  /// What the insurer owes on this sale (step 22: the record's insurance.share; 0 when uninsured or refunded).
  double get insuredShare => status == 'refunded' ? 0 : insurerShare(raw);

  /// What the client still owes on a credit sale (an insurer's share is the insurer's debt, not the client's).
  double get balance => total - paid - insuredShare;
}
