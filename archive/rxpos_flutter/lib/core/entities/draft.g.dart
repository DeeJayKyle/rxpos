// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'draft.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Draft _$DraftFromJson(Map<String, dynamic> json) => _Draft(
  id: const Str().fromJson(json['id']),
  kind: json['kind'] == null ? 'sale' : const Str().fromJson(json['kind']),
  branchId: json['branchId'] == null
      ? 'main'
      : const Str().fromJson(json['branchId']),
  mode: json['mode'] == null ? '' : const Str().fromJson(json['mode']),
  userId: json['userId'] == null ? '' : const Str().fromJson(json['userId']),
  userName: json['userName'] == null
      ? ''
      : const Str().fromJson(json['userName']),
  order: json['order'] == null ? 0 : const Num().fromJson(json['order']),
  startedAt: json['startedAt'] == null
      ? ''
      : const Str().fromJson(json['startedAt']),
  title: json['title'] == null ? '' : const Str().fromJson(json['title']),
  count: json['count'] == null ? 0 : const Num().fromJson(json['count']),
  total: json['total'] == null ? 0 : const Num().fromJson(json['total']),
  data: json['data'] as Map<String, dynamic>?,
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$DraftToJson(_Draft instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'kind': ?const Str().toJson(instance.kind),
  'branchId': ?const Str().toJson(instance.branchId),
  'mode': ?const Str().toJson(instance.mode),
  'userId': ?const Str().toJson(instance.userId),
  'userName': ?const Str().toJson(instance.userName),
  'order': ?const Num().toJson(instance.order),
  'startedAt': ?const Str().toJson(instance.startedAt),
  'title': ?const Str().toJson(instance.title),
  'count': ?const Num().toJson(instance.count),
  'total': ?const Num().toJson(instance.total),
  'data': ?instance.data?.map((k, e) => MapEntry(const Str().toJson(k), e)),
};
