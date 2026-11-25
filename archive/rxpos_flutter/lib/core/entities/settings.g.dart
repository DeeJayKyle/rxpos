// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settings.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PaymentMethod _$PaymentMethodFromJson(Map<String, dynamic> json) =>
    _PaymentMethod(
      id: const Str().fromJson(json['id']),
      name: json['name'] == null ? '' : const Str().fromJson(json['name']),
      type: json['type'] == null ? 'other' : const Str().fromJson(json['type']),
    );

Map<String, dynamic> _$PaymentMethodToJson(_PaymentMethod instance) =>
    <String, dynamic>{
      'id': ?const Str().toJson(instance.id),
      'name': ?const Str().toJson(instance.name),
      'type': ?const Str().toJson(instance.type),
    };

_PharmacySettings _$PharmacySettingsFromJson(
  Map<String, dynamic> json,
) => _PharmacySettings(
  name: json['name'] == null
      ? 'My Pharmacy'
      : const Str().fromJson(json['name']),
  phone: json['phone'] == null ? '' : const Str().fromJson(json['phone']),
  address: json['address'] == null ? '' : const Str().fromJson(json['address']),
  currency: json['currency'] == null
      ? 'UGX'
      : const Str().fromJson(json['currency']),
  decimals: json['decimals'] == null
      ? 0
      : const Num().fromJson(json['decimals']),
  locale: json['locale'] == null
      ? 'en-UG'
      : const Str().fromJson(json['locale']),
  taxRate: json['taxRate'] == null ? 0 : const Num().fromJson(json['taxRate']),
  taxInclusive: json['taxInclusive'] == null
      ? false
      : const Flag().fromJson(json['taxInclusive']),
  retailMarkup: json['retailMarkup'] == null
      ? 50
      : const Num().fromJson(json['retailMarkup']),
  wholesaleMarkup: json['wholesaleMarkup'] == null
      ? 25
      : const Num().fromJson(json['wholesaleMarkup']),
  priceRound: json['priceRound'] == null
      ? 0
      : const Num().fromJson(json['priceRound']),
  expiryWarnDays: json['expiryWarnDays'] == null
      ? 90
      : const Num().fromJson(json['expiryWarnDays']),
  clientCapture: json['clientCapture'] == null
      ? 'optional'
      : const Str().fromJson(json['clientCapture']),
  receiveUnit: json['receiveUnit'] == null
      ? 'pack'
      : const Str().fromJson(json['receiveUnit']),
  sellUnitRetail: json['sellUnitRetail'] == null
      ? 'unit'
      : const Str().fromJson(json['sellUnitRetail']),
  sellUnitWholesale: json['sellUnitWholesale'] == null
      ? 'pack'
      : const Str().fromJson(json['sellUnitWholesale']),
  paymentMethods:
      (json['paymentMethods'] as List<dynamic>?)
          ?.map((e) => PaymentMethod.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <PaymentMethod>[],
  autoPrint: json['autoPrint'] == null
      ? false
      : const Flag().fromJson(json['autoPrint']),
  updatedAt: json['updatedAt'] == null
      ? ''
      : const Str().fromJson(json['updatedAt']),
);

Map<String, dynamic> _$PharmacySettingsToJson(_PharmacySettings instance) =>
    <String, dynamic>{
      'name': ?const Str().toJson(instance.name),
      'phone': ?const Str().toJson(instance.phone),
      'address': ?const Str().toJson(instance.address),
      'currency': ?const Str().toJson(instance.currency),
      'decimals': ?const Num().toJson(instance.decimals),
      'locale': ?const Str().toJson(instance.locale),
      'taxRate': ?const Num().toJson(instance.taxRate),
      'taxInclusive': ?const Flag().toJson(instance.taxInclusive),
      'retailMarkup': ?const Num().toJson(instance.retailMarkup),
      'wholesaleMarkup': ?const Num().toJson(instance.wholesaleMarkup),
      'priceRound': ?const Num().toJson(instance.priceRound),
      'expiryWarnDays': ?const Num().toJson(instance.expiryWarnDays),
      'clientCapture': ?const Str().toJson(instance.clientCapture),
      'receiveUnit': ?const Str().toJson(instance.receiveUnit),
      'sellUnitRetail': ?const Str().toJson(instance.sellUnitRetail),
      'sellUnitWholesale': ?const Str().toJson(instance.sellUnitWholesale),
      'paymentMethods': instance.paymentMethods.map((e) => e.toJson()).toList(),
      'autoPrint': ?const Flag().toJson(instance.autoPrint),
    };
