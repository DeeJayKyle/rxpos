// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'people.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AppUser _$AppUserFromJson(Map<String, dynamic> json) => _AppUser(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  email: json['email'] == null ? '' : const Str().fromJson(json['email']),
  username: json['username'] == null
      ? ''
      : const Str().fromJson(json['username']),
  phone: json['phone'] == null ? '' : const Str().fromJson(json['phone']),
  role: json['role'] == null ? 'cashier' : const Str().fromJson(json['role']),
  branchId: json['branchId'] == null
      ? ''
      : const Str().fromJson(json['branchId']),
  active: json['active'] == null ? true : const Flag().fromJson(json['active']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$AppUserToJson(_AppUser instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'email': ?const Str().toJson(instance.email),
  'username': ?const Str().toJson(instance.username),
  'phone': ?const Str().toJson(instance.phone),
  'role': ?const Str().toJson(instance.role),
  'branchId': ?const Str().toJson(instance.branchId),
  'active': ?const Flag().toJson(instance.active),
};

_Role _$RoleFromJson(Map<String, dynamic> json) => _Role(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  permissions:
      (json['permissions'] as List<dynamic>?)
          ?.map(const Str().fromJson)
          .toList() ??
      const <String>[],
  builtIn: json['builtIn'] == null
      ? false
      : const Flag().fromJson(json['builtIn']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$RoleToJson(_Role instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'permissions': instance.permissions.map(const Str().toJson).toList(),
  'builtIn': ?const Flag().toJson(instance.builtIn),
};

_Branch _$BranchFromJson(Map<String, dynamic> json) => _Branch(
  id: const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  address: json['address'] == null ? '' : const Str().fromJson(json['address']),
  phone: json['phone'] == null ? '' : const Str().fromJson(json['phone']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$BranchToJson(_Branch instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'address': ?const Str().toJson(instance.address),
  'phone': ?const Str().toJson(instance.phone),
};
