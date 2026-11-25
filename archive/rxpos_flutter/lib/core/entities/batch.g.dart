// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'batch.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Batch _$BatchFromJson(Map<String, dynamic> json) => _Batch(
  id: const Str().fromJson(json['id']),
  productId: json['productId'] == null
      ? ''
      : const Str().fromJson(json['productId']),
  batch: json['batch'] == null ? '' : const Str().fromJson(json['batch']),
  expiry: json['expiry'] == null ? '' : const Str().fromJson(json['expiry']),
  cost: json['cost'] == null ? 0 : const Num().fromJson(json['cost']),
  received: json['received'] == null
      ? ''
      : const Str().fromJson(json['received']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$BatchToJson(_Batch instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'productId': ?const Str().toJson(instance.productId),
  'batch': ?const Str().toJson(instance.batch),
  'expiry': ?const Str().toJson(instance.expiry),
  'cost': ?const Num().toJson(instance.cost),
  'received': ?const Str().toJson(instance.received),
};
