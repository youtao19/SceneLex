import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/auth/application/auth_controller.dart';
import 'package:app/features/notifications/application/reminder_controller.dart';
import 'package:app/features/settings/data/settings_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 真机验证每日提醒：按计划排提醒、关掉就取消、今天完成跳到明天、登出清干净。
/// 运行前先撤销通知权限，用来验证“拒绝权限只显示引导、不影响学习”：
///   adb shell pm revoke cn.scenlex.app android.permission.POST_NOTIFICATIONS
///
/// 隔离环境与其它探针相同（adb reverse + 假模型 + 隔离库）。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  tz_data.initializeTimeZones();

  testWidgets('每日提醒按计划排期、开关、跳天与登出清理', (tester) async {
    final evidence = <String, Object?>{
      'registered': false,
      'reminderScheduled': false,
      'permissionGuidanceShown': false,
      'disabledClearsReminder': false,
      'enabledReschedules': false,
      'planCompleteSkipsToday': false,
      'logoutClearsReminder': false,
      'error': null,
    };
    final container = ProviderContainer();
    final plugin = FlutterLocalNotificationsPlugin();

    try {
      // 先清掉历史遗留的排期（之前探针留下的每日提醒），否则计数会被污染。
      await plugin.cancelAll();
      await SessionCookieStore().clear();
      await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));

      await tester.tap(find.text('有访问密钥？注册新账号'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, '邮箱'),
        'notify-${DateTime.now().millisecondsSinceEpoch}@example.test',
      );
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-LEARN-TEST-0001',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registered'] = true;

      // 进入学习页后按计划排提醒（概览加载即触发）。
      await _pumpUntilFound(tester, find.text('今日新词'));
      await tester.pump(const Duration(seconds: 3));
      evidence['reminderScheduled'] = (await _pendingCount(plugin)) >= 1;

      // 设置页：权限被撤销时应给出引导而不是静默失败。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('我的')).first,
      );
      await _pumpUntilFound(tester, find.text('学习设置与模型端点'));
      await tester.tap(find.text('学习设置与模型端点'));
      await _pumpUntilFound(tester, find.text('每日提醒'));
      await _pumpUntilFound(tester, find.textContaining('系统通知权限还没开'));
      evidence['permissionGuidanceShown'] = true;

      // 关掉提醒 → 已排的提醒取消（按标题定位，别点到复习限制那个开关）。
      final reminderSwitch = find.ancestor(
        of: find.textContaining('每日提醒'),
        matching: find.byType(SwitchListTile),
      );

      await tester.tap(reminderSwitch);
      await tester.pump(const Duration(seconds: 3));
      evidence['disabledClearsReminder'] = (await _pendingCount(plugin)) == 0;

      // 再打开 → 重新排一条。
      await tester.tap(reminderSwitch);
      await tester.pump(const Duration(seconds: 3));
      evidence['enabledReschedules'] = (await _pendingCount(plugin)) >= 1;

      // 把目标改成 1 并完成一个词：今天计划完成，提醒应跳到明天。
      final settingsApi = SettingsApi(ApiClient(session: SessionCookieStore()));
      await settingsApi.updateLearningSettings(dailyNewWordTarget: 1);
      await settingsApi.updateLearningSettings(currentSystemBookId: 1);

      // 用真实登录用户 id 同步提醒（新容器会自己用安全存储里的会话校验一次）。
      final userId = (await container.read(authControllerProvider.future))?.id;

      if (userId == null) {
        throw StateError('没有取到登录用户');
      }

      await container
          .read(reminderProvider.notifier)
          .syncWithPlan(
            userId: userId,
            newWordTarget: 1,
            newWordCompleted: 1,
            dueTotal: 0,
          );

      final nextAt = container.read(reminderProvider).nextAt;
      final beijingNow = tz.TZDateTime.now(tz.getLocation('Asia/Shanghai'));

      evidence['planCompleteSkipsToday'] =
          nextAt != null && nextAt.hour == 20 && nextAt.day != beijingNow.day;

      // 登出：提醒和通知一起清掉。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('我的')).first,
      );
      await _pumpUntilFound(tester, find.widgetWithText(OutlinedButton, '退出登录'));
      await tester.tap(find.widgetWithText(OutlinedButton, '退出登录'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, '退出'));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));
      await tester.pump(const Duration(seconds: 3));
      evidence['logoutClearsReminder'] = (await _pendingCount(plugin)) == 0;
    } catch (error) {
      evidence['error'] = error.toString();
    } finally {
      container.dispose();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('NOTIFICATION_FLOW_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'registered',
      'reminderScheduled',
      'permissionGuidanceShown',
      'disabledClearsReminder',
      'enabledReschedules',
      'planCompleteSkipsToday',
      'logoutClearsReminder',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
  });
}

/// vivo 上这类自查调用会间歇性不返回，所以一律带超时。
Future<int> _pendingCount(FlutterLocalNotificationsPlugin plugin) async {
  try {
    final pending = await plugin.pendingNotificationRequests().timeout(
      const Duration(seconds: 10),
    );

    return pending.length;
  } catch (_) {
    return -1;
  }
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
  final file = File('${dir.path}/notification_flow_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
