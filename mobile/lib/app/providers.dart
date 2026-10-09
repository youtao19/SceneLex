import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/network/session_cookie.dart';
import '../core/storage/secret_storage.dart';
import '../core/platform/tts_service.dart';
import '../core/storage/device_prefs.dart';
import '../features/auth/data/auth_api.dart';
import '../features/learning/data/learning_api.dart';
import '../features/notifications/data/notification_gateway.dart';
import '../features/ocr/data/ocr_api.dart';
import '../features/ocr/data/ocr_draft_storage.dart';
import '../features/reading/data/reading_api.dart';
import '../features/settings/data/settings_api.dart';
import '../features/words/data/words_api.dart';

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

final learningApiProvider = Provider<LearningApi>(
  (ref) => HttpLearningApi(ref.watch(apiClientProvider)),
);

final wordsApiProvider = Provider<WordsApi>(
  (ref) => HttpWordsApi(ref.watch(apiClientProvider)),
);

final readingApiProvider = Provider<ReadingApi>(
  (ref) => HttpReadingApi(ref.watch(apiClientProvider)),
);

final notificationGatewayProvider = Provider<NotificationGateway>(
  (ref) => LocalNotificationGateway(),
);

final ocrApiProvider = Provider<OcrApi>(
  (ref) => HttpOcrApi(ref.watch(apiClientProvider)),
);

final ocrDraftStorageProvider = Provider<OcrDraftStorage>(
  (ref) => FileOcrDraftStorage(),
);

final devicePrefsProvider = Provider<DevicePrefs>(
  (ref) => DevicePrefs(SharedPrefsStore()),
);

/// 发音服务全局一份：引擎状态和选中的语音要复用，不每次重建。
final ttsServiceProvider = Provider<TtsService>((ref) => TtsService());
