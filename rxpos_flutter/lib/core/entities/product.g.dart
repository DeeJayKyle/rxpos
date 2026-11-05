// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Pack _$PackFromJson(Map<String, dynamic> json) => _Pack(
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  size: json['size'] == null ? 1 : const Num().fromJson(json['size']),
  price: json['price'] == null ? 0 : const Num().fromJson(json['price']),
  wholesale: json['wholesale'] == null
      ? 0
      : const Num().fromJson(json['wholesale']),
);

Map<String, dynamic> _$PackToJson(_Pack instance) => <String, dynamic>{
  'name': ?const Str().toJson(instance.name),
  'size': ?const Num().toJson(instance.size),
  'price': ?const Num().toJson(instance.price),
  'wholesale': ?const Num().toJson(instance.wholesale),
};

_Product _$ProductFromJson(Map<String, dynamic> json) => _Product(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  generic: json['generic'] == null ? '' : const Str().fromJson(json['generic']),
  form: json['form'] == null ? '' : const Str().fromJson(json['form']),
  unit: json['unit'] == null ? '' : const Str().fromJson(json['unit']),
  barcode: json['barcode'] == null ? '' : const Str().fromJson(json['barcode']),
  category: json['category'] == null
      ? ''
      : const Str().fromJson(json['category']),
  strength: json['strength'] == null
      ? ''
      : const Str().fromJson(json['strength']),
  price: json['price'] == null ? 0 : const Num().fromJson(json['price']),
  wholesale: json['wholesale'] == null
      ? 0
      : const Num().fromJson(json['wholesale']),
  cost: json['cost'] == null ? 0 : const Num().fromJson(json['cost']),
  reorder: json['reorder'] == null ? 0 : const Num().fromJson(json['reorder']),
  packs:
      (json['packs'] as List<dynamic>?)
          ?.map((e) => Pack.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Pack>[],
  rx: json['rx'] == null ? false : const Flag().fromJson(json['rx']),
  controlled: json['controlled'] == null
      ? false
      : const Flag().fromJson(json['controlled']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$ProductToJson(_Product instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'generic': ?const Str().toJson(instance.generic),
  'form': ?const Str().toJson(instance.form),
  'unit': ?const Str().toJson(instance.unit),
  'barcode': ?const Str().toJson(instance.barcode),
  'category': ?const Str().toJson(instance.category),
  'strength': ?const Str().toJson(instance.strength),
  'price': ?const Num().toJson(instance.price),
  'wholesale': ?const Num().toJson(instance.wholesale),
  'cost': ?const Num().toJson(instance.cost),
  'reorder': ?const Num().toJson(instance.reorder),
  'packs': instance.packs.map((e) => e.toJson()).toList(),
  'rx': ?const Flag().toJson(instance.rx),
  'controlled': ?const Flag().toJson(instance.controlled),
};
