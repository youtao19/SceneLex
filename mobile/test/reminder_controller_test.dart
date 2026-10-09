import 'package:app/app/providers.dart';
import 'package:app/core/storage/device_prefs.dart';
import 'package:app/features/notifications/application/reminder_controller.dart';
import 'package:app/features/notifications/data/notification_gateway.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 提醒调度要钉住：按计划决定今天提不提醒、今天完成只跳过今天、登出清干净。
void main() {
  setUpAll(tz_data.initializeTimeZones);

  test('新词没完成时排在今天 20:00', () async {
    final gateway = _FakeGateway();
    final container = _buildContainer(gateway);

    await container
        .read(reminderProvider.notifier)
        .syncWithPlan(userId: 1, newWordTarget: 20, newWordCompleted: 3, dueTotal: 0);

    expect(gateway.scheduled.length, 1);
    expect(gateway.scheduled.single.hour, 20);
    expect(gateway.cancelled, 0);
  });

  test('今天计划已完成时只跳过今天，明天照旧排一条', () async {
    final gateway = _FakeGateway();
    final container = _buildContainer(gateway);
    final now = tz.TZDateTime.now(tz.getLocation('Asia/Shanghai'));

    await container
        .read(reminderProvider.notifier)
        .syncWithPlan(userId: 1, newWordTarget: 20, newWordCompleted: 20, dueTotal: 0);

    final scheduled = gateway.scheduled.single;

    expect(scheduled.hour, 20);
    expect(
      scheduled.isAfter(now.add(const Duration(hours: 12))),
      isTrue,
      reason: '今天已完成，下一次提醒应该在明天而不是今天',
    );
    expect(gateway.cancelled, 0, reason: '不能把每天的提醒一起取消掉');
  });

  test('关闭提醒后取消已排的提醒', () async {
    final gateway = _FakeGateway();
    final container = _buildContainer(gateway);

    await container
        .read(reminderProvider.notifier)
        .updateSettings(userId: 1, enabled: false);
    await container
        .read(reminderProvider.notifier)
        .syncWithPlan(userId: 1, newWordTarget: 20, newWordCompleted: 0, dueTotal: 0);

    // 关闭时会先取消一次，随后 syncWithPlan 再确认一次，两次都算取消。
    expect(gateway.cancelled, greaterThanOrEqualTo(1));
    expect(gateway.scheduled, isEmpty);
    expect(container.read(reminderProvider).enabled, isFalse);
  });

  test('改时间后用新时间排提醒，并按用户保存', () async {
    final gateway = _FakeGateway();
    final store = _InMemoryKeyValueStore();
    final container = _buildContainer(gateway, store: store);

    await container
        .read(reminderProvider.notifier)
        .updateSettings(userId: 7, hour: 9, minute: 30);
    await container
        .read(reminderProvider.notifier)
        .syncWithPlan(userId: 7, newWordTarget: 20, newWordCompleted: 0, dueTotal: 1);

    expect(gateway.scheduled.last.hour, 9);
    expect(gateway.scheduled.last.minute, 30);

    // 另一个用户读到的还是默认时间：偏好按用户隔离。
    final other = await DevicePrefs(store).readReminderSettings(8);

    expect(other.hour, 20);
  });

  test('权限被拒时只记录状态，不影响别的流程', () async {
    final gateway = _FakeGateway()..permission = false;
    final container = _buildContainer(gateway);

    final granted = await container.read(reminderProvider.notifier).requestPermission();

    expect(granted, isFalse);
    expect(container.read(reminderProvider).permissionGranted, isFalse);
  });

  test('登出会清掉提醒和通知', () async {
    final gateway = _FakeGateway();
    final container = _buildContainer(gateway);

    await container.read(reminderProvider.notifier).clearForLogout();

    expect(gateway.cancelledAll, 1);
    expect(container.read(reminderProvider).nextAt, isNull);
  });
}

ProviderContainer _buildContainer(_FakeGateway gateway, {KeyValueStore? store}) {
  return ProviderContainer(
    overrides: [
      notificationGatewayProvider.overrideWithValue(gateway),
      devicePrefsProvider.overrideWithValue(
        DevicePrefs(store ?? _InMemoryKeyValueStore()),
      ),
    ],
  );
}

class _InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _values.remove(key);
  }
}

class _FakeGateway implements NotificationGateway {
  final List<tz.TZDateTime> scheduled = [];
  int cancelled = 0;
  int cancelledAll = 0;
  bool permission = true;
  final List<String> completions = [];

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> requestPermission() async => permission;

  @override
  Future<bool> permissionGranted() async => permission;

  @override
  Future<void> scheduleDailyReminder({
    required tz.TZDateTime at,
    required String title,
    required String body,
  }) async {
    scheduled.add(at);
  }

  @override
  Future<void> cancelReminder() async {
    cancelled += 1;
  }

  @override
  Future<void> showCompletion({required String title, required String body}) async {
    completions.add(title);
  }

  @override
  Future<void> cancelAll() async {
    cancelledAll += 1;
  }

  @override
  void onTapRoute(void Function(String route) handler) {}
}
