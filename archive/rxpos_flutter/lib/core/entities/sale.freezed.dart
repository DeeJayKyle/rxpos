// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'sale.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Allocation {

 String? get batchId; double get qty; String get batch; String get expiry;
/// Create a copy of Allocation
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AllocationCopyWith<Allocation> get copyWith => _$AllocationCopyWithImpl<Allocation>(this as Allocation, _$identity);

  /// Serializes this Allocation to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Allocation;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Allocation&&(identical(other.batchId, _this.batchId) || other.batchId == _this.batchId)&&(identical(other.qty, _this.qty) || other.qty == _this.qty)&&(identical(other.batch, _this.batch) || other.batch == _this.batch)&&(identical(other.expiry, _this.expiry) || other.expiry == _this.expiry));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Allocation;
  return Object.hash(runtimeType,_this.batchId,_this.qty,_this.batch,_this.expiry);
}

@override
String toString() {
  final _this = this as Allocation;
  return 'Allocation(batchId: ${_this.batchId}, qty: ${_this.qty}, batch: ${_this.batch}, expiry: ${_this.expiry})';
}


}

/// @nodoc
abstract mixin class $AllocationCopyWith<$Res>  {
  factory $AllocationCopyWith(Allocation value, $Res Function(Allocation) _then) = _$AllocationCopyWithImpl;
@useResult
$Res call({
 String? batchId, double qty, String batch, String expiry
});




}
/// @nodoc
class _$AllocationCopyWithImpl<$Res>
    implements $AllocationCopyWith<$Res> {
  _$AllocationCopyWithImpl(this._self, this._then);

  final Allocation _self;
  final $Res Function(Allocation) _then;

/// Create a copy of Allocation
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? batchId = freezed,Object? qty = null,Object? batch = null,Object? expiry = null,}) {
  return _then(Allocation(
batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [Allocation].
extension AllocationPatterns on Allocation {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Allocation value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Allocation() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Allocation value)  $default,){
final _that = this;
switch (_that) {
case _Allocation():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Allocation value)?  $default,){
final _that = this;
switch (_that) {
case _Allocation() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? batchId,  double qty,  String batch,  String expiry)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Allocation() when $default != null:
return $default(_that.batchId,_that.qty,_that.batch,_that.expiry);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? batchId,  double qty,  String batch,  String expiry)  $default,) {final _that = this;
switch (_that) {
case _Allocation():
return $default(_that.batchId,_that.qty,_that.batch,_that.expiry);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? batchId,  double qty,  String batch,  String expiry)?  $default,) {final _that = this;
switch (_that) {
case _Allocation() when $default != null:
return $default(_that.batchId,_that.qty,_that.batch,_that.expiry);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Allocation implements Allocation {
  const _Allocation({this.batchId, this.qty = 0, this.batch = '', this.expiry = ''});
  factory _Allocation.fromJson(Map<String, dynamic> json) => _$AllocationFromJson(json);

@override final  String? batchId;
@override@JsonKey() final  double qty;
@override@JsonKey() final  String batch;
@override@JsonKey() final  String expiry;

/// Create a copy of Allocation
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AllocationCopyWith<_Allocation> get copyWith => __$AllocationCopyWithImpl<_Allocation>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AllocationToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Allocation&&(identical(other.batchId, batchId) || other.batchId == batchId)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.batch, batch) || other.batch == batch)&&(identical(other.expiry, expiry) || other.expiry == expiry));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,batchId,qty,batch,expiry);
}

@override
String toString() {
    return 'Allocation(batchId: $batchId, qty: $qty, batch: $batch, expiry: $expiry)';
}


}

