import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/network/operation_id.dart';
import '../data/ocr_api.dart';
import '../data/ocr_draft_storage.dart';

/// 流程里的草稿页：本地文件 + 服务端识别结果。
class OcrDraftPage {
  const OcrDraftPage({
    required this.draft,
    this.status = OcrPageStatus.pending,
    this.text = '',
    this.error = '',
  });

  final OcrDraftFile draft;
  final OcrPageStatus status;
  final String text;
  final String error;

  bool get canRetry => status == OcrPageStatus.failed;

  OcrDraftPage copyWith({
    OcrPageStatus? status,
    String? text,
    String? error,
  }) {
    return OcrDraftPage(
      draft: draft,
      status: status ?? this.status,
      text: text ?? this.text,
      error: error ?? this.error,
    );
  }
}

class OcrFlowState {
  const OcrFlowState({
    this.pages = const [],
    this.batchId,
    this.busy = false,
    this.errorMessage,
    this.savedArticleId,
  });

  final List<OcrDraftPage> pages;
  final int? batchId;
  final bool busy;
  final String? errorMessage;
  final int? savedArticleId;

  int get totalBytes =>
      pages.fold(0, (total, page) => total + page.draft.byteSize);

  bool get hasUnfinishedPages =>
      pages.any((page) => page.status == OcrPageStatus.pending);

  OcrFlowState copyWith({
    List<OcrDraftPage>? pages,
    int? batchId,
    bool? busy,
    String? errorMessage,
    bool clearError = false,
    int? savedArticleId,
  }) {
    return OcrFlowState(
      pages: pages ?? this.pages,
      batchId: batchId ?? this.batchId,
      busy: busy ?? this.busy,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      savedArticleId: savedArticleId ?? this.savedArticleId,
    );
  }
}

/// 拍照识别流程：本地先按限制拦截、按用户页序上传、只重试失败页、结束时清草稿。
class OcrFlowController extends Notifier<OcrFlowState> {
  @override
  OcrFlowState build() => const OcrFlowState();

  OcrApi get _api => ref.read(ocrApiProvider);

  OcrDraftStorage get _storage => ref.read(ocrDraftStorageProvider);

  /// 加入草稿页：不压缩、不改写，只做数量与体积校验。
  Future<void> addPages(List<OcrPickedImage> picked) async {
    final drafts = <OcrDraftPage>[];

    for (final image in picked) {
      final draft = await _storage.importImage(image.path, image.fileName);
      drafts.add(OcrDraftPage(draft: draft));
    }

    final pages = [...state.pages, ...drafts];

    try {
      _assertWithinLimits(pages);
    } on ApiFailure catch (error) {
      // 超限时不留下刚拷进来的草稿。
      for (final page in drafts) {
        await _storage.removeDraft(page.draft.path);
      }

      state = state.copyWith(errorMessage: error.message);

      return;
    }

    state = state.copyWith(pages: pages, clearError: true);
  }

  void moveUp(int index) => _swap(index, index - 1);

  void moveDown(int index) => _swap(index, index + 1);

  void removeAt(int index) {
    if (index < 0 || index >= state.pages.length) {
      return;
    }

    final pages = [...state.pages];
    final removed = pages.removeAt(index);

    state = state.copyWith(pages: pages);
    _storage.removeDraft(removed.draft.path);
  }

  /// 换图保持页序：失败页换一张，不用整批重来。
  Future<void> replaceAt(int index, OcrPickedImage image) async {
    if (index < 0 || index >= state.pages.length) {
      return;
    }

    final draft = await _storage.importImage(image.path, image.fileName);
    final pages = [...state.pages];

    try {
      _assertWithinLimits([
        ...pages.sublist(0, index),
        OcrDraftPage(draft: draft),
        ...pages.sublist(index + 1),
      ]);
    } on ApiFailure catch (error) {
      await _storage.removeDraft(draft.path);
      state = state.copyWith(errorMessage: error.message);

      return;
    }

    final previous = pages[index];
    pages[index] = OcrDraftPage(draft: draft);
    state = state.copyWith(pages: pages, clearError: true);
    await _storage.removeDraft(previous.draft.path);
  }

