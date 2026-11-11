// A fake RxPOS cloud for tests: answers POST /api/sync like worker/index.js (pages by sequence number, a device is not
// sent its own records unless it asks for everything, an epoch that changes on a restore).
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:rxpos/core/network/interceptors.dart';

class ServerRecord {
  ServerRecord(this.seq, this.t, this.id, this.rec, this.at, {this.origin = 'other-device', this.deleted = false});
  final int seq;
  final String t, id, at, origin;
  final Map<String, Object?>? rec;
  final bool deleted;
}

class FakeCloud implements HttpClientAdapter {
  FakeCloud({this.pageSize = 400, this.phases = false});

  final int pageSize;
  /// Faster sync, stage 2: split a full download into the core and the history like the worker (HISTORY_SQL; here,
  /// sales marked `old` are history). Off: a cloud before stage 2, which ignores the phase.
  final bool phases;
  final records = <ServerRecord>[];
  String epoch = 'epoch-1';
  final requests = <Map<String, Object?>>[];

  /// drop the connection on this request number (1-based)
  int? failOnRequest;

  /// answer this request number with something that is not a sync reply
  int? garbageOnRequest;

  /// apply this request, then lose the reply (the device never hears back)
  int? loseReplyOnRequest;

  /// answer this request number with 401 (the sign-in expired)
  int? expiredOnRequest;

  /// changes the cloud refuses (no permission): "table|id"
  final refuse = <String>{};

  /// op ids already applied (the cloud's sync_ops ledger)
  final applied = <String>{};
  int dupes = 0;

  /// The newest version of each record, as the cloud holds it.
  Map<String, ServerRecord> get current {
    final m = <String, ServerRecord>{};
    for (final r in records) {
      m['${r.t}|${r.id}'] = r;
    }
    return m;
  }

  int get _seq => records.isEmpty ? 0 : records.last.seq;

  void add(String t, String id, Map<String, Object?> rec, String at, {String origin = 'other-device'}) =>
      records.add(ServerRecord(_seq + 1, t, id, {...rec, 'id': id}, at, origin: origin));

  void delete(String t, String id, String at) => records.add(ServerRecord(_seq + 1, t, id, null, at, deleted: true));

  /// A Dio wired to this cloud with the app's failure handling (no retry delays in tests).
  Dio dio() => Dio(BaseOptions(responseType: ResponseType.json))
    ..httpClientAdapter = this
    ..interceptors.add(FailureInterceptor());

  /// Answers POST /api/login: (status, reply) for a request body.
  (int, Map<String, Object?>) Function(Map<String, Object?> body)? login;
  final logins = <Map<String, Object?>>[];

  /// Answers for other endpoints, e.g. 'config', 'pay/request', 'pay/status', 'sms'.
  final api = <String, (int, Map<String, Object?>) Function(Map<String, Object?> body)>{};
  final calls = <(String, Map<String, Object?>)>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final path = Uri.parse(options.path).path;
    if (!path.endsWith('/api/sync') && !path.endsWith('/api/login')) {
      // other cloud calls (config, Mobile Money, SMS): answered by [api], keyed by the path after /api/
      final name = path.substring(path.indexOf('/api/') + 5);
      calls.add((name, options.data is Map ? (options.data as Map).cast<String, Object?>() : Uri.parse(options.path).queryParameters));
      final answer = api[name];
      if (answer == null) return ResponseBody.fromString('{"error":"Not found"}', 404, headers: _json);
      final (status, reply) = answer(calls.last.$2);
      return ResponseBody.fromString(jsonEncode(reply), status, headers: _json);
    }
    final body = (options.data as Map).cast<String, Object?>();
    if (options.path.endsWith('/api/login')) {
      logins.add(body);
      final answer = login;
      if (answer == null) throw DioException(requestOptions: options, type: DioExceptionType.connectionError, error: 'no route');
      final (status, reply) = answer(body);
      return ResponseBody.fromString(jsonEncode(reply), status, headers: _json);
    }
    requests.add(body);
    if (failOnRequest == requests.length) {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError, error: 'connection reset');
    }
    if (garbageOnRequest == requests.length) return ResponseBody.fromString('{"hello":"world"}', 200, headers: _json);
    if (expiredOnRequest == requests.length) return ResponseBody.fromString('{"error":"Not signed in"}', 401, headers: _json);
    final refusedKeys = <String>[];
    var appliedNow = 0;
    for (final raw in (body['changes'] as List? ?? const [])) {
      final ch = (raw as Map).cast<String, Object?>();
      final t = ch['t'] as String, id = '${ch['id']}', at = ch['at'] as String, op = ch['op'] as String?;
      if (op != null && applied.contains(op)) {
        dupes++;
        continue;
      }
      final key = '$t|$id';
      final have = current[key];
      final appendOnly = const {'movements', 'audit', 'controlled'}.contains(t);
      // as worker/index.js: deleting an append-only row is refused; overwriting one is ignored (insert only)
      if (refuse.contains(key) || (appendOnly && ch['deleted'] == true)) {
        refusedKeys.add(key);
        continue;
      }
      if (appendOnly && have != null) {
        if (op != null) applied.add(op);
        continue;
      }
      if (op != null) applied.add(op);
      if (have != null && have.at.compareTo(at) >= 0) continue; // an older edit: the newer one stays
      records.add(
        ServerRecord(_seq + 1, t, id, (ch['rec'] as Map?)?.cast<String, Object?>(), at, origin: '${body['deviceId']}', deleted: ch['deleted'] == true),
      );
      appliedNow++;
    }
    if (loseReplyOnRequest == requests.length) {
      throw DioException(requestOptions: options, type: DioExceptionType.receiveTimeout, error: 'reply lost');
    }
    final since = (body['since'] as num).toInt();
    final all = body['all'] == true;
    final device = body['deviceId'];
    final phase = phases && all && (body['phase'] == 'core' || body['phase'] == 'history') ? body['phase'] as String : null;
    bool history(ServerRecord r) => r.t == 'sales' && r.rec?['old'] == true;
    final next = records.where((r) => r.seq > since && (all || r.origin != device) && (phase == null || (phase == 'history') == history(r))).toList();
    final page = next.take(pageSize).toList();
    final cursor = page.isEmpty || next.length <= page.length ? _seq : page.last.seq; // the last page: the newest number, like the worker
    final reply = {
      'changes': [
        for (final r in page) {'t': r.t, 'id': r.id, 'at': r.at, if (r.deleted) 'deleted': true else 'rec': r.rec},
      ],
      'cursor': cursor,
      'more': next.length > page.length,
      'applied': appliedNow,
      'refused': refusedKeys.length,
      'refusedKeys': refusedKeys,
      'dupes': dupes,
      'epoch': epoch,
      'tenant': 't-sample',
      'protocol': 2,
      if (phases) 'phase': phase,
    };
    return ResponseBody.fromString(jsonEncode(reply), 200, headers: _json);
  }

  static const _json = {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  };

  @override
  void close({bool force = false}) {}
}
