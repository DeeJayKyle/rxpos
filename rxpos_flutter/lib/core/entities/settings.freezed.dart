// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'settings.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PaymentMethod {

 String get id; String get name; String get type;
/// Create a copy of PaymentMethod
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PaymentMethodCopyWith<PaymentMethod> get copyWith => _$PaymentMethodCopyWithImpl<PaymentMethod>(this as PaymentMethod, _$identity);

  /// Serializes this PaymentMethod to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PaymentMethod;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PaymentMethod&&(identical(other.id, _this.id) || other.id == _this.id)&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.type, _this.type) || other.type == _this.type));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PaymentMethod;
  return Object.hash(runtimeType,_this.id,_this.name,_this.type);
}

@override
String toString() {
  final _this = this as PaymentMethod;
  return 'PaymentMethod(id: ${_this.id}, name: ${_this.name}, type: ${_this.type})';
}


}

/// @nodoc
abstract mixin class $PaymentMethodCopyWith<$Res>  {
  factory $PaymentMethodCopyWith(PaymentMethod value, $Res Function(PaymentMethod) _then) = _$PaymentMethodCopyWithImpl;
@useResult
$Res call({
 String id, String name, String type
});




}
/// @nodoc
class _$PaymentMethodCopyWithImpl<$Res>
    implements $PaymentMethodCopyWith<$Res> {
  _$PaymentMethodCopyWithImpl(this._self, this._then);

  final PaymentMethod _self;
  final $Res Function(PaymentMethod) _then;

/// Create a copy of PaymentMethod
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? type = null,}) {
  return _then(PaymentMethod(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [PaymentMethod].
extension PaymentMethodPatterns on PaymentMethod {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PaymentMethod value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PaymentMethod() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PaymentMethod value)  $default,){
final _that = this;
switch (_that) {
case _PaymentMethod():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PaymentMethod value)?  $default,){
final _that = this;
switch (_that) {
case _PaymentMethod() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name,  String type)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PaymentMethod() when $default != null:
return $default(_that.id,_that.name,_that.type);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name,  String type)  $default,) {final _that = this;
switch (_that) {
case _PaymentMethod():
return $default(_that.id,_that.name,_that.type);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name,  String type)?  $default,) {final _that = this;
switch (_that) {
case _PaymentMethod() when $default != null:
return $default(_that.id,_that.name,_that.type);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _PaymentMethod implements PaymentMethod {
  const _PaymentMethod({required this.id, this.name = '', this.type = 'other'});
  factory _PaymentMethod.fromJson(Map<String, dynamic> json) => _$PaymentMethodFromJson(json);

@override final  String id;
@override@JsonKey() final  String name;
@override@JsonKey() final  String type;

/// Create a copy of PaymentMethod
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PaymentMethodCopyWith<_PaymentMethod> get copyWith => __$PaymentMethodCopyWithImpl<_PaymentMethod>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PaymentMethodToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PaymentMethod&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.type, type) || other.type == type));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hash(runtimeType,id,name,type);
}

@override
String toString() {
    return 'PaymentMethod(id: $id, name: $name, type: $type)';
}


}

