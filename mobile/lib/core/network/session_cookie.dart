import 'dart:io';

import '../storage/secret_storage.dart';

/// 会话 Cookie 是登录态的唯一凭据（HttpOnly，脚本读不到），只能放系统安全存储；
/// 不写日志、不放普通偏好，也不在 App 里另发一套 token。
class SessionCookieStore {
  SessionCookieStore({SecretStorage? storage})
    : _storage = storage ?? SecureSecretStorage();

  /// 必须和后端 `backend/src/utils/session-cookie.ts` 里的名字一致，改名要两端同时改。
  static const cookieName = 'sl_session';

  static const _storageKey = 'session_cookie';

  final SecretStorage _storage;

  /// 过期的 Cookie 等于没登录，直接删掉，避免拿旧会话去请求再被拒。
  Future<Cookie?> readCookie() async {
    final raw = await _storage.read(_storageKey);

    if (raw == null || raw.isEmpty) {
      return null;
    }

    final cookie = Cookie.fromSetCookieValue(raw);
    final expires = cookie.expires;

    if (expires != null && expires.isBefore(DateTime.now())) {
      await clear();
      return null;
    }

    return cookie;
  }

  /// 保存服务端原始 Set-Cookie：属性（过期、Path）只在这里有，转发时必须还原。
  /// 其他 Cookie 不是本客户端的会话，静默忽略而不是混进登录态。
  Future<void> saveSetCookie(String setCookieHeader) async {
    final cookie = Cookie.fromSetCookieValue(setCookieHeader);

    if (cookie.name != cookieName) {
      return;
    }

    await _storage.write(_storageKey, setCookieHeader);
  }

  Future<void> clear() => _storage.delete(_storageKey);

  /// 请求头只回传 name=value；HttpOnly 等属性是给客户端看的，不应原样发回。
  Future<Map<String, String>> authHeaders() async {
    final cookie = await readCookie();

    if (cookie == null) {
      return const {};
    }

    return {'Cookie': '${cookie.name}=${cookie.value}'};
  }
}
