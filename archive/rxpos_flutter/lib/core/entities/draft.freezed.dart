// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'draft.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Draft {

 String get id;/// 'sale' | 'delivery'
 String get kind; String get branchId; String get mode; String get userId; String get userName; double get order; String get startedAt; String get title; double get count; double get total;/// the held sale or delivery itself, as the React app stores it
 Map<String, Object?>? get data;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Draft
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DraftCopyWith<Draft> get copyWith => _$DraftCopyWithImpl<Draft>(this as Draft, _$identity);

  /// Serializes this Draft to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Draft;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Draft&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.kind, _this.kind) || other.kind == _this.kind)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&(identical(other.mode, _this.mode) || other.mode == _this.mode)&&(identical(other.userId, _this.userId) || other.userId == _this.userId)&&(identical(other.userName, _this.userName) || other.userName == _this.userName)&&(identical(other.order, _this.order) || other.order == _this.order)&&(identical(other.startedAt, _this.startedAt) || other.startedAt == _this.startedAt)&&(identical(other.title, _this.title) || other.title == _this.title)&&(identical(other.count, _this.count) || other.count == _this.count)&&(identical(other.total, _this.total) || other.total == _this.total)&&const DeepCollectionEquality().equals(other.data, _this.data)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Draft;
  return Object.hash(runtimeType,_this.id,_this.kind,_this.branchId,_this.mode,_this.userId,_this.userName,_this.order,_this.startedAt,_this.title,_this.count,_this.total,const DeepCollectionEquality().hash(_this.data),_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Draft;
  return 'Draft(id: ${_this.id}, kind: ${_this.kind}, branchId: ${_this.branchId}, mode: ${_this.mode}, userId: ${_this.userId}, userName: ${_this.userName}, order: ${_this.order}, startedAt: ${_this.startedAt}, title: ${_this.title}, count: ${_this.count}, total: ${_this.total}, data: ${_this.data}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $DraftCopyWith<$Res>  {
  factory $DraftCopyWith(Draft value, $Res Function(Draft) _then) = _$DraftCopyWithImpl;
@useResult
$Res call({
 String id, String kind, String branchId, String mode, String userId, String userName, double order, String startedAt, String title, double count, double total, Map<String, Object?>? data,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$DraftCopyWithImpl<$Res>
    implements $DraftCopyWith<$Res> {
  _$DraftCopyWithImpl(this._self, this._then);

  final Draft _self;
  final $Res Function(Draft) _then;

/// Create a copy of Draft
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? kind = null,Object? branchId = null,Object? mode = null,Object? userId = null,Object? userName = null,Object? order = null,Object? startedAt = null,Object? title = null,Object? count = null,Object? total = null,Object? data = freezed,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Draft(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,kind: null == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,mode: null == mode ? _self.mode : mode // ignore: cast_nullable_to_non_nullable
as String,userId: null == userId ? _self.userId : userId // ignore: cast_nullable_to_non_nullable
as String,userName: null == userName ? _self.userName : userName // ignore: cast_nullable_to_non_nullable
as String,order: null == order ? _self.order : order // ignore: cast_nullable_to_non_nullable
as double,startedAt: null == startedAt ? _self.startedAt : startedAt // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,data: freezed == data ? _self.data : data // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>?,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Draft].
extension DraftPatterns on Draft {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Draft value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Draft() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Draft value)  $default,){
final _that = this;
switch (_that) {
case _Draft():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Draft value)?  $default,){
final _that = this;
switch (_that) {
case _Draft() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String kind,  String branchId,  String mode,  String userId,  String userName,  double order,  String startedAt,  String title,  double count,  double total,  Map<String, Object?>? data, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Draft() when $default != null:
return $default(_that.id,_that.kind,_that.branchId,_that.mode,_that.userId,_that.userName,_that.order,_that.startedAt,_that.title,_that.count,_that.total,_that.data,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String kind,  String branchId,  String mode,  String userId,  String userName,  double order,  String startedAt,  String title,  double count,  double total,  Map<String, Object?>? data, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Draft():
return $default(_that.id,_that.kind,_that.branchId,_that.mode,_that.userId,_that.userName,_that.order,_that.startedAt,_that.title,_that.count,_that.total,_that.data,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String kind,  String branchId,  String mode,  String userId,  String userName,  double order,  String startedAt,  String title,  double count,  double total,  Map<String, Object?>? data, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Draft() when $default != null:
return $default(_that.id,_that.kind,_that.branchId,_that.mode,_that.userId,_that.userName,_that.order,_that.startedAt,_that.title,_that.count,_that.total,_that.data,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Draft extends Draft {
  const _Draft({required this.id, this.kind = 'sale', this.branchId = 'main', this.mode = '', this.userId = '', this.userName = '', this.order = 0, this.startedAt = '', this.title = '', this.count = 0, this.total = 0,  Map<String, Object?>? data, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _data = data,_raw = raw,super._();
  factory _Draft.fromJson(Map<String, dynamic> json) => _$DraftFromJson(json);

@override final  String id;
/// 'sale' | 'delivery'
@override@JsonKey() final  String kind;
@override@JsonKey() final  String branchId;
@override@JsonKey() final  String mode;
@override@JsonKey() final  String userId;
@override@JsonKey() final  String userName;
@override@JsonKey() final  double order;
@override@JsonKey() final  String startedAt;
@override@JsonKey() final  String title;
@override@JsonKey() final  double count;
@override@JsonKey() final  double total;
/// the held sale or delivery itself, as the React app stores it
 final  Map<String, Object?>? _data;
/// the held sale or delivery itself, as the React app stores it
@override Map<String, Object?>? get data {
  final value = _data;
  if (value == null) return null;
  if (_data is EqualUnmodifiableMapView) return _data;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Draft
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DraftCopyWith<_Draft> get copyWith => __$DraftCopyWithImpl<_Draft>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DraftToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Draft&&(identical(other.id, id) || other.id == id)&&(identical(other.kind, kind) || other.kind == kind)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&(identical(other.mode, mode) || other.mode == mode)&&(identical(other.userId, userId) || other.userId == userId)&&(identical(other.userName, userName) || other.userName == userName)&&(identical(other.order, order) || other.order == order)&&(identical(other.startedAt, startedAt) || other.startedAt == startedAt)&&(identical(other.title, title) || other.title == title)&&(identical(other.count, count) || other.count == count)&&(identical(other.total, total) || other.total == total)&&const DeepCollectionEquality().equals(other.data, _data)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,kind,branchId,mode,userId,userName,order,startedAt,title,count,total,const DeepCollectionEquality().hash(_data),updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Draft(id: $id, kind: $kind, branchId: $branchId, mode: $mode, userId: $userId, userName: $userName, order: $order, startedAt: $startedAt, title: $title, count: $count, total: $total, data: $data, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$DraftCopyWith<$Res> implements $DraftCopyWith<$Res> {
  factory _$DraftCopyWith(_Draft value, $Res Function(_Draft) _then) = __$DraftCopyWithImpl;
@override @useResult
$Res call({
 String id, String kind, String branchId, String mode, String userId, String userName, double order, String startedAt, String title, double count, double total, Map<String, Object?>? data,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$DraftCopyWithImpl<$Res>
    implements _$DraftCopyWith<$Res> {
  __$DraftCopyWithImpl(this._self, this._then);

  final _Draft _self;
  final $Res Function(_Draft) _then;

/// Create a copy of Draft
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? kind = null,Object? branchId = null,Object? mode = null,Object? userId = null,Object? userName = null,Object? order = null,Object? startedAt = null,Object? title = null,Object? count = null,Object? total = null,Object? data = freezed,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Draft(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,kind: null == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,mode: null == mode ? _self.mode : mode // ignore: cast_nullable_to_non_nullable
as String,userId: null == userId ? _self.userId : userId // ignore: cast_nullable_to_non_nullable
as String,userName: null == userName ? _self.userName : userName // ignore: cast_nullable_to_non_nullable
as String,order: null == order ? _self.order : order // ignore: cast_nullable_to_non_nullable
as double,startedAt: null == startedAt ? _self.startedAt : startedAt // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,count: null == count ? _self.count : count // ignore: cast_nullable_to_non_nullable
as double,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,data: freezed == data ? _self._data : data // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>?,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
