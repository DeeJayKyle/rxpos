// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sale.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Allocation _$AllocationFromJson(Map<String, dynamic> json) => _Allocation(
  batchId: const OptStr().fromJson(json['batchId']),
  qty: json['qty'] == null ? 0 : const Num().fromJson(json['qty']),
  batch: json['batch'] == null ? '' : const Str().fromJson(json['batch']),
  expiry: json['expiry'] == null ? '' : const Str().fromJson(json['expiry']),
);

Map<String, dynamic> _$AllocationToJson(_Allocation instance) =>
    <String, dynamic>{
      'batchId': ?const OptStr().toJson(instance.batchId),
      'qty': ?const Num().toJson(instance.qty),
      'batch': ?const Str().toJson(instance.batch),
      'expiry': ?const Str().toJson(instance.expiry),
    };

_SalePack _$SalePackFromJson(Map<String, dynamic> json) => _SalePack(
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  size: json['size'] == null ? 1 : const Num().fromJson(json['size']),
  count: json['count'] == null ? 0 : const Num().fromJson(json['count']),
  price: json['price'] == null ? 0 : const Num().fromJson(json['price']),
);

Map<String, dynamic> _$SalePackToJson(_SalePack instance) => <String, dynamic>{
  'name': ?const Str().toJson(instance.name),
  'size': ?const Num().toJson(instance.size),
  'count': ?const Num().toJson(instance.count),
  'price': ?const Num().toJson(instance.price),
};

_SaleItem _$SaleItemFromJson(Map<String, dynamic> json) => _SaleItem(
  id: json['id'] == null ? '' : const Str().fromJson(json['id']),
  name: json['name'] == null ? '' : const Str().fromJson(json['name']),
  price: json['price'] == null ? 0 : const Num().fromJson(json['price']),
  cost: json['cost'] == null ? 0 : const Num().fromJson(json['cost']),
  qty: json['qty'] == null ? 0 : const Num().fromJson(json['qty']),
  discount: json['discount'] == null
      ? 0
      : const Num().fromJson(json['discount']),
  controlled: json['controlled'] == null
      ? false
      : const Flag().fromJson(json['controlled']),
  pack: json['pack'] == null
      ? null
      : SalePack.fromJson(json['pack'] as Map<String, dynamic>),
  alloc:
      (json['alloc'] as List<dynamic>?)
          ?.map((e) => Allocation.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <Allocation>[],
  directions: json['directions'] as Map<String, dynamic>?,
);

Map<String, dynamic> _$SaleItemToJson(_SaleItem instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'name': ?const Str().toJson(instance.name),
  'price': ?const Num().toJson(instance.price),
  'cost': ?const Num().toJson(instance.cost),
  'qty': ?const Num().toJson(instance.qty),
  'discount': ?const Num().toJson(instance.discount),
  'controlled': ?const Flag().toJson(instance.controlled),
  'pack': ?instance.pack?.toJson(),
  'alloc': instance.alloc.map((e) => e.toJson()).toList(),
  'directions': ?instance.directions?.map(
    (k, e) => MapEntry(const Str().toJson(k), e),
  ),
};

_Sale _$SaleFromJson(Map<String, dynamic> json) => _Sale(
  id: const Str().fromJson(json['id']),
  number: json['number'] == null ? '' : const Str().fromJson(json['number']),
  date: json['date'] == null ? '' : const Str().fromJson(json['date']),
  type: json['type'] == null ? 'retail' : const Str().fromJson(json['type']),
  branchId: json['branchId'] == null
      ? 'main'
      : const Str().fromJson(json['branchId']),
  items:
      (json['items'] as List<dynamic>?)
          ?.map((e) => SaleItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <SaleItem>[],
  subtotal: json['subtotal'] == null
      ? 0
      : const Num().fromJson(json['subtotal']),
  discount: json['discount'] == null
      ? 0
      : const Num().fromJson(json['discount']),
  tax: json['tax'] == null ? 0 : const Num().fromJson(json['tax']),
  total: json['total'] == null ? 0 : const Num().fromJson(json['total']),
  payment: json['payment'] == null ? '' : const Str().fromJson(json['payment']),
  paid: json['paid'] == null ? 0 : const Num().fromJson(json['paid']),
  tendered: json['tendered'] == null
      ? 0
      : const Num().fromJson(json['tendered']),
  bankId: json['bankId'] == null ? '' : const Str().fromJson(json['bankId']),
  customerId: json['customerId'] == null
      ? 'walk-in'
      : const Str().fromJson(json['customerId']),
  customerName: json['customerName'] == null
      ? ''
      : const Str().fromJson(json['customerName']),
  cashier: json['cashier'] == null ? '' : const Str().fromJson(json['cashier']),
  status: json['status'] == null
      ? 'completed'
      : const Str().fromJson(json['status']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$SaleToJson(_Sale instance) => <String, dynamic>{
  'id': ?const Str().toJson(instance.id),
  'number': ?const Str().toJson(instance.number),
  'date': ?const Str().toJson(instance.date),
  'type': ?const Str().toJson(instance.type),
  'branchId': ?const Str().toJson(instance.branchId),
  'items': instance.items.map((e) => e.toJson()).toList(),
  'subtotal': ?const Num().toJson(instance.subtotal),
  'discount': ?const Num().toJson(instance.discount),
  'tax': ?const Num().toJson(instance.tax),
  'total': ?const Num().toJson(instance.total),
  'payment': ?const Str().toJson(instance.payment),
  'paid': ?const Num().toJson(instance.paid),
  'tendered': ?const Num().toJson(instance.tendered),
  'bankId': ?const Str().toJson(instance.bankId),
  'customerId': ?const Str().toJson(instance.customerId),
  'customerName': ?const Str().toJson(instance.customerName),
  'cashier': ?const Str().toJson(instance.cashier),
  'status': ?const Str().toJson(instance.status),
};
