// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'product.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Pack {

 String get name; double get size; double get price; double get wholesale;
/// Create a copy of Pack
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PackCopyWith<Pack> get copyWith => _$PackCopyWithImpl<Pack>(this as Pack, _$identity);

  /// Serializes this Pack to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Pack;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Pack&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.size, _this.size) || other.size == _this.size)&&(identical(other.price, _this.price) || other.price == _this.price)&&(identical(other.wholesale, _this.wholesale) || other.wholesale == _this.wholesale));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Pack;
  return Object.hash(runtimeType,_this.name,_this.size,_this.price,_this.wholesale);
}

@override
String toString() {
  final _this = this as Pack;
  return 'Pack(name: ${_this.name}, size: ${_this.size}, price: ${_this.price}, wholesale: ${_this.wholesale})';
}


}

/// @nodoc
abstract mixin class $PackCopyWith<$Res>  {
  factory $PackCopyWith(Pack value, $Res Function(Pack) _then) = _$PackCopyWithImpl;
@useResult
$Res call({
 String name, double size, double price, double wholesale
});




}
/// @nodoc
class _$PackCopyWithImpl<$Res>
    implements $PackCopyWith<$Res> {
  _$PackCopyWithImpl(this._self, this._then);

  final Pack _self;
  final $Res Function(Pack) _then;

/// Create a copy of Pack
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? size = null,Object? price = null,Object? wholesale = null,}) {
  return _then(Pack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,wholesale: null == wholesale ? _self.wholesale : wholesale // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [Pack].
extension PackPatterns on Pack {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Pack value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Pack() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Pack value)  $default,){
final _that = this;
switch (_that) {
case _Pack():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Pack value)?  $default,){
final _that = this;
switch (_that) {
case _Pack() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  double size,  double price,  double wholesale)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Pack() when $default != null:
return $default(_that.name,_that.size,_that.price,_that.wholesale);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  double size,  double price,  double wholesale)  $default,) {final _that = this;
switch (_that) {
case _Pack():
return $default(_that.name,_that.size,_that.price,_that.wholesale);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  double size,  double price,  double wholesale)?  $default,) {final _that = this;
switch (_that) {
case _Pack() when $default != null:
return $default(_that.name,_that.size,_that.price,_that.wholesale);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Pack implements Pack {
  const _Pack({this.name = '', this.size = 1, this.price = 0, this.wholesale = 0});
  factory _Pack.fromJson(Map<String, dynamic> json) => _$PackFromJson(json);

@override@JsonKey() final  String name;
@override@JsonKey() final  double size;
@override@JsonKey() final  double price;
@override@JsonKey() final  double wholesale;

/// Create a copy of Pack
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PackCopyWith<_Pack> get copyWith => __$PackCopyWithImpl<_Pack>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PackToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Pack&&(identical(other.name, name) || other.name == name)&&(identical(other.size, size) || other.size == size)&&(identical(other.price, price) || other.price == price)&&(identical(other.wholesale, wholesale) || other.wholesale == wholesale));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,name,size,price,wholesale);
}

@override
String toString() {
    return 'Pack(name: $name, size: $size, price: $price, wholesale: $wholesale)';
}


}

