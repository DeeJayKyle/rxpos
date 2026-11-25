import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'draft.freezed.dart';
part 'draft.g.dart';

/// A held sale or an unfinished delivery, kept so work survives a restart and shows on every device.
@freezed
abstract class Draft with _$Draft {
  const Draft._();

  @JsonSerializable(converters: recordConverters)
  const factory Draft({
    required String id,
    /// 'sale' | 'delivery'
    @Default('sale') String kind,
    @Default('main') String branchId,
    @Default('') String mode,
    @Default('') String userId,
    @Default('') String userName,
    @Default(0) double order,
    @Default('') String startedAt,
    @Default('') String title,
    @Default(0) double count,
    @Default(0) double total,
    /// the held sale or delivery itself, as the React app stores it
    Map<String, Object?>? data,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Draft;

  factory Draft.fromJson(Map<String, Object?> json) => _$DraftFromJson(json);

  factory Draft.fromRecord(Map<String, Object?> rec) => Draft.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
