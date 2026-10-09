import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 验证 vivo 上通知能不能真的到：它的省电策略可能延迟甚至吞掉通知，必须实测。
///
/// 刻意不在 App 里自查通知：实测 `getActiveNotifications()` 在 vivo 上不返回，会把探针挂死。
/// 所以这里只负责“申请权限 + 立刻发一条 + 排一条定时”，随后由宿主机用
/// `adb shell dumpsys notification` 观察实际是否出现、延迟多久。
/// 按 SPEC 不申请精确闹钟权限，用 inexactAllowWhileIdle，延迟属正常结果。
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
      'pendingAfterDailySchedule': 'unknown',
      'dailyScheduledFor': '',
      'immediateShown': true,
    };

    // 立即通知：证明通道本身能用（是否真的出现由宿主机看通知栏）。
    await plugin.show(id: 1, title: '探针', body: '立即通知', notificationDetails: details);

    // 定时通知排在 90 秒后；matchDateTimeComponents 让它每天同一时间重复。
    final fireAt = tz.TZDateTime.now(tz.local).add(const Duration(seconds: 90));
    await plugin.zonedSchedule(
      id: 2,
      title: '探针',
      body: '每日提醒',
      scheduledDate: fireAt,
      notificationDetails: details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
    );
    evidence['dailyScheduledFor'] = fireAt.toIso8601String();
    /**
     * vivo 上 `pendingNotificationRequests()` 实测不返回（会直接把探针挂死），
     * 所以自查一律加超时并记录结果：App 里也不能无条件等这类调用。
     */
    evidence['pendingAfterDailySchedule'] = await _selfCheck(
      plugin.pendingNotificationRequests(),
    );

    await _writeEvidence(evidence);

    // 只输出权限和排期结果，不包含正文内容。
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

/// 自查调用超时就返回超时标记，而不是让整个探针卡死。
Future<String> _selfCheck(Future<List<PendingNotificationRequest>> pending) async {
  try {
    final requests = await pending.timeout(const Duration(seconds: 10));

    return 'pending=${requests.length}';
  } catch (error) {
    return 'failed: $error';
  }
}
