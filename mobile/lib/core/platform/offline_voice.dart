/// Android 的语音列表必须明确声明离线能力，未知能力不视为可用。
class OfflineVoice {
  const OfflineVoice({required this.name, required this.locale});

  final String name;
  final String locale;

  /// 不回退到其他口音或需要网络/尚未安装的语音。
  static OfflineVoice? selectAndroid(List<Map<String, String>> voices) {
    for (final voice in voices) {
      final locale = voice['locale']?.replaceAll('_', '-');
      final features = voice['features']?.split('\t') ?? const <String>[];
      if (locale?.toLowerCase() == 'en-us' &&
          voice['network_required'] == '0' &&
          !features.contains('notInstalled') &&
          (voice['name']?.isNotEmpty ?? false)) {
        return OfflineVoice(name: voice['name']!, locale: voice['locale']!);
      }
    }
    return null;
  }
}
