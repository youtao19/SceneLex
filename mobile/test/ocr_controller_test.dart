import 'package:app/app/providers.dart';
import 'package:app/core/network/api_failure.dart';
import 'package:app/features/ocr/application/ocr_controller.dart';
import 'package:app/features/ocr/data/ocr_api.dart';
import 'package:app/features/ocr/data/ocr_draft_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// 拍照识别流程的规则：本地限制、按页序上传、只重试失败页、断网不自动上传、退出清草稿。
void main() {
  test('超过 10 张直接拒绝，并且不留草稿', () async {
    final storage = _FakeDraftStorage();
    final container = _buildContainer(storage: storage);

    await container
        .read(ocrFlowProvider.notifier)
        .addPages(_picked(count: 11, byteSize: 1000));

    final state = container.read(ocrFlowProvider);

    expect(state.pages, isEmpty);
    expect(state.errorMessage, contains('最多'));
    expect(storage.removed, isNotEmpty);
  });

  test('单张超过 20 MB 与总量超过 200 MB 都会被本地拦下', () async {
    // 假存储决定“文件大小”，用它来构造边界。
    final oversized = _buildContainer(storage: _FakeDraftStorage(byteSize: 20000001));
    await oversized
        .read(ocrFlowProvider.notifier)
        .addPages(_picked(count: 1, byteSize: 20000001));
    expect(oversized.read(ocrFlowProvider).errorMessage, contains('20 MB'));

    // 10 张 × 20 MB 正好等于 200 MB：批次上限和单图上限是同一组数字，
    // 所以这一档必须放行（批次上限是给服务端参数变更时兜底的冗余校验）。
    final exact = _buildContainer(storage: _FakeDraftStorage(byteSize: 20000000));
    await exact
        .read(ocrFlowProvider.notifier)
        .addPages(_picked(count: 10, byteSize: 20000000));
    expect(exact.read(ocrFlowProvider).pages.length, 10);
    expect(exact.read(ocrFlowProvider).errorMessage, isNull);
  });

  test('调整页序后按新顺序上传', () async {
    final api = _FakeOcrApi();
    final container = _buildContainer(api: api);

    await container
        .read(ocrFlowProvider.notifier)
        .addPages([
          const OcrPickedImage(path: '/tmp/a.png', fileName: 'a.png'),
          const OcrPickedImage(path: '/tmp/b.png', fileName: 'b.png'),
        ]);
    container.read(ocrFlowProvider.notifier).moveDown(0);

    expect(
      container.read(ocrFlowProvider).pages.map((page) => page.draft.fileName),
      ['b.png', 'a.png'],
    );

    await container.read(ocrFlowProvider.notifier).recognize();

    expect(api.uploadedFileNames, ['b.png', 'a.png']);
    expect(api.uploadedPageIndexes, [0, 1]);
  });

  test('换图保持页序，并删掉被替换的本地草稿', () async {
    final storage = _FakeDraftStorage();
    final container = _buildContainer(storage: storage);

    await container.read(ocrFlowProvider.notifier).addPages([
      const OcrPickedImage(path: '/tmp/a.png', fileName: 'a.png'),
      const OcrPickedImage(path: '/tmp/b.png', fileName: 'b.png'),
    ]);

    await container
        .read(ocrFlowProvider.notifier)
        .replaceAt(0, const OcrPickedImage(path: '/tmp/c.png', fileName: 'c.png'));

    final pages = container.read(ocrFlowProvider).pages;

    expect(pages.map((page) => page.draft.fileName), ['c.png', 'b.png']);
    expect(storage.removed.any((path) => path.contains('a.png')), isTrue);
  });

  test('只上传还没成功的页，已成功页不会重复识别', () async {
    final api = _FakeOcrApi();
    final container = _buildContainer(api: api);

    await container.read(ocrFlowProvider.notifier).addPages(_picked(count: 2));
    await container.read(ocrFlowProvider.notifier).recognize();

    expect(api.uploadedPageIndexes, [0, 1]);

    await container.read(ocrFlowProvider.notifier).recognize();

    expect(api.uploadedPageIndexes, [0, 1], reason: '第二次不应该再上传已成功的页');
  });

  test('失败页可以重试，也可以明确跳过', () async {
    final api = _FakeOcrApi()
      ..uploadStatus = OcrPageStatus.failed
      ..uploadError = '没有识别到正文';
    final container = _buildContainer(api: api);

    await container.read(ocrFlowProvider.notifier).addPages(_picked(count: 1));
    await container.read(ocrFlowProvider.notifier).recognize();

    expect(container.read(ocrFlowProvider).pages.single.canRetry, isTrue);

    api.retryStatus = OcrPageStatus.success;
    api.retryText = '重试后的正文';
    await container.read(ocrFlowProvider.notifier).retryAt(0);

    expect(container.read(ocrFlowProvider).pages.single.text, '重试后的正文');

    await container.read(ocrFlowProvider.notifier).skipAt(0);

    expect(container.read(ocrFlowProvider).pages.single.status, OcrPageStatus.skipped);
    expect(api.skippedIndexes, [0]);
  });

  test('断网时停下并保留草稿，不自动重传', () async {
    final api = _FakeOcrApi()..uploadFailure = const NetworkFailure();
    final container = _buildContainer(api: api);

    await container.read(ocrFlowProvider.notifier).addPages(_picked(count: 1));
    await container.read(ocrFlowProvider.notifier).recognize();

    final state = container.read(ocrFlowProvider);

    expect(state.pages.single.status, OcrPageStatus.pending);
    expect(state.errorMessage, isNotNull);
    expect(api.uploadedPageIndexes.length, 1, reason: '失败后不应该自动重试');
  });

  test('保存失败时保留已识别文字，重试保存不重新识别', () async {
    final api = _FakeOcrApi()..saveFailure = const NetworkFailure();
    final storage = _FakeDraftStorage();
    final container = _buildContainer(api: api, storage: storage);

    await container.read(ocrFlowProvider.notifier).addPages(_picked(count: 1));
    await container.read(ocrFlowProvider.notifier).recognize();

    final saved = await container.read(ocrFlowProvider.notifier).saveArticle();

    expect(saved, isNull);
    expect(container.read(ocrFlowProvider).pages.single.text, isNotEmpty);
    expect(api.uploadedPageIndexes.length, 1);

    api.saveFailure = null;
    final retried = await container.read(ocrFlowProvider.notifier).saveArticle();

    expect(retried, 42);
    expect(api.uploadedPageIndexes.length, 1, reason: '重试保存不应该重新识别');
    expect(container.read(ocrFlowProvider).pages, isEmpty);
    expect(storage.removed, isNotEmpty);
  });

  test('放弃识别会通知服务端并清掉本地草稿', () async {
    final api = _FakeOcrApi();
    final storage = _FakeDraftStorage();
    final container = _buildContainer(api: api, storage: storage);

    await container.read(ocrFlowProvider.notifier).addPages(_picked(count: 2));
    await container.read(ocrFlowProvider.notifier).recognize();
    await container.read(ocrFlowProvider.notifier).cancel();

    expect(api.cancelledBatches, 1);
    expect(storage.removed.length, greaterThanOrEqualTo(2));
    expect(container.read(ocrFlowProvider).pages, isEmpty);
  });
}

