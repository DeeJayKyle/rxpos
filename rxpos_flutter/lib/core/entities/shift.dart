import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'shift.freezed.dart';
part 'shift.g.dart';

/// A cashier's shift: opened with a float, closed with a cash count.
@freezed
abstract class Shift with _$Shift {
  const Shift._();

  @JsonSerializable(converters: recordConverters)
  const factory Shift({
    required String id,
    @Default('') String userId,
    @Default('') String user,
    @Default('main') String branchId,
    @Default('') String openedAt,
    @Default(0) double float,
    String? closedAt,
    @Default(0) double counted,
    @Default(0) double expected,
    @Default(0) double variance,
    @Default('') String note,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Shift;

  factory Shift.fromJson(Map<String, Object?> json) => _$ShiftFromJson(json);

  factory Shift.fromRecord(Map<String, Object?> rec) => Shift.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());

  bool get isOpen => closedAt == null || closedAt!.isEmpty;
}
