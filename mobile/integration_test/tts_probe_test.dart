import 'dart:convert';

import 'package:app/core/platform/offline_voice.dart';
import 'package:app/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:integration_test/integration_test.dart';

/// 只枚举设备能力，不自动朗读；离线听感需用户点击后另行验证。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('记录真实 Android 引擎和离线 en-US 语音能力', (tester) async {
    await tester.pumpWidget(const SceneLexApp());
    final tts = FlutterTts();
    final raw = await tts.getVoices.timeout(const Duration(seconds: 20));
    final voices = (raw as List).map((item) {
      return (item as Map).map(
        (key, value) => MapEntry(key.toString(), value.toString()),
      );
    }).toList();
    final selected = OfflineVoice.selectAndroid(voices);
    // 仅输出语音元数据，不包含设备标识、凭据或用户内容。
    final evidence = {
      'engine': await tts.getDefaultEngine,
      'voices': voices,
      'selectedOfflineUS': selected?.name,
      'audibleOfflineVerified': false,
    };
    // ignore: avoid_print
    print('TTS_PROBE: ${jsonEncode(evidence)}');
    await tts.stop();
    expect(raw, isA<List>());
  });
}
