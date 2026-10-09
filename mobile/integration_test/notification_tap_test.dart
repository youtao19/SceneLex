import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/notifications/application/reminder_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 真机验证完成通知：能弹出，点它之后跳到学习页。
/// 点击由宿主机完成（通知栏坐标），所以探针只负责“发通知 + 等人点”。
///
/// 运行：
///   adb shell pm grant cn.scenlex.app android.permission.POST_NOTIFICATIONS
///   启动后宿主机执行：下拉通知栏 → 点 SceneLex 的那条通知
///   adb shell run-as cn.scenlex.app cat app_flutter/notification_tap_evidence.json
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('完成通知能弹出且点击后跳到学习页', (tester) async {
    final evidence = <String, Object?>{
      'registered': false,
      'movedAwayFromStudy': false,
      'completionPosted': false,
      'tappedToStudy': false,
      'error': null,
    };
    final container = ProviderContainer();

    try {
      await SessionCookieStore().clear();
      await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));

      await tester.tap(find.text('有访问密钥？注册新账号'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, '邮箱'),
        'notif-${DateTime.now().millisecondsSinceEpoch}@example.test',
      );
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-LEARN-TEST-0001',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registered'] = true;

      // 先离开学习页，这样“点通知后回到学习页”才是有意义的证据。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('我的')).first,
      );
      await _pumpUntilFound(tester, find.widgetWithText(OutlinedButton, '退出登录'));
      evidence['movedAwayFromStudy'] = find.text('今日新词').evaluate().isEmpty;

      await container
          .read(reminderProvider.notifier)
          .notifyCompletion(title: '词卡已生成', body: '探针用的完成通知，点它会回到学习页。');
      evidence['completionPosted'] = true;

      // 等宿主机点通知：点了就会跳到学习页。
      await _pumpUntilFound(
        tester,
        find.text('今日新词'),
        timeout: const Duration(seconds: 60),
      );
      evidence['tappedToStudy'] = true;
    } catch (error) {
      evidence['error'] = error.toString();
    } finally {
      container.dispose();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('NOTIFICATION_TAP_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'registered',
      'movedAwayFromStudy',
      'completionPosted',
      'tappedToStudy',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
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
  final file = File('${dir.path}/notification_tap_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
