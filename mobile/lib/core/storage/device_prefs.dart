import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// 抽一层是为了测试能换内存实现，不用跑平台通道。
abstract class KeyValueStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

class SharedPrefsStore implements KeyValueStore {
  SharedPrefsStore([SharedPreferencesAsync? prefs])
    : _prefs = prefs ?? SharedPreferencesAsync();

  final SharedPreferencesAsync _prefs;

  @override
  Future<String?> read(String key) => _prefs.getString(key);

  @override
  Future<void> write(String key, String value) => _prefs.setString(key, value);

  @override
  Future<void> delete(String key) => _prefs.remove(key);
}

/// 上次没学完的位置。只存 id 和模式，不存词卡内容，也不做离线队列。
class StudyPosition {
  const StudyPosition({
    required this.mode,
    this.wordId,
    this.bookItemId,
  });

  factory StudyPosition.fromJson(Map<String, dynamic> json) {
    return StudyPosition(
      mode: json['mode'] as String? ?? 'review',
      wordId: (json['wordId'] as num?)?.toInt(),
      bookItemId: (json['bookItemId'] as num?)?.toInt(),
    );
  }

  final String mode;

  /// 复习词用个人词 id；新词在完成前还没有个人词记录，所以用词条 id。
  final int? wordId;
  final int? bookItemId;

  Map<String, Object?> toJson() => {
    'mode': mode,
    'wordId': wordId,
    'bookItemId': bookItemId,
  };
}

/// 提醒设置：开关和时间都按用户保存，换账号不会带着上一个账号的偏好。
class ReminderSettings {
  const ReminderSettings({required this.enabled, required this.hour, required this.minute});

  factory ReminderSettings.fromJson(Map<String, dynamic> json) {
    return ReminderSettings(
      enabled: json['enabled'] != false,
      hour: (json['hour'] as num? ?? 20).toInt(),
      minute: (json['minute'] as num? ?? 0).toInt(),
    );
  }

  final bool enabled;
  final int hour;
  final int minute;

  Map<String, Object?> toJson() => {
    'enabled': enabled,
    'hour': hour,
    'minute': minute,
  };
}

class DevicePrefs {
  DevicePrefs(this._store);

  final KeyValueStore _store;

  /// 位置按用户隔离：切换账号时不恢复上一账号的位置。
  String _positionKey(int userId) => 'study_position_$userId';

  Future<void> saveStudyPosition(int userId, StudyPosition position) {
    return _store.write(_positionKey(userId), jsonEncode(position.toJson()));
  }

  Future<StudyPosition?> readStudyPosition(int userId) async {
    final raw = await _store.read(_positionKey(userId));

    if (raw == null || raw.isEmpty) {
      return null;
    }

    try {
      return StudyPosition.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on FormatException {
      // 数据坏了就当没有位置，别让恢复失败挡住学习。
      await clearStudyPosition(userId);

      return null;
    }
  }

  Future<void> clearStudyPosition(int userId) =>
      _store.delete(_positionKey(userId));

  String _reminderKey(int userId) => 'reminder_settings_$userId';

  Future<void> saveReminderSettings(int userId, ReminderSettings settings) {
    return _store.write(_reminderKey(userId), jsonEncode(settings.toJson()));
  }

  Future<ReminderSettings> readReminderSettings(int userId) async {
    final raw = await _store.read(_reminderKey(userId));

    if (raw == null || raw.isEmpty) {
      return const ReminderSettings(enabled: true, hour: 20, minute: 0);
    }

    try {
      return ReminderSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on FormatException {
      return const ReminderSettings(enabled: true, hour: 20, minute: 0);
    }
  }
}
