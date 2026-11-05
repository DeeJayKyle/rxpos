// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'movement.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Movement {

 String get id; String get productId; double get qty; String get type; String get ref; String get note; String get user;/// null: stock recorded without a batch (older data)
 String? get batchId; String get branchId; String get date;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Movement
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MovementCopyWith<Movement> get copyWith => _$MovementCopyWithImpl<Movement>(this as Movement, _$identity);

  /// Serializes this Movement to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Movement;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Movement&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.productId, _this.productId) || other.productId == _this.productId)&&(identical(other.qty, _this.qty) || other.qty == _this.qty)&&(identical(other.type, _this.type) || other.type == _this.type)&&(identical(other.ref, _this.ref) || other.ref == _this.ref)&&(identical(other.note, _this.note) || other.note == _this.note)&&(identical(other.user, _this.user) || other.user == _this.user)&&(identical(other.batchId, _this.batchId) || other.batchId == _this.batchId)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&(identical(other.date, _this.date) || other.date == _this.date)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Movement;
  return Object.hash(runtimeType,_this.id,_this.productId,_this.qty,_this.type,_this.ref,_this.note,_this.user,_this.batchId,_this.branchId,_this.date,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Movement;
  return 'Movement(id: ${_this.id}, productId: ${_this.productId}, qty: ${_this.qty}, type: ${_this.type}, ref: ${_this.ref}, note: ${_this.note}, user: ${_this.user}, batchId: ${_this.batchId}, branchId: ${_this.branchId}, date: ${_this.date}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $MovementCopyWith<$Res>  {
  factory $MovementCopyWith(Movement value, $Res Function(Movement) _then) = _$MovementCopyWithImpl;
@useResult
$Res call({
 String id, String productId, double qty, String type, String ref, String note, String user, String? batchId, String branchId, String date,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$MovementCopyWithImpl<$Res>
    implements $MovementCopyWith<$Res> {
  _$MovementCopyWithImpl(this._self, this._then);

  final Movement _self;
  final $Res Function(Movement) _then;

/// Create a copy of Movement
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? productId = null,Object? qty = null,Object? type = null,Object? ref = null,Object? note = null,Object? user = null,Object? batchId = freezed,Object? branchId = null,Object? date = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Movement(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,ref: null == ref ? _self.ref : ref // ignore: cast_nullable_to_non_nullable
as String,note: null == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as String,batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Movement].
extension MovementPatterns on Movement {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Movement value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Movement() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Movement value)  $default,){
final _that = this;
switch (_that) {
case _Movement():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Movement value)?  $default,){
final _that = this;
switch (_that) {
case _Movement() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String productId,  double qty,  String type,  String ref,  String note,  String user,  String? batchId,  String branchId,  String date, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Movement() when $default != null:
return $default(_that.id,_that.productId,_that.qty,_that.type,_that.ref,_that.note,_that.user,_that.batchId,_that.branchId,_that.date,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String productId,  double qty,  String type,  String ref,  String note,  String user,  String? batchId,  String branchId,  String date, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Movement():
return $default(_that.id,_that.productId,_that.qty,_that.type,_that.ref,_that.note,_that.user,_that.batchId,_that.branchId,_that.date,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String productId,  double qty,  String type,  String ref,  String note,  String user,  String? batchId,  String branchId,  String date, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Movement() when $default != null:
return $default(_that.id,_that.productId,_that.qty,_that.type,_that.ref,_that.note,_that.user,_that.batchId,_that.branchId,_that.date,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Movement extends Movement {
  const _Movement({required this.id, this.productId = '', this.qty = 0, this.type = '', this.ref = '', this.note = '', this.user = '', this.batchId, this.branchId = 'main', this.date = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Movement.fromJson(Map<String, dynamic> json) => _$MovementFromJson(json);

@override final  String id;
@override@JsonKey() final  String productId;
@override@JsonKey() final  double qty;
@override@JsonKey() final  String type;
@override@JsonKey() final  String ref;
@override@JsonKey() final  String note;
@override@JsonKey() final  String user;
/// null: stock recorded without a batch (older data)
@override final  String? batchId;
@override@JsonKey() final  String branchId;
@override@JsonKey() final  String date;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Movement
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MovementCopyWith<_Movement> get copyWith => __$MovementCopyWithImpl<_Movement>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MovementToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Movement&&(identical(other.id, id) || other.id == id)&&(identical(other.productId, productId) || other.productId == productId)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.type, type) || other.type == type)&&(identical(other.ref, ref) || other.ref == ref)&&(identical(other.note, note) || other.note == note)&&(identical(other.user, user) || other.user == user)&&(identical(other.batchId, batchId) || other.batchId == batchId)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&(identical(other.date, date) || other.date == date)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,productId,qty,type,ref,note,user,batchId,branchId,date,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Movement(id: $id, productId: $productId, qty: $qty, type: $type, ref: $ref, note: $note, user: $user, batchId: $batchId, branchId: $branchId, date: $date, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$MovementCopyWith<$Res> implements $MovementCopyWith<$Res> {
  factory _$MovementCopyWith(_Movement value, $Res Function(_Movement) _then) = __$MovementCopyWithImpl;
@override @useResult
$Res call({
 String id, String productId, double qty, String type, String ref, String note, String user, String? batchId, String branchId, String date,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$MovementCopyWithImpl<$Res>
    implements _$MovementCopyWith<$Res> {
  __$MovementCopyWithImpl(this._self, this._then);

  final _Movement _self;
  final $Res Function(_Movement) _then;

/// Create a copy of Movement
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? productId = null,Object? qty = null,Object? type = null,Object? ref = null,Object? note = null,Object? user = null,Object? batchId = freezed,Object? branchId = null,Object? date = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Movement(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,productId: null == productId ? _self.productId : productId // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as double,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,ref: null == ref ? _self.ref : ref // ignore: cast_nullable_to_non_nullable
as String,note: null == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as String,batchId: freezed == batchId ? _self.batchId : batchId // ignore: cast_nullable_to_non_nullable
as String?,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
