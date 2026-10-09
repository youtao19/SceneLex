import 'package:dio/dio.dart';

import '../config/app_config.dart';
import 'api_failure.dart';
import 'session_cookie.dart';

/// 后端统一返回 `{ code, message, data }`，这一层只把 `data` 交给上层，
/// 并把 HTTP/Dio 错误收敛成 ApiFailure，界面不用认识 DioException。
class ApiClient {
  ApiClient({required this.session, Dio? dio, String? baseUrl})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
              // 学习内容以服务器为准，超时后就明确报错，不静默返回旧数据。
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 30),
              sendTimeout: const Duration(seconds: 30),
            ),
          ) {
    _dio.interceptors.add(_SessionCookieInterceptor(session));
  }

  final SessionCookieStore session;
  final Dio _dio;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) {
    return _send<T>(() => _dio.get<dynamic>(path, queryParameters: query));
  }

  Future<T> post<T>(String path, {Object? body}) {
    return _send<T>(() => _dio.post<dynamic>(path, data: body));
  }

  Future<T> patch<T>(String path, {Object? body}) {
    return _send<T>(() => _dio.patch<dynamic>(path, data: body));
  }

  Future<void> delete(String path) async {
    await _send<Object?>(() => _dio.delete<dynamic>(path));
  }

  /// SSE 这类长连接要自己消费字节流，所以直接把响应流交给调用方。
  /// 助手回复可能跑很久，所以这里单独放宽接收超时。
  Future<ResponseBody> postStream(String path, {Object? body}) async {
    try {
      final response = await _dio.post<ResponseBody>(
        path,
        data: body,
        options: Options(
          responseType: ResponseType.stream,
          receiveTimeout: const Duration(minutes: 5),
        ),
      );

      return response.data!;
    } on DioException catch (error) {
      throw mapDioFailure(error);
    }
  }

  /// 后端返回 `data: null` 的写入接口（例如登出）用它，不去解析响应体。
  Future<void> postNoContent(String path, {Object? body}) async {
    await _send<Object?>(() => _dio.post<dynamic>(path, data: body));
  }

  /// 头像这类小文件走 multipart；OCR 原图按页上传，不经过这里。
  /// 必须显式指定 content type：Dio 默认发 application/octet-stream，后端按 MIME 白名单会直接拒。
  Future<T> upload<T>(
    String path, {
    required String field,
    required String filePath,
    required String fileName,
    Map<String, Object?>? fields,
  }) async {
    final mediaType = mediaTypeForFileName(fileName);

    return _send<T>(() async {
      final form = FormData.fromMap({
        ...?fields,
        field: await MultipartFile.fromFile(
          filePath,
          filename: fileName,
          contentType: mediaType,
        ),
      });

      return _dio.post<dynamic>(path, data: form);
    });
  }

  Future<T> _send<T>(Future<Response<dynamic>> Function() request) async {
    try {
      final response = await request();

      return _readData<T>(response.data);
    } on DioException catch (error) {
      throw mapDioFailure(error);
    }
  }

  T _readData<T>(dynamic body) {
    if (body is! Map<String, dynamic> || !body.containsKey('data')) {
      throw const RequestFailure(500, '后端返回格式不符合约定');
    }

    final data = body['data'];

    // 类型不符时给一句能排查的话，而不是抛裸的 TypeError。
    if (data is! T) {
      throw const RequestFailure(500, '后端返回的数据类型和客户端预期不一致');
    }

    return data;
  }
}

/// 上传图片的 content type 只能从文件名推导，后端按 MIME 白名单校验。
DioMediaType mediaTypeForFileName(String fileName) {
  final lower = fileName.toLowerCase();

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return DioMediaType('image', 'jpeg');
  }

  if (lower.endsWith('.png')) {
    return DioMediaType('image', 'png');
  }

  if (lower.endsWith('.webp')) {
    return DioMediaType('image', 'webp');
  }

  throw const RequestFailure(400, '只支持 JPG、PNG、WEBP 图片');
}

/// HTTP/Dio 错误 → 界面能直接用的失败类型。
ApiFailure mapDioFailure(DioException error) {
  final response = error.response;

  if (response == null) {
    return const NetworkFailure();
  }

  final message = _readMessage(response.data);

  if (response.statusCode == 401) {
    return SessionExpiredFailure(message ?? '登录状态已失效，请重新登录');
  }

  if (response.statusCode == 403) {
    return AccessDeniedFailure(message ?? '账号已到期或被停用，请联系管理员');
  }

  if (message == null) {
    // 后端没按约定返回 JSON（例如旧版本的 404 返回 HTML 页）：
    // 说清是“响应格式不对”，否则排查时看不出是前后端版本不匹配。
    return RequestFailure(
      response.statusCode ?? 500,
      '服务器返回了非预期响应（HTTP ${response.statusCode ?? 500}），可能是前后端版本不匹配',
    );
  }

  return RequestFailure(response.statusCode ?? 500, message);
}

/// 后端错误体是 `{ code, message, data }`；拿不到就返回 null 让调用方用默认文案。
String? _readMessage(dynamic data) {
  if (data is Map && data['message'] is String) {
    return data['message'] as String;
  }

  return null;
}

class _SessionCookieInterceptor extends Interceptor {
  _SessionCookieInterceptor(this._session);

  final SessionCookieStore _session;

  /// 每次请求都从安全存储取 Cookie：会话可能已经被登出清掉。
  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    options.headers.addAll(await _session.authHeaders());
    handler.next(options);
  }

  /// 后端用 Set-Cookie 下发会话，属性只在响应里有，必须原样存下来。
  @override
  Future<void> onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) async {
    final setCookies = response.headers['set-cookie'] ?? const <String>[];

    for (final value in setCookies) {
      await _session.saveSetCookie(value);
    }

    handler.next(response);
  }
}
