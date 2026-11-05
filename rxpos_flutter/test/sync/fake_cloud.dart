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
  FakeCloud({this.pageSize = 400});

  final int pageSize;
  final records = <ServerRecord>[];
  String epoch = 'epoch-1';
  final requests = <Map<String, Object?>>[];
  /// drop the connection on this request number (1-based)
  int? failOnRequest;
  /// answer this request number with something that is not a sync reply
  int? garbageOnRequest;

  int get _seq => records.isEmpty ? 0 : records.last.seq;

  void add(String t, String id, Map<String, Object?> rec, String at, {String origin = 'other-device'}) =>
      records.add(ServerRecord(_seq + 1, t, id, {...rec, 'id': id}, at, origin: origin));

  void delete(String t, String id, String at) => records.add(ServerRecord(_seq + 1, t, id, null, at, deleted: true));

  /// A Dio wired to this cloud with the app's failure handling (no retry delays in tests).
  Dio dio() => Dio(BaseOptions(responseType: ResponseType.json))
    ..httpClientAdapter = this
    ..interceptors.add(FailureInterceptor());

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final body = (options.data as Map).cast<String, Object?>();
    requests.add(body);
    if (failOnRequest == requests.length) {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError, error: 'connection reset');
    }
    if (garbageOnRequest == requests.length) return ResponseBody.fromString('{"hello":"world"}', 200, headers: _json);
    final since = (body['since'] as num).toInt();
    final all = body['all'] == true;
    final device = body['deviceId'];
    final next = records.where((r) => r.seq > since && (all || r.origin != device)).toList();
    final page = next.take(pageSize).toList();
    final cursor = page.isEmpty ? _seq : page.last.seq;
    final reply = {
      'changes': [for (final r in page) {'t': r.t, 'id': r.id, 'at': r.at, if (r.deleted) 'deleted': true else 'rec': r.rec}],
      'cursor': cursor,
      'more': next.length > page.length,
      'applied': 0, 'refused': 0, 'epoch': epoch, 'tenant': 't-sample', 'protocol': 2,
    };
    return ResponseBody.fromString(jsonEncode(reply), 200, headers: _json);
  }

  static const _json = {Headers.contentTypeHeader: [Headers.jsonContentType]};

  @override
  void close({bool force = false}) {}
}

