import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/network/session_cookie.dart';
import '../core/storage/secret_storage.dart';
import '../features/auth/data/auth_api.dart';
import '../features/settings/data/settings_api.dart';

/// 依赖都在这里组装，功能模块只依赖自己需要的那一个。
/// 测试可以覆盖这些 provider，换成内存存储或假客户端。
final secretStorageProvider = Provider<SecretStorage>(
  (ref) => SecureSecretStorage(),
);

final sessionCookieStoreProvider = Provider<SessionCookieStore>(
  (ref) => SessionCookieStore(storage: ref.watch(secretStorageProvider)),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(session: ref.watch(sessionCookieStoreProvider)),
);

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(apiClientProvider)),
);

final settingsApiProvider = Provider<SettingsApi>(
  (ref) => SettingsApi(ref.watch(apiClientProvider)),
);
