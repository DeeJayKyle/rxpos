import 'package:freezed_annotation/freezed_annotation.dart';

import '../data/json_fields.dart';
import '../data/record_merge.dart';

part 'people.freezed.dart';
part 'people.g.dart';

/// Someone who signs in. [role] is a role id (admin, manager, pharmacist, dispenser, cashier or the pharmacy's own).
@freezed
abstract class AppUser with _$AppUser {
  const AppUser._();

  @JsonSerializable(converters: recordConverters)
  const factory AppUser({
    required String id,
    @Default('') String name,
    @Default('') String email,
    @Default('') String username,
    @Default('') String phone,
    @Default('cashier') String role,
    @Default('') String branchId,
    @Default(true) bool active,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _AppUser;

  factory AppUser.fromJson(Map<String, Object?> json) => _$AppUserFromJson(json);

  factory AppUser.fromRecord(Map<String, Object?> rec) => AppUser.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}

/// A role and the permissions it grants.
@freezed
abstract class Role with _$Role {
  const Role._();

  @JsonSerializable(converters: recordConverters)
  const factory Role({
    required String id,
    @Default('') String name,
    @Default(<String>[]) List<String> permissions,
    @Default(false) bool builtIn,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Role;

  factory Role.fromJson(Map<String, Object?> json) => _$RoleFromJson(json);

  factory Role.fromRecord(Map<String, Object?> rec) => Role.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}

/// A branch of the pharmacy. The first one is 'main'.
@freezed
abstract class Branch with _$Branch {
  const Branch._();

  @JsonSerializable(converters: recordConverters)
  const factory Branch({
    required String id,
    @Default('') String name,
    @Default('') String address,
    @Default('') String phone,
    @JsonKey(includeToJson: false) @Default('') String updatedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) @Default(<String, Object?>{}) Map<String, Object?> raw,
  }) = _Branch;

  factory Branch.fromJson(Map<String, Object?> json) => _$BranchFromJson(json);

  factory Branch.fromRecord(Map<String, Object?> rec) => Branch.fromJson(rec).copyWith(raw: rec);

  Map<String, Object?> toRecord() => mergeRecord(raw, toJson());
}