/// @nodoc
abstract mixin class _$AllocationCopyWith<$Res> implements $AllocationCopyWith<$Res> {
  factory _$AllocationCopyWith(_Allocation value, $Res Function(_Allocation) _then) = __$AllocationCopyWithImpl;
@override @useResult
$Res call({
 String? batchId, double qty, String batch, String expiry
});




}
/// @nodoc
class __$AllocationCopyWithImpl<$Res>
    implements _$AllocationCopyWith<$Res> {
  __$AllocationCopyWithImpl(this._self, this._then);

  final _Allocation _self;
  final $Res Function(_Allocation) _then;

/// Create a copy of Allocation
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? batchId = freezed,Object? qty = null,Object? batch = null,Object? expiry = null,}) {
  return _then(_Allocation(
batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$SalePack {

 String get name; double get size; double get count; double get price;
/// Create a copy of SalePack
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SalePackCopyWith<SalePack> get copyWith => _$SalePackCopyWithImpl<SalePack>(this as SalePack, _$identity);

  /// Serializes this SalePack to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as SalePack;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SalePack&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.size, _this.size) || other.size == _this.size)&&(identical(other.count, _this.count) || other.count == _this.count)&&(identical(other.price, _this.price) || other.price == _this.price));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as SalePack;
  return Object.hash(runtimeType,_this.name,_this.size,_this.count,_this.price);
}

@override
String toString() {
  final _this = this as SalePack;
  return 'SalePack(name: ${_this.name}, size: ${_this.size}, count: ${_this.count}, price: ${_this.price})';
}


}

/// @nodoc
abstract mixin class $SalePackCopyWith<$Res>  {
  factory $SalePackCopyWith(SalePack value, $Res Function(SalePack) _then) = _$SalePackCopyWithImpl;
@useResult
$Res call({
 String name, double size, double count, double price
});




}
/// @nodoc
class _$SalePackCopyWithImpl<$Res>
    implements $SalePackCopyWith<$Res> {
  _$SalePackCopyWithImpl(this._self, this._then);

  final SalePack _self;
  final $Res Function(SalePack) _then;

/// Create a copy of SalePack
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? size = null,Object? count = null,Object? price = null,}) {
  return _then(SalePack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [SalePack].
extension SalePackPatterns on SalePack {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SalePack value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SalePack() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SalePack value)  $default,){
final _that = this;
switch (_that) {
case _SalePack():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SalePack value)?  $default,){
final _that = this;
switch (_that) {
case _SalePack() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  double size,  double count,  double price)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SalePack() when $default != null:
return $default(_that.name,_that.size,_that.count,_that.price);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  double size,  double count,  double price)  $default,) {final _that = this;
switch (_that) {
case _SalePack():
return $default(_that.name,_that.size,_that.count,_that.price);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  double size,  double count,  double price)?  $default,) {final _that = this;
switch (_that) {
case _SalePack() when $default != null:
return $default(_that.name,_that.size,_that.count,_that.price);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _SalePack implements SalePack {
  const _SalePack({this.name = '', this.size = 1, this.count = 0, this.price = 0});
  factory _SalePack.fromJson(Map<String, dynamic> json) => _$SalePackFromJson(json);

@override@JsonKey() final  String name;
@override@JsonKey() final  double size;
@override@JsonKey() final  double count;
@override@JsonKey() final  double price;

/// Create a copy of SalePack
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SalePackCopyWith<_SalePack> get copyWith => __$SalePackCopyWithImpl<_SalePack>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SalePackToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _SalePack&&(identical(other.name, name) || other.name == name)&&(identical(other.size, size) || other.size == size)&&(identical(other.count, count) || other.count == count)&&(identical(other.price, price) || other.price == price));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,name,size,count,price);
}

@override
String toString() {
    return 'SalePack(name: $name, size: $size, count: $count, price: $price)';
}


}

