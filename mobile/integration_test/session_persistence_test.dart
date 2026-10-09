import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/auth/data/auth_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 覆盖安装验证用的小探针：没有会话就注册一个，有会话就校验它还在。
///
/// 用法（两轮，中间重新构建并覆盖安装一次）：
///   adb reverse tcp:3003 tcp:3003
///   fvm flutter build apk --debug --target=integration_test/session_persistence_test.dart \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3003/api
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk && adb shell am start -n cn.scenlex.app/.MainActivity
///   # 把 pubspec.yaml 的 version 加 1，重新构建并覆盖安装，再跑一次
///   adb shell run-as cn.scenlex.app cat app_flutter/session_persistence_evidence.json
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('首次注册，覆盖安装后会话仍在', (tester) async {
    final evidence = <String, Object?>{
      'phase': 'unknown',
      'sessionRestored': false,
      'error': null,
    };

    try {
      final store = SessionCookieStore();
      final existing = await store.readCookie();

      if (existing == null) {
        // 第一轮：没有会话，注册一个并留下会话。
        await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
        await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));
        await tester.tap(find.text('有访问密钥？注册新账号'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextField, '邮箱'),
          'upgrade-${DateTime.now().millisecondsSinceEpoch}@example.test',
        );
        await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
        await tester.enterText(
          find.widgetWithText(TextField, '访问密钥'),
          'SLX-LEARN-TEST-0001',
        );
        await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
        await _pumpUntilFound(tester, find.byType(NavigationBar));

        evidence['phase'] = 'registered';
      } else {
        // 第二轮：覆盖安装后 Cookie 应该还在，并且后端仍然认这个会话。
        final user = await AuthApi(
          ApiClient(session: store),
        ).fetchMe();

        evidence['phase'] = 'restored';
        evidence['sessionRestored'] = user.id > 0;
      }
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('SESSION_PERSISTENCE_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
  });
}

Future<void> _pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 40),
}) async {
  final deadline = DateTime.now().add(timeout);

  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));

    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }

  throw StateError('等待超时，没有出现：$finder');
}

Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/session_persistence_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
