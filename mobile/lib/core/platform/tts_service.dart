import 'dart:io';

import 'package:flutter_tts/flutter_tts.dart';

import 'offline_voice.dart';

/// 发音只用系统里“已安装的离线美式语音”。找不到就明确报缺失，
/// 不暗中换成联网语音或其他口音（SPEC 第 6 节）。
enum TtsStatus { ready, missingVoice }

/// 缺语音时给用户的可操作指引；不承诺一定能装上，也不替用户改系统设置。
const missingVoiceGuidance =
    '这台手机还没有可用的离线美式语音。请到系统「设置 → 语言与输入 → 文字转语音」安装英语（美国）语音包，装好后再点发音。';

class TtsService {
  TtsService({FlutterTts? tts}) : _tts = tts ?? FlutterTts();

  final FlutterTts _tts;
  TtsStatus _status = TtsStatus.missingVoice;
  String? _voiceName;

  TtsStatus get status => _status;

  /// 选中的语音名（iOS 交给系统管理时为 null），用于界面说明当前用的是哪个。
  String? get voiceName => _voiceName;

  /// 每次进入学习流程前准备一次：语音包可能被用户卸载或更换引擎。
  Future<TtsStatus> prepare() async {
    if (!Platform.isAndroid) {
      // iOS 的语音包由系统管理，首版不验收 iOS 真机，所以这里只设置语言。
      await _tts.setLanguage('en-US');
      _status = TtsStatus.ready;
      _voiceName = null;

      return _status;
    }

    final raw = await _tts.getVoices.timeout(const Duration(seconds: 10));
    final voices = (raw as List).map((item) {
      return (item as Map).map(
        (key, value) => MapEntry(key.toString(), value.toString()),
      );
    }).toList();
    final selected = OfflineVoice.selectAndroid(voices);

    if (selected == null) {
      _status = TtsStatus.missingVoice;
      _voiceName = null;

      return _status;
    }

    await _tts.setVoice({'name': selected.name, 'locale': selected.locale});
    _status = TtsStatus.ready;
    _voiceName = selected.name;

    return _status;
  }

  /// 语音缺失时直接不发音：宁可没声音，也不要静默走网络。
  Future<void> speak(String word) async {
    if (_status != TtsStatus.ready) {
      return;
    }

    await _tts.stop();
    await _tts.speak(word);
  }

  Future<void> stop() => _tts.stop();
}
