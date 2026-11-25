// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'purchase.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PurchasePack {

 String get name; double get size; double get count; double get cost;
/// Create a copy of PurchasePack
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PurchasePackCopyWith<PurchasePack> get copyWith => _$PurchasePackCopyWithImpl<PurchasePack>(this as PurchasePack, _$identity);

  /// Serializes this PurchasePack to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PurchasePack;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PurchasePack&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.size, _this.size) || other.size == _this.size)&&(identical(other.count, _this.count) || other.count == _this.count)&&(identical(other.cost, _this.cost) || other.cost == _this.cost));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PurchasePack;
  return Object.hash(runtimeType,_this.name,_this.size,_this.count,_this.cost);
}

@override
String toString() {
  final _this = this as PurchasePack;
  return 'PurchasePack(name: ${_this.name}, size: ${_this.size}, count: ${_this.count}, cost: ${_this.cost})';
}


}

/// @nodoc
abstract mixin class $PurchasePackCopyWith<$Res>  {
  factory $PurchasePackCopyWith(PurchasePack value, $Res Function(PurchasePack) _then) = _$PurchasePackCopyWithImpl;
@useResult
$Res call({
 String name, double size, double count, double cost
});




}
/// @nodoc
class _$PurchasePackCopyWithImpl<$Res>
    implements $PurchasePackCopyWith<$Res> {
  _$PurchasePackCopyWithImpl(this._self, this._then);

  final PurchasePack _self;
  final $Res Function(PurchasePack) _then;

/// Create a copy of PurchasePack
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? size = null,Object? count = null,Object? cost = null,}) {
  return _then(PurchasePack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [PurchasePack].
extension PurchasePackPatterns on PurchasePack {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PurchasePack value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PurchasePack() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PurchasePack value)  $default,){
final _that = this;
switch (_that) {
case _PurchasePack():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PurchasePack value)?  $default,){
final _that = this;
switch (_that) {
case _PurchasePack() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  double size,  double count,  double cost)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PurchasePack() when $default != null:
return $default(_that.name,_that.size,_that.count,_that.cost);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  double size,  double count,  double cost)  $default,) {final _that = this;
switch (_that) {
case _PurchasePack():
return $default(_that.name,_that.size,_that.count,_that.cost);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  double size,  double count,  double cost)?  $default,) {final _that = this;
switch (_that) {
case _PurchasePack() when $default != null:
return $default(_that.name,_that.size,_that.count,_that.cost);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _PurchasePack implements PurchasePack {
  const _PurchasePack({this.name = '', this.size = 1, this.count = 0, this.cost = 0});
  factory _PurchasePack.fromJson(Map<String, dynamic> json) => _$PurchasePackFromJson(json);

@override@JsonKey() final  String name;
@override@JsonKey() final  double size;
@override@JsonKey() final  double count;
@override@JsonKey() final  double cost;

/// Create a copy of PurchasePack
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PurchasePackCopyWith<_PurchasePack> get copyWith => __$PurchasePackCopyWithImpl<_PurchasePack>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PurchasePackToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PurchasePack&&(identical(other.name, name) || other.name == name)&&(identical(other.size, size) || other.size == size)&&(identical(other.count, count) || other.count == count)&&(identical(other.cost, cost) || other.cost == cost));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,name,size,count,cost);
}

@override
String toString() {
    return 'PurchasePack(name: $name, size: $size, count: $count, cost: $cost)';
}


}

