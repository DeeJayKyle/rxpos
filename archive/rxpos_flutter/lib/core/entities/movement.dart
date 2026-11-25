import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'movement.freezed.dart';
part 'movement.g.dart';

/// One change to stock (+ received, − sold). Stock is always the sum of movements, so two devices working offline
/// both count. Movements are never edited or deleted (the cloud refuses it).
@freezed
abstract class Movement with _$Movement {
  const Movement._();

  @JsonSerializable(converters: recordConverters)
  const factory Movement({
    required String id,
    @Default('') String productId,
    @Default(0) double qty,
    @Default('') String type,
    @Default('') String ref,
    @Default('') String note,
    @Default('') String user,
    /// null: stock recorded without a batch (older data)
    String? batchId,
    @Default('main') String branchId,
    @Default('') String date,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Movement;

  factory Movement.fromJson(Map<String, Object?> json) => _$MovementFromJson(json);

  factory Movement.fromRecord(Map<String, Object?> rec) => Movement.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
