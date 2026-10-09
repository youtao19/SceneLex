import 'package:app/app/providers.dart';
import 'package:app/core/storage/device_prefs.dart';
import 'package:app/core/storage/secret_storage.dart';
import 'package:app/features/auth/application/auth_controller.dart';
import 'package:app/features/auth/data/auth_user.dart';
import 'package:app/features/notifications/data/notification_gateway.dart';
import 'package:app/features/ocr/application/ocr_controller.dart';
import 'package:app/features/ocr/data/ocr_api.dart';
import 'package:app/features/ocr/data/ocr_draft_storage.dart';
import 'package:app/features/ocr/presentation/ocr_capture_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;

/// 首次识别必须先把“图片会传给模型服务商”说清楚，用户不同意就不能上传。
void main() {
  testWidgets('首次点识别先弹第三方说明，同意后才会上传', (tester) async {
    final store = _InMemoryKeyValueStore();
    final api = _FakeOcrApi();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          devicePrefsProvider.overrideWithValue(DevicePrefs(store)),
          secretStorageProvider.overrideWithValue(_InMemorySecretStorage()),
          notificationGatewayProvider.overrideWithValue(_FakeGateway()),
          ocrApiProvider.overrideWithValue(api),
          ocrDraftStorageProvider.overrideWithValue(_FakeDraftStorage()),
          authControllerProvider.overrideWith(_FakeAuthController.new),
          ocrFlowProvider.overrideWith(_ReadyFlowController.new),
        ],
        child: const MaterialApp(home: OcrCapturePage()),
      ),
    );
    await tester.pumpAndSettle();

    // 有草稿页时按钮可用，点一下应该先弹说明。
    await tester.tap(find.widgetWithText(FilledButton, '开始识别'));
    await tester.pumpAndSettle();

    expect(find.text('图片会发送给模型服务商'), findsOneWidget);
    expect(api.uploadedPages, isEmpty, reason: '还没同意就不能上传');

    // 先不识别：说明不写入，下一次还会再问。
    await tester.tap(find.widgetWithText(TextButton, '先不识别'));
    await tester.pumpAndSettle();

    expect(api.uploadedPages, isEmpty);
    expect(await DevicePrefs(store).hasSeenOcrNotice(7), isFalse);

    // 再点一次并同意：这次应该开始识别，并记住已经说明过。
    await tester.tap(find.widgetWithText(FilledButton, '开始识别'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '知道了，开始识别'));
    await tester.pumpAndSettle();

    expect(await DevicePrefs(store).hasSeenOcrNotice(7), isTrue);
    expect(api.uploadedPages, [0]);
  });

  testWidgets('已经说明过就直接识别，不再重复弹窗', (tester) async {
    final store = _InMemoryKeyValueStore();
    final api = _FakeOcrApi();

    await DevicePrefs(store).markOcrNoticeSeen(7);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          devicePrefsProvider.overrideWithValue(DevicePrefs(store)),
          secretStorageProvider.overrideWithValue(_InMemorySecretStorage()),
          notificationGatewayProvider.overrideWithValue(_FakeGateway()),
          ocrApiProvider.overrideWithValue(api),
          ocrDraftStorageProvider.overrideWithValue(_FakeDraftStorage()),
          authControllerProvider.overrideWith(_FakeAuthController.new),
          ocrFlowProvider.overrideWith(_ReadyFlowController.new),
        ],
        child: const MaterialApp(home: OcrCapturePage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, '开始识别'));
    await tester.pumpAndSettle();

    expect(find.text('图片会发送给模型服务商'), findsNothing);
    expect(api.uploadedPages, [0]);
  });
}

/// 已登录用户：说明与提醒都按这个 id 存。
class _FakeAuthController extends AuthController {
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

/// 直接给出“已有一页待识别”的状态，省掉选图这一步。
class _ReadyFlowController extends OcrFlowController {
  @override
  OcrFlowState build() {
    return const OcrFlowState(
      pages: [
        OcrDraftPage(
          draft: OcrDraftFile(path: '/drafts/1.png', fileName: '1.png', byteSize: 1000),
        ),
      ],
    );
  }
}

class _FakeOcrApi implements OcrApi {
  final List<int> uploadedPages = [];

  @override
  Future<int> createBatch(String operationId) async => 1;

  @override
  Future<OcrBatchSnapshot> getBatch(int batchId) async =>
      const OcrBatchSnapshot(pages: []);

  @override
  Future<OcrPageResult> uploadPage({
    required int batchId,
    required int pageIndex,
    required String filePath,
    required String fileName,
  }) async {
    uploadedPages.add(pageIndex);

    return OcrPageResult(
      pageIndex: pageIndex,
      status: OcrPageStatus.success,
      text: '正文',
      error: '',
    );
  }

  @override
  Future<OcrPageResult> retryPage({
    required int batchId,
    required int pageIndex,
  }) async => const OcrPageResult(
    pageIndex: 0,
    status: OcrPageStatus.success,
    text: '',
    error: '',
  );

  @override
  Future<OcrPageResult> skipPage({
    required int batchId,
    required int pageIndex,
  }) async => const OcrPageResult(
    pageIndex: 0,
    status: OcrPageStatus.skipped,
    text: '',
    error: '',
  );

  @override
  Future<OcrSavedArticle> saveArticle({required int batchId, String? title}) async =>
      const OcrSavedArticle(articleId: 1, text: '');

  @override
  Future<void> cancelBatch(int batchId) async {}
}

class _FakeDraftStorage implements OcrDraftStorage {
  @override
  Future<OcrDraftFile> importImage(String sourcePath, String fileName) async =>
      OcrDraftFile(path: '/drafts/x.png', fileName: fileName, byteSize: 1000);

  @override
  Future<void> removeDraft(String path) async {}

  @override
  Future<int> cleanupStaleDrafts() async => 0;
}

class _FakeGateway implements NotificationGateway {
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
  void onTapRoute(void Function(String route) handler) {}
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

class _InMemorySecretStorage implements SecretStorage {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}