  /// 识别：只上传还没成功的页，按用户确认的页序逐页上传。
  /// 断网就停下并保留本地草稿，恢复网络后由用户手动点“继续识别”，不自动重传。
  Future<void> recognize() async {
    if (state.busy || state.pages.isEmpty) {
      return;
    }

    state = state.copyWith(busy: true, clearError: true);

    try {
      final batchId = state.batchId ?? await _api.createBatch(createOperationId());

      if (state.batchId == null) {
        state = state.copyWith(batchId: batchId);
      }

      for (var index = 0; index < state.pages.length; index += 1) {
        final page = state.pages[index];

        if (page.status == OcrPageStatus.success ||
            page.status == OcrPageStatus.skipped) {
          continue;
        }

        final result = await _api.uploadPage(
          batchId: batchId,
          pageIndex: index,
          filePath: page.draft.path,
          fileName: page.draft.fileName,
        );

        _applyResult(index, result);
      }

      state = state.copyWith(busy: false, clearError: true);
    } on ApiFailure catch (error) {
      state = state.copyWith(busy: false, errorMessage: describeFailure(error));
    }
  }

  Future<void> retryAt(int index) async {
    final batchId = state.batchId;

    if (batchId == null || state.busy) {
      return;
    }

    state = state.copyWith(busy: true, clearError: true);

    try {
      _applyResult(index, await _api.retryPage(batchId: batchId, pageIndex: index));
      state = state.copyWith(busy: false);
    } on ApiFailure catch (error) {
      state = state.copyWith(busy: false, errorMessage: describeFailure(error));
    }
  }

  Future<void> skipAt(int index) async {
    final batchId = state.batchId;

    if (batchId == null || state.busy) {
      return;
    }

    state = state.copyWith(busy: true, clearError: true);

    try {
      _applyResult(index, await _api.skipPage(batchId: batchId, pageIndex: index));
      state = state.copyWith(busy: false);
    } on ApiFailure catch (error) {
      state = state.copyWith(busy: false, errorMessage: describeFailure(error));
    }
  }

  /// 保存文章：失败时保留已识别文字，重试保存不会重新识别。
  Future<int?> saveArticle() async {
    final batchId = state.batchId;

    if (batchId == null || state.busy) {
      return null;
    }

    state = state.copyWith(busy: true, clearError: true);

    try {
      final saved = await _api.saveArticle(batchId: batchId);

      state = state.copyWith(busy: false, savedArticleId: saved.articleId);
      await clearLocalDrafts();

      return saved.articleId;
    } on ApiFailure catch (error) {
      state = state.copyWith(busy: false, errorMessage: describeFailure(error));

      return null;
    }
  }

  /// 放弃这次识别：通知服务端删原图，并清掉本地草稿。
  Future<void> cancel() async {
    final batchId = state.batchId;

    if (batchId != null) {
      try {
        await _api.cancelBatch(batchId);
      } on ApiFailure {
        // 服务端删不掉也要让用户能退出，本地草稿仍然清掉。
      }
    }

    await clearLocalDrafts();
    state = const OcrFlowState();
  }

  /// 清本地草稿：只删自己拷贝的那份，相册原文件不动。
  Future<void> clearLocalDrafts() async {
    for (final page in state.pages) {
      await _storage.removeDraft(page.draft.path);
    }

    state = state.copyWith(pages: const []);
  }

  void _applyResult(int index, OcrPageResult result) {
    if (index < 0 || index >= state.pages.length) {
      return;
    }

    final pages = [...state.pages];
    pages[index] = pages[index].copyWith(
      status: result.status,
      text: result.text,
      error: result.error,
    );

    state = state.copyWith(pages: pages);
  }

  void _swap(int left, int right) {
    if (left < 0 || right < 0 || left >= state.pages.length || right >= state.pages.length) {
      return;
    }

    final pages = [...state.pages];
    final item = pages[left];
    pages[left] = pages[right];
    pages[right] = item;

    state = state.copyWith(pages: pages);
  }

  /// 本地拦截：服务端还会再校验一遍，客户端不能只信自己。
  void _assertWithinLimits(List<OcrDraftPage> pages) {
    if (pages.length > OcrLimits.maxPages) {
      throw const RequestFailure(400, '一次最多识别 10 张，请减少页数后重试');
    }

    var total = 0;

    for (final page in pages) {
      if (page.draft.byteSize > OcrLimits.maxPageBytes) {
        throw const RequestFailure(400, '单张图片不能超过 20 MB');
      }

      total += page.draft.byteSize;
    }

    if (total > OcrLimits.maxBatchBytes) {
      throw const RequestFailure(400, '本次图片总量不能超过 200 MB');
    }
  }
}

/// 选图/拍照的结果：只带路径和文件名，内容不改写。
class OcrPickedImage {
  const OcrPickedImage({required this.path, required this.fileName});

  final String path;
  final String fileName;
}

final ocrFlowProvider = NotifierProvider<OcrFlowController, OcrFlowState>(
  OcrFlowController.new,
);
