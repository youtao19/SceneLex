/// Android 的语音列表必须明确声明离线能力，未知能力不视为可用。
///
/// 2026-10-09 用户决定：主验收设备默认引擎只有不带地区的 `en` 离线语音，
/// 没有 `en-US`。为避免“有语音却不能用”，允许在**没有 en-US 时退回不带地区的 en**；
/// 显式别的地区（en-GB 等）仍然不选，因为那等于偷偷换口音。
class OfflineVoice {
  const OfflineVoice({required this.name, required this.locale});

  final String name;
  final String locale;

  /// 不回退到需要网络或尚未安装的语音；也不回退到别的口音。
  static OfflineVoice? selectAndroid(List<Map<String, String>> voices) {
    return _firstMatching(voices, (locale) => locale == 'en-us') ??
        _firstMatching(voices, (locale) => locale == 'en');
  }

  static OfflineVoice? _firstMatching(
    List<Map<String, String>> voices,
    bool Function(String locale) matches,
  ) {
    for (final voice in voices) {
      final locale = voice['locale']?.replaceAll('_', '-').toLowerCase();
      final features = voice['features']?.split('\t') ?? const <String>[];
      final name = voice['name'] ?? '';

      if (locale != null &&
          matches(locale) &&
          voice['network_required'] == '0' &&
          !features.contains('notInstalled') &&
          name.isNotEmpty) {
        return OfflineVoice(name: name, locale: voice['locale']!);
      }
    }

    return null;
  }
}
