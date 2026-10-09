import '../../../core/network/api_client.dart';

/// 识别相关的限制必须和后端 `ocr-rules.ts` 用同一套数字（1 MB = 1,000,000 字节）。
class OcrLimits {
  const OcrLimits._();

  static const maxPages = 10;
  static const maxPageBytes = 20000000;
  static const maxBatchBytes = 200000000;
}

enum OcrPageStatus { pending, success, failed, skipped }

OcrPageStatus ocrPageStatusFrom(String value) {
  return switch (value) {
    'success' => OcrPageStatus.success,
    'failed' => OcrPageStatus.failed,
    'skipped' => OcrPageStatus.skipped,
    _ => OcrPageStatus.pending,
  };
}

class OcrPageResult {
  const OcrPageResult({
    required this.pageIndex,
    required this.status,
    required this.text,
    required this.error,
  });

  factory OcrPageResult.fromJson(Map<String, dynamic> json) {
    return OcrPageResult(
      pageIndex: (json['pageIndex'] as num).toInt(),
      status: ocrPageStatusFrom(json['status'] as String? ?? 'pending'),
      text: json['text'] as String? ?? '',
      error: json['error'] as String? ?? '',
    );
  }

  final int pageIndex;
  final OcrPageStatus status;
  final String text;
  final String error;
}

class OcrSavedArticle {
  const OcrSavedArticle({required this.articleId, required this.text});

  factory OcrSavedArticle.fromJson(Map<String, dynamic> json) {
    return OcrSavedArticle(
      articleId: (json['articleId'] as num).toInt(),
      text: json['text'] as String? ?? '',
    );
  }

  final int articleId;
  final String text;
}

/// 多页识别接口。原图按页上传，服务端只长期保存合并后的文章文字。
abstract class OcrApi {
  Future<int> createBatch(String operationId);

  Future<OcrPageResult> uploadPage({
    required int batchId,
    required int pageIndex,
    required String filePath,
    required String fileName,
  });

  /// 查批次已有结果：断线重连后先看服务端记了什么，不盲目重发。
  Future<OcrBatchSnapshot> getBatch(int batchId);

  Future<OcrPageResult> retryPage({required int batchId, required int pageIndex});

  Future<OcrPageResult> skipPage({required int batchId, required int pageIndex});

  Future<OcrSavedArticle> saveArticle({required int batchId, String? title});

  Future<void> cancelBatch(int batchId);
}

/// 批次的已有结果：页状态、服务端记录的原图字节数。
class OcrBatchSnapshot {
  const OcrBatchSnapshot({required this.pages});

  factory OcrBatchSnapshot.fromJson(Map<String, dynamic> json) {
    return OcrBatchSnapshot(
      pages: (json['pages'] as List<dynamic>? ?? const [])
          .map((item) => OcrPageSnapshot.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  final List<OcrPageSnapshot> pages;
}

class OcrPageSnapshot {
  const OcrPageSnapshot({
    required this.pageIndex,
    required this.status,
    required this.text,
    required this.byteSize,
    required this.hasImage,
  });

  factory OcrPageSnapshot.fromJson(Map<String, dynamic> json) {
    return OcrPageSnapshot(
      pageIndex: (json['pageIndex'] as num).toInt(),
      status: ocrPageStatusFrom(json['status'] as String? ?? 'pending'),
      text: json['text'] as String? ?? '',
      byteSize: (json['byteSize'] as num? ?? 0).toInt(),
      hasImage: json['hasImage'] == true,
    );
  }

  final int pageIndex;
  final OcrPageStatus status;
  final String text;
  final int byteSize;
  final bool hasImage;
}

class HttpOcrApi implements OcrApi {
  HttpOcrApi(this._client);

  final ApiClient _client;

  @override
  Future<int> createBatch(String operationId) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/ocr/batches',
      body: {'operationId': operationId},
    );

    return (data['batchId'] as num).toInt();
  }

  @override
  Future<OcrPageResult> uploadPage({
    required int batchId,
    required int pageIndex,
    required String filePath,
    required String fileName,
  }) async {
    final data = await _client.upload<Map<String, dynamic>>(
      '/ocr/batches/$batchId/pages/$pageIndex',
      field: 'image',
      filePath: filePath,
      fileName: fileName,
    );

    return OcrPageResult.fromJson(data);
  }

  @override
  Future<OcrBatchSnapshot> getBatch(int batchId) async {
    final data = await _client.get<Map<String, dynamic>>('/ocr/batches/$batchId');

    return OcrBatchSnapshot.fromJson(data);
  }

  @override
  Future<OcrPageResult> retryPage({
    required int batchId,
    required int pageIndex,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/ocr/batches/$batchId/pages/$pageIndex/retry',
    );

    return OcrPageResult.fromJson(data);
  }

  @override
  Future<OcrPageResult> skipPage({
    required int batchId,
    required int pageIndex,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/ocr/batches/$batchId/pages/$pageIndex/skip',
    );

    return OcrPageResult.fromJson(data);
  }

  @override
  Future<OcrSavedArticle> saveArticle({required int batchId, String? title}) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/ocr/batches/$batchId/article',
      body: {'title': ?title},
    );

    return OcrSavedArticle.fromJson(data);
  }

  @override
  Future<void> cancelBatch(int batchId) =>
      _client.delete('/ocr/batches/$batchId');
}
