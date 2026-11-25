// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'people.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AppUser {

 String get id; String get name; String get email; String get username; String get phone; String get role; String get branchId; bool get active;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of AppUser
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AppUserCopyWith<AppUser> get copyWith => _$AppUserCopyWithImpl<AppUser>(this as AppUser, _$identity);

  /// Serializes this AppUser to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as AppUser;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AppUser&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.email, _this.email) || other.email == _this.email)&&(identical(other.username, _this.username) || other.username == _this.username)&&(identical(other.phone, _this.phone) || other.phone == _this.phone)&&(identical(other.role, _this.role) || other.role == _this.role)&&(identical(other.branchId, _this.branchId) || other.branchId == _this.branchId)&&(identical(other.active, _this.active) || other.active == _this.active)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as AppUser;
  return Object.hash(runtimeType,_this.id,_this.name,_this.email,_this.username,_this.phone,_this.role,_this.branchId,_this.active,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as AppUser;
  return 'AppUser(id: ${_this.id}, name: ${_this.name}, email: ${_this.email}, username: ${_this.username}, phone: ${_this.phone}, role: ${_this.role}, branchId: ${_this.branchId}, active: ${_this.active}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $AppUserCopyWith<$Res>  {
  factory $AppUserCopyWith(AppUser value, $Res Function(AppUser) _then) = _$AppUserCopyWithImpl;
@useResult
$Res call({
 String id, String name, String email, String username, String phone, String role, String branchId, bool active,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$AppUserCopyWithImpl<$Res>
    implements $AppUserCopyWith<$Res> {
  _$AppUserCopyWithImpl(this._self, this._then);

  final AppUser _self;
  final $Res Function(AppUser) _then;

/// Create a copy of AppUser
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? email = null,Object? username = null,Object? phone = null,Object? role = null,Object? branchId = null,Object? active = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(AppUser(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,email: null == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String,username: null == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,active: null == active ? _self.active : active // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [AppUser].
extension AppUserPatterns on AppUser {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AppUser value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AppUser() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AppUser value)  $default,){
final _that = this;
switch (_that) {
case _AppUser():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AppUser value)?  $default,){
final _that = this;
switch (_that) {
case _AppUser() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String email,  String username,  String phone,  String role,  String branchId,  bool active, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AppUser() when $default != null:
return $default(_that.id,_that.name,_that.email,_that.username,_that.phone,_that.role,_that.branchId,_that.active,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String email,  String username,  String phone,  String role,  String branchId,  bool active, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _AppUser():
return $default(_that.id,_that.name,_that.email,_that.username,_that.phone,_that.role,_that.branchId,_that.active,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String email,  String username,  String phone,  String role,  String branchId,  bool active, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _AppUser() when $default != null:
return $default(_that.id,_that.name,_that.email,_that.username,_that.phone,_that.role,_that.branchId,_that.active,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _AppUser extends AppUser {
  const _AppUser({required this.id, this.name = '', this.email = '', this.username = '', this.phone = '', this.role = 'cashier', this.branchId = '', this.active = true, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _AppUser.fromJson(Map<String, dynamic> json) => _$AppUserFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String email;
@override@JsonKey() final  String username;
@override@JsonKey() final  String phone;
@override@JsonKey() final  String role;
@override@JsonKey() final  String branchId;
@override@JsonKey() final  bool active;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of AppUser
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AppUserCopyWith<_AppUser> get copyWith => __$AppUserCopyWithImpl<_AppUser>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AppUserToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _AppUser&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.email, email) || other.email == email)&&(identical(other.username, username) || other.username == username)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.role, role) || other.role == role)&&(identical(other.branchId, branchId) || other.branchId == branchId)&&(identical(other.active, active) || other.active == active)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,email,username,phone,role,branchId,active,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'AppUser(id: $id, name: $name, email: $email, username: $username, phone: $phone, role: $role, branchId: $branchId, active: $active, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$AppUserCopyWith<$Res> implements $AppUserCopyWith<$Res> {
  factory _$AppUserCopyWith(_AppUser value, $Res Function(_AppUser) _then) = __$AppUserCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String email, String username, String phone, String role, String branchId, bool active,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$AppUserCopyWithImpl<$Res>
    implements _$AppUserCopyWith<$Res> {
  __$AppUserCopyWithImpl(this._self, this._then);

  final _AppUser _self;
  final $Res Function(_AppUser) _then;

/// Create a copy of AppUser
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? email = null,Object? username = null,Object? phone = null,Object? role = null,Object? branchId = null,Object? active = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_AppUser(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,email: null == email ? _self.email : email // ignore: cast_nullable_to_non_nullable
as String,username: null == username ? _self.username : username // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as String,branchId: null == branchId ? _self.branchId : branchId // ignore: cast_nullable_to_non_nullable
as String,active: null == active ? _self.active : active // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}


/// @nodoc
mixin _$Role {

 String get id; String get name; List<String> get permissions; bool get builtIn;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Role
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RoleCopyWith<Role> get copyWith => _$RoleCopyWithImpl<Role>(this as Role, _$identity);

  /// Serializes this Role to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Role;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Role&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&const DeepCollectionEquality().equals(other.permissions, _this.permissions)&&(identical(other.builtIn, _this.builtIn) || other.builtIn == _this.builtIn)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Role;
  return Object.hash(runtimeType,_this.id,_this.name,const DeepCollectionEquality().hash(_this.permissions),_this.builtIn,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Role;
  return 'Role(id: ${_this.id}, name: ${_this.name}, permissions: ${_this.permissions}, builtIn: ${_this.builtIn}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $RoleCopyWith<$Res>  {
  factory $RoleCopyWith(Role value, $Res Function(Role) _then) = _$RoleCopyWithImpl;
@useResult
$Res call({
 String id, String name, List<String> permissions, bool builtIn,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$RoleCopyWithImpl<$Res>
    implements $RoleCopyWith<$Res> {
  _$RoleCopyWithImpl(this._self, this._then);

  final Role _self;
  final $Res Function(Role) _then;

/// Create a copy of Role
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? permissions = null,Object? builtIn = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Role(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,permissions: null == permissions ? _self.permissions : permissions // ignore: cast_nullable_to_non_nullable
as List<String>,builtIn: null == builtIn ? _self.builtIn : builtIn // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Role].
extension RolePatterns on Role {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Role value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Role() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Role value)  $default,){
final _that = this;
switch (_that) {
case _Role():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Role value)?  $default,){
final _that = this;
switch (_that) {
case _Role() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  List<String> permissions,  bool builtIn, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Role() when $default != null:
return $default(_that.id,_that.name,_that.permissions,_that.builtIn,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  List<String> permissions,  bool builtIn, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Role():
return $default(_that.id,_that.name,_that.permissions,_that.builtIn,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  List<String> permissions,  bool builtIn, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Role() when $default != null:
return $default(_that.id,_that.name,_that.permissions,_that.builtIn,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Role extends Role {
  const _Role({required this.id, this.name = '',  List<String> permissions = const <String>[], this.builtIn = false, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _permissions = permissions,_raw = raw,super._();
  factory _Role.fromJson(Map<String, dynamic> json) => _$RoleFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
 final  List<String> _permissions;
@override@JsonKey() List<String> get permissions {
  if (_permissions is EqualUnmodifiableListView) return _permissions;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_permissions);
}

@override@JsonKey() final  bool builtIn;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Role
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RoleCopyWith<_Role> get copyWith => __$RoleCopyWithImpl<_Role>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RoleToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Role&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&const DeepCollectionEquality().equals(other.permissions, _permissions)&&(identical(other.builtIn, builtIn) || other.builtIn == builtIn)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,const DeepCollectionEquality().hash(_permissions),builtIn,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Role(id: $id, name: $name, permissions: $permissions, builtIn: $builtIn, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$RoleCopyWith<$Res> implements $RoleCopyWith<$Res> {
  factory _$RoleCopyWith(_Role value, $Res Function(_Role) _then) = __$RoleCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, List<String> permissions, bool builtIn,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$RoleCopyWithImpl<$Res>
    implements _$RoleCopyWith<$Res> {
  __$RoleCopyWithImpl(this._self, this._then);

  final _Role _self;
  final $Res Function(_Role) _then;

/// Create a copy of Role
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? permissions = null,Object? builtIn = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Role(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,permissions: null == permissions ? _self._permissions : permissions // ignore: cast_nullable_to_non_nullable
as List<String>,builtIn: null == builtIn ? _self.builtIn : builtIn // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}


/// @nodoc
mixin _$Branch {

 String get id; String get name; String get address; String get phone;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of Branch
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BranchCopyWith<Branch> get copyWith => _$BranchCopyWithImpl<Branch>(this as Branch, _$identity);

  /// Serializes this Branch to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as Branch;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Branch&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.address, _this.address) || other.address == _this.address)&&(identical(other.phone, _this.phone) || other.phone == _this.phone)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as Branch;
  return Object.hash(runtimeType,_this.id,_this.name,_this.address,_this.phone,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw));
}

@override
String toString() {
  final _this = this as Branch;
  return 'Branch(id: ${_this.id}, name: ${_this.name}, address: ${_this.address}, phone: ${_this.phone}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $BranchCopyWith<$Res>  {
  factory $BranchCopyWith(Branch value, $Res Function(Branch) _then) = _$BranchCopyWithImpl;
@useResult
$Res call({
 String id, String name, String address, String phone,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$BranchCopyWithImpl<$Res>
    implements $BranchCopyWith<$Res> {
  _$BranchCopyWithImpl(this._self, this._then);

  final Branch _self;
  final $Res Function(Branch) _then;

/// Create a copy of Branch
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? address = null,Object? phone = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(Branch(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [Branch].
extension BranchPatterns on Branch {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Branch value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Branch() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Branch value)  $default,){
final _that = this;
switch (_that) {
case _Branch():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Branch value)?  $default,){
final _that = this;
switch (_that) {
case _Branch() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String address,  String phone, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Branch() when $default != null:
return $default(_that.id,_that.name,_that.address,_that.phone,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String address,  String phone, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _Branch():
return $default(_that.id,_that.name,_that.address,_that.phone,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String address,  String phone, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _Branch() when $default != null:
return $default(_that.id,_that.name,_that.address,_that.phone,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _Branch extends Branch {
  const _Branch({required this.id, this.name = '', this.address = '', this.phone = '', @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _raw = raw,super._();
  factory _Branch.fromJson(Map<String, dynamic> json) => _$BranchFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String address;
@override@JsonKey() final  String phone;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of Branch
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BranchCopyWith<_Branch> get copyWith => __$BranchCopyWithImpl<_Branch>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BranchToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _Branch&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.address, address) || other.address == address)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,address,phone,updatedAt,const DeepCollectionEquality().hash(_raw));
}

@override
String toString() {
    return 'Branch(id: $id, name: $name, address: $address, phone: $phone, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$BranchCopyWith<$Res> implements $BranchCopyWith<$Res> {
  factory _$BranchCopyWith(_Branch value, $Res Function(_Branch) _then) = __$BranchCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String address, String phone,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$BranchCopyWithImpl<$Res>
    implements _$BranchCopyWith<$Res> {
  __$BranchCopyWithImpl(this._self, this._then);

  final _Branch _self;
  final $Res Function(_Branch) _then;

/// Create a copy of Branch
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? address = null,Object? phone = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_Branch(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
