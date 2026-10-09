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
}
