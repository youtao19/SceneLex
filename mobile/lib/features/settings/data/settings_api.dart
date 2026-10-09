import '../../../core/network/api_client.dart';
import 'settings_models.dart';

/// 端点连通测试的结果：失败时后端会给一句可操作的话。
class EndpointTestResult {
  const EndpointTestResult({required this.ok, required this.message});

  factory EndpointTestResult.fromJson(Map<String, dynamic> json) {
    return EndpointTestResult(
      ok: json['ok'] == true,
      message: json['message'] as String? ?? '',
    );
  }

  final bool ok;
  final String message;
}

/// 模型端点与学习设置。密钥只在新建/编辑时提交给后端，App 不保存明文。
class SettingsApi {
  SettingsApi(this._client);

  final ApiClient _client;

  Future<EndpointListData> fetchEndpoints() async {
    final data = await _client.get<Map<String, dynamic>>('/settings/endpoints');

    return EndpointListData.fromJson(data);
  }

  Future<AiEndpoint> createEndpoint({
    required String label,
    required String baseUrl,
    required String model,
    required String visionModel,
    required String apiKey,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/settings/endpoints',
      body: {
        'label': label,
        'baseUrl': baseUrl,
        'model': model,
        'visionModel': visionModel,
        'apiKey': apiKey,
      },
    );

    return AiEndpoint.fromJson(data);
  }

  /// 编辑时 apiKey 留空表示保持原密钥不变。
  Future<AiEndpoint> updateEndpoint(
    int endpointId, {
    required String label,
    required String baseUrl,
    required String model,
    required String visionModel,
    required String apiKey,
  }) async {
    final data = await _client.patch<Map<String, dynamic>>(
      '/settings/endpoints/$endpointId',
      body: {
        'label': label,
        'baseUrl': baseUrl,
        'model': model,
        'visionModel': visionModel,
        'apiKey': apiKey,
      },
    );

    return AiEndpoint.fromJson(data);
  }

  Future<void> deleteEndpoint(int endpointId) =>
      _client.delete('/settings/endpoints/$endpointId');

  Future<void> setDefaultEndpoint(int endpointId) async {
    await _client.postNoContent('/settings/endpoints/$endpointId/default');
  }

  /// 已保存端点只能用后端解密出来的密钥测试。
  Future<EndpointTestResult> testSavedEndpoint(int endpointId) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/settings/endpoints/$endpointId/test',
    );

    return EndpointTestResult.fromJson(data);
  }

  Future<LearningSettings> fetchLearningSettings() async {
    final data = await _client.get<Map<String, dynamic>>('/settings/learning');

    return LearningSettings.fromJson(data);
  }

  /// 只提交要改的字段：没带的字段后端保持原值。
  Future<LearningSettings> updateLearningSettings({
    int? dailyNewWordTarget,
    Object? currentSystemBookId = _keepBook,
    bool? dailyReviewLimitEnabled,
    int? dailyReviewLimit,
  }) async {
    final data = await _client.patch<Map<String, dynamic>>(
      '/settings/learning',
      body: {
        'dailyNewWordTarget': ?dailyNewWordTarget,
        if (!identical(currentSystemBookId, _keepBook))
          'currentSystemBookId': currentSystemBookId,
        'dailyReviewLimitEnabled': ?dailyReviewLimitEnabled,
        'dailyReviewLimit': ?dailyReviewLimit,
      },
    );

    return LearningSettings.fromJson(data);
  }

  /// 设置页只列系统词书；进度和排序由后端按个人 words 计算。
  Future<List<SystemWordBookSummary>> fetchSystemWordBooks() async {
    final data = await _client.get<List<dynamic>>('/system-word-books');

    return data
        .map((item) => SystemWordBookSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}

/// 用哨兵区分“不改当前词书”和“把当前词书清空（null）”。
const Object _keepBook = Object();
