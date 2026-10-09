import 'package:app/core/platform/offline_voice.dart';
import 'package:flutter_test/flutter_test.dart';

/// 语音筛选必须保守，不能把未知网络能力当作离线能力。
void main() {
  test('只选已安装的离线美式语音', () {
    final voice = OfflineVoice.selectAndroid([
      {'name': 'british', 'locale': 'en-GB', 'network_required': '0'},
      {'name': 'online', 'locale': 'en-US', 'network_required': '1'},
      {
        'name': 'missing',
        'locale': 'en-US',
        'network_required': '0',
        'features': 'notInstalled',
      },
      {'name': 'offline', 'locale': 'en_US', 'network_required': '0'},
    ]);
    expect(voice?.name, 'offline');
  });

  test('缺失能力标记或没有美式语音时不回退', () {
    expect(
      OfflineVoice.selectAndroid([
        {'name': 'unknown', 'locale': 'en-US'},
        {'name': 'british', 'locale': 'en-GB', 'network_required': '0'},
      ]),
      isNull,
    );
    expect(OfflineVoice.selectAndroid([]), isNull);
  });
}
