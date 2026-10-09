import 'package:app/app/app.dart';
import 'package:app/app/providers.dart';
import 'package:app/core/storage/device_prefs.dart';
import 'package:app/core/storage/secret_storage.dart';
import 'package:app/features/auth/application/auth_controller.dart';
import 'package:app/features/auth/data/auth_user.dart';
import 'package:app/features/learning/data/learning_api.dart';
import 'package:app/features/notifications/data/notification_gateway.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 点通知要按 payload 跳转：网关收到点击后调用注册进来的 handler，路由跟着走。
/// 真机上这条路径被 vivo 安装弹窗挡住，所以先用组件测试把接线钉住。
void main() {
  // 提醒规则会用到北京时区；测试里网关是假的，所以自己把时区库准备好。
  setUpAll(tz_data.initializeTimeZones);

  testWidgets('点通知后按 payload 跳到学习页', (tester) async {
    final gateway = _FakeGateway();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secretStorageProvider.overrideWithValue(_EmptySecretStorage()),
          devicePrefsProvider.overrideWithValue(DevicePrefs(_InMemoryStore())),
          notificationGatewayProvider.overrideWithValue(gateway),
          authControllerProvider.overrideWith(_SignedInController.new),
          // 学习页要拉概览：测试里给固定数据，别真发网络请求。
          learningApiProvider.overrideWithValue(_FakeLearningApi()),
        ],
        child: const SceneLexApp(),
      ),
    );
    await _pumpUntilFound(tester, find.text('今日新词'));

    // 先去“我的”，这样跳回学习页才是有意义的证据。
    await tester.tap(
      find.descendant(of: find.byType(NavigationBar), matching: find.text('我的')).first,
    );
    await _pumpUntilFound(tester, find.text('退出登录'));
    expect(find.text('今日新词'), findsNothing);

    // 模拟用户点了通知：网关把 payload 交给注册的 handler。
    expect(gateway.tapHandler, isNotNull, reason: '路由应该注册过点击回调');
    gateway.tapHandler!('/study');

    await _pumpUntilFound(tester, find.text('今日新词'));
  });
}

class _FakeLearningApi implements LearningApi {
  @override
  Future<StudyOverview> fetchOverview() async {
    return const StudyOverview(
      learningDay: '2026-10-09',
      newWordTarget: 20,
      newWordCompleted: 0,
      currentSystemBookId: 1,
      currentSystemBookName: '探针词书',
      dueTotal: 0,
      queueCount: 0,
      dailyReviewLimitEnabled: false,
      dailyReviewLimit: 20,
    );
  }

  @override
  Future<NewWordQueue> fetchNewWords({int? limit}) async =>
      const NewWordQueue(
        bookId: 1,
        bookName: '探针词书',
        newWordTarget: 20,
        newWordCompleted: 0,
        remainingTarget: 20,
        words: [],
      );

  @override
  Future<List<StudyWord>> fetchTodayWords() async => const [];

  @override
  Future<HistoryArchive> fetchHistory() async => const HistoryArchive(
    summary: HistorySummary(totalWords: 0, dueToday: 0, reviewedWords: 0),
    words: [],
  );

  @override
  Future<StudyWord> completeNewWord({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
    required ReviewRating rating,
    required String operationId,
  }) async => throw UnimplementedError();

  @override
  Future<StudyWord> reviewWord({
    required int wordId,
    required ReviewRating rating,
    required String operationId,
    required int expectedVersion,
  }) async => throw UnimplementedError();

  @override
  Future<StudyWord> rollbackReview({
    required int wordId,
    required String targetOperationId,
    required String operationId,
  }) async => throw UnimplementedError();

  @override
  Future<WordLookupEntry> lookup(String word) async => throw UnimplementedError();

  @override
  Future<GeneratedWordCard> generate(String word, {int? systemBookItemId}) async =>
      throw UnimplementedError();

  @override
  Future<StudyWord> saveCard({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
  }) async => throw UnimplementedError();
}

class _SignedInController extends AuthController {
  @override
  Future<AuthUser?> build() async {
    return const AuthUser(
      id: 7,
      email: 'probe@example.test',
      nickname: '探针',
      role: 'user',
      isVip: false,
      accessStatus: 'active',
      accessExpiresAt: '2026-12-01T00:00:00.000Z',
    );
  }
}

class _FakeGateway implements NotificationGateway {
  void Function(String route)? tapHandler;

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> requestPermission() async => true;

  @override
  Future<bool> permissionGranted() async => true;

  @override
  Future<void> scheduleDailyReminder({
    required tz.TZDateTime at,
    required String title,
    required String body,
  }) async {}

  @override
  Future<void> cancelReminder() async {}

  @override
  Future<void> showCompletion({required String title, required String body}) async {}

  @override
  Future<void> cancelAll() async {}

  @override
  void onTapRoute(void Function(String route) handler) {
    tapHandler = handler;
  }
}

Future<void> _pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final deadline = DateTime.now().add(timeout);

  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));

    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }

  throw StateError('等待超时，没有出现：$finder');
}

class _EmptySecretStorage implements SecretStorage {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

class _InMemoryStore implements KeyValueStore {
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
