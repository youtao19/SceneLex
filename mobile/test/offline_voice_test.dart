import 'package:app/core/platform/offline_voice.dart';
import 'package:flutter_test/flutter_test.dart';

/// 语音筛选必须保守：不能把未知网络能力当离线能力，也不能偷偷换口音。
/// 用户已确认：没有 en-US 时可以退回**不带地区**的 en。
void main() {
  test('优先选已安装的离线美式语音', () {
    final voice = OfflineVoice.selectAndroid([
      {'name': 'plain-en', 'locale': 'en', 'network_required': '0'},
      {'name': 'british', 'locale': 'en-GB', 'network_required': '0'},
      {'name': 'offline', 'locale': 'en_US', 'network_required': '0'},
    ]);

    expect(voice?.name, 'offline');
  });

  test('没有 en-US 时退回不带地区的 en', () {
    final voice = OfflineVoice.selectAndroid([
      {'name': 'british', 'locale': 'en-GB', 'network_required': '0'},
      {'name': 'plain-en', 'locale': 'en', 'network_required': '0'},
    ]);

    expect(voice?.name, 'plain-en');
  });

  test('显式别的地区不算美式，不会拿来顶替', () {
    expect(
      OfflineVoice.selectAndroid([
        {'name': 'british', 'locale': 'en-GB', 'network_required': '0'},
        {'name': 'aussie', 'locale': 'en-AU', 'network_required': '0'},
      ]),
      isNull,
    );
  });

  test('需要网络或没安装的语音一律不选', () {
    expect(
      OfflineVoice.selectAndroid([
        {'name': 'online', 'locale': 'en-US', 'network_required': '1'},
        {
          'name': 'missing',
          'locale': 'en-US',
          'network_required': '0',
          'features': 'notInstalled',
        },
        {'name': 'unknown', 'locale': 'en'},
      ]),
      isNull,
    );
    expect(OfflineVoice.selectAndroid([]), isNull);
  });
}