/// @nodoc
abstract mixin class _$PaymentMethodCopyWith<$Res> implements $PaymentMethodCopyWith<$Res> {
  factory _$PaymentMethodCopyWith(_PaymentMethod value, $Res Function(_PaymentMethod) _then) = __$PaymentMethodCopyWithImpl;
@override @useResult
$Res call({
 String id, String name, String type
});




}
/// @nodoc
class __$PaymentMethodCopyWithImpl<$Res>
    implements _$PaymentMethodCopyWith<$Res> {
  __$PaymentMethodCopyWithImpl(this._self, this._then);

  final _PaymentMethod _self;
  final $Res Function(_PaymentMethod) _then;

/// Create a copy of PaymentMethod
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? type = null,}) {
  return _then(_PaymentMethod(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$PharmacySettings {

 String get name; String get phone; String get address; String get currency; double get decimals; String get locale; double get taxRate; bool get taxInclusive; double get retailMarkup; double get wholesaleMarkup; double get priceRound; double get expiryWarnDays;/// 'off' | 'optional' | 'required': whether the till asks for the client
 String get clientCapture;/// packs: 'pack' | 'unit' (src/packs.js)
 String get receiveUnit; String get sellUnitRetail; String get sellUnitWholesale; List<PaymentMethod> get paymentMethods; bool get autoPrint;@JsonKey(includeToJson: false) String get updatedAt;@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw;
/// Create a copy of PharmacySettings
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PharmacySettingsCopyWith<PharmacySettings> get copyWith => _$PharmacySettingsCopyWithImpl<PharmacySettings>(this as PharmacySettings, _$identity);

  /// Serializes this PharmacySettings to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  final _this = this as PharmacySettings;
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PharmacySettings&&(identical(other.name, _this.name) || other.name == _this.name)&&(identical(other.phone, _this.phone) || other.phone == _this.phone)&&(identical(other.address, _this.address) || other.address == _this.address)&&(identical(other.currency, _this.currency) || other.currency == _this.currency)&&(identical(other.decimals, _this.decimals) || other.decimals == _this.decimals)&&(identical(other.locale, _this.locale) || other.locale == _this.locale)&&(identical(other.taxRate, _this.taxRate) || other.taxRate == _this.taxRate)&&(identical(other.taxInclusive, _this.taxInclusive) || other.taxInclusive == _this.taxInclusive)&&(identical(other.retailMarkup, _this.retailMarkup) || other.retailMarkup == _this.retailMarkup)&&(identical(other.wholesaleMarkup, _this.wholesaleMarkup) || other.wholesaleMarkup == _this.wholesaleMarkup)&&(identical(other.priceRound, _this.priceRound) || other.priceRound == _this.priceRound)&&(identical(other.expiryWarnDays, _this.expiryWarnDays) || other.expiryWarnDays == _this.expiryWarnDays)&&(identical(other.clientCapture, _this.clientCapture) || other.clientCapture == _this.clientCapture)&&(identical(other.receiveUnit, _this.receiveUnit) || other.receiveUnit == _this.receiveUnit)&&(identical(other.sellUnitRetail, _this.sellUnitRetail) || other.sellUnitRetail == _this.sellUnitRetail)&&(identical(other.sellUnitWholesale, _this.sellUnitWholesale) || other.sellUnitWholesale == _this.sellUnitWholesale)&&const DeepCollectionEquality().equals(other.paymentMethods, _this.paymentMethods)&&(identical(other.autoPrint, _this.autoPrint) || other.autoPrint == _this.autoPrint)&&(identical(other.updatedAt, _this.updatedAt) || other.updatedAt == _this.updatedAt)&&const DeepCollectionEquality().equals(other.raw, _this.raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
  final _this = this as PharmacySettings;
  return Object.hashAll([runtimeType,_this.name,_this.phone,_this.address,_this.currency,_this.decimals,_this.locale,_this.taxRate,_this.taxInclusive,_this.retailMarkup,_this.wholesaleMarkup,_this.priceRound,_this.expiryWarnDays,_this.clientCapture,_this.receiveUnit,_this.sellUnitRetail,_this.sellUnitWholesale,const DeepCollectionEquality().hash(_this.paymentMethods),_this.autoPrint,_this.updatedAt,const DeepCollectionEquality().hash(_this.raw)]);
}

@override
String toString() {
  final _this = this as PharmacySettings;
  return 'PharmacySettings(name: ${_this.name}, phone: ${_this.phone}, address: ${_this.address}, currency: ${_this.currency}, decimals: ${_this.decimals}, locale: ${_this.locale}, taxRate: ${_this.taxRate}, taxInclusive: ${_this.taxInclusive}, retailMarkup: ${_this.retailMarkup}, wholesaleMarkup: ${_this.wholesaleMarkup}, priceRound: ${_this.priceRound}, expiryWarnDays: ${_this.expiryWarnDays}, clientCapture: ${_this.clientCapture}, receiveUnit: ${_this.receiveUnit}, sellUnitRetail: ${_this.sellUnitRetail}, sellUnitWholesale: ${_this.sellUnitWholesale}, paymentMethods: ${_this.paymentMethods}, autoPrint: ${_this.autoPrint}, updatedAt: ${_this.updatedAt}, raw: ${_this.raw})';
}


}

/// @nodoc
abstract mixin class $PharmacySettingsCopyWith<$Res>  {
  factory $PharmacySettingsCopyWith(PharmacySettings value, $Res Function(PharmacySettings) _then) = _$PharmacySettingsCopyWithImpl;
@useResult
$Res call({
 String name, String phone, String address, String currency, double decimals, String locale, double taxRate, bool taxInclusive, double retailMarkup, double wholesaleMarkup, double priceRound, double expiryWarnDays, String clientCapture, String receiveUnit, String sellUnitRetail, String sellUnitWholesale, List<PaymentMethod> paymentMethods, bool autoPrint,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class _$PharmacySettingsCopyWithImpl<$Res>
    implements $PharmacySettingsCopyWith<$Res> {
  _$PharmacySettingsCopyWithImpl(this._self, this._then);

  final PharmacySettings _self;
  final $Res Function(PharmacySettings) _then;

/// Create a copy of PharmacySettings
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,Object? phone = null,Object? address = null,Object? currency = null,Object? decimals = null,Object? locale = null,Object? taxRate = null,Object? taxInclusive = null,Object? retailMarkup = null,Object? wholesaleMarkup = null,Object? priceRound = null,Object? expiryWarnDays = null,Object? clientCapture = null,Object? receiveUnit = null,Object? sellUnitRetail = null,Object? sellUnitWholesale = null,Object? paymentMethods = null,Object? autoPrint = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(PharmacySettings(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,decimals: null == decimals ? _self.decimals : decimals // ignore: cast_nullable_to_non_nullable
as double,locale: null == locale ? _self.locale : locale // ignore: cast_nullable_to_non_nullable
as String,taxRate: null == taxRate ? _self.taxRate : taxRate // ignore: cast_nullable_to_non_nullable
as double,taxInclusive: null == taxInclusive ? _self.taxInclusive : taxInclusive // ignore: cast_nullable_to_non_nullable
as bool,retailMarkup: null == retailMarkup ? _self.retailMarkup : retailMarkup // ignore: cast_nullable_to_non_nullable
as double,wholesaleMarkup: null == wholesaleMarkup ? _self.wholesaleMarkup : wholesaleMarkup // ignore: cast_nullable_to_non_nullable
as double,priceRound: null == priceRound ? _self.priceRound : priceRound // ignore: cast_nullable_to_non_nullable
as double,expiryWarnDays: null == expiryWarnDays ? _self.expiryWarnDays : expiryWarnDays // ignore: cast_nullable_to_non_nullable
as double,clientCapture: null == clientCapture ? _self.clientCapture : clientCapture // ignore: cast_nullable_to_non_nullable
as String,receiveUnit: null == receiveUnit ? _self.receiveUnit : receiveUnit // ignore: cast_nullable_to_non_nullable
as String,sellUnitRetail: null == sellUnitRetail ? _self.sellUnitRetail : sellUnitRetail // ignore: cast_nullable_to_non_nullable
as String,sellUnitWholesale: null == sellUnitWholesale ? _self.sellUnitWholesale : sellUnitWholesale // ignore: cast_nullable_to_non_nullable
as String,paymentMethods: null == paymentMethods ? _self.paymentMethods : paymentMethods // ignore: cast_nullable_to_non_nullable
as List<PaymentMethod>,autoPrint: null == autoPrint ? _self.autoPrint : autoPrint // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self.raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}

}


/// Adds pattern-matching-related methods to [PharmacySettings].
extension PharmacySettingsPatterns on PharmacySettings {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PharmacySettings value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PharmacySettings() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PharmacySettings value)  $default,){
final _that = this;
switch (_that) {
case _PharmacySettings():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PharmacySettings value)?  $default,){
final _that = this;
switch (_that) {
case _PharmacySettings() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name,  String phone,  String address,  String currency,  double decimals,  String locale,  double taxRate,  bool taxInclusive,  double retailMarkup,  double wholesaleMarkup,  double priceRound,  double expiryWarnDays,  String clientCapture,  String receiveUnit,  String sellUnitRetail,  String sellUnitWholesale,  List<PaymentMethod> paymentMethods,  bool autoPrint, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PharmacySettings() when $default != null:
return $default(_that.name,_that.phone,_that.address,_that.currency,_that.decimals,_that.locale,_that.taxRate,_that.taxInclusive,_that.retailMarkup,_that.wholesaleMarkup,_that.priceRound,_that.expiryWarnDays,_that.clientCapture,_that.receiveUnit,_that.sellUnitRetail,_that.sellUnitWholesale,_that.paymentMethods,_that.autoPrint,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name,  String phone,  String address,  String currency,  double decimals,  String locale,  double taxRate,  bool taxInclusive,  double retailMarkup,  double wholesaleMarkup,  double priceRound,  double expiryWarnDays,  String clientCapture,  String receiveUnit,  String sellUnitRetail,  String sellUnitWholesale,  List<PaymentMethod> paymentMethods,  bool autoPrint, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)  $default,) {final _that = this;
switch (_that) {
case _PharmacySettings():
return $default(_that.name,_that.phone,_that.address,_that.currency,_that.decimals,_that.locale,_that.taxRate,_that.taxInclusive,_that.retailMarkup,_that.wholesaleMarkup,_that.priceRound,_that.expiryWarnDays,_that.clientCapture,_that.receiveUnit,_that.sellUnitRetail,_that.sellUnitWholesale,_that.paymentMethods,_that.autoPrint,_that.updatedAt,_that.raw);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name,  String phone,  String address,  String currency,  double decimals,  String locale,  double taxRate,  bool taxInclusive,  double retailMarkup,  double wholesaleMarkup,  double priceRound,  double expiryWarnDays,  String clientCapture,  String receiveUnit,  String sellUnitRetail,  String sellUnitWholesale,  List<PaymentMethod> paymentMethods,  bool autoPrint, @JsonKey(includeToJson: false)  String updatedAt, @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw)?  $default,) {final _that = this;
switch (_that) {
case _PharmacySettings() when $default != null:
return $default(_that.name,_that.phone,_that.address,_that.currency,_that.decimals,_that.locale,_that.taxRate,_that.taxInclusive,_that.retailMarkup,_that.wholesaleMarkup,_that.priceRound,_that.expiryWarnDays,_that.clientCapture,_that.receiveUnit,_that.sellUnitRetail,_that.sellUnitWholesale,_that.paymentMethods,_that.autoPrint,_that.updatedAt,_that.raw);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(converters: recordConverters)
class _PharmacySettings extends PharmacySettings {
  const _PharmacySettings({this.name = 'My Pharmacy', this.phone = '', this.address = '', this.currency = 'UGX', this.decimals = 0, this.locale = 'en-UG', this.taxRate = 0, this.taxInclusive = false, this.retailMarkup = 50, this.wholesaleMarkup = 25, this.priceRound = 0, this.expiryWarnDays = 90, this.clientCapture = 'optional', this.receiveUnit = 'pack', this.sellUnitRetail = 'unit', this.sellUnitWholesale = 'pack',  List<PaymentMethod> paymentMethods = const <PaymentMethod>[], this.autoPrint = false, @JsonKey(includeToJson: false) this.updatedAt = '', @JsonKey(includeFromJson: false, includeToJson: false)  Map<String, Object?> raw = const <String, Object?>{}}): _paymentMethods = paymentMethods,_raw = raw,super._();
  factory _PharmacySettings.fromJson(Map<String, dynamic> json) => _$PharmacySettingsFromJson(json);

@override@JsonKey() final  String name;
@override@JsonKey() final  String phone;
@override@JsonKey() final  String address;
@override@JsonKey() final  String currency;
@override@JsonKey() final  double decimals;
@override@JsonKey() final  String locale;
@override@JsonKey() final  double taxRate;
@override@JsonKey() final  bool taxInclusive;
@override@JsonKey() final  double retailMarkup;
@override@JsonKey() final  double wholesaleMarkup;
@override@JsonKey() final  double priceRound;
@override@JsonKey() final  double expiryWarnDays;
/// 'off' | 'optional' | 'required': whether the till asks for the client
@override@JsonKey() final  String clientCapture;
/// packs: 'pack' | 'unit' (src/packs.js)
@override@JsonKey() final  String receiveUnit;
@override@JsonKey() final  String sellUnitRetail;
@override@JsonKey() final  String sellUnitWholesale;
 final  List<PaymentMethod> _paymentMethods;
@override@JsonKey() List<PaymentMethod> get paymentMethods {
  if (_paymentMethods is EqualUnmodifiableListView) return _paymentMethods;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_paymentMethods);
}

@override@JsonKey() final  bool autoPrint;
@override@JsonKey(includeToJson: false) final  String updatedAt;
 final  Map<String, Object?> _raw;
@override@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> get raw {
  if (_raw is EqualUnmodifiableMapView) return _raw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_raw);
}


/// Create a copy of PharmacySettings
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PharmacySettingsCopyWith<_PharmacySettings> get copyWith => __$PharmacySettingsCopyWithImpl<_PharmacySettings>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PharmacySettingsToJson(this, );
}

@override
bool operator ==(Object other) {
    return identical(this, other) || (other.runtimeType == runtimeType&&other is _PharmacySettings&&(identical(other.name, name) || other.name == name)&&(identical(other.phone, phone) || other.phone == phone)&&(identical(other.address, address) || other.address == address)&&(identical(other.currency, currency) || other.currency == currency)&&(identical(other.decimals, decimals) || other.decimals == decimals)&&(identical(other.locale, locale) || other.locale == locale)&&(identical(other.taxRate, taxRate) || other.taxRate == taxRate)&&(identical(other.taxInclusive, taxInclusive) || other.taxInclusive == taxInclusive)&&(identical(other.retailMarkup, retailMarkup) || other.retailMarkup == retailMarkup)&&(identical(other.wholesaleMarkup, wholesaleMarkup) || other.wholesaleMarkup == wholesaleMarkup)&&(identical(other.priceRound, priceRound) || other.priceRound == priceRound)&&(identical(other.expiryWarnDays, expiryWarnDays) || other.expiryWarnDays == expiryWarnDays)&&(identical(other.clientCapture, clientCapture) || other.clientCapture == clientCapture)&&(identical(other.receiveUnit, receiveUnit) || other.receiveUnit == receiveUnit)&&(identical(other.sellUnitRetail, sellUnitRetail) || other.sellUnitRetail == sellUnitRetail)&&(identical(other.sellUnitWholesale, sellUnitWholesale) || other.sellUnitWholesale == sellUnitWholesale)&&const DeepCollectionEquality().equals(other.paymentMethods, _paymentMethods)&&(identical(other.autoPrint, autoPrint) || other.autoPrint == autoPrint)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.raw, _raw));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode {
    return Object.hashAll([runtimeType,name,phone,address,currency,decimals,locale,taxRate,taxInclusive,retailMarkup,wholesaleMarkup,priceRound,expiryWarnDays,clientCapture,receiveUnit,sellUnitRetail,sellUnitWholesale,const DeepCollectionEquality().hash(_paymentMethods),autoPrint,updatedAt,const DeepCollectionEquality().hash(_raw)]);
}

@override
String toString() {
    return 'PharmacySettings(name: $name, phone: $phone, address: $address, currency: $currency, decimals: $decimals, locale: $locale, taxRate: $taxRate, taxInclusive: $taxInclusive, retailMarkup: $retailMarkup, wholesaleMarkup: $wholesaleMarkup, priceRound: $priceRound, expiryWarnDays: $expiryWarnDays, clientCapture: $clientCapture, receiveUnit: $receiveUnit, sellUnitRetail: $sellUnitRetail, sellUnitWholesale: $sellUnitWholesale, paymentMethods: $paymentMethods, autoPrint: $autoPrint, updatedAt: $updatedAt, raw: $raw)';
}


}

/// @nodoc
abstract mixin class _$PharmacySettingsCopyWith<$Res> implements $PharmacySettingsCopyWith<$Res> {
  factory _$PharmacySettingsCopyWith(_PharmacySettings value, $Res Function(_PharmacySettings) _then) = __$PharmacySettingsCopyWithImpl;
@override @useResult
$Res call({
 String name, String phone, String address, String currency, double decimals, String locale, double taxRate, bool taxInclusive, double retailMarkup, double wholesaleMarkup, double priceRound, double expiryWarnDays, String clientCapture, String receiveUnit, String sellUnitRetail, String sellUnitWholesale, List<PaymentMethod> paymentMethods, bool autoPrint,@JsonKey(includeToJson: false) String updatedAt,@JsonKey(includeFromJson: false, includeToJson: false) Map<String, Object?> raw
});




}
/// @nodoc
class __$PharmacySettingsCopyWithImpl<$Res>
    implements _$PharmacySettingsCopyWith<$Res> {
  __$PharmacySettingsCopyWithImpl(this._self, this._then);

  final _PharmacySettings _self;
  final $Res Function(_PharmacySettings) _then;

/// Create a copy of PharmacySettings
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,Object? phone = null,Object? address = null,Object? currency = null,Object? decimals = null,Object? locale = null,Object? taxRate = null,Object? taxInclusive = null,Object? retailMarkup = null,Object? wholesaleMarkup = null,Object? priceRound = null,Object? expiryWarnDays = null,Object? clientCapture = null,Object? receiveUnit = null,Object? sellUnitRetail = null,Object? sellUnitWholesale = null,Object? paymentMethods = null,Object? autoPrint = null,Object? updatedAt = null,Object? raw = null,}) {
  return _then(_PharmacySettings(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,phone: null == phone ? _self.phone : phone // ignore: cast_nullable_to_non_nullable
as String,address: null == address ? _self.address : address // ignore: cast_nullable_to_non_nullable
as String,currency: null == currency ? _self.currency : currency // ignore: cast_nullable_to_non_nullable
as String,decimals: null == decimals ? _self.decimals : decimals // ignore: cast_nullable_to_non_nullable
as double,locale: null == locale ? _self.locale : locale // ignore: cast_nullable_to_non_nullable
as String,taxRate: null == taxRate ? _self.taxRate : taxRate // ignore: cast_nullable_to_non_nullable
as double,taxInclusive: null == taxInclusive ? _self.taxInclusive : taxInclusive // ignore: cast_nullable_to_non_nullable
as bool,retailMarkup: null == retailMarkup ? _self.retailMarkup : retailMarkup // ignore: cast_nullable_to_non_nullable
as double,wholesaleMarkup: null == wholesaleMarkup ? _self.wholesaleMarkup : wholesaleMarkup // ignore: cast_nullable_to_non_nullable
as double,priceRound: null == priceRound ? _self.priceRound : priceRound // ignore: cast_nullable_to_non_nullable
as double,expiryWarnDays: null == expiryWarnDays ? _self.expiryWarnDays : expiryWarnDays // ignore: cast_nullable_to_non_nullable
as double,clientCapture: null == clientCapture ? _self.clientCapture : clientCapture // ignore: cast_nullable_to_non_nullable
as String,receiveUnit: null == receiveUnit ? _self.receiveUnit : receiveUnit // ignore: cast_nullable_to_non_nullable
as String,sellUnitRetail: null == sellUnitRetail ? _self.sellUnitRetail : sellUnitRetail // ignore: cast_nullable_to_non_nullable
as String,sellUnitWholesale: null == sellUnitWholesale ? _self.sellUnitWholesale : sellUnitWholesale // ignore: cast_nullable_to_non_nullable
as String,paymentMethods: null == paymentMethods ? _self._paymentMethods : paymentMethods // ignore: cast_nullable_to_non_nullable
as List<PaymentMethod>,autoPrint: null == autoPrint ? _self.autoPrint : autoPrint // ignore: cast_nullable_to_non_nullable
as bool,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String,raw: null == raw ? _self._raw : raw // ignore: cast_nullable_to_non_nullable
as Map<String, Object?>,
  ));
}


}

// dart format on
