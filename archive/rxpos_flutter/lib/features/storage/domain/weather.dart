// Weather for where the device is, from Open-Meteo (free, no key, open data), ported from src/weather.js: the WMO
// code's label and icon, the forecast address, advice for medicine storage, and the outside readings at 00:00,
// 06:00, 12:00 and 18:00.
import 'package:flutter/material.dart';


typedef Place = ({String name, double lat, double lon, String source});

/// Storage limits (Settings → Alerts & storage).
typedef Limits = ({double roomMax, double roomMin, double fridgeMin, double fridgeMax, double humidityMax, double hotAlert});

const kampala = (name: 'Kampala, Uganda', lat: 0.3476, lon: 32.5825, source: 'settings');

Place? placeFrom(Object? j, {String? source}) {
  if (j is! Map) return null;
  final lat = (j['lat'] as num?)?.toDouble(), lon = (j['lon'] as num?)?.toDouble();
  if (lat == null || lon == null) return null;
  return (name: '${j['name'] ?? ''}', lat: lat, lon: lon, source: source ?? '${j['source'] ?? 'settings'}');
}

Map<String, Object?> placeJson(Place p) => {'name': p.name, 'lat': p.lat, 'lon': p.lon, 'source': p.source};

/// The place from the cloud's guess of the connection's location ({lat, lon, city, country}), rounded like React.
Place? networkPlace(Map<String, Object?>? net) {
  final lat = (net?['lat'] as num?)?.toDouble(), lon = (net?['lon'] as num?)?.toDouble();
  if (lat == null || lon == null || lat == 0) return null;
  double r3(double v) => (v * 1000).round() / 1000;
  final name = [net!['city'], net['country']].where((x) => x != null && '$x'.isNotEmpty).join(', ');
  return (name: name.isEmpty ? 'Your area' : name, lat: r3(lat), lon: r3(lon), source: 'network');
}

/// The place from the device's GPS, named from the connection's city when the cloud knows it (src/weather.js).
Place gpsPlace(double lat, double lon, Map<String, Object?>? net) {
  double r4(double v) => (v * 10000).round() / 10000;
  final city = '${net?['city'] ?? ''}';
  return (name: city.isEmpty ? 'Your location' : 'Near $city', lat: r4(lat), lon: r4(lon), source: 'gps');
}

/// WMO weather code → label and icon.
(String, IconData) describeWeather(num? code) {
  final c = code ?? 0;
  if (c == 0) return ('Clear sky', Icons.wb_sunny_outlined);
  if (c <= 2) return ('Partly cloudy', Icons.wb_cloudy_outlined);
  if (c == 3) return ('Overcast', Icons.cloud_outlined);
  if (c <= 48) return ('Fog', Icons.foggy);
  if (c <= 57) return ('Drizzle', Icons.grain);
  if (c <= 67 || (c >= 80 && c <= 82)) return ('Rain', Icons.umbrella_outlined);
  if (c <= 77 || c == 85 || c == 86) return ('Snow', Icons.ac_unit);
  return ('Thunderstorm', Icons.thunderstorm_outlined);
}

String forecastUrl(Place p) => Uri.https('api.open-meteo.com', '/v1/forecast', {
      'latitude': '${p.lat}', 'longitude': '${p.lon}', 'timezone': 'auto', 'forecast_days': '2', 'past_days': '1',
      'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
      'hourly': 'temperature_2m,relative_humidity_2m,precipitation_probability',
      'daily': 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code',
    }).toString();

String placeSearchUrl(String q) => Uri.https('geocoding-api.open-meteo.com', '/v1/search', {'count': '6', 'language': 'en', 'format': 'json', 'name': q}).toString();

/// Advice for medicine storage from the outside weather: (tone 'danger' | 'warn', text).
List<(String, String)> storageAdvice(Map? cur, Limits l) {
  if (cur == null) return const [];
  final t = (cur['temperature_2m'] as num?)?.toDouble(), h = cur['relative_humidity_2m'] as num?;
  final out = <(String, String)>[];
  if (t != null && t >= l.hotAlert) {
    out.add(('danger', 'Hot (${t.round()}°C): keep the shop cool, close blinds, check the room thermometer.'));
  } else if (t != null && t >= l.roomMax) {
    out.add(('warn', 'Warm outside (${t.round()}°C): keep heat-sensitive medicines below ${_n(l.roomMax)}°C.'));
  }
  if (h != null && h >= l.humidityMax) out.add(('warn', 'Humid ($h%): keep containers closed; protect tablets, powders and test strips from moisture.'));
  return out;
}

String _n(double v) => v == v.roundToDouble() ? '${v.round()}' : '$v';

/// Outside temperature & humidity at 00:00, 06:00, 12:00 and 18:00 (yesterday and today, up to now).
List<({String time, num temp, num? humidity})> sixHourReadings(Map? data) {
  final h = data?['hourly'] as Map?;
  final times = h?['time'] as List?;
  if (times == null) return const [];
  final nowLocal = '${(data!['current'] as Map?)?['time'] ?? ''}';
  final temps = (h!['temperature_2m'] as List?) ?? const [], hums = (h['relative_humidity_2m'] as List?) ?? const [];
  final out = <({String time, num temp, num? humidity})>[];
  for (var i = 0; i < times.length; i++) {
    final t = '${times[i]}';
    if (t.length < 16) continue;
    final hh = int.tryParse(t.substring(11, 13)) ?? 1;
    final temp = i < temps.length ? temps[i] as num? : null;
    if (t.substring(14, 16) == '00' && hh % 6 == 0 && t.compareTo(nowLocal) <= 0 && temp != null) {
      out.add((time: t, temp: temp, humidity: i < hums.length ? hums[i] as num? : null));
    }
  }
  return out;
}
