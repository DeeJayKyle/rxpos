import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'batch.freezed.dart';
part 'batch.g.dart';

/// A lot of a medicine: batch number, expiry and what it cost. Its quantity comes from stock movements.
@freezed
abstract class Batch with _$Batch {
  const Batch._();

  @JsonSerializable(converters: recordConverters)
  const factory Batch({
    required String id,
    @Default('') String productId,
    @Default('') String batch,
    @Default('') String expiry,
    @Default(0) double cost,
    @Default('') String received,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Batch;

  factory Batch.fromJson(Map<String, Object?> json) => _$BatchFromJson(json);

  factory Batch.fromRecord(Map<String, Object?> rec) => Batch.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
