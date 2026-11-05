// The cloud calls the till makes besides sync (src/cloud.js): which services are set up, Mobile Money payment
// requests to the customer's phone, and SMS.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/sync_engine.dart';
import 'dio_client.dart';

class CloudApi {
  CloudApi(this._dio, this._base);
  final Dio _dio;
  final String _base;

  Future<Map<String, Object?>> _call(String path, {Object? body, Duration timeout = const Duration(seconds: 20)}) async {
    try {
      final o = Options(sendTimeout: timeout, receiveTimeout: timeout);
      final res = body == null ? await _dio.get<Object?>('$_base$path', options: o) : await _dio.post<Object?>('$_base$path', data: body, options: o);
      final j = res.data;
      return j is Map ? j.cast<String, Object?>() : const {};
    } on DioException catch (e) {
      throw Exception(e.message ?? 'No connection to the RxPOS cloud.');
    }
  }

  /// Which services the cloud has (mtn, airtel, sms … true when set up).
  Future<Map<String, Object?>> config() => _call('/api/config', timeout: const Duration(seconds: 8));

  /// Ask the customer's phone to approve a payment; returns the provider's reference to poll.
  Future<String> payRequest({required String provider, required String phone, required double amount, required String reference, required String note}) async {
    final j = await _call(
      '/api/pay/request',
      body: {'provider': provider, 'phone': phone, 'amount': amount, 'reference': reference, 'note': note},
      timeout: const Duration(seconds: 30),
    );
    return '${j['ref'] ?? ''}';
  }

  /// PENDING, SUCCESSFUL or FAILED, with txid / reason.
  Future<Map<String, Object?>> payStatus(String provider, String ref) => _call('/api/pay/status?provider=$provider&ref=${Uri.encodeComponent(ref)}');

  Future<void> sendSms(List<String> to, String message) => _call('/api/sms', body: {'to': to, 'message': message});
}

final cloudApiProvider = Provider<CloudApi>((ref) => CloudApi(ref.watch(dioProvider), syncBase(ref.watch(appConfigProvider).cloudUrl)));

/// MTN or Airtel from a Ugandan number (like src/cloud.js guessNetwork).
String guessNetwork(String msisdn) {
  final local = msisdn.replaceFirst(RegExp(r'^256'), '').replaceFirst(RegExp(r'^0'), '');
  return RegExp(r'^(7[045]|20)').hasMatch(local) ? 'airtel' : 'mtn';
}

/// Waits for the customer to approve a Mobile Money request: every [every], up to [tries] times (React: 4 s × 45).
/// Returns the confirmed payment ({provider, phone, ref, txid}); throws with the reason otherwise. [cancelled] stops it.
Future<Map<String, Object?>> requestMomo(
  CloudApi api, {
  required String provider,
  required String phone,
  required double amount,
  required String pharmacy,
  Duration every = const Duration(seconds: 4),
  int tries = 45,
  bool Function()? cancelled,
  void Function(String ref)? onRef,
}) async {
  final reference = 'PP${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
  final ref = await api.payRequest(provider: provider, phone: phone, amount: amount, reference: reference, note: '$pharmacy payment');
  onRef?.call(ref);
  for (var i = 0; i < tries; i++) {
    await Future<void>.delayed(every);
    if (cancelled?.call() ?? false) throw const MomoCancelled();
    final s = await api.payStatus(provider, ref).catchError((_) => <String, Object?>{'status': 'PENDING'});
    if (s['status'] == 'SUCCESSFUL') return {'provider': provider, 'phone': phone, 'ref': ref, 'txid': '${s['txid'] ?? ''}'};
    if (s['status'] == 'FAILED') {
      throw Exception('The customer declined or the payment failed${(s['reason'] ?? '') == '' ? '' : ': ${s['reason']}'}');
    }
  }
  throw Exception('No answer from the customer’s phone. Try again or record the payment manually.');
}

class MomoCancelled implements Exception {
  const MomoCancelled();
}
