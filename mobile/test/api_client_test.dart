import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/api_failure.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/in_memory_secret_storage.dart';

/// 用假适配器替掉真实网络：这一层要验证的是 Cookie 处理和错误分类，不是 HTTP 本身。
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    lastRequest = options;

    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonBody(
  Object? body, {
  int statusCode = 200,
  Map<String, List<String>>? headers,
}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      ...?headers,
    },
  );
}

ApiClient _buildClient(_FakeAdapter adapter, {SessionCookieStore? session}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.test/api'))
    ..httpClientAdapter = adapter;

  return ApiClient(
    session: session ?? SessionCookieStore(storage: InMemorySecretStorage()),
    dio: dio,
  );
}

void main() {
  test('只把后端响应的 data 交给上层', () async {
    final adapter = _FakeAdapter(
      (_) async => _jsonBody({
        'code': 200,
        'message': 'ok',
        'data': {'user': {'id': 7}},
      }),
    );

    final data = await _buildClient(adapter).get<Map<String, dynamic>>('/auth/me');

    expect(data['user'], {'id': 7});
  });

  test('响应里的 Set-Cookie 存进安全存储，后续请求自动带上 Cookie', () async {
    final storage = InMemorySecretStorage();
    final session = SessionCookieStore(storage: storage);
    var calls = 0;
    final adapter = _FakeAdapter((_) async {
      calls += 1;

      if (calls == 1) {
        return _jsonBody(
          {'code': 200, 'message': 'ok', 'data': null},
          headers: {
            'set-cookie': ['sl_session=tok123; Path=/; HttpOnly; SameSite=Lax'],
          },
        );
      }

      return _jsonBody({
        'code': 200,
        'message': 'ok',
        'data': {'user': {'id': 7}},
      });
    });
    final client = _buildClient(adapter, session: session);

    await client.postNoContent('/auth/login');
    expect(storage.values, isNotEmpty);

    await client.get<Map<String, dynamic>>('/auth/me');

    expect(adapter.lastRequest?.headers['Cookie'], 'sl_session=tok123');
  });

  test('401 归类为会话失效，带上后端的话', () async {
    final adapter = _FakeAdapter(
      (_) async => _jsonBody(
        {'code': 401, 'message': '请先登录', 'data': null},
        statusCode: 401,
      ),
    );

    await expectLater(
      _buildClient(adapter).get<Map<String, dynamic>>('/auth/me'),
      throwsA(
        isA<SessionExpiredFailure>().having(
          (failure) => failure.message,
          'message',
          '请先登录',
        ),
      ),
    );
  });

  test('403 归类为账号/权限问题，引导联系管理员', () async {
    final adapter = _FakeAdapter(
      (_) async => _jsonBody(
        {'code': 403, 'message': '账号已过期', 'data': null},
        statusCode: 403,
      ),
    );

    await expectLater(
      _buildClient(adapter).get<Map<String, dynamic>>('/word/overview'),
      throwsA(isA<AccessDeniedFailure>()),
    );
  });

  test('其他错误保留状态码和消息', () async {
    final adapter = _FakeAdapter(
      (_) async => _jsonBody(
        {'code': 409, 'message': '这条记录已在其他端更新', 'data': null},
        statusCode: 409,
      ),
    );

    await expectLater(
      _buildClient(adapter).post<Map<String, dynamic>>('/word/review'),
      throwsA(
        isA<RequestFailure>()
            .having((failure) => failure.statusCode, 'statusCode', 409)
            .having(
              (failure) => failure.message,
              'message',
              '这条记录已在其他端更新',
            ),
      ),
    );
  });

  test('上传图片按文件名给出 image/png，而不是默认的 octet-stream', () async {
    final file = File('${Directory.systemTemp.path}/upload-probe.png')
      ..writeAsBytesSync([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    final adapter = _FakeAdapter(
      (_) async => _jsonBody({
        'code': 200,
        'message': 'ok',
        'data': {'user': {'id': 1}},
      }),
    );

    await _buildClient(adapter).upload<Map<String, dynamic>>(
      '/auth/me/avatar',
      field: 'avatar',
      filePath: file.path,
      fileName: 'avatar.png',
    );

    // 请求整体是 multipart/form-data，真正的图片类型在表单分片里。
    final form = adapter.lastRequest?.data as FormData;

    expect(form.files.single.value.contentType?.mimeType, 'image/png');
  });

  test('不支持的扩展名直接拒绝，不发请求', () async {
    var called = false;
    final adapter = _FakeAdapter((_) async {
      called = true;

      return _jsonBody({'code': 200, 'message': 'ok', 'data': null});
    });

    await expectLater(
      _buildClient(adapter).upload<Map<String, dynamic>>(
        '/auth/me/avatar',
        field: 'avatar',
        filePath: '/tmp/whatever.gif',
        fileName: 'avatar.gif',
      ),
      throwsA(isA<RequestFailure>()),
    );
    expect(called, isFalse);
  });

  test('连不上网络时报 NetworkFailure，不能伪装成空数据', () async {
    final adapter = _FakeAdapter(
      (options) async => throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      ),
    );

    await expectLater(
      _buildClient(adapter).get<Map<String, dynamic>>('/word/overview'),
      throwsA(isA<NetworkFailure>()),
    );
  });
}
