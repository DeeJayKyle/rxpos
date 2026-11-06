// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'party.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Customer _$CustomerFromJson(Map<String, dynamic> json) => _Customer(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  phone: json['phone'] == null ? '' : const Str().fromJson(json['phone']),
  allergies: json['allergies'] == null
      ? ''
      : const Str().fromJson(json['allergies']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$CustomerToJson(_Customer instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'phone': ?const Str().toJson(instance.phone),
  'allergies': ?const Str().toJson(instance.allergies),
};

_Supplier _$SupplierFromJson(Map<String, dynamic> json) => _Supplier(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  contact: json['contact'] == null ? '' : const Str().fromJson(json['contact']),
  phone: json['phone'] == null ? '' : const Str().fromJson(json['phone']),
  email: json['email'] == null ? '' : const Str().fromJson(json['email']),
  address: json['address'] == null ? '' : const Str().fromJson(json['address']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$SupplierToJson(_Supplier instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'contact': ?const Str().toJson(instance.contact),
  'phone': ?const Str().toJson(instance.phone),
  'email': ?const Str().toJson(instance.email),
  'address': ?const Str().toJson(instance.address),
};
