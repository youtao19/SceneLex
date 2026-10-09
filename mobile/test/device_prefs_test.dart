import 'package:app/core/storage/device_prefs.dart';
import 'package:flutter_test/flutter_test.dart';

/// 设备偏好必须按用户隔离，而且默认值要保守（没看过说明就是没看过）。
void main() {
  test('首次识别说明默认没看过，标记后按用户记住', () async {
    final prefs = DevicePrefs(_InMemoryKeyValueStore());

    expect(await prefs.hasSeenOcrNotice(1), isFalse);

    await prefs.markOcrNoticeSeen(1);

    expect(await prefs.hasSeenOcrNotice(1), isTrue);
    // 另一个账号还是要重新说明一次。
    expect(await prefs.hasSeenOcrNotice(2), isFalse);
  });

  test('提醒设置默认 20:00 且开启，改完按用户保存', () async {
    final prefs = DevicePrefs(_InMemoryKeyValueStore());

    final defaults = await prefs.readReminderSettings(1);

    expect(defaults.enabled, isTrue);
    expect(defaults.hour, 20);
    expect(defaults.minute, 0);

    await prefs.saveReminderSettings(
      1,
      const ReminderSettings(enabled: false, hour: 9, minute: 15),
    );

    final saved = await prefs.readReminderSettings(1);

    expect(saved.enabled, isFalse);
    expect(saved.hour, 9);
    expect(saved.minute, 15);
    expect((await prefs.readReminderSettings(2)).hour, 20);
  });

  test('学习位置存坏了就当没有，不让恢复失败挡住学习', () async {
    final store = _InMemoryKeyValueStore();
    final prefs = DevicePrefs(store);

    await store.write('study_position_1', 'not-json');

    expect(await prefs.readStudyPosition(1), isNull);
    expect(await store.read('study_position_1'), isNull);
  });
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
