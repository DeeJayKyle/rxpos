// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'batch.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Batch {

 String get id; String get productId; String get batch; String get expiry; double get cost; String get received;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Batch
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BatchCopyWith<Batch> get copyWith => _$BatchCopyWithImpl<Batch>(this as Batch, _$identity);

  /// Serializes this Batch to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Batch;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Batch&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.productId, _this.productId) || other.productId == _this.productId)&&(identical(other.batch, _this.batch) || other.batch == _this.batch)&&(identical(other.expiry, _this.expiry) || other.expiry == _this.expiry)&&(identical(other.cost, _this.cost) || other.cost == _this.cost)&&(identical(other.received, _this.received) || other.received == _this.received)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Batch;
  return Object.hash(runtimeType,_this.id,_this.productId,_this.batch,_this.expiry,_this.cost,_this.received,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Batch;
  return 'Batch(id: ${_this.id}, productId: ${_this.productId}, batch: ${_this.batch}, expiry: ${_this.expiry}, cost: ${_this.cost}, received: ${_this.received}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $BatchCopyWith<$Res>  {
  factory $BatchCopyWith(Batch value, $Res Function(Batch) _then) = _$BatchCopyWithImpl;
@useResult
$Res call({
 String id, String productId, String batch, String expiry, double cost, String received,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$BatchCopyWithImpl<$Res>
    implements $BatchCopyWith<$Res> {
  _$BatchCopyWithImpl(this._self, this._then);

  final Batch _self;
  final $Res Function(Batch) _then;

/// Create a copy of Batch
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? productId = null,Object? batch = null,Object? expiry = null,Object? cost = null,Object? received = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Batch(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,received: null == received ? _self.received : received // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Batch].
extension BatchPatterns on Batch {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Batch value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Batch() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Batch value)  $default,){
final _that = this;
switch (_that) {
case _Batch():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Batch value)?  $default,){
final _that = this;
switch (_that) {
case _Batch() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String productId,  String batch,  String expiry,  double cost,  String received, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Batch() when $default != null:
return $default(_that.id,_that.productId,_that.batch,_that.expiry,_that.cost,_that.received,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String productId,  String batch,  String expiry,  double cost,  String received, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Batch():
return $default(_that.id,_that.productId,_that.batch,_that.expiry,_that.cost,_that.received,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String productId,  String batch,  String expiry,  double cost,  String received, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Batch() when $default != null:
return $default(_that.id,_that.productId,_that.batch,_that.expiry,_that.cost,_that.received,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Batch extends Batch {
  const _Batch({required this.id, this.productId = '', this.batch = '', this.expiry = '', this.cost = 0, this.received = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Batch.fromJson(Map<String, dynamic> json) => _$BatchFromJson(json);

@override final  String id;
@override@JsonKey() final  String productId;
@override@JsonKey() final  String batch;
@override@JsonKey() final  String expiry;
@override@JsonKey() final  double cost;
@override@JsonKey() final  String received;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Batch
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BatchCopyWith<_Batch> get copyWith => __$BatchCopyWithImpl<_Batch>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BatchToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Batch&&(identical(other.id, id) || other.id == id)&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.batch, batch) || other.batch == batch)&&(identical(other.expiry, expiry) || other.expiry == expiry)&&(identical(other.cost, cost) || other.cost == cost)&&(identical(other.received, received) || other.received == received)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,productId,batch,expiry,cost,received,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Batch(id: $id, productId: $productId, batch: $batch, expiry: $expiry, cost: $cost, received: $received, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$BatchCopyWith<$Res> implements $BatchCopyWith<$Res> {
  factory _$BatchCopyWith(_Batch value, $Res Function(_Batch) _then) = __$BatchCopyWithImpl;
@override @useResult
$Res call({
 String id, String productId, String batch, String expiry, double cost, String received,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$BatchCopyWithImpl<$Res>
    implements _$BatchCopyWith<$Res> {
  __$BatchCopyWithImpl(this._self, this._then);

  final _Batch _self;
  final $Res Function(_Batch) _then;

/// Create a copy of Batch
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? productId = null,Object? batch = null,Object? expiry = null,Object? cost = null,Object? received = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Batch(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,batch: null == batch ? _self.batch : batch // ignore: cast_nullable_to_non_nullable
as String,expiry: null == expiry ? _self.expiry : expiry // ignore: cast_nullable_to_non_nullable
as String,cost: null == cost ? _self.cost : cost // ignore: cast_nullable_to_non_nullable
as double,received: null == received ? _self.received : received // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