/// @nodoc
abstract mixin class _$SalePackCopyWith<$Res> implements $SalePackCopyWith<$Res> {
  factory _$SalePackCopyWith(_SalePack value, $Res Function(_SalePack) _then) = __$SalePackCopyWithImpl;
@override @useResult
$Res call({
 String name, double size, double count, double price
});




}
/// @nodoc
class __$SalePackCopyWithImpl<$Res>
    implements _$SalePackCopyWith<$Res> {
  __$SalePackCopyWithImpl(this._self, this._then);

  final _SalePack _self;
  final $Res Function(_SalePack) _then;

/// Create a copy of SalePack
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? size = null,Object? count = null,Object? price = null,}) {
  return _then(_SalePack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$SaleItem {

 String get id; String get name; double get price; double get cost; double get qty; double get discount; bool get controlled; SalePack? get pack; List<Allocation> get alloc;/// dosage directions as written by the React app (kept as they are)
 Map<String, Object?>? get directions;
/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SaleItemCopyWith<SaleItem> get copyWith => _$SaleItemCopyWithImpl<SaleItem>(this as SaleItem, _$identity);

  /// Serializes this SaleItem to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as SaleItem;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SaleItem&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.price, _this.price) || other.price == _this.price)&&(identical(other.cost, _this.cost) || other.cost == _this.cost)&&(identical(other.qty, _this.qty) || other.qty == _this.qty)&&(identical(other.discount, _this.discount) || other.discount == _this.discount)&&(identical(other.controlled, _this.controlled) || other.controlled == _this.controlled)&&(identical(other.pack, _this.pack) || other.pack == _this.pack)&&const DeepCollectionEquality().equals(other.alloc, _this.alloc)&&const DeepCollectionEquality().equals(other.directions, _this.directions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as SaleItem;
  return Object.hash(runtimeType,_this.id,_this.name,_this.price,_this.cost,_this.qty,_this.discount,_this.controlled,_this.pack,const DeepCollectionEquality().hash(_this.alloc),const DeepCollectionEquality().hash(_this.directions));
}

@override
String toString() {
  final _this = this as SaleItem;
  return 'SaleItem(id: ${_this.id}, name: ${_this.name}, price: ${_this.price}, cost: ${_this.cost}, qty: ${_this.qty}, discount: ${_this.discount}, controlled: ${_this.controlled}, pack: ${_this.pack}, alloc: ${_this.alloc}, directions: ${_this.directions})';
}


}

/// @nodoc
abstract mixin class $SaleItemCopyWith<$Res>  {
  factory $SaleItemCopyWith(SaleItem value, $Res Function(SaleItem) _then) = _$SaleItemCopyWithImpl;
@useResult
$Res call({
 String id, String name, double price, double cost, double qty, double discount, bool controlled, SalePack? pack, List<Allocation> alloc, Map<String, Object?>? directions
});


$SalePackCopyWith<$Res>? get pack;

}
/// @nodoc
class _$SaleItemCopyWithImpl<$Res>
    implements $SaleItemCopyWith<$Res> {
  _$SaleItemCopyWithImpl(this._self, this._then);

  final SaleItem _self;
  final $Res Function(SaleItem) _then;

/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? price = null,Object? cost = null,Object? qty = null,Object? discount = null,Object? controlled = null,Object? pack = freezed,Object? alloc = null,Object? directions = freezed,}) {
  return _then(SaleItem(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,discount: null == discount ? _self.discount : discount // ignore: cast_nullable_to_non_nullable
as double,controlled: null == controlled ? _self.controlled : controlled // ignore: cast_nullable_to_non_nullable
as bool,pack: freezed == pack ? _self.pack : pack // ignore: cast_nullable_to_non_nullable
as SalePack?,alloc: null == alloc ? _self.alloc : alloc // ignore: cast_nullable_to_non_nullable
as List<Allocation>,directions: freezed == directions ? _self.directions : directions // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>?,
  ));
}
/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SalePackCopyWith<$Res>? get pack {
    if (_self.pack == null) {
    return null;
  }

  return $SalePackCopyWith<$Res>(_self.pack!, (value) {
    return _then(_self.copyWith(pack: value));
  });
}
}


