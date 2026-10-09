import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 验证 vivo 上通知能不能真的到：它的省电策略可能延迟甚至吞掉通知，必须实测。
/// 按 SPEC 不申请精确闹钟权限，用 inexactAllowWhileIdle，所以观察到延迟是正常结果，
/// 但要分清“延迟多久”和“完全不到”。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('通知权限、立即通知和每日定时通知的实际表现', (tester) async {
    tz_data.initializeTimeZones();
    // 提醒按北京时间算，不跟随手机所在时区。
    tz.setLocalLocation(tz.getLocation('Asia/Shanghai'));

    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    final android = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'probe',
        '探针通知',
        importance: Importance.high,
        priority: Priority.high,
      ),
    );
    final evidence = <String, Object?>{
      'permissionGranted': await android?.requestNotificationsPermission(),
      'notificationsEnabled': await android?.areNotificationsEnabled(),
      'canScheduleExact': await android?.canScheduleExactNotifications(),
      'immediateShown': false,
      'pendingAfterDailySchedule': 0,
      'dailyFired': false,
      'dailyDelaySeconds': null,
      'pendingAfterCancel': null,
    };

    try {
      // 先证明通道本身能用，否则定时没到就分不清是权限问题还是调度问题。
      await plugin.show(id: 1, title: '探针', body: '立即通知', notificationDetails: details);
      await Future<void>.delayed(const Duration(seconds: 3));
      evidence['immediateShown'] = (await plugin.getActiveNotifications()).any(
        (notification) => notification.id == 1,
      );

      final fireAt = tz.TZDateTime.now(tz.local).add(const Duration(seconds: 60));
      await plugin.zonedSchedule(
        id: 2,
        title: '探针',
        body: '每日提醒',
        scheduledDate: fireAt,
        notificationDetails: details,
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.time,
      );
      evidence['pendingAfterDailySchedule'] =
          (await plugin.pendingNotificationRequests()).length;

      // 最多等 6 分钟：inexact 闹钟本来就有窗口，超过这个时间就算实际不可用。
      final deadline = DateTime.now().add(const Duration(minutes: 6));
      while (DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(seconds: 10));
        final active = await plugin.getActiveNotifications();
        if (active.any((notification) => notification.id == 2)) {
          evidence['dailyFired'] = true;
          evidence['dailyDelaySeconds'] = DateTime.now()
              .difference(fireAt.toLocal())
              .inSeconds;
          break;
        }
      }

      await plugin.cancel(id: 2);
      evidence['pendingAfterCancel'] =
          (await plugin.pendingNotificationRequests()).length;
    } finally {
      // 探针不该在用户手机上留下通知和日程。
      await plugin.cancelAll();
      await _writeEvidence(evidence);
    }

    // 只输出权限和计时结果，不包含正文内容。
    // ignore: avoid_print
    print('NOTIFICATION_PROBE: ${jsonEncode(evidence)}');
  });
}

/// standalone 启动时 print 不会进 logcat，只能把证据写进应用私有目录用 adb 读。
Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/notification_probe_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
