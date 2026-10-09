import 'package:app/core/storage/secret_storage.dart';

/// 测试用内存实现：不跑平台通道，也不碰真机安全存储。
class InMemorySecretStorage implements SecretStorage {
  final Map<String, String> _values = {};

  /// 方便断言“登出后确实什么都没留下”。
  Map<String, String> get values => Map.unmodifiable(_values);

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
