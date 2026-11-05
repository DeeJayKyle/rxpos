// One shared weather feed for the app (src/weather.js useWeather / refreshWeather): the place (a fixed town from
// Settings, else the internet connection's location from the RxPOS cloud, else the town in Settings), the forecast
// from Open-Meteo kept on this device for 15 minutes (shown offline), refreshed every 15 minutes while on screen.
import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/network/cloud_api.dart';
import '../domain/weather.dart';

/// How the weather reaches the network: status code and decoded JSON (replaced in tests).
typedef WeatherFetch = Future<(int, Object?)> Function(String url);

final weatherFetchProvider = Provider<WeatherFetch>((ref) {
  final dio = Dio();
  const t = Duration(seconds: 10);
  return (url) async {
    final r = await dio.get<Object?>(url, options: Options(receiveTimeout: t, sendTimeout: t, validateStatus: (_) => true)).timeout(t);
    return (r.statusCode ?? 0, r.data is String ? jsonDecode(r.data! as String) : r.data);
  };
});

/// Where this device is, from the RxPOS cloud (the internet connection's approximate location); null when unknown.
final connectionPlaceProvider = Provider<Future<Map<String, Object?>?> Function()>((ref) => () async {
      try {
        return await ref.read(cloudApiProvider).get('/api/geo');
      } catch (_) {
        return null;
      }
    });

const weatherKey = 'weather', placeKey = 'place';

class WeatherState {
  const WeatherState({this.place, this.data, this.error = '', this.loading = false});
  final Place? place;
  final Map<String, Object?>? data;
  final String error;
  final bool loading;
  Map<String, Object?>? get current => (data?['current'] as Map?)?.cast<String, Object?>();
}

class WeatherController extends Notifier<WeatherState> {
  Timer? _timer;
  Future<void>? _running;

  @override
  WeatherState build() {
    ref.onDispose(() => _timer?.cancel());
    _timer = Timer.periodic(const Duration(minutes: 15), (_) => refresh());
    scheduleMicrotask(() async {
      final c = await _read(weatherKey);
      if (c != null && state.data == null) state = WeatherState(place: placeFrom(c['place']), data: (c['data'] as Map?)?.cast<String, Object?>(), loading: true);
      await refresh();
    });
    return const WeatherState(loading: true);
  }

  Future<Map<String, Object?>?> _read(String k) async {
    try {
      final v = await ref.read(deviceValueProvider(k).future);
      return v == null ? null : (jsonDecode(v) as Map).cast<String, Object?>();
    } catch (_) {
      return null;
    }
  }

  Future<void> _write(String k, Object v) => ref.read(deviceValueProvider(k).notifier).set(jsonEncode(v));

  /// Fixed town → that town; else the connection's location (kept 30 minutes) → the town set in Settings.
  Future<Place> _place() async {
    final s = (await ref.read(settingsProvider.future)).raw;
    final fixed = placeFrom(s['weatherPlace'], source: 'settings');
    if (s['weatherMode'] == 'fixed' && fixed != null) return fixed;
    final c = await _read(placeKey);
    final at = DateTime.tryParse('${c?['at'] ?? ''}');
    final kept = placeFrom(c?['place']);
    if (kept != null && at != null && DateTime.now().difference(at) < const Duration(minutes: 30)) return kept;
    final place = networkPlace(await ref.read(connectionPlaceProvider)()) ?? fixed ?? kampala;
    await _write(placeKey, {'at': DateTime.now().toUtc().toIso8601String(), 'place': placeJson(place)});
    return place;
  }

  /// Fetch again ([force]: even if the device's copy is less than 15 minutes old). One refresh at a time.
  Future<void> refresh({bool force = false}) => _running ??= _refresh(force).whenComplete(() => _running = null);

  Future<void> _refresh(bool force) async {
    try {
      if (force) state = WeatherState(place: state.place, data: state.data, loading: true);
      final place = await _place();
      final key = '${place.lat},${place.lon}';
      final c = await _read(weatherKey);
      final at = DateTime.tryParse('${c?['at'] ?? ''}');
      if (!force && c?['key'] == key && at != null && DateTime.now().difference(at) < const Duration(minutes: 15)) {
        if (ref.mounted) state = WeatherState(place: place, data: (c!['data'] as Map?)?.cast<String, Object?>());
        return;
      }
      final (int, Object?) r;
      try {
        r = await ref.read(weatherFetchProvider)(forecastUrl(place));
      } catch (_) {
        throw 'The weather service did not answer. Check the internet connection.';
      }
      if (r.$1 < 200 || r.$1 >= 300 || r.$2 is! Map) throw 'Weather service unavailable';
      final data = (r.$2! as Map).cast<String, Object?>();
      await _write(weatherKey, {'key': key, 'at': DateTime.now().toUtc().toIso8601String(), 'data': data, 'place': placeJson(place)});
      if (ref.mounted) state = WeatherState(place: place, data: data);
    } catch (e) {
      if (ref.mounted) state = WeatherState(place: state.place, data: state.data, error: '$e');
    }
  }
}

final weatherProvider = NotifierProvider.autoDispose<WeatherController, WeatherState>(WeatherController.new);

/// Town search for Settings → Alerts & storage (Open-Meteo geocoding).
Future<List<Place>> searchPlaces(WeatherFetch fetch, String q) async {
  final (status, body) = await fetch(placeSearchUrl(q));
  if (status != 200 || body is! Map) throw 'Could not search places. Check the internet.';
  return [
    for (final x in (body['results'] as List?) ?? const [])
      if (x is Map && x['latitude'] is num)
        (name: [x['name'], x['admin1'], x['country']].where((v) => v != null && '$v'.isNotEmpty).join(', '), lat: (x['latitude'] as num).toDouble(), lon: (x['longitude'] as num).toDouble(), source: 'settings'),
  ];
}
