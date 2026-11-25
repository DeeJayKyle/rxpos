import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../config/app_config.dart';
import 'interceptors.dart';

part 'dio_client.g.dart';

@Riverpod(keepAlive: true)
AppConfig appConfig(Ref ref) => const AppConfig();

/// The signed-in device's cloud token (set by sign-in, restored from the device database at start-up).
@Riverpod(keepAlive: true)
class AuthToken extends _$AuthToken {
  @override
  String? build() => null;

  void set(String? token) => state = token;
}

/// The one HTTP client for the RxPOS cloud.
@Riverpod(keepAlive: true)
Dio dio(Ref ref) {
  final config = ref.watch(appConfigProvider);
  final dio = Dio(BaseOptions(
    baseUrl: config.cloudUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 60),
    contentType: Headers.jsonContentType,
    responseType: ResponseType.json,
  ));
  dio.interceptors.addAll([
    AuthInterceptor(() => ref.read(authTokenProvider)),
    RetryInterceptor(dio),
    FailureInterceptor(),
  ]);
  return dio;
}