/// Adds pattern-matching-related methods to [SaleItem].
extension SaleItemPatterns on SaleItem {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SaleItem value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SaleItem() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SaleItem value)  $default,){
final _that = this;
switch (_that) {
case _SaleItem():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SaleItem value)?  $default,){
final _that = this;
switch (_that) {
case _SaleItem() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  double price,  double cost,  double qty,  double discount,  bool controlled,  SalePack? pack,  List<Allocation> alloc,  Map<String, Object?>? directions)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SaleItem() when $default != null:
return $default(_that.id,_that.name,_that.price,_that.cost,_that.qty,_that.discount,_that.controlled,_that.pack,_that.alloc,_that.directions);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  double price,  double cost,  double qty,  double discount,  bool controlled,  SalePack? pack,  List<Allocation> alloc,  Map<String, Object?>? directions)  $default,) {final _that = this;
switch (_that) {
case _SaleItem():
return $default(_that.id,_that.name,_that.price,_that.cost,_that.qty,_that.discount,_that.controlled,_that.pack,_that.alloc,_that.directions);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  double price,  double cost,  double qty,  double discount,  bool controlled,  SalePack? pack,  List<Allocation> alloc,  Map<String, Object?>? directions)?  $default,) {final _that = this;
switch (_that) {
case _SaleItem() when $default != null:
return $default(_that.id,_that.name,_that.price,_that.cost,_that.qty,_that.discount,_that.controlled,_that.pack,_that.alloc,_that.directions);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _SaleItem implements SaleItem {
  const _SaleItem({this.id = '', this.name = '', this.price = 0, this.cost = 0, this.qty = 0, this.discount = 0, this.controlled = false, this.pack,  List<Allocation> alloc = const <Allocation>[],  Map<String, Object?>? directions}): _alloc = alloc,_directions = directions;
  factory _SaleItem.fromJson(Map<String, dynamic> json) => _$SaleItemFromJson(json);

@override@JsonKey() final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  double price;
@override@JsonKey() final  double cost;
@override@JsonKey() final  double qty;
@override@JsonKey() final  double discount;
@override@JsonKey() final  bool controlled;
@override final  SalePack? pack;
 final  List<Allocation> _alloc;
@override@JsonKey() List<Allocation> get alloc {
  if (_alloc is EqualUnmodifiableListView) return _alloc;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alloc);
}

/// dosage directions as written by the React app (kept as they are)
 final  Map<String, Object?>? _directions;
/// dosage directions as written by the React app (kept as they are)
@override Map<String, Object?>? get directions {
  final value = _directions;
  if (value == null) return null;
  if (_directions is EqualUnmodifiableMapView) return _directions;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SaleItemCopyWith<_SaleItem> get copyWith => __$SaleItemCopyWithImpl<_SaleItem>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SaleItemToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _SaleItem&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.price, price) || other.price == price)&&(identical(other.cost, cost) || other.cost == cost)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.discount, discount) || other.discount == discount)&&(identical(other.controlled, controlled) || other.controlled == controlled)&&(identical(other.pack, pack) || other.pack == pack)&&const DeepCollectionEquality().equals(other.alloc, _alloc)&&const DeepCollectionEquality().equals(other.directions, _directions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,price,cost,qty,discount,controlled,pack,const DeepCollectionEquality().hash(_alloc),const DeepCollectionEquality().hash(_directions));
}

@override
String toString() {
    return 'SaleItem(id: $id, name: $name, price: $price, cost: $cost, qty: $qty, discount: $discount, controlled: $controlled, pack: $pack, alloc: $alloc, directions: $directions)';
}


}

/// @nodoc
abstract mixin class _$SaleItemCopyWith<$Res> implements $SaleItemCopyWith<$Res> {
  factory _$SaleItemCopyWith(_SaleItem value, $Res Function(_SaleItem) _then) = __$SaleItemCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, double price, double cost, double qty, double discount, bool controlled, SalePack? pack, List<Allocation> alloc, Map<String, Object?>? directions
});


@override $SalePackCopyWith<$Res>? get pack;

}
/// @nodoc
class __$SaleItemCopyWithImpl<$Res>
    implements _$SaleItemCopyWith<$Res> {
  __$SaleItemCopyWithImpl(this._self, this._then);

  final _SaleItem _self;
  final $Res Function(_SaleItem) _then;

/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? price = null,Object? cost = null,Object? qty = null,Object? discount = null,Object? controlled = null,Object? pack = freezed,Object? alloc = null,Object? directions = freezed,}) {
  return _then(_SaleItem(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,discount: null == discount ? _self.discount : discount // ignore: cast_nullable_to_non_nullable
as double,controlled: null == controlled ? _self.controlled : controlled // ignore: cast_nullable_to_non_nullable
as bool,pack: freezed == pack ? _self.pack : pack // ignore: cast_nullable_to_non_nullable
as SalePack?,alloc: null == alloc ? _self._alloc : alloc // ignore: cast_nullable_to_non_nullable
as List<Allocation>,directions: freezed == directions ? _self._directions : directions // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>?,
  ));
}

