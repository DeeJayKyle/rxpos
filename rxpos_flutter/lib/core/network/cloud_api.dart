// The cloud calls the till makes besides sync (src/cloud.js): which services are set up, Mobile Money payment
// requests to the customer's phone, and SMS.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/sync_engine.dart';
import 'api_failure.dart';
import 'dio_client.dart';

/// Audit P2-7, option 1: set by the app shell. Before a call that acts as a person in the cloud, someone signed in with a
/// PIN, fingerprint or offline password on a device holding another person's token confirms with their own password
/// (it throws when they don't). Sync and the till's own calls never wait for it.
Future<void> Function()? personGuard;

/// Calls that act as a person in the cloud (the classic app marks the same ones `personal` in src/cloud.js).
bool personalCall(String path, {required bool post}) =>
    path.startsWith('/api/2fa') || path.startsWith('/api/sessions/') || path.startsWith('/api/calendar-link') || path.startsWith('/api/daily-stock-link') ||
    (post && (path.startsWith('/api/reports/send') || path.startsWith('/api/summary')));

class CloudApi {
  CloudApi(this._dio, this._base);
  final Dio _dio;
  final String _base;

  /// [passRefusals]: "sign in again" and "refused" come out as the [ApiFailure] itself (no point asking again).
  Future<Map<String, Object?>> _call(String path, {Object? body, Duration timeout = const Duration(seconds: 20), bool passRefusals = false}) async {
    if (personalCall(path, post: body != null)) await personGuard?.call();
    try {
      final o = Options(sendTimeout: timeout, receiveTimeout: timeout);
      final res = body == null ? await _dio.get<Object?>('$_base$path', options: o) : await _dio.post<Object?>('$_base$path', data: body, options: o);
      final j = res.data;
      return j is Map ? j.cast<String, Object?>() : const {};
    } on DioException catch (e) {
      final f = e.error;
      if (passRefusals && f is ApiFailure && (f.kind == ApiFailureKind.signInAgain || f.kind == ApiFailureKind.refused)) throw f;
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

  /// PENDING, SUCCESSFUL or FAILED, with txid / reason. Throws [ApiFailure] when the cloud says sign in again or refuses.
  Future<Map<String, Object?>> payStatus(String provider, String ref) =>
      _call('/api/pay/status?provider=$provider&ref=${Uri.encodeComponent(ref)}', passRefusals: true);

  Future<void> sendSms(List<String> to, String message) => _call('/api/sms', body: {'to': to, 'message': message});

  /// Any other call: POST [body] to [path].
  Future<Map<String, Object?>> post(String path, Object body, {Duration timeout = const Duration(seconds: 60)}) => _call(path, body: body, timeout: timeout);
  Future<Map<String, Object?>> get(String path) => _call(path);

  /// An invoice page (JPEG data URL) read by two AI models in the cloud: supplier, invoiceNo, date, total, items, …
  Future<Map<String, Object?>> aiInvoice(String image) => _call('/api/ai/invoice', body: {'image': image}, timeout: const Duration(seconds: 120));

  /// A prescription photo read by AI.
  Future<Map<String, Object?>> aiPrescription(String image) => _call('/api/ai/prescription', body: {'image': image}, timeout: const Duration(seconds: 90));

  /// The address of a file kept in the pharmacy's cloud.
  String fileUrl(String path) => path.startsWith('http') ? path : '$_base${path.startsWith('/') ? '' : '/'}$path';
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
  var failures = 0;
  for (var i = 0; i < tries; i++) {
    await Future<void>.delayed(every);
    if (cancelled?.call() ?? false) throw const MomoCancelled();
    final Map<String, Object?> s;
    try {
      s = await api.payStatus(provider, ref);
      failures = 0;
    } on ApiFailure {
      rethrow; // sign in again / refused: asking again will not help
    } catch (_) {
      // a dropped check is not "still waiting" for ever: after a few in a row, say so (the payment may have gone through)
      if (++failures >= maxStatusFailures) {
        throw Exception('Couldn’t check the payment status. Ask the customer whether the payment went through before charging again.');
      }
      continue;
    }
    if (s['status'] == 'SUCCESSFUL') return {'provider': provider, 'phone': phone, 'ref': ref, 'txid': '${s['txid'] ?? ''}'};
    if (s['status'] == 'FAILED') {
      throw Exception('The customer declined or the payment failed${(s['reason'] ?? '') == '' ? '' : ': ${s['reason']}'}');
    }
  }
  throw Exception('No answer from the customer’s phone. Try again or record the payment manually.');
}

/// Status checks that may fail in a row before the cashier is told the status couldn't be checked.
const maxStatusFailures = 3;

class MomoCancelled implements Exception {
  const MomoCancelled();
}
