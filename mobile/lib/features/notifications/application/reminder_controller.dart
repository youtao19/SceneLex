import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../app/providers.dart';
import '../../../core/storage/device_prefs.dart';
import '../data/notification_gateway.dart';
import 'reminder_rules.dart';

class ReminderState {
  const ReminderState({
    this.enabled = true,
    this.hour = ReminderRules.defaultHour,
    this.minute = ReminderRules.defaultMinute,
    this.permissionGranted = true,
    this.nextAt,
  });

  final bool enabled;
  final int hour;
  final int minute;
  final bool permissionGranted;
  final tz.TZDateTime? nextAt;
}

/// 提醒的调度：按当前学习计划决定“今天要不要提醒”，今天完成就跳到明天，
/// 后续每天仍然提醒；拒绝通知权限不影响学习，只影响提醒。
class ReminderController extends Notifier<ReminderState> {
  @override
  ReminderState build() => const ReminderState();

  NotificationGateway get _gateway => ref.read(notificationGatewayProvider);

  DevicePrefs get _prefs => ref.read(devicePrefsProvider);

  Future<void> loadForUser(int userId) async {
    final settings = await _prefs.readReminderSettings(userId);

    state = ReminderState(
      enabled: settings.enabled,
      hour: settings.hour,
      minute: settings.minute,
      // 权限状态要现查：用户可能刚在系统里关掉通知。
      permissionGranted: await _gateway.permissionGranted(),
    );
  }

  /// 计划变化（进入学习页、完成一个词）后重新排提醒。
  Future<void> syncWithPlan({
    required int userId,
    required int newWordTarget,
    required int newWordCompleted,
    required int dueTotal,
  }) async {
    final settings = await _prefs.readReminderSettings(userId);
    final now = tz.TZDateTime.now(tz.getLocation('Asia/Shanghai'));

    if (!settings.enabled) {
      await _gateway.cancelReminder();
      state = ReminderState(
        enabled: false,
        hour: settings.hour,
        minute: settings.minute,
      );

      return;
    }

    final remindToday = ReminderRules.shouldRemindToday(
      newWordTarget: newWordTarget,
      newWordCompleted: newWordCompleted,
      dueTotal: dueTotal,
    );
    final at = ReminderRules.nextReminderAt(
      now,
      remindToday: remindToday,
      hour: settings.hour,
      minute: settings.minute,
    );

    await _gateway.scheduleDailyReminder(
      at: at,
      title: '今天的单词还没学完',
      body: '打开 SceneLex 继续今天的计划。',
    );

    state = ReminderState(
      enabled: true,
      hour: settings.hour,
      minute: settings.minute,
      permissionGranted: await _gateway.permissionGranted(),
      nextAt: at,
    );
  }

  /// 改时间或开关：写进设备偏好后立刻重排。
  Future<void> updateSettings({
    required int userId,
    bool? enabled,
    int? hour,
    int? minute,
  }) async {
    final current = await _prefs.readReminderSettings(userId);

    await _prefs.saveReminderSettings(
      userId,
      ReminderSettings(
        enabled: enabled ?? current.enabled,
        hour: hour ?? current.hour,
        minute: minute ?? current.minute,
      ),
    );

    await loadForUser(userId);

    // 关掉就直接取消；打开时按“今天还没完成”保守排一条，
    // 真正的“今天已完成就跳天”由 syncWithPlan 在学习页按计划覆盖。
    if (state.enabled) {
      final at = ReminderRules.nextReminderAt(
        tz.TZDateTime.now(tz.getLocation('Asia/Shanghai')),
        remindToday: true,
        hour: state.hour,
        minute: state.minute,
      );

      await _gateway.scheduleDailyReminder(
        at: at,
        title: '今天的单词还没学完',
        body: '打开 SceneLex 继续今天的计划。',
      );
      state = ReminderState(
        enabled: true,
        hour: state.hour,
        minute: state.minute,
        permissionGranted: state.permissionGranted,
        nextAt: at,
      );
    } else {
      await _gateway.cancelReminder();
    }
  }

  /// 权限被拒不影响学习：只把状态显示出来，并给系统设置引导。
  Future<bool> requestPermission() async {
    final granted = await _gateway.requestPermission();

    state = ReminderState(
      enabled: state.enabled,
      hour: state.hour,
      minute: state.minute,
      permissionGranted: granted,
      nextAt: state.nextAt,
    );

    return granted;
  }

  /// 登出：提醒和通知都要清掉，换账号不能看到上一个账号的内容。
  Future<void> clearForLogout() async {
    await _gateway.cancelAll();
    state = const ReminderState();
  }

  /// 三类完成通知：客户端观察到完成时才发，不承诺后台送达。
  Future<void> notifyCompletion({required String title, required String body}) {
    return _gateway.showCompletion(title: title, body: body);
  }
}

final reminderProvider = NotifierProvider<ReminderController, ReminderState>(
  ReminderController.new,
);