/// @nodoc
abstract mixin class _$PurchasePackCopyWith<$Res> implements $PurchasePackCopyWith<$Res> {
  factory _$PurchasePackCopyWith(_PurchasePack value, $Res Function(_PurchasePack) _then) = __$PurchasePackCopyWithImpl;
@override @useResult
$Res call({
 String name, double size, double count, double cost
});




}
/// @nodoc
class __$PurchasePackCopyWithImpl<$Res>
    implements _$PurchasePackCopyWith<$Res> {
  __$PurchasePackCopyWithImpl(this._self, this._then);

  final _PurchasePack _self;
  final $Res Function(_PurchasePack) _then;

/// Create a copy of PurchasePack
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? size = null,Object? count = null,Object? cost = null,}) {
  return _then(_PurchasePack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$PurchaseItem {

 String get productId; String get name; double get qty; double get cost; String get batch; String get expiry; String? get batchId; PurchasePack? get pack; bool get added;
/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PurchaseItemCopyWith<PurchaseItem> get copyWith => _$PurchaseItemCopyWithImpl<PurchaseItem>(this as PurchaseItem, _$identity);

  /// Serializes this PurchaseItem to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PurchaseItem;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PurchaseItem&&(identical(other.productId, _this.productId) || other.productId == _this.productId)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.qty, _this.qty) || other.qty == _this.qty)&&(identical(other.cost, _this.cost) || other.cost == _this.cost)&&(identical(other.batch, _this.batch) || other.batch == _this.batch)&&(identical(other.expiry, _this.expiry) || other.expiry == _this.expiry)&&(identical(other.batchId, _this.batchId) || other.batchId == _this.batchId)&&(identical(other.pack, _this.pack) || other.pack == _this.pack)&&(identical(other.added, _this.added) || other.added == _this.added));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PurchaseItem;
  return Object.hash(runtimeType,_this.productId,_this.name,_this.qty,_this.cost,_this.batch,_this.expiry,_this.batchId,_this.pack,_this.added);
}

@override
String toString() {
  final _this = this as PurchaseItem;
  return 'PurchaseItem(productId: ${_this.productId}, name: ${_this.name}, qty: ${_this.qty}, cost: ${_this.cost}, batch: ${_this.batch}, expiry: ${_this.expiry}, batchId: ${_this.batchId}, pack: ${_this.pack}, added: ${_this.added})';
}


}

/// @nodoc
abstract mixin class $PurchaseItemCopyWith<$Res>  {
  factory $PurchaseItemCopyWith(PurchaseItem value, $Res Function(PurchaseItem) _then) = _$PurchaseItemCopyWithImpl;
@useResult
$Res call({
 String productId, String name, double qty, double cost, String batch, String expiry, String? batchId, PurchasePack? pack, bool added
});


$PurchasePackCopyWith<$Res>? get pack;

}
/// @nodoc
class _$PurchaseItemCopyWithImpl<$Res>
    implements $PurchaseItemCopyWith<$Res> {
  _$PurchaseItemCopyWithImpl(this._self, this._then);

  final PurchaseItem _self;
  final $Res Function(PurchaseItem) _then;

/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? productId = null,Object? name = null,Object? qty = null,Object? cost = null,Object? batch = null,Object? expiry = null,Object? batchId = freezed,Object? pack = freezed,Object? added = null,}) {
  return _then(PurchaseItem(
productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,pack: freezed == pack ? _self.pack : pack // ignore: cast_nullable_to_non_nullable
as PurchasePack?,added: null == added ? _self.added : added // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}
/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PurchasePackCopyWith<$Res>? get pack {
    if (_self.pack == null) {
    return null;
  }

  return $PurchasePackCopyWith<$Res>(_self.pack!, (value) {
    return _then(_self.copyWith(pack: value));
  });
}
}


/// Adds pattern-matching-related methods to [PurchaseItem].
extension PurchaseItemPatterns on PurchaseItem {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PurchaseItem value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PurchaseItem() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PurchaseItem value)  $default,){
final _that = this;
switch (_that) {
case _PurchaseItem():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PurchaseItem value)?  $default,){
final _that = this;
switch (_that) {
case _PurchaseItem() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String productId,  String name,  double qty,  double cost,  String batch,  String expiry,  String? batchId,  PurchasePack? pack,  bool added)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PurchaseItem() when $default != null:
return $default(_that.productId,_that.name,_that.qty,_that.cost,_that.batch,_that.expiry,_that.batchId,_that.pack,_that.added);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String productId,  String name,  double qty,  double cost,  String batch,  String expiry,  String? batchId,  PurchasePack? pack,  bool added)  $default,) {final _that = this;
switch (_that) {
case _PurchaseItem():
return $default(_that.productId,_that.name,_that.qty,_that.cost,_that.batch,_that.expiry,_that.batchId,_that.pack,_that.added);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String productId,  String name,  double qty,  double cost,  String batch,  String expiry,  String? batchId,  PurchasePack? pack,  bool added)?  $default,) {final _that = this;
switch (_that) {
case _PurchaseItem() when $default != null:
return $default(_that.productId,_that.name,_that.qty,_that.cost,_that.batch,_that.expiry,_that.batchId,_that.pack,_that.added);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _PurchaseItem implements PurchaseItem {
  const _PurchaseItem({this.productId = '', this.name = '', this.qty = 0, this.cost = 0, this.batch = '', this.expiry = '', this.batchId, this.pack, this.added = false});
  factory _PurchaseItem.fromJson(Map<String, dynamic> json) => _$PurchaseItemFromJson(json);

@override@JsonKey() final  String productId;
@override@JsonKey() final  String name;
@override@JsonKey() final  double qty;
@override@JsonKey() final  double cost;
@override@JsonKey() final  String batch;
@override@JsonKey() final  String expiry;
@override final  String? batchId;
@override final  PurchasePack? pack;
@override@JsonKey() final  bool added;

/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PurchaseItemCopyWith<_PurchaseItem> get copyWith => __$PurchaseItemCopyWithImpl<_PurchaseItem>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PurchaseItemToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PurchaseItem&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.name, name) || other.name == name)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.cost, cost) || other.cost == cost)&&(identical(other.batch, batch) || other.batch == batch)&&(identical(other.expiry, expiry) || other.expiry == expiry)&&(identical(other.batchId, batchId) || other.batchId == batchId)&&(identical(other.pack, pack) || other.pack == pack)&&(identical(other.added, added) || other.added == added));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,productId,name,qty,cost,batch,expiry,batchId,pack,added);
}