/// Create a copy of SaleItem
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SalePackCopyWith<$Res>? get pack {
    if (_self.pack == null) {
    return null;
  }

  return $SalePackCopyWith<$Res>(_self.pack!, (value) {
    return _then(_self.copyWith(pack: value));
  });
}
}


/// @nodoc
mixin _$Sale {

 String get id; String get number; String get date;/// 'retail' | 'wholesale'
 String get type; String get branchId; List<SaleItem> get items; double get subtotal; double get discount; double get tax; double get total; String get payment; double get paid; double get tendered; String get bankId; String get customerId; String get customerName; String get cashier; String get status;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Sale
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SaleCopyWith<Sale> get copyWith => _$SaleCopyWithImpl<Sale>(this as Sale, _$identity);

  /// Serializes this Sale to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Sale;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Sale&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.number, _this.number) || other.number == _this.number)&&(identical(other.date, _this.date) || other.date == _this.date)&&(identical(other.type, _this.type) || other.type == _this.type)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&const DeepCollectionEquality().equals(other.items, _this.items)&&(identical(other.subtotal, _this.subtotal) || other.subtotal == _this.subtotal)&&(identical(other.discount, _this.discount) || other.discount == _this.discount)&&(identical(other.tax, _this.tax) || other.tax == _this.tax)&&(identical(other.total, _this.total) || other.total == _this.total)&&(identical(other.payment, _this.payment) || other.payment == _this.payment)&&(identical(other.paid, _this.paid) || other.paid == _this.paid)&&(identical(other.tendered, _this.tendered) || other.tendered == _this.tendered)&&(identical(other.bankId, _this.bankId) || other.bankId == _this.bankId)&&(identical(other.customerId, _this.customerId) || other.customerId == _this.customerId)&&(identical(other.customerName, _this.customerName) || other.customerName == _this.customerName)&&(identical(other.cashier, _this.cashier) || other.cashier == _this.cashier)&&(identical(other.status, _this.status) || other.status == _this.status)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Sale;
  return Object.hashAll([runtimeType,_this.id,_this.number,_this.date,_this.type,_this.branchId,const DeepCollectionEquality().hash(_this.items),_this.subtotal,_this.discount,_this.tax,_this.total,_this.payment,_this.paid,_this.tendered,_this.bankId,_this.customerId,_this.customerName,_this.cashier,_this.status,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw)]);
}

