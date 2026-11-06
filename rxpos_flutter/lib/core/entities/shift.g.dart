// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shift.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Shift _$ShiftFromJson(Map<String, dynamic> json) => _Shift(
  id: const Str().fromJson(json['id']),
  userId: json['userId'] == null ? '' : const Str().fromJson(json['userId']),
  user: json['user'] == null ? '' : const Str().fromJson(json['user']),
  branchId: json['branchId'] == null
      ? 'main'
      : const Str().fromJson(json['branchId']),
  openedAt: json['openedAt'] == null
      ? ''
      : const Str().fromJson(json['openedAt']),
  float: json['float'] == null ? 0 : const Num().fromJson(json['float']),
  closedAt: const OptStr().fromJson(json['closedAt']),
  counted: json['counted'] == null ? 0 : const Num().fromJson(json['counted']),
  expected: json['expected'] == null
      ? 0
      : const Num().fromJson(json['expected']),
  variance: json['variance'] == null
      ? 0
      : const Num().fromJson(json['variance']),
  note: json['note'] == null ? '' : const Str().fromJson(json['note']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$ShiftToJson(_Shift instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'userId': ?const Str().toJson(instance.userId),
  'user': ?const Str().toJson(instance.user),
  'branchId': ?const Str().toJson(instance.branchId),
  'openedAt': ?const Str().toJson(instance.openedAt),
  'float': ?const Num().toJson(instance.float),
  'closedAt': ?const OptStr().toJson(instance.closedAt),
  'counted': ?const Num().toJson(instance.counted),
  'expected': ?const Num().toJson(instance.expected),
  'variance': ?const Num().toJson(instance.variance),
  'note': ?const Str().toJson(instance.note),
};