/// @nodoc
abstract mixin class _$PackCopyWith<$Res> implements $PackCopyWith<$Res> {
  factory _$PackCopyWith(_Pack value, $Res Function(_Pack) _then) = __$PackCopyWithImpl;
@override @useResult
$Res call({
 String name, double size, double price, double wholesale
});




}
/// @nodoc
class __$PackCopyWithImpl<$Res>
    implements _$PackCopyWith<$Res> {
  __$PackCopyWithImpl(this._self, this._then);

  final _Pack _self;
  final $Res Function(_Pack) _then;

/// Create a copy of Pack
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? size = null,Object? price = null,Object? wholesale = null,}) {
  return _then(_Pack(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,size: null == size ? _self.size : size // ignore: cast_nullable_to_non_nullable
as double,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,wholesale: null == wholesale ? _self.wholesale : wholesale // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$Product {

 String get id; String get name; String get generic; String get form; String get unit; String get barcode; String get category; String get strength; double get price; double get wholesale; double get cost; double get reorder; List<Pack> get packs; bool get rx; bool get controlled;/// Set by the store on every save; read only here.
@JsonKey(includeToJson: false) String get updatedAt;/// The record as it was read, so fields this app does not know are written back untouched.
@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Product
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ProductCopyWith<Product> get copyWith => _$ProductCopyWithImpl<Product>(this as Product, _$identity);

  /// Serializes this Product to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Product;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Product&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.generic, _this.generic) || other.generic == _this.generic)&&(identical(other.form, _this.form) || other.form == _this.form)&&(identical(other.unit, _this.unit) || other.unit == _this.unit)&&(identical(other.barcode, _this.barcode) || other.barcode == _this.barcode)&&(identical(other.category, _this.category) || other.category == _this.category)&&(identical(other.strength, _this.strength) || other.strength == _this.strength)&&(identical(other.price, _this.price) || other.price == _this.price)&&(identical(other.wholesale, _this.wholesale) || other.wholesale == _this.wholesale)&&(identical(other.cost, _this.cost) || other.cost == _this.cost)&&(identical(other.reorder, _this.reorder) || other.reorder == _this.reorder)&&const DeepCollectionEquality().equals(other.packs, _this.packs)&&(identical(other.rx, _this.rx) || other.rx == _this.rx)&&(identical(other.controlled, _this.controlled) || other.controlled == _this.controlled)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Product;
  return Object.hash(runtimeType,_this.id,_this.name,_this.generic,_this.form,_this.unit,_this.barcode,_this.category,_this.strength,_this.price,_this.wholesale,_this.cost,_this.reorder,const DeepCollectionEquality().hash(_this.packs),_this.rx,_this.controlled,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Product;
  return 'Product(id: ${_this.id}, name: ${_this.name}, generic: ${_this.generic}, form: ${_this.form}, unit: ${_this.unit}, barcode: ${_this.barcode}, category: ${_this.category}, strength: ${_this.strength}, price: ${_this.price}, wholesale: ${_this.wholesale}, cost: ${_this.cost}, reorder: ${_this.reorder}, packs: ${_this.packs}, rx: ${_this.rx}, controlled: ${_this.controlled}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $ProductCopyWith<$Res>  {
  factory $ProductCopyWith(Product value, $Res Function(Product) _then) = _$ProductCopyWithImpl;
@useResult
$Res call({
 String id, String name, String generic, String form, String unit, String barcode, String category, String strength, double price, double wholesale, double cost, double reorder, List<Pack> packs, bool rx, bool controlled,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$ProductCopyWithImpl<$Res>
    implements $ProductCopyWith<$Res> {
  _$ProductCopyWithImpl(this._self, this._then);

  final Product _self;
  final $Res Function(Product) _then;

/// Create a copy of Product
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? generic = null,Object? form = null,Object? unit = null,Object? barcode = null,Object? category = null,Object? strength = null,Object? price = null,Object? wholesale = null,Object? cost = null,Object? reorder = null,Object? packs = null,Object? rx = null,Object? controlled = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Product(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,generic: null == generic ? _self.generic : generic // ignore: cast_nullable_to_non_nullable
as String,form: null == form ? _self.form : form // ignore: cast_nullable_to_non_nullable
as String,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,barcode: null == barcode ? _self.barcode : barcode // ignore: cast_nullable_to_non_nullable
as String,category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,strength: null == strength ? _self.strength : strength // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,wholesale: null == wholesale ? _self.wholesale : wholesale // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,reorder: null == reorder ? _self.reorder : reorder // ignore: cast_nullable_to_non_nullable
as double,packs: null == packs ? _self.packs : packs // ignore: cast_nullable_to_non_nullable
as List<Pack>,rx: null == rx ? _self.rx : rx // ignore: cast_nullable_to_non_nullable
as bool,controlled: null == controlled ? _self.controlled : controlled // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Product].
extension ProductPatterns on Product {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Product value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Product() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Product value)  $default,){
final _that = this;
switch (_that) {
case _Product():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Product value)?  $default,){
final _that = this;
switch (_that) {
case _Product() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String generic,  String form,  String unit,  String barcode,  String category,  String strength,  double price,  double wholesale,  double cost,  double reorder,  List<Pack> packs,  bool rx,  bool controlled, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Product() when $default != null:
return $default(_that.id,_that.name,_that.generic,_that.form,_that.unit,_that.barcode,_that.category,_that.strength,_that.price,_that.wholesale,_that.cost,_that.reorder,_that.packs,_that.rx,_that.controlled,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String generic,  String form,  String unit,  String barcode,  String category,  String strength,  double price,  double wholesale,  double cost,  double reorder,  List<Pack> packs,  bool rx,  bool controlled, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Product():
return $default(_that.id,_that.name,_that.generic,_that.form,_that.unit,_that.barcode,_that.category,_that.strength,_that.price,_that.wholesale,_that.cost,_that.reorder,_that.packs,_that.rx,_that.controlled,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String generic,  String form,  String unit,  String barcode,  String category,  String strength,  double price,  double wholesale,  double cost,  double reorder,  List<Pack> packs,  bool rx,  bool controlled, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Product() when $default != null:
return $default(_that.id,_that.name,_that.generic,_that.form,_that.unit,_that.barcode,_that.category,_that.strength,_that.price,_that.wholesale,_that.cost,_that.reorder,_that.packs,_that.rx,_that.controlled,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Product extends Product {
  const _Product({required this.id, this.name = '', this.generic = '', this.form = '', this.unit = '', this.barcode = '', this.category = '', this.strength = '', this.price = 0, this.wholesale = 0, this.cost = 0, this.reorder = 0,  List<Pack> packs = const <Pack>[], this.rx = false, this.controlled = false, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _packs = packs,_raw = raw,super._();
  factory _Product.fromJson(Map<String, dynamic> json) => _$ProductFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String generic;
@override@JsonKey() final  String form;
@override@JsonKey() final  String unit;
@override@JsonKey() final  String barcode;
@override@JsonKey() final  String category;
@override@JsonKey() final  String strength;
@override@JsonKey() final  double price;
@override@JsonKey() final  double wholesale;
@override@JsonKey() final  double cost;
@override@JsonKey() final  double reorder;
 final  List<Pack> _packs;
@override@JsonKey() List<Pack> get packs {
  if (_packs is EqualUnmodifiableListView) return _packs;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_packs);
}

@override@JsonKey() final  bool rx;
@override@JsonKey() final  bool controlled;
/// Set by the store on every save; read only here.
@override@JsonKey(includeToJson: false) final  String updatedAt;
/// The record as it was read, so fields this app does not know are written back untouched.
 final  Map<String, Object?> _raw;
/// The record as it was read, so fields this app does not know are written back untouched.
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Product
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ProductCopyWith<_Product> get copyWith => __$ProductCopyWithImpl<_Product>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ProductToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Product&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.generic, generic) || other.generic == generic)&&(identical(other.form, form) || other.form == form)&&(identical(other.unit, unit) || other.unit == unit)&&(identical(other.barcode, barcode) || other.barcode == barcode)&&(identical(other.category, category) || other.category == category)&&(identical(other.strength, strength) || other.strength == strength)&&(identical(other.price, price) || other.price == price)&&(identical(other.wholesale, wholesale) || other.wholesale == wholesale)&&(identical(other.cost, cost) || other.cost == cost)&&(identical(other.reorder, reorder) || other.reorder == reorder)&&const DeepCollectionEquality().equals(other.packs, _packs)&&(identical(other.rx, rx) || other.rx == rx)&&(identical(other.controlled, controlled) || other.controlled == controlled)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,generic,form,unit,barcode,category,strength,price,wholesale,cost,reorder,const DeepCollectionEquality().hash(_packs),rx,controlled,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Product(id: $id, name: $name, generic: $generic, form: $form, unit: $unit, barcode: $barcode, category: $category, strength: $strength, price: $price, wholesale: $wholesale, cost: $cost, reorder: $reorder, packs: $packs, rx: $rx, controlled: $controlled, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$ProductCopyWith<$Res> implements $ProductCopyWith<$Res> {
  factory _$ProductCopyWith(_Product value, $Res Function(_Product) _then) = __$ProductCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String generic, String form, String unit, String barcode, String category, String strength, double price, double wholesale, double cost, double reorder, List<Pack> packs, bool rx, bool controlled,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$ProductCopyWithImpl<$Res>
    implements _$ProductCopyWith<$Res> {
  __$ProductCopyWithImpl(this._self, this._then);

  final _Product _self;
  final $Res Function(_Product) _then;

/// Create a copy of Product
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? generic = null,Object? form = null,Object? unit = null,Object? barcode = null,Object? category = null,Object? strength = null,Object? price = null,Object? wholesale = null,Object? cost = null,Object? reorder = null,Object? packs = null,Object? rx = null,Object? controlled = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Product(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,generic: null == generic ? _self.generic : generic // ignore: cast_nullable_to_non_nullable
as String,form: null == form ? _self.form : form // ignore: cast_nullable_to_non_nullable
as String,unit: null == unit ? _self.unit : unit // ignore: cast_nullable_to_non_nullable
as String,barcode: null == barcode ? _self.barcode : barcode // ignore: cast_nullable_to_non_nullable
as String,category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,strength: null == strength ? _self.strength : strength // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,wholesale: null == wholesale ? _self.wholesale : wholesale // ignore: cast_nullable_to_non_nullable
as double,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,reorder: null == reorder ? _self.reorder : reorder // ignore: cast_nullable_to_non_nullable
as double,packs: null == packs ? _self._packs : packs // ignore: cast_nullable_to_non_nullable
as List<Pack>,rx: null == rx ? _self.rx : rx // ignore: cast_nullable_to_non_nullable
as bool,controlled: null == controlled ? _self.controlled : controlled // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