@override
String toString() {
  final _this = this as Sale;
  return 'Sale(id: ${_this.id}, number: ${_this.number}, date: ${_this.date}, type: ${_this.type}, branchId: ${_this.branchId}, items: ${_this.items}, subtotal: ${_this.subtotal}, discount: ${_this.discount}, tax: ${_this.tax}, total: ${_this.total}, payment: ${_this.payment}, paid: ${_this.paid}, tendered: ${_this.tendered}, bankId: ${_this.bankId}, customerId: ${_this.customerId}, customerName: ${_this.customerName}, cashier: ${_this.cashier}, status: ${_this.status}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $SaleCopyWith<$Res>  {
  factory $SaleCopyWith(Sale value, $Res Function(Sale) _then) = _$SaleCopyWithImpl;
@useResult
$Res call({
 String id, String number, String date, String type, String branchId, List<SaleItem> items, double subtotal, double discount, double tax, double total, String payment, double paid, double tendered, String bankId, String customerId, String customerName, String cashier, String status,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$SaleCopyWithImpl<$Res>
    implements $SaleCopyWith<$Res> {
  _$SaleCopyWithImpl(this._self, this._then);

  final Sale _self;
  final $Res Function(Sale) _then;

/// Create a copy of Sale
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? number = null,Object? date = null,Object? type = null,Object? branchId = null,Object? items = null,Object? subtotal = null,Object? discount = null,Object? tax = null,Object? total = null,Object? payment = null,Object? paid = null,Object? tendered = null,Object? bankId = null,Object? customerId = null,Object? customerName = null,Object? cashier = null,Object? status = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Sale(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,number: null == number ? _self.number : number // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<SaleItem>,subtotal: null == subtotal ? _self.subtotal : subtotal // ignore: cast_nullable_to_non_nullable
as double,discount: null == discount ? _self.discount : discount // ignore: cast_nullable_to_non_nullable
as double,tax: null == tax ? _self.tax : tax // ignore: cast_nullable_to_non_nullable
as double,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,payment: null == payment ? _self.payment : payment // ignore: cast_nullable_to_non_nullable
as String,paid: null == paid ? _self.paid : paid // ignore: cast_nullable_to_non_nullable
as double,tendered: null == tendered ? _self.tendered : tendered // ignore: cast_nullable_to_non_nullable
as double,bankId: null == bankId ? _self.bankId : bankId // ignore: cast_nullable_to_non_nullable
as String,customerId: null == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String,customerName: null == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String,cashier: null == cashier ? _self.cashier : cashier // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Sale].
extension SalePatterns on Sale {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Sale value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Sale() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Sale value)  $default,){
final _that = this;
switch (_that) {
case _Sale():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Sale value)?  $default,){
final _that = this;
switch (_that) {
case _Sale() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String number,  String date,  String type,  String branchId,  List<SaleItem> items,  double subtotal,  double discount,  double tax,  double total,  String payment,  double paid,  double tendered,  String bankId,  String customerId,  String customerName,  String cashier,  String status, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Sale() when $default != null:
return $default(_that.id,_that.number,_that.date,_that.type,_that.branchId,_that.items,_that.subtotal,_that.discount,_that.tax,_that.total,_that.payment,_that.paid,_that.tendered,_that.bankId,_that.customerId,_that.customerName,_that.cashier,_that.status,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String number,  String date,  String type,  String branchId,  List<SaleItem> items,  double subtotal,  double discount,  double tax,  double total,  String payment,  double paid,  double tendered,  String bankId,  String customerId,  String customerName,  String cashier,  String status, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Sale():
return $default(_that.id,_that.number,_that.date,_that.type,_that.branchId,_that.items,_that.subtotal,_that.discount,_that.tax,_that.total,_that.payment,_that.paid,_that.tendered,_that.bankId,_that.customerId,_that.customerName,_that.cashier,_that.status,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String number,  String date,  String type,  String branchId,  List<SaleItem> items,  double subtotal,  double discount,  double tax,  double total,  String payment,  double paid,  double tendered,  String bankId,  String customerId,  String customerName,  String cashier,  String status, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Sale() when $default != null:
return $default(_that.id,_that.number,_that.date,_that.type,_that.branchId,_that.items,_that.subtotal,_that.discount,_that.tax,_that.total,_that.payment,_that.paid,_that.tendered,_that.bankId,_that.customerId,_that.customerName,_that.cashier,_that.status,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Sale extends Sale {
  const _Sale({required this.id, this.number = '', this.date = '', this.type = 'retail', this.branchId = 'main',  List<SaleItem> items = const <SaleItem>[], this.subtotal = 0, this.discount = 0, this.tax = 0, this.total = 0, this.payment = '', this.paid = 0, this.tendered = 0, this.bankId = '', this.customerId = 'walk-in', this.customerName = '', this.cashier = '', this.status = 'completed', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _items = items,_raw = raw,super._();
  factory _Sale.fromJson(Map<String, dynamic> json) => _$SaleFromJson(json);

@override final  String id;
@override@JsonKey() final  String number;
@override@JsonKey() final  String date;
/// 'retail' | 'wholesale'
@override@JsonKey() final  String type;
@override@JsonKey() final  String branchId;
 final  List<SaleItem> _items;
@override@JsonKey() List<SaleItem> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

@override@JsonKey() final  double subtotal;
@override@JsonKey() final  double discount;
@override@JsonKey() final  double tax;
@override@JsonKey() final  double total;
@override@JsonKey() final  String payment;
@override@JsonKey() final  double paid;
@override@JsonKey() final  double tendered;
@override@JsonKey() final  String bankId;
@override@JsonKey() final  String customerId;
@override@JsonKey() final  String customerName;
@override@JsonKey() final  String cashier;
@override@JsonKey() final  String status;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Sale
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SaleCopyWith<_Sale> get copyWith => __$SaleCopyWithImpl<_Sale>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SaleToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Sale&&(identical(other.id, id) || other.id == id)&&(identical(other.number, number) || other.number == number)&&(identical(other.date, date) || other.date == date)&&(identical(other.type, type) || other.type == type)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&const DeepCollectionEquality().equals(other.items, _items)&&(identical(other.subtotal, subtotal) || other.subtotal == subtotal)&&(identical(other.discount, discount) || other.discount == discount)&&(identical(other.tax, tax) || other.tax == tax)&&(identical(other.total, total) || other.total == total)&&(identical(other.payment, payment) || other.payment == payment)&&(identical(other.paid, paid) || other.paid == paid)&&(identical(other.tendered, tendered) || other.tendered == tendered)&&(identical(other.bankId, bankId) || other.bankId == bankId)&&(identical(other.customerId, customerId) || other.customerId == customerId)&&(identical(other.customerName, customerName) || other.customerName == customerName)&&(identical(other.cashier, cashier) || other.cashier == cashier)&&(identical(other.status, status) || other.status == status)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hashAll([runtimeType,id,number,date,type,branchId,const DeepCollectionEquality().hash(_items),subtotal,discount,tax,total,payment,paid,tendered,bankId,customerId,customerName,cashier,status,updatedAt,const DeepCollectionEquality().hash(_raw)]);
}

@override
String toString() {
    return 'Sale(id: $id, number: $number, date: $date, type: $type, branchId: $branchId, items: $items, subtotal: $subtotal, discount: $discount, tax: $tax, total: $total, payment: $payment, paid: $paid, tendered: $tendered, bankId: $bankId, customerId: $customerId, customerName: $customerName, cashier: $cashier, status: $status, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$SaleCopyWith<$Res> implements $SaleCopyWith<$Res> {
  factory _$SaleCopyWith(_Sale value, $Res Function(_Sale) _then) = __$SaleCopyWithImpl;
@override @useResult
$Res call({
 String id, String number, String date, String type, String branchId, List<SaleItem> items, double subtotal, double discount, double tax, double total, String payment, double paid, double tendered, String bankId, String customerId, String customerName, String cashier, String status,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$SaleCopyWithImpl<$Res>
    implements _$SaleCopyWith<$Res> {
  __$SaleCopyWithImpl(this._self, this._then);

  final _Sale _self;
  final $Res Function(_Sale) _then;

/// Create a copy of Sale
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? number = null,Object? date = null,Object? type = null,Object? branchId = null,Object? items = null,Object? subtotal = null,Object? discount = null,Object? tax = null,Object? total = null,Object? payment = null,Object? paid = null,Object? tendered = null,Object? bankId = null,Object? customerId = null,Object? customerName = null,Object? cashier = null,Object? status = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Sale(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,number: null == number ? _self.number : number // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<SaleItem>,subtotal: null == subtotal ? _self.subtotal : subtotal // ignore: cast_nullable_to_non_nullable
as double,discount: null == discount ? _self.discount : discount // ignore: cast_nullable_to_non_nullable
as double,tax: null == tax ? _self.tax : tax // ignore: cast_nullable_to_non_nullable
as double,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,payment: null == payment ? _self.payment : payment // ignore: cast_nullable_to_non_nullable
as String,paid: null == paid ? _self.paid : paid // ignore: cast_nullable_to_non_nullable
as double,tendered: null == tendered ? _self.tendered : tendered // ignore: cast_nullable_to_non_nullable
as double,bankId: null == bankId ? _self.bankId : bankId // ignore: cast_nullable_to_non_nullable
as String,customerId: null == customerId ? _self.customerId : customerId // ignore: cast_nullable_to_non_nullable
as String,customerName: null == customerName ? _self.customerName : customerName // ignore: cast_nullable_to_non_nullable
as String,cashier: null == cashier ? _self.cashier : cashier // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
