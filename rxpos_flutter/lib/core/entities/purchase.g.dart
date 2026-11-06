// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'purchase.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PurchasePack _$PurchasePackFromJson(Map<String, dynamic> json) =>
    _PurchasePack(
      name: json['name'] == null ? '' : const Str().fromJson(json['name']),
      size: json['size'] == null ? 1 : const Num().fromJson(json['size']),
      count: json['count'] == null ? 0 : const Num().fromJson(json['count']),
      cost: json['cost'] == null ? 0 : const Num().fromJson(json['cost']),
    );

Map<String, dynamic> _$PurchasePackToJson(_PurchasePack instance) =>
    <String, dynamic>{
      'name': ?const Str().toJson(instance.name),
      'size': ?const Num().toJson(instance.size),
      'count': ?const Num().toJson(instance.count),
      'cost': ?const Num().toJson(instance.cost),
    };

_PurchaseItem _$PurchaseItemFromJson(
  Map<String, dynamic> json,
) => _PurchaseItem(
  productId: json['productId'] == null
      ? ''
      : const Str().fromJson(json['productId']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  qty: json['qty'] == null ? 0 : const Num().fromJson(json['qty']),
  cost: json['cost'] == null ? 0 : const Num().fromJson(json['cost']),
  batch: json['batch'] == null ? '' : const Str().fromJson(json['batch']),
  expiry: json['expiry'] == null ? '' : const Str().fromJson(json['expiry']),
  batchId: const OptStr().fromJson(json['batchId']),
  pack: json['pack'] == null
      ? null
      : PurchasePack.fromJson(json['pack'] as Map<String, dynamic>),
  added: json['added'] == null ? false : const Flag().fromJson(json['added']),
);

Map<String, dynamic> _$PurchaseItemToJson(_PurchaseItem instance) =>
    <String, dynamic>{
      'productId': ?const Str().toJson(instance.productId),
      'name': ?const Str().toJson(instance.name),
      'qty': ?const Num().toJson(instance.qty),
      'cost': ?const Num().toJson(instance.cost),
      'batch': ?const Str().toJson(instance.batch),
      'expiry': ?const Str().toJson(instance.expiry),
      'batchId': ?const OptStr().toJson(instance.batchId),
      'pack': ?instance.pack?.toJson(),
      'added': ?const Flag().toJson(instance.added),
    };

_Purchase _$PurchaseFromJson(Map<String, dynamic> json) => _Purchase(
  id: const Str().fromJson(json['id']),
  number: json['number'] == null ? '' : const Str().fromJson(json['number']),
  supplierId: json['supplierId'] == null
      ? ''
      : const Str().fromJson(json['supplierId']),
  supplierName: json['supplierName'] == null
      ? ''
      : const Str().fromJson(json['supplierName']),
  invoice: json['invoice'] == null ? '' : const Str().fromJson(json['invoice']),
  notes: json['notes'] == null ? '' : const Str().fromJson(json['notes']),
  date: json['date'] == null ? '' : const Str().fromJson(json['date']),
  receivedBy: json['receivedBy'] == null
      ? ''
      : const Str().fromJson(json['receivedBy']),
  total: json['total'] == null ? 0 : const Num().fromJson(json['total']),
  paid: json['paid'] == null ? 0 : const Num().fromJson(json['paid']),
  bankId: json['bankId'] == null ? '' : const Str().fromJson(json['bankId']),
  branchId: json['branchId'] == null
      ? 'main'
      : const Str().fromJson(json['branchId']),
  items:
      (json['items'] as List<dynamic>?)
          ?.map((e) => PurchaseItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <PurchaseItem>[],
  scanned: json['scanned'] == null
      ? false
      : const Flag().fromJson(json['scanned']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$PurchaseToJson(_Purchase instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'number': ?const Str().toJson(instance.number),
  'supplierId': ?const Str().toJson(instance.supplierId),
  'supplierName': ?const Str().toJson(instance.supplierName),
  'invoice': ?const Str().toJson(instance.invoice),
  'notes': ?const Str().toJson(instance.notes),
  'date': ?const Str().toJson(instance.date),
  'receivedBy': ?const Str().toJson(instance.receivedBy),
  'total': ?const Num().toJson(instance.total),
  'paid': ?const Num().toJson(instance.paid),
  'bankId': ?const Str().toJson(instance.bankId),
  'branchId': ?const Str().toJson(instance.branchId),
  'items': instance.items.map((e) => e.toJson()).toList(),
  'scanned': ?const Flag().toJson(instance.scanned),
};
