// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'party.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Customer {

 String get id; String get name; String get phone; String get allergies;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$CustomerCopyWith<Customer> get copyWith => _$CustomerCopyWithImpl<Customer>(this as Customer, _$identity);

  /// Serializes this Customer to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Customer;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Customer&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.phone, _this.phone) || other.phone == _this.phone)&&(identical(other.allergies, _this.allergies) || other.allergies == _this.allergies)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Customer;
  return Object.hash(runtimeType,_this.id,_this.name,_this.phone,_this.allergies,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Customer;
  return 'Customer(id: ${_this.id}, name: ${_this.name}, phone: ${_this.phone}, allergies: ${_this.allergies}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $CustomerCopyWith<$Res>  {
  factory $CustomerCopyWith(Customer value, $Res Function(Customer) _then) = _$CustomerCopyWithImpl;
@useResult
$Res call({
 String id, String name, String phone, String allergies,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$CustomerCopyWithImpl<$Res>
    implements $CustomerCopyWith<$Res> {
  _$CustomerCopyWithImpl(this._self, this._then);

  final Customer _self;
  final $Res Function(Customer) _then;

/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? phone = null,Object? allergies = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Customer(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,allergies: null == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Customer].
extension CustomerPatterns on Customer {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Customer value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Customer() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Customer value)  $default,){
final _that = this;
switch (_that) {
case _Customer():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Customer value)?  $default,){
final _that = this;
switch (_that) {
case _Customer() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String phone,  String allergies, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Customer() when $default != null:
return $default(_that.id,_that.name,_that.phone,_that.allergies,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String phone,  String allergies, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Customer():
return $default(_that.id,_that.name,_that.phone,_that.allergies,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String phone,  String allergies, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Customer() when $default != null:
return $default(_that.id,_that.name,_that.phone,_that.allergies,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Customer extends Customer {
  const _Customer({required this.id, this.name = '', this.phone = '', this.allergies = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Customer.fromJson(Map<String, dynamic> json) => _$CustomerFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String phone;
@override@JsonKey() final  String allergies;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$CustomerCopyWith<_Customer> get copyWith => __$CustomerCopyWithImpl<_Customer>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$CustomerToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Customer&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.allergies, allergies) || other.allergies == allergies)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,phone,allergies,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Customer(id: $id, name: $name, phone: $phone, allergies: $allergies, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$CustomerCopyWith<$Res> implements $CustomerCopyWith<$Res> {
  factory _$CustomerCopyWith(_Customer value, $Res Function(_Customer) _then) = __$CustomerCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String phone, String allergies,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$CustomerCopyWithImpl<$Res>
    implements _$CustomerCopyWith<$Res> {
  __$CustomerCopyWithImpl(this._self, this._then);

  final _Customer _self;
  final $Res Function(_Customer) _then;

/// Create a copy of Customer
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? phone = null,Object? allergies = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Customer(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,allergies: null == allergies ? _self.allergies : allergies // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}


/// @nodoc
mixin _$Supplier {

 String get id; String get name; String get contact; String get phone; String get email; String get address;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Supplier
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SupplierCopyWith<Supplier> get copyWith => _$SupplierCopyWithImpl<Supplier>(this as Supplier, _$identity);

  /// Serializes this Supplier to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Supplier;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Supplier&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.contact, _this.contact) || other.contact == _this.contact)&&(identical(other.phone, _this.phone) || other.phone == _this.phone)&&(identical(other.email, _this.email) || other.email == _this.email)&&(identical(other.address, _this.address) || other.address == _this.address)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Supplier;
  return Object.hash(runtimeType,_this.id,_this.name,_this.contact,_this.phone,_this.email,_this.address,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Supplier;
  return 'Supplier(id: ${_this.id}, name: ${_this.name}, contact: ${_this.contact}, phone: ${_this.phone}, email: ${_this.email}, address: ${_this.address}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $SupplierCopyWith<$Res>  {
  factory $SupplierCopyWith(Supplier value, $Res Function(Supplier) _then) = _$SupplierCopyWithImpl;
@useResult
$Res call({
 String id, String name, String contact, String phone, String email, String address,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$SupplierCopyWithImpl<$Res>
    implements $SupplierCopyWith<$Res> {
  _$SupplierCopyWithImpl(this._self, this._then);

  final Supplier _self;
  final $Res Function(Supplier) _then;

/// Create a copy of Supplier
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? contact = null,Object? phone = null,Object? email = null,Object? address = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Supplier(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,contact: null == contact ? _self.contact : contact // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,email: null == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Supplier].
extension SupplierPatterns on Supplier {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Supplier value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Supplier() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Supplier value)  $default,){
final _that = this;
switch (_that) {
case _Supplier():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Supplier value)?  $default,){
final _that = this;
switch (_that) {
case _Supplier() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String contact,  String phone,  String email,  String address, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Supplier() when $default != null:
return $default(_that.id,_that.name,_that.contact,_that.phone,_that.email,_that.address,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String contact,  String phone,  String email,  String address, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Supplier():
return $default(_that.id,_that.name,_that.contact,_that.phone,_that.email,_that.address,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String contact,  String phone,  String email,  String address, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Supplier() when $default != null:
return $default(_that.id,_that.name,_that.contact,_that.phone,_that.email,_that.address,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Supplier extends Supplier {
  const _Supplier({required this.id, this.name = '', this.contact = '', this.phone = '', this.email = '', this.address = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Supplier.fromJson(Map<String, dynamic> json) => _$SupplierFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String contact;
@override@JsonKey() final  String phone;
@override@JsonKey() final  String email;
@override@JsonKey() final  String address;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Supplier
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SupplierCopyWith<_Supplier> get copyWith => __$SupplierCopyWithImpl<_Supplier>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SupplierToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Supplier&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.contact, contact) || other.contact == contact)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.email, email) || other.email == email)&&(identical(other.address, address) || other.address == address)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,contact,phone,email,address,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Supplier(id: $id, name: $name, contact: $contact, phone: $phone, email: $email, address: $address, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$SupplierCopyWith<$Res> implements $SupplierCopyWith<$Res> {
  factory _$SupplierCopyWith(_Supplier value, $Res Function(_Supplier) _then) = __$SupplierCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String contact, String phone, String email, String address,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$SupplierCopyWithImpl<$Res>
    implements _$SupplierCopyWith<$Res> {
  __$SupplierCopyWithImpl(this._self, this._then);

  final _Supplier _self;
  final $Res Function(_Supplier) _then;

/// Create a copy of Supplier
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? contact = null,Object? phone = null,Object? email = null,Object? address = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Supplier(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,contact: null == contact ? _self.contact : contact // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,email: null == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
