import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 抽一层是为了能在测试里换成内存实现，不用真跑平台通道。
abstract class SecretStorage {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

/// 系统安全存储：Android 用 Keystore 保护的密文，磁盘上读不到明文。
class SecureSecretStorage implements SecretStorage {
  SecureSecretStorage([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
