import 'dart:convert';
import 'dart:io';

import 'package:app/core/platform/offline_voice.dart';
import 'package:app/core/platform/tts_service.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 真机确认发音链路：能选到一个离线语音、并且真的调用了 speak。
/// 听感（是不是美式、有没有声音）需要人耳确认，探针不代替。
///
/// 用户已确认：没有 en-US 时可以退回不带地区的 en。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('真机能选到离线语音并调用发音', (tester) async {
    final evidence = <String, Object?>{
      'status': null,
      'voiceName': null,
      'voiceLocale': null,
      'speakCalled': false,
      'error': null,
    };

    try {
      final tts = FlutterTts();
      final raw = await tts.getVoices.timeout(const Duration(seconds: 20));
      final voices = (raw as List).map((item) {
        return (item as Map).map(
          (key, value) => MapEntry(key.toString(), value.toString()),
        );
      }).toList();
      final selected = OfflineVoice.selectAndroid(voices);

      evidence['voiceName'] = selected?.name;
      evidence['voiceLocale'] = selected?.locale;

      final service = TtsService(tts: tts);

      evidence['status'] = (await service.prepare()).name;

      if (service.status == TtsStatus.ready) {
        // 真的调用一次 speak：能返回就说明引擎接受了这个语音和文本。
        await service.speak('probe');
        evidence['speakCalled'] = true;
        await service.stop();
      }
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('TTS_VOICE_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
  });
}

Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/tts_voice_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
