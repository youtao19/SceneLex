import 'package:app/features/notifications/application/reminder_rules.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 提醒规则最容易错在跨日边界：今天计划完成了要跳过今天，但明天还得提醒。
void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
  });

  tz.TZDateTime beijing(int year, int month, int day, int hour, [int minute = 0]) {
    return tz.TZDateTime(tz.getLocation('Asia/Shanghai'), year, month, day, hour, minute);
  }

  test('白天且今天要提醒时排在今天 20:00', () {
    final next = ReminderRules.nextReminderAt(
      beijing(2026, 10, 9, 9, 30),
      remindToday: true,
    );

    expect(next, beijing(2026, 10, 9, 20));
  });

  test('已经过了 20:00 就排到明天', () {
    final next = ReminderRules.nextReminderAt(
      beijing(2026, 10, 9, 21),
      remindToday: true,
    );

    expect(next, beijing(2026, 10, 10, 20));
  });

  test('今天计划已完成时跳过今天，但明天仍然提醒', () {
    final next = ReminderRules.nextReminderAt(
      beijing(2026, 10, 9, 9),
      remindToday: false,
    );

    expect(next, beijing(2026, 10, 10, 20));
  });

  test('晚上完成计划时不会把提醒推到后天', () {
    final next = ReminderRules.nextReminderAt(
      beijing(2026, 10, 9, 21),
      remindToday: false,
    );

    expect(next, beijing(2026, 10, 10, 20));
  });

  test('跨月边界也能算出下一天', () {
    final next = ReminderRules.nextReminderAt(
      beijing(2026, 10, 31, 22),
      remindToday: false,
    );

    expect(next, beijing(2026, 11, 1, 20));
  });

  test('新词完成且无到期词时不再提醒，目标 0 也适用', () {
    expect(
      ReminderRules.shouldRemindToday(
        newWordTarget: 20,
        newWordCompleted: 20,
        dueTotal: 0,
      ),
      isFalse,
    );
    expect(
      ReminderRules.shouldRemindToday(
        newWordTarget: 0,
        newWordCompleted: 0,
        dueTotal: 0,
      ),
      isFalse,
    );
  });

  test('还有到期词或新词没完成时照常提醒', () {
    expect(
      ReminderRules.shouldRemindToday(
        newWordTarget: 20,
        newWordCompleted: 20,
        dueTotal: 3,
      ),
      isTrue,
    );
    expect(
      ReminderRules.shouldRemindToday(
        newWordTarget: 20,
        newWordCompleted: 5,
        dueTotal: 0,
      ),
      isTrue,
    );
  });
}
