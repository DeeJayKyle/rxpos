// Weather & storage rules (src/weather.js, src/pages/Storage.jsx): weather labels, storage advice, the 6-hourly
// outside readings, the connection's place, and in-range readings with humidity.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/features/extras/domain/extras.dart';
import 'package:rxpos/features/storage/application/weather_controller.dart';
import 'package:rxpos/features/storage/domain/weather.dart';

void main() {
  final s = PharmacySettings.fromRecord({});

  test('weather codes', () {
    expect([for (final c in [0, 1, 3, 45, 51, 61, 81, 71, 95]) describeWeather(c).$1],
        ['Clear sky', 'Partly cloudy', 'Overcast', 'Fog', 'Drizzle', 'Rain', 'Rain', 'Snow', 'Thunderstorm']);
  });

  test('limits: defaults, text numbers like Number(x), humidity counts', () {
    final l = storageLimits(s);
    expect((l.roomMin, l.roomMax, l.fridgeMin, l.fridgeMax, l.humidityMax, l.hotAlert), (15.0, 25.0, 2.0, 8.0, 65.0, 30.0));
    expect(storageLimits(PharmacySettings.fromRecord({'roomMax': '28', 'humidityMax': ''})).roomMax, 28);
    expect(tempInRange('Room', 22, s, 60), isTrue);
    expect(tempInRange('Room', 22, s, 70), isFalse, reason: 'too humid');
    expect(tempInRange('Outside', 40, s, 99), isTrue);
  });

  test('storage advice from the weather outside', () {
    final l = storageLimits(s);
    expect(storageAdvice(null, l), isEmpty);
    expect(storageAdvice({'temperature_2m': 31.2, 'relative_humidity_2m': 50}, l).single.$1, 'danger');
    expect(storageAdvice({'temperature_2m': 26, 'relative_humidity_2m': 50}, l).single.$2, 'Warm outside (26°C): keep heat-sensitive medicines below 25°C.');
    expect(storageAdvice({'temperature_2m': 20, 'relative_humidity_2m': 80}, l).single.$2, startsWith('Humid (80%)'));
  });

  test('outside readings at 00, 06, 12 and 18 up to now', () {
    final r = sixHourReadings({
      'current': {'time': '2026-11-05T12:30'},
      'hourly': {
        'time': ['2026-11-05T00:00', '2026-11-05T03:00', '2026-11-05T06:00', '2026-11-05T12:00', '2026-11-05T18:00'],
        'temperature_2m': [18, 17, null, 27.5, 24],
        'relative_humidity_2m': [80, 85, 82, 55, 60],
      },
    });
    expect([for (final x in r) (x.time, x.temp, x.humidity)], [('2026-11-05T00:00', 18, 80), ('2026-11-05T12:00', 27.5, 55)]);
  });

  test('the place: the connection location rounded, names and the forecast address', () {
    final p = networkPlace({'lat': 0.31234, 'lon': 32.58349, 'city': 'Kampala', 'country': 'UG'})!;
    expect((p.name, p.lat, p.lon, p.source), ('Kampala, UG', 0.312, 32.583, 'network'));
    expect(networkPlace({'error': 'Location unknown'}), isNull);
    expect(networkPlace({'lat': 1.0, 'lon': 2.0})!.name, 'Your area');
    final url = forecastUrl(kampala);
    expect(url, startsWith('https://api.open-meteo.com/v1/forecast?latitude=0.3476&longitude=32.5825'));
    expect(url, contains('past_days=1'));
  });

  test('town search', () async {
    final found = await searchPlaces((url) async {
      expect(url, contains('name=Mbarara'));
      return (200, {'results': [{'name': 'Mbarara', 'admin1': 'Western Region', 'country': 'Uganda', 'latitude': -0.6, 'longitude': 30.65}]});
    }, 'Mbarara');
    expect((found.single.name, found.single.lat), ('Mbarara, Western Region, Uganda', -0.6));
  });

  test('the place from GPS: rounded to 4 places, named from the connection\'s city', () {
    final p = gpsPlace(0.336712, 32.571903, {'city': 'Kampala'});
    expect((p.name, p.lat, p.lon, p.source), ('Near Kampala', 0.3367, 32.5719, 'gps'));
    expect(gpsPlace(1, 2, null).name, 'Your location');
  });
}
