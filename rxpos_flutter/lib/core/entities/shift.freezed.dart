// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'shift.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Shift {

 String get id; String get userId; String get user; String get branchId; String get openedAt; double get float; String? get closedAt; double get counted; double get expected; double get variance; String get note;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Shift
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ShiftCopyWith<Shift> get copyWith => _$ShiftCopyWithImpl<Shift>(this as Shift, _$identity);

  /// Serializes this Shift to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Shift;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Shift&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.userId, _this.userId) || other.userId == _this.userId)&&(identical(other.user, _this.user) || other.user == _this.user)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&(identical(other.openedAt, _this.openedAt) || other.openedAt == _this.openedAt)&&(identical(other.float, _this.float) || other.float == _this.float)&&(identical(other.closedAt, _this.closedAt) || other.closedAt == _this.closedAt)&&(identical(other.counted, _this.counted) || other.counted == _this.counted)&&(identical(other.expected, _this.expected) || other.expected == _this.expected)&&(identical(other.variance, _this.variance) || other.variance == _this.variance)&&(identical(other.note, _this.note) || other.note == _this.note)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Shift;
  return Object.hash(runtimeType,_this.id,_this.userId,_this.user,_this.branchId,_this.openedAt,_this.float,_this.closedAt,_this.counted,_this.expected,_this.variance,_this.note,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Shift;
  return 'Shift(id: ${_this.id}, userId: ${_this.userId}, user: ${_this.user}, branchId: ${_this.branchId}, openedAt: ${_this.openedAt}, float: ${_this.float}, closedAt: ${_this.closedAt}, counted: ${_this.counted}, expected: ${_this.expected}, variance: ${_this.variance}, note: ${_this.note}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $ShiftCopyWith<$Res>  {
  factory $ShiftCopyWith(Shift value, $Res Function(Shift) _then) = _$ShiftCopyWithImpl;
@useResult
$Res call({
 String id, String userId, String user, String branchId, String openedAt, double float, String? closedAt, double counted, double expected, double variance, String note,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$ShiftCopyWithImpl<$Res>
    implements $ShiftCopyWith<$Res> {
  _$ShiftCopyWithImpl(this._self, this._then);

  final Shift _self;
  final $Res Function(Shift) _then;

/// Create a copy of Shift
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? userId = null,Object? user = null,Object? branchId = null,Object? openedAt = null,Object? float = null,Object? closedAt = freezed,Object? counted = null,Object? expected = null,Object? variance = null,Object? note = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Shift(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,userId: null == userId ? _self.userId : userId // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,openedAt: null == openedAt ? _self.openedAt : openedAt // ignore: cast_nullable_to_non_nullable
as String,float: null == float ? _self.float : float // ignore: cast_nullable_to_non_nullable
as double,closedAt: freezed == closedAt ? _self.closedAt : closedAt // ignore: cast_nullable_to_non_nullable
as String?,counted: null == counted ? _self.counted : counted // ignore: cast_nullable_to_non_nullable
as double,expected: null == expected ? _self.expected : expected // ignore: cast_nullable_to_non_nullable
as double,variance: null == variance ? _self.variance : variance // ignore: cast_nullable_to_non_nullable
as double,note: null == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Shift].
extension ShiftPatterns on Shift {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Shift value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Shift() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Shift value)  $default,){
final _that = this;
switch (_that) {
case _Shift():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Shift value)?  $default,){
final _that = this;
switch (_that) {
case _Shift() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String userId,  String user,  String branchId,  String openedAt,  double float,  String? closedAt,  double counted,  double expected,  double variance,  String note, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Shift() when $default != null:
return $default(_that.id,_that.userId,_that.user,_that.branchId,_that.openedAt,_that.float,_that.closedAt,_that.counted,_that.expected,_that.variance,_that.note,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String userId,  String user,  String branchId,  String openedAt,  double float,  String? closedAt,  double counted,  double expected,  double variance,  String note, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Shift():
return $default(_that.id,_that.userId,_that.user,_that.branchId,_that.openedAt,_that.float,_that.closedAt,_that.counted,_that.expected,_that.variance,_that.note,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String userId,  String user,  String branchId,  String openedAt,  double float,  String? closedAt,  double counted,  double expected,  double variance,  String note, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Shift() when $default != null:
return $default(_that.id,_that.userId,_that.user,_that.branchId,_that.openedAt,_that.float,_that.closedAt,_that.counted,_that.expected,_that.variance,_that.note,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Shift extends Shift {
  const _Shift({required this.id, this.userId = '', this.user = '', this.branchId = 'main', this.openedAt = '', this.float = 0, this.closedAt, this.counted = 0, this.expected = 0, this.variance = 0, this.note = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Shift.fromJson(Map<String, dynamic> json) => _$ShiftFromJson(json);

@override final  String id;
@override@JsonKey() final  String userId;
@override@JsonKey() final  String user;
@override@JsonKey() final  String branchId;
@override@JsonKey() final  String openedAt;
@override@JsonKey() final  double float;
@override final  String? closedAt;
@override@JsonKey() final  double counted;
@override@JsonKey() final  double expected;
@override@JsonKey() final  double variance;
@override@JsonKey() final  String note;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Shift
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ShiftCopyWith<_Shift> get copyWith => __$ShiftCopyWithImpl<_Shift>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ShiftToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Shift&&(identical(other.id, id) || other.id == id)&&(identical(other.userId, userId) || other.userId == userId)&&(identical(other.user, user) || other.user == user)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&(identical(other.openedAt, openedAt) || other.openedAt == openedAt)&&(identical(other.float, float) || other.float == float)&&(identical(other.closedAt, closedAt) || other.closedAt == closedAt)&&(identical(other.counted, counted) || other.counted == counted)&&(identical(other.expected, expected) || other.expected == expected)&&(identical(other.variance, variance) || other.variance == variance)&&(identical(other.note, note) || other.note == note)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,userId,user,branchId,openedAt,float,closedAt,counted,expected,variance,note,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Shift(id: $id, userId: $userId, user: $user, branchId: $branchId, openedAt: $openedAt, float: $float, closedAt: $closedAt, counted: $counted, expected: $expected, variance: $variance, note: $note, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$ShiftCopyWith<$Res> implements $ShiftCopyWith<$Res> {
  factory _$ShiftCopyWith(_Shift value, $Res Function(_Shift) _then) = __$ShiftCopyWithImpl;
@override @useResult
$Res call({
 String id, String userId, String user, String branchId, String openedAt, double float, String? closedAt, double counted, double expected, double variance, String note,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$ShiftCopyWithImpl<$Res>
    implements _$ShiftCopyWith<$Res> {
  __$ShiftCopyWithImpl(this._self, this._then);

  final _Shift _self;
  final $Res Function(_Shift) _then;

/// Create a copy of Shift
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? userId = null,Object? user = null,Object? branchId = null,Object? openedAt = null,Object? float = null,Object? closedAt = freezed,Object? counted = null,Object? expected = null,Object? variance = null,Object? note = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Shift(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,userId: null == userId ? _self.userId : userId // ignore: cast_nullable_to_non_nullable
as String,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,openedAt: null == openedAt ? _self.openedAt : openedAt // ignore: cast_nullable_to_non_nullable
as String,float: null == float ? _self.float : float // ignore: cast_nullable_to_non_nullable
as double,closedAt: freezed == closedAt ? _self.closedAt : closedAt // ignore: cast_nullable_to_non_nullable
as String?,counted: null == counted ? _self.counted : counted // ignore: cast_nullable_to_non_nullable
as double,expected: null == expected ? _self.expected : expected // ignore: cast_nullable_to_non_nullable
as double,variance: null == variance ? _self.variance : variance // ignore: cast_nullable_to_non_nullable
as double,note: null == note ? _self.note : note // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