@override
String toString() {
    return 'PurchaseItem(productId: $productId, name: $name, qty: $qty, cost: $cost, batch: $batch, expiry: $expiry, batchId: $batchId, pack: $pack, added: $added)';
}


}

/// @nodoc
abstract mixin class _$PurchaseItemCopyWith<$Res> implements $PurchaseItemCopyWith<$Res> {
  factory _$PurchaseItemCopyWith(_PurchaseItem value, $Res Function(_PurchaseItem) _then) = __$PurchaseItemCopyWithImpl;
@override @useResult
$Res call({
 String productId, String name, double qty, double cost, String batch, String expiry, String? batchId, PurchasePack? pack, bool added
});


@override $PurchasePackCopyWith<$Res>? get pack;

}
/// @nodoc
class __$PurchaseItemCopyWithImpl<$Res>
    implements _$PurchaseItemCopyWith<$Res> {
  __$PurchaseItemCopyWithImpl(this._self, this._then);

  final _PurchaseItem _self;
  final $Res Function(_PurchaseItem) _then;

/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? productId = null,Object? name = null,Object? qty = null,Object? cost = null,Object? batch = null,Object? expiry = null,Object? batchId = freezed,Object? pack = freezed,Object? added = null,}) {
  return _then(_PurchaseItem(
productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,pack: freezed == pack ? _self.pack : pack // ignore: cast_nullable_to_non_nullable
as PurchasePack?,added: null == added ? _self.added : added // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

/// Create a copy of PurchaseItem
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PurchasePackCopyWith<$Res>? get pack {
    if (_self.pack == null) {
    return null;
  }

  return $PurchasePackCopyWith<$Res>(_self.pack!, (value) {
    return _then(_self.copyWith(pack: value));
  });
}
}


/// @nodoc
mixin _$Purchase {

 String get id; String get number; String get supplierId; String get supplierName; String get invoice; String get notes; String get date; String get receivedBy; double get total; double get paid; String get bankId; String get branchId; List<PurchaseItem> get items; bool get scanned;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Purchase
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PurchaseCopyWith<Purchase> get copyWith => _$PurchaseCopyWithImpl<Purchase>(this as Purchase, _$identity);

  /// Serializes this Purchase to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Purchase;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Purchase&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.number, _this.number) || other.number == _this.number)&&(identical(other.supplierId, _this.supplierId) || other.supplierId == _this.supplierId)&&(identical(other.supplierName, _this.supplierName) || other.supplierName == _this.supplierName)&&(identical(other.invoice, _this.invoice) || other.invoice == _this.invoice)&&(identical(other.notes, _this.notes) || other.notes == _this.notes)&&(identical(other.date, _this.date) || other.date == _this.date)&&(identical(other.receivedBy, _this.receivedBy) || other.receivedBy == _this.receivedBy)&&(identical(other.total, _this.total) || other.total == _this.total)&&(identical(other.paid, _this.paid) || other.paid == _this.paid)&&(identical(other.bankId, _this.bankId) || other.bankId == _this.bankId)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&const DeepCollectionEquality().equals(other.items, _this.items)&&(identical(other.scanned, _this.scanned) || other.scanned == _this.scanned)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Purchase;
  return Object.hash(runtimeType,_this.id,_this.number,_this.supplierId,_this.supplierName,_this.invoice,_this.notes,_this.date,_this.receivedBy,_this.total,_this.paid,_this.bankId,_this.branchId,const DeepCollectionEquality().hash(_this.items),_this.scanned,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Purchase;
  return 'Purchase(id: ${_this.id}, number: ${_this.number}, supplierId: ${_this.supplierId}, supplierName: ${_this.supplierName}, invoice: ${_this.invoice}, notes: ${_this.notes}, date: ${_this.date}, receivedBy: ${_this.receivedBy}, total: ${_this.total}, paid: ${_this.paid}, bankId: ${_this.bankId}, branchId: ${_this.branchId}, items: ${_this.items}, scanned: ${_this.scanned}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $PurchaseCopyWith<$Res>  {
  factory $PurchaseCopyWith(Purchase value, $Res Function(Purchase) _then) = _$PurchaseCopyWithImpl;
@useResult
$Res call({
 String id, String number, String supplierId, String supplierName, String invoice, String notes, String date, String receivedBy, double total, double paid, String bankId, String branchId, List<PurchaseItem> items, bool scanned,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$PurchaseCopyWithImpl<$Res>
    implements $PurchaseCopyWith<$Res> {
  _$PurchaseCopyWithImpl(this._self, this._then);

  final Purchase _self;
  final $Res Function(Purchase) _then;

/// Create a copy of Purchase
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? number = null,Object? supplierId = null,Object? supplierName = null,Object? invoice = null,Object? notes = null,Object? date = null,Object? receivedBy = null,Object? total = null,Object? paid = null,Object? bankId = null,Object? branchId = null,Object? items = null,Object? scanned = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Purchase(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,number: null == number ? _self.number : number // ignore: cast_nullable_to_non_nullable
as String,supplierId: null == supplierId ? _self.supplierId : supplierId // ignore: cast_nullable_to_non_nullable
as String,supplierName: null == supplierName ? _self.supplierName : supplierName // ignore: cast_nullable_to_non_nullable
as String,invoice: null == invoice ? _self.invoice : invoice // ignore: cast_nullable_to_non_nullable
as String,notes: null == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,receivedBy: null == receivedBy ? _self.receivedBy : receivedBy // ignore: cast_nullable_to_non_nullable
as String,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,paid: null == paid ? _self.paid : paid // ignore: cast_nullable_to_non_nullable
as double,bankId: null == bankId ? _self.bankId : bankId // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<PurchaseItem>,scanned: null == scanned ? _self.scanned : scanned // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Purchase].
extension PurchasePatterns on Purchase {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Purchase value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Purchase() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Purchase value)  $default,){
final _that = this;
switch (_that) {
case _Purchase():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Purchase value)?  $default,){
final _that = this;
switch (_that) {
case _Purchase() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String number,  String supplierId,  String supplierName,  String invoice,  String notes,  String date,  String receivedBy,  double total,  double paid,  String bankId,  String branchId,  List<PurchaseItem> items,  bool scanned, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Purchase() when $default != null:
return $default(_that.id,_that.number,_that.supplierId,_that.supplierName,_that.invoice,_that.notes,_that.date,_that.receivedBy,_that.total,_that.paid,_that.bankId,_that.branchId,_that.items,_that.scanned,_that.updatedAt,_that.raw);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String number,  String supplierId,  String supplierName,  String invoice,  String notes,  String date,  String receivedBy,  double total,  double paid,  String bankId,  String branchId,  List<PurchaseItem> items,  bool scanned, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Purchase():
return $default(_that.id,_that.number,_that.supplierId,_that.supplierName,_that.invoice,_that.notes,_that.date,_that.receivedBy,_that.total,_that.paid,_that.bankId,_that.branchId,_that.items,_that.scanned,_that.updatedAt,_that.raw);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String number,  String supplierId,  String supplierName,  String invoice,  String notes,  String date,  String receivedBy,  double total,  double paid,  String bankId,  String branchId,  List<PurchaseItem> items,  bool scanned, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Purchase() when $default != null:
return $default(_that.id,_that.number,_that.supplierId,_that.supplierName,_that.invoice,_that.notes,_that.date,_that.receivedBy,_that.total,_that.paid,_that.bankId,_that.branchId,_that.items,_that.scanned,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Purchase extends Purchase {
  const _Purchase({required this.id, this.number = '', this.supplierId = '', this.supplierName = '', this.invoice = '', this.notes = '', this.date = '', this.receivedBy = '', this.total = 0, this.paid = 0, this.bankId = '', this.branchId = 'main',  List<PurchaseItem> items = const <PurchaseItem>[], this.scanned = false, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _items = items,_raw = raw,super._();
  factory _Purchase.fromJson(Map<String, dynamic> json) => _$PurchaseFromJson(json);

@override final  String id;
@override@JsonKey() final  String number;
@override@JsonKey() final  String supplierId;
@override@JsonKey() final  String supplierName;
@override@JsonKey() final  String invoice;
@override@JsonKey() final  String notes;
@override@JsonKey() final  String date;
@override@JsonKey() final  String receivedBy;
@override@JsonKey() final  double total;
@override@JsonKey() final  double paid;
@override@JsonKey() final  String bankId;
@override@JsonKey() final  String branchId;
 final  List<PurchaseItem> _items;
@override@JsonKey() List<PurchaseItem> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

@override@JsonKey() final  bool scanned;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Purchase
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PurchaseCopyWith<_Purchase> get copyWith => __$PurchaseCopyWithImpl<_Purchase>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PurchaseToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Purchase&&(identical(other.id, id) || other.id == id)&&(identical(other.number, number) || other.number == number)&&(identical(other.supplierId, supplierId) || other.supplierId == supplierId)&&(identical(other.supplierName, supplierName) || other.supplierName == supplierName)&&(identical(other.invoice, invoice) || other.invoice == invoice)&&(identical(other.notes, notes) || other.notes == notes)&&(identical(other.date, date) || other.date == date)&&(identical(other.receivedBy, receivedBy) || other.receivedBy == receivedBy)&&(identical(other.total, total) || other.total == total)&&(identical(other.paid, paid) || other.paid == paid)&&(identical(other.bankId, bankId) || other.bankId == bankId)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&const DeepCollectionEquality().equals(other.items, _items)&&(identical(other.scanned, scanned) || other.scanned == scanned)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,number,supplierId,supplierName,invoice,notes,date,receivedBy,total,paid,bankId,branchId,const DeepCollectionEquality().hash(_items),scanned,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Purchase(id: $id, number: $number, supplierId: $supplierId, supplierName: $supplierName, invoice: $invoice, notes: $notes, date: $date, receivedBy: $receivedBy, total: $total, paid: $paid, bankId: $bankId, branchId: $branchId, items: $items, scanned: $scanned, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$PurchaseCopyWith<$Res> implements $PurchaseCopyWith<$Res> {
  factory _$PurchaseCopyWith(_Purchase value, $Res Function(_Purchase) _then) = __$PurchaseCopyWithImpl;
@override @useResult
$Res call({
 String id, String number, String supplierId, String supplierName, String invoice, String notes, String date, String receivedBy, double total, double paid, String bankId, String branchId, List<PurchaseItem> items, bool scanned,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$PurchaseCopyWithImpl<$Res>
    implements _$PurchaseCopyWith<$Res> {
  __$PurchaseCopyWithImpl(this._self, this._then);

  final _Purchase _self;
  final $Res Function(_Purchase) _then;

/// Create a copy of Purchase
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? number = null,Object? supplierId = null,Object? supplierName = null,Object? invoice = null,Object? notes = null,Object? date = null,Object? receivedBy = null,Object? total = null,Object? paid = null,Object? bankId = null,Object? branchId = null,Object? items = null,Object? scanned = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Purchase(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,number: null == number ? _self.number : number // ignore: cast_nullable_to_non_nullable
as String,supplierId: null == supplierId ? _self.supplierId : supplierId // ignore: cast_nullable_to_non_nullable
as String,supplierName: null == supplierName ? _self.supplierName : supplierName // ignore: cast_nullable_to_non_nullable
as String,invoice: null == invoice ? _self.invoice : invoice // ignore: cast_nullable_to_non_nullable
as String,notes: null == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,receivedBy: null == receivedBy ? _self.receivedBy : receivedBy // ignore: cast_nullable_to_non_nullable
as String,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,paid: null == paid ? _self.paid : paid // ignore: cast_nullable_to_non_nullable
as double,bankId: null == bankId ? _self.bankId : bankId // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<PurchaseItem>,scanned: null == scanned ? _self.scanned : scanned // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
