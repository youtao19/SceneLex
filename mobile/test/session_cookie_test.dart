import 'dart:io';

import 'package:app/core/network/session_cookie.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/in_memory_secret_storage.dart';

/// 会话 Cookie 是登录态唯一凭据，规则必须钉住：只认 sl_session、过期即失效、登出清干净。
void main() {
  test('保存服务端 Set-Cookie 后能原样读回', () async {
    final storage = InMemorySecretStorage();
    final store = SessionCookieStore(storage: storage);

    await store.saveSetCookie(
      'sl_session=abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
    );

    final cookie = await store.readCookie();

    expect(cookie?.name, 'sl_session');
    expect(cookie?.value, 'abc123');
    expect(await store.authHeaders(), {'Cookie': 'sl_session=abc123'});
  });

  test('别的 Cookie 不混进登录态', () async {
    final storage = InMemorySecretStorage();
    final store = SessionCookieStore(storage: storage);

    await store.saveSetCookie('other=1; Path=/');

    expect(await store.readCookie(), isNull);
    expect(await store.authHeaders(), isEmpty);
  });

  test('已过期的 Cookie 视为未登录并被清掉', () async {
    final storage = InMemorySecretStorage();
    final store = SessionCookieStore(storage: storage);

    await store.saveSetCookie(
      'sl_session=old; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );

    expect(await store.readCookie(), isNull);
    expect(storage.values, isEmpty);
  });

  test('登出清空存储，切换账号不会复用上一个会话', () async {
    final storage = InMemorySecretStorage();
    final store = SessionCookieStore(storage: storage);

    await store.saveSetCookie('sl_session=abc123; Path=/');
    await store.clear();

    expect(storage.values, isEmpty);
    expect(await store.authHeaders(), isEmpty);
  });

  test('请求头只回传 name=value，不把 HttpOnly 等属性发回服务端', () async {
    final storage = InMemorySecretStorage();
    final store = SessionCookieStore(storage: storage);

    await store.saveSetCookie('sl_session=abc123; Path=/; HttpOnly');

    final headers = await store.authHeaders();

    expect(headers['Cookie'], 'sl_session=abc123');
    expect(headers['Cookie'], isNot(contains('HttpOnly')));
  });

  test('能解析 dart:io 的 Cookie 属性，过期时间不会丢', () async {
    final store = SessionCookieStore(storage: InMemorySecretStorage());

    await store.saveSetCookie('sl_session=abc; Path=/; Max-Age=60');

    final cookie = await store.readCookie();

    expect(cookie, isA<Cookie>());
    expect(cookie!.maxAge, 60);
  });
}
