import 'package:timezone/timezone.dart' as tz;

/// 每日提醒的纯规则：北京时间 20:00。
/// 今天计划已完成就跳过今天，但后续每天照旧（不能因为今天取消就永久取消）。
class ReminderRules {
  const ReminderRules._();

  static const defaultHour = 20;
  static const defaultMinute = 0;

  /// 今天是否还需要提醒：新词目标完成且没有到期复习词时不再提醒。
  /// 目标为 0 表示只复习，此时新词条件天然满足。
  static bool shouldRemindToday({
    required int newWordTarget,
    required int newWordCompleted,
    required int dueTotal,
  }) {
    final newWordsDone = newWordCompleted >= newWordTarget;

    return !(newWordsDone && dueTotal == 0);
  }

  /// 下一个该提醒的时间：取“还在未来、且今天没被跳过”的那个 20:00。
  /// 跨月跨年交给 TZDateTime 自己归一化。
  static tz.TZDateTime nextReminderAt(
    tz.TZDateTime now, {
    required bool remindToday,
    int hour = defaultHour,
    int minute = defaultMinute,
  }) {
    final todayAt = tz.TZDateTime(
      now.location,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );

    if (remindToday && todayAt.isAfter(now)) {
      return todayAt;
    }

    return tz.TZDateTime(
      now.location,
      now.year,
      now.month,
      now.day + 1,
      hour,
      minute,
    );
  }
}