List<OcrPickedImage> _picked({int count = 1, int byteSize = 1000}) {
  return List.generate(
    count,
    (index) => OcrPickedImage(path: '/tmp/p$index.png', fileName: 'p$index.png'),
  );
}

ProviderContainer _buildContainer({_FakeOcrApi? api, _FakeDraftStorage? storage}) {
  return ProviderContainer(
    overrides: [
      ocrApiProvider.overrideWithValue(api ?? _FakeOcrApi()),
      ocrDraftStorageProvider.overrideWithValue(storage ?? _FakeDraftStorage()),
    ],
  );
}

class _FakeDraftStorage implements OcrDraftStorage {
  _FakeDraftStorage({this.byteSize = 1000});

  final int byteSize;
  final List<String> removed = [];
  int _counter = 0;

  @override
  Future<OcrDraftFile> importImage(String sourcePath, String fileName) async {
    _counter += 1;

    return OcrDraftFile(
      path: '/drafts/$_counter-$fileName',
      fileName: fileName,
      byteSize: byteSize,
    );
  }

  @override
  Future<void> removeDraft(String path) async {
    removed.add(path);
  }

  @override
  Future<int> cleanupStaleDrafts() async => 0;
}

class _FakeOcrApi implements OcrApi {
  OcrPageStatus uploadStatus = OcrPageStatus.success;
  String uploadError = '';
  ApiFailure? uploadFailure;
  OcrPageStatus retryStatus = OcrPageStatus.success;
  String retryText = '识别正文';
  ApiFailure? saveFailure;
  final List<int> uploadedPageIndexes = [];
  final List<String> uploadedFileNames = [];
  final List<int> skippedIndexes = [];
  int cancelledBatches = 0;
  final int _batchId = 7;

  @override
  Future<int> createBatch(String operationId) async => _batchId;

  @override
  Future<OcrPageResult> uploadPage({
    required int batchId,
    required int pageIndex,
    required String filePath,
    required String fileName,
  }) async {
    uploadedPageIndexes.add(pageIndex);
    uploadedFileNames.add(fileName);

    if (uploadFailure != null) {
      throw uploadFailure!;
    }

    return OcrPageResult(
      pageIndex: pageIndex,
      status: uploadStatus,
      text: uploadStatus == OcrPageStatus.success ? '识别正文' : '',
      error: uploadError,
    );
  }

  @override
  Future<OcrBatchSnapshot> getBatch(int batchId) async {
    return const OcrBatchSnapshot(pages: []);
  }

  @override
  Future<OcrPageResult> retryPage({
    required int batchId,
    required int pageIndex,
  }) async {
    return OcrPageResult(
      pageIndex: pageIndex,
      status: retryStatus,
      text: retryText,
      error: '',
    );
  }

  @override
  Future<OcrPageResult> skipPage({
    required int batchId,
    required int pageIndex,
  }) async {
    skippedIndexes.add(pageIndex);

    return OcrPageResult(
      pageIndex: pageIndex,
      status: OcrPageStatus.skipped,
      text: '',
      error: '',
    );
  }

  @override
  Future<OcrSavedArticle> saveArticle({required int batchId, String? title}) async {
    if (saveFailure != null) {
      throw saveFailure!;
    }

    return const OcrSavedArticle(articleId: 42, text: '合并后的正文');
  }

  @override
  Future<void> cancelBatch(int batchId) async {
    cancelledBatches += 1;
  }
}
