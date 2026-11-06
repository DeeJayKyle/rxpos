import 'dart:async';

import 'package:dio/dio.dart';

import '../utils/backoff.dart';
import 'api_failure.dart';

/// Adds the signed-in device's token to every cloud call.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this.token);

  final String? Function() token;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final t = token();
    if (t != null && t.isNotEmpty) options.headers['Authorization'] = 'Bearer $t';
    handler.next(options);
  }
}

/// Retries calls marked safe to repeat (`extra: {'retry': true}`; sync is, because the cloud applies each change
/// once) when the network drops or the cloud is briefly unavailable, with the shared backoff.
class RetryInterceptor extends Interceptor {
  RetryInterceptor(this.dio, {this.maxRetries = 3});

  final Dio dio;
  final int maxRetries;

  static bool _transient(DioException e) =>
      e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout ||
      const {502, 503, 504}.contains(e.response?.statusCode);

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final o = err.requestOptions;
    final tries = (o.extra['tries'] as int?) ?? 0;
    if (o.extra['retry'] == true && tries < maxRetries && _transient(err)) {
      await Future<void>.delayed(backoff(tries));
      o.extra['tries'] = tries + 1;
      try {
        return handler.resolve(await dio.fetch<dynamic>(o));
      } on DioException catch (e) {
        return handler.next(e);
      }
    }
    handler.next(err);
  }
}

/// Turns any failure into an [ApiFailure] with a plain message.
class FailureInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final status = err.response?.statusCode;
    final data = err.response?.data;
    final said = data is Map && data['error'] is String ? data['error'] as String : null;
    final ApiFailure f;
    if (status == null) {
      f = const ApiFailure(ApiFailureKind.offline, 'No connection to the RxPOS cloud. Work continues on this device.');
    } else if (status == 401) {
      f = ApiFailure(ApiFailureKind.signInAgain, said ?? 'Sign in again to keep syncing.', status: status);
    } else if (status >= 400 && status < 500) {
      f = ApiFailure(ApiFailureKind.refused, said ?? 'The cloud refused this ($status).', status: status);
    } else {
      f = ApiFailure(ApiFailureKind.server, said ?? 'The cloud had a problem ($status). It will be tried again.', status: status);
    }
    handler.next(err.copyWith(error: f, message: f.message));
  }
}
