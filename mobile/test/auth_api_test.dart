import 'dart:convert';
import 'dart:typed_data';

import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/auth/data/auth_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/in_memory_secret_storage.dart';

/// 账号接口的响应形状必须钉住：只有注册/登录把用户包在 `user` 里，
/// 其他接口直接返回用户对象。搞错会让每次冷启动都以为会话失效。
class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.respond);

  final Map<String, dynamic> Function(RequestOptions options) respond;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;

    return ResponseBody.fromString(
      jsonEncode({'code': 200, 'message': 'ok', 'data': respond(options)}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const _userJson = {
  'id': 9,
  'email': 'user@example.test',
  'nickname': '小明',
  'role': 'user',
  'isVip': false,
  'accessStatus': 'active',
  'accessExpiresAt': '2026-11-08T00:00:00.000Z',
  'avatarUrl': null,
};

AuthApi _buildApi(_RecordingAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.test/api'))
    ..httpClientAdapter = adapter;

  return AuthApi(
    ApiClient(
      session: SessionCookieStore(storage: InMemorySecretStorage()),
      dio: dio,
    ),
  );
}

void main() {
  test('/auth/me 直接返回用户对象', () async {
    final adapter = _RecordingAdapter((_) => _userJson);

    final user = await _buildApi(adapter).fetchMe();

    expect(user.id, 9);
    expect(user.email, 'user@example.test');
    expect(adapter.lastRequest?.path, '/auth/me');
  });

  test('改昵称同样直接返回用户对象', () async {
    final adapter = _RecordingAdapter(
      (_) => {..._userJson, 'nickname': '新昵称'},
    );

    final user = await _buildApi(adapter).updateProfile(nickname: '新昵称');

    expect(user.nickname, '新昵称');
    expect(adapter.lastRequest?.method, 'PATCH');
  });

  test('注册和登录把用户包在 user 里', () async {
    final adapter = _RecordingAdapter((_) => {'user': _userJson});

    final user = await _buildApi(
      adapter,
    ).login(email: 'user@example.test', password: 'Passw0rd!23');

    expect(user.id, 9);
    expect(adapter.lastRequest?.path, '/auth/login');
  });
}
