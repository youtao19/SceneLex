import 'dart:convert';
import 'dart:io';

import 'package:app/core/network/session_cookie.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 验证真机上安全存储能否跨 App 重启保住会话 Cookie，以及 Cookie 能否正确回传。
/// 用设备自己的回环服务器代替后端，避免动生产账号；真实后端契约在联调时再补。
/// 跨启动保留靠手动重跑本 entrypoint 验证：`flutter test` 跑完会卸载 APK，
/// 那样连数据目录一起没了，所以用 adb 启动两次、中间不重装。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('会话 Cookie 能存入安全存储、跨启动保留并回传', (tester) async {
    final store = SessionCookieStore();
    // 这次跑之前是否已经有上次留下的会话，是跨启动保留的唯一证据。
    final previous = await store.readCookie();

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final response = request.response;

      if (request.uri.path == '/login') {
        response.headers.add(
          'Set-Cookie',
          'sl_session=probe-${DateTime.now().millisecondsSinceEpoch};'
          ' Path=/; HttpOnly; SameSite=Lax',
        );
      } else {
        response.write(request.headers.value('cookie') ?? '');
      }

      await response.close();
    });

    final client = HttpClient();
    final base = 'http://127.0.0.1:${server.port}';
    final evidence = <String, Object?>{
      'previousRunCookiePresent': previous != null,
      'savedAndReadBack': false,
      'serverSawCookie': false,
    };

    try {
      final login = await (await client.getUrl(Uri.parse('$base/login'))).close();
      await login.drain<void>();
      final setCookie = login.headers['set-cookie']?.first;
      expect(setCookie, isNotNull, reason: '回环服务器必须发回 Set-Cookie');

      await store.saveSetCookie(setCookie!);

      final saved = await store.readCookie();
      evidence['savedAndReadBack'] = saved?.name == SessionCookieStore.cookieName;

      final me = await client.getUrl(Uri.parse('$base/me'));
      (await store.authHeaders()).forEach(me.headers.set);
      final echoed = await (await me.close()).transform(utf8.decoder).join();
      evidence['serverSawCookie'] = echoed.startsWith(
        '${SessionCookieStore.cookieName}=',
      );

      // 先落盘再断言：断言失败时也能从文件看到到底哪一步没成。
      await _writeEvidence(evidence);

      expect(saved?.name, SessionCookieStore.cookieName);
      expect(echoed, startsWith('${SessionCookieStore.cookieName}='));
    } finally {
      client.close(force: true);
      await server.close(force: true);
    }

    // 只输出布尔结果，不打印 Cookie 值。
    // ignore: avoid_print
    print('SESSION_PROBE: ${jsonEncode(evidence)}');
  });
}

/// standalone 启动时 print 不会进 logcat，只能把证据写进应用私有目录用 adb 读。
Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/session_probe_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
