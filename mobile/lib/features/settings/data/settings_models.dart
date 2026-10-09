/// 端点列表里的一个端点。后端只回传密钥掩码，明文不出后端。
class AiEndpoint {
  const AiEndpoint({
    required this.id,
    required this.label,
    required this.baseUrl,
    required this.model,
    required this.visionModel,
    required this.keyPreview,
    required this.isDefault,
  });

  factory AiEndpoint.fromJson(Map<String, dynamic> json) {
    return AiEndpoint(
      id: (json['id'] as num).toInt(),
      label: json['label'] as String? ?? '',
      baseUrl: json['baseUrl'] as String? ?? '',
      model: json['model'] as String? ?? '',
      visionModel: json['visionModel'] as String? ?? '',
      keyPreview: json['keyPreview'] as String? ?? '',
      isDefault: json['isDefault'] == true,
    );
  }

  final int id;
  final String label;
  final String baseUrl;
  final String model;
  final String visionModel;
  final String keyPreview;
  final bool isDefault;

  /// 视觉模型为空表示这个端点不能做 OCR，界面要明确说清楚而不是静默失败。
  bool get supportsVision => visionModel.trim().isNotEmpty;
}

/// 系统端点只回传名字和模型，地址与密钥不出后端。
class SystemEndpointStatus {
  const SystemEndpointStatus({
    required this.canUse,
    required this.available,
    this.label,
    this.model,
  });

  factory SystemEndpointStatus.fromJson(Map<String, dynamic> json) {
    return SystemEndpointStatus(
      canUse: json['canUse'] == true,
      available: json['available'] == true,
      label: json['label'] as String?,
      model: json['model'] as String?,
    );
  }

  final bool canUse;
  final bool available;
  final String? label;
  final String? model;
}

class EndpointListData {
  const EndpointListData({required this.endpoints, required this.system});

  factory EndpointListData.fromJson(Map<String, dynamic> json) {
    final endpoints = (json['endpoints'] as List<dynamic>? ?? const [])
        .map((item) => AiEndpoint.fromJson(item as Map<String, dynamic>))
        .toList();

    return EndpointListData(
      endpoints: endpoints,
      system: SystemEndpointStatus.fromJson(
        json['system'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }

  final List<AiEndpoint> endpoints;
  final SystemEndpointStatus system;
}

/// 学习设置：新词目标和复习限制是两个独立设置，别混用。
class LearningSettings {
  const LearningSettings({
    required this.dailyNewWordTarget,
    required this.currentSystemBookId,
    required this.dailyReviewLimitEnabled,
    required this.dailyReviewLimit,
  });

  factory LearningSettings.fromJson(Map<String, dynamic> json) {
    return LearningSettings(
      dailyNewWordTarget: (json['dailyNewWordTarget'] as num? ?? 20).toInt(),
      currentSystemBookId: (json['currentSystemBookId'] as num?)?.toInt(),
      dailyReviewLimitEnabled: json['dailyReviewLimitEnabled'] == true,
      dailyReviewLimit: (json['dailyReviewLimit'] as num? ?? 20).toInt(),
    );
  }

  final int dailyNewWordTarget;
  final int? currentSystemBookId;
  final bool dailyReviewLimitEnabled;
  final int dailyReviewLimit;
}

/// 系统词书在设置页只需要 id 和名字。
class SystemWordBookSummary {
  const SystemWordBookSummary({required this.id, required this.name});

  factory SystemWordBookSummary.fromJson(Map<String, dynamic> json) {
    return SystemWordBookSummary(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
    );
  }

  final int id;
  final String name;
}
