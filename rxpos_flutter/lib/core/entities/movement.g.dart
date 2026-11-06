// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'movement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Movement _$MovementFromJson(Map<String, dynamic> json) => _Movement(
  id: const Str().fromJson(json['id']),
  productId: json['productId'] == null
      ? ''
      : const Str().fromJson(json['productId']),
  qty: json['qty'] == null ? 0 : const Num().fromJson(json['qty']),
  type: json['type'] == null ? '' : const Str().fromJson(json['type']),
  ref: json['ref'] == null ? '' : const Str().fromJson(json['ref']),
  note: json['note'] == null ? '' : const Str().fromJson(json['note']),
  user: json['user'] == null ? '' : const Str().fromJson(json['user']),
  batchId: const OptStr().fromJson(json['batchId']),
  branchId: json['branchId'] == null
      ? 'main'
      : const Str().fromJson(json['branchId']),
  date: json['date'] == null ? '' : const Str().fromJson(json['date']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$MovementToJson(_Movement instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'productId': ?const Str().toJson(instance.productId),
  'qty': ?const Num().toJson(instance.qty),
  'type': ?const Str().toJson(instance.type),
  'ref': ?const Str().toJson(instance.ref),
  'note': ?const Str().toJson(instance.note),
  'user': ?const Str().toJson(instance.user),
  'batchId': ?const OptStr().toJson(instance.batchId),
  'branchId': ?const Str().toJson(instance.branchId),
  'date': ?const Str().toJson(instance.date),
};
