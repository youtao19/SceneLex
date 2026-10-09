/// 后端地址按构建配置区分：默认走线上，开发时用
/// `--dart-define=API_BASE_URL=http://<开发机>:3003/api` 覆盖。
/// 真机连本机后端还要 `adb reverse tcp:3003 tcp:3003`。
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://scenlex.cn/api',
  );

  /// 后端返回的头像地址是相对路径，拼上站点地址才能加载。
  static String absoluteUrl(String path) {
    if (path.startsWith('http')) {
      return path;
    }

    return '${apiBaseUrl.replaceFirst(RegExp(r'/api$'), '')}$path';
  }
}
