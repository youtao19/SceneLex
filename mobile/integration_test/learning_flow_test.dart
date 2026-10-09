import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/settings/data/settings_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 真机跑真实后端的专注学习闭环：新词→揭晓→评分→下一词→撤销→恢复位置→词库/历史。
///
/// 隔离后端（本地临时库 + adb reverse）：
///   adb reverse tcp:3003 tcp:3003
///   fvm flutter build apk --debug --target=integration_test/learning_flow_test.dart \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3003/api
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb shell am start -n cn.scenlex.app/.MainActivity
///   adb shell run-as cn.scenlex.app cat app_flutter/learning_flow_evidence.json
/// 测试库里的“真机测试词书”（alpha/beta/gamma/delta）是本用例的语料，不碰生产数据。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('新词学习、评分、撤销、恢复位置与词库历史在真机上走通', (tester) async {
    final evidence = <String, Object?>{
      'registered': false,
      'overviewShowsPlan': false,
      'firstCardFrontHidesMeaning': false,
      'revealedFullCard': false,
      'advancedToNextWord': false,
      'voiceGuidanceOrVoice': null,
      'undoReturnedToPreviousWord': false,
      'resumedFromSavedPosition': false,
      'reviewEmptyStateCorrect': false,
      'lookupGenerateSave': false,
      'wordBookCreatedAndRenamed': false,
      'wordBookDeleted': false,
      'systemBookVisible': false,
      'historyShowsSavedWord': false,
      'error': null,
    };

    try {
      await SessionCookieStore().clear();
      await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));

      await tester.tap(find.text('有访问密钥？注册新账号'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, '邮箱'),
        'learn-${DateTime.now().millisecondsSinceEpoch}@example.test',
      );
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-LEARN-TEST-0001',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registered'] = true;

      // 用真实接口把当前词书指向测试词书，等价于用户在设置里选书。
      final settingsApi = SettingsApi(ApiClient(session: SessionCookieStore()));
      await settingsApi.updateLearningSettings(currentSystemBookId: 1);

      // 学习页显示共享计划。设好词书后要刷新，否则按钮还是禁用状态。
      await _pumpUntilFound(tester, find.text('今日新词'));
      await tester.tap(find.byTooltip('刷新'));
      await _pumpUntilFound(tester, find.text('真机测试词书'));
      evidence['overviewShowsPlan'] =
          find.textContaining('已完成 0 /').evaluate().isNotEmpty;

      await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
      await _pumpUntilFound(tester, find.text('alpha'));

      // 正面不能出现中文释义，必须先揭晓。
      evidence['firstCardFrontHidesMeaning'] =
          find.text('揭晓释义').evaluate().isNotEmpty &&
          find.textContaining('第一个').evaluate().isEmpty;

      // 发音：有离线美式语音就出声，没有就明确引导。
      await tester.tap(find.byIcon(Icons.volume_up));
      await tester.pump(const Duration(seconds: 2));
      evidence['voiceGuidanceOrVoice'] =
          find.textContaining('文字转语音').evaluate().isNotEmpty
          ? 'guidance-shown'
          : 'voice-available';

      await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
      await tester.pumpAndSettle();
      evidence['revealedFullCard'] =
          find.widgetWithText(OutlinedButton, '记得').evaluate().isNotEmpty;

      await tester.tap(find.widgetWithText(OutlinedButton, '记得'));
      await _pumpUntilFound(tester, find.text('beta'));
      evidence['advancedToNextWord'] = true;

      // 撤销上一词：回到 alpha，并且答案保持显示。
      await tester.tap(find.widgetWithText(TextButton, '撤销上一词'));
      await _pumpUntilFound(tester, find.text('alpha'));
      evidence['undoReturnedToPreviousWord'] =
          find.widgetWithText(OutlinedButton, '记得').evaluate().isNotEmpty;

      // 再评一次走到 beta，然后重启应用看能否从上次位置继续。
      await tester.tap(find.widgetWithText(OutlinedButton, '记得'));
      await _pumpUntilFound(tester, find.text('beta'));

      await tester.pumpWidget(
        ProviderScope(key: UniqueKey(), child: const SceneLexApp()),
      );
      await _pumpUntilFound(tester, find.text('今日新词'));
      await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
      await _pumpUntilFound(tester, find.textContaining('已从上次没学完的位置继续'));
      evidence['resumedFromSavedPosition'] =
          find.text('beta').evaluate().isNotEmpty;

      // 新词排期在未来，所以复习应当给出“今天没有到期词”的准确空状态。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('学习')).first,
      );
      await tester.pumpAndSettle();
      evidence['reviewEmptyStateCorrect'] =
          find.text('今天没有到期词').evaluate().isNotEmpty;

      // 查词：词典事实 → 生成完整词卡 → 保存到单词本。
      await tester.tap(find.byTooltip('查词'));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '查词'));
      await tester.enterText(find.widgetWithText(TextField, '单词'), 'gamma');
      await tester.tap(find.widgetWithText(FilledButton, '查词'));
      await _pumpUntilFound(tester, find.textContaining('伽马'));
      await tester.tap(find.widgetWithText(OutlinedButton, '生成完整词卡'));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '保存到单词本'));
      await tester.tap(find.widgetWithText(FilledButton, '保存到单词本'));
      await _pumpUntilFound(tester, find.textContaining('已保存到单词本'));
      evidence['lookupGenerateSave'] = true;

      // 词库：系统词书里能看到测试词书与已学标记。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('词库')).first,
      );
      await _pumpUntilFound(tester, find.text('真机测试词书'));
      evidence['systemBookVisible'] = true;

      // 单词本：新建 → 改名 → 删除。
      await tester.tap(find.widgetWithText(Tab, '我的单词本'));
      await _pumpUntilFound(tester, find.byTooltip('新建单词本'));
      // 用 AppBar 的新建入口：列表底部那行在真机上点击不稳定。
      await tester.tap(find.byTooltip('新建单词本'));
      await tester.pumpAndSettle();
      evidence['createDialogOpened'] =
          find.byType(AlertDialog).evaluate().isNotEmpty;

      if (find.byType(AlertDialog).evaluate().isEmpty) {
        throw StateError('新建单词本弹窗没有出现');
      }

      await tester.enterText(find.byType(TextField).last, '真机单词本');
      await tester.tap(find.widgetWithText(FilledButton, '创建'));
      await _pumpUntilFound(tester, find.text('真机单词本'));

      await tester.tap(find.text('真机单词本'));
      await _pumpUntilFound(tester, find.byTooltip('改名'));
      await tester.tap(find.byTooltip('改名'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, '真机单词本改');
      await tester.tap(find.widgetWithText(FilledButton, '保存'));
      await _pumpUntilFound(tester, find.text('真机单词本改'));
      evidence['wordBookCreatedAndRenamed'] = true;

      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('词库')).first,
      );
      // 回到词库默认落在“系统词书”，要再切回“我的单词本”才看得到刚才那本。
      await _pumpUntilFound(tester, find.widgetWithText(Tab, '我的单词本'));
      await tester.tap(find.widgetWithText(Tab, '我的单词本'));
      await _pumpUntilFound(tester, find.text('真机单词本改'));
      await tester.tap(
        find.descendant(
          of: find.ancestor(
            of: find.text('真机单词本改'),
            matching: find.byType(ListTile),
          ),
          matching: find.byType(PopupMenuButton<String>),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('删除').last);
      await _pumpUntilGone(tester, find.text('真机单词本改'));
      evidence['wordBookDeleted'] = true;

      // 历史：alpha 已经完成过，应该出现在历史里。
      await tester.tap(find.widgetWithText(Tab, '历史'));
      await _pumpUntilFound(tester, find.textContaining('共 '));
      evidence['historyShowsSavedWord'] =
          find.text('alpha').evaluate().isNotEmpty;
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('LEARNING_FLOW_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'registered',
      'overviewShowsPlan',
      'firstCardFrontHidesMeaning',
      'revealedFullCard',
      'advancedToNextWord',
      'undoReturnedToPreviousWord',
      'resumedFromSavedPosition',
      'reviewEmptyStateCorrect',
      'lookupGenerateSave',
      'wordBookCreatedAndRenamed',
      'wordBookDeleted',
      'systemBookVisible',
      'historyShowsSavedWord',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
    expect(evidence['voiceGuidanceOrVoice'], isNotNull);
  });
}

Future<void> _pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final deadline = DateTime.now().add(timeout);

  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));

    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }

  throw StateError('等待超时，没有出现：$finder');
}

Future<void> _pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final deadline = DateTime.now().add(timeout);

  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));

    if (finder.evaluate().isEmpty) {
      return;
    }
  }

  throw StateError('等待超时，仍然存在：$finder');
}

Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/learning_flow_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
