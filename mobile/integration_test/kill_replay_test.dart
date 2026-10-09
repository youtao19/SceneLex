import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/learning/data/learning_api.dart';
import 'package:app/features/settings/data/settings_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 两轮验证“强杀不承诺继续、回来不自动重放”：
///   第一轮：注册 + 学一个词并评分，把评分前后的状态写进文件。
///   宿主机 force-stop 应用。
///   第二轮：重新启动，用同一个会话查服务端：复习次数不能被自动重放加一次，
///           并且学习位置指向下一个词（不是重放刚才那个）。
///
/// 运行：
///   adb shell am start -n cn.scenlex.app/.MainActivity      # 第一轮
///   adb shell am force-stop cn.scenlex.app
///   adb shell am start -n cn.scenlex.app/.MainActivity      # 第二轮
///   adb shell run-as cn.scenlex.app cat app_flutter/kill_replay_evidence.json
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('强杀后不自动重放评分，位置指向下一词', (tester) async {
    final evidence = <String, Object?>{
      'phase': 'unknown',
      'ratedReviewCount': null,
      'reviewCountAfterRestart': null,
      'noAutoReplay': false,
      'positionPointsToNextWord': false,
      'error': null,
    };

    final learningApi = HttpLearningApi(ApiClient(session: SessionCookieStore()));
    final marker = await _markerFile();

    try {
      if (!marker.existsSync()) {
        // 第一轮：注册并评分一个词。
        await SessionCookieStore().clear();
        await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
        await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));
        await tester.tap(find.text('有访问密钥？注册新账号'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextField, '邮箱'),
          'kill-${DateTime.now().millisecondsSinceEpoch}@example.test',
        );
        await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
        await tester.enterText(
          find.widgetWithText(TextField, '访问密钥'),
          'SLX-LEARN-TEST-0001',
        );
        await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
        await _pumpUntilFound(tester, find.byType(NavigationBar));

        await SettingsApi(
          ApiClient(session: SessionCookieStore()),
        ).updateLearningSettings(currentSystemBookId: 1);

        await tester.tap(
          find.descendant(of: find.byType(NavigationBar), matching: find.text('学习')).first,
        );
        await tester.pump(const Duration(seconds: 1));
        await tester.tap(find.byTooltip('刷新'));
        await tester.pump(const Duration(seconds: 2));
        await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
        await _pumpUntilFound(tester, find.text('alpha'));
        await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(OutlinedButton, '记得'));
        await _pumpUntilFound(tester, find.text('beta'));

        final history = await learningApi.fetchHistory();
        final alpha = history.words.firstWhere((word) => word.word == 'alpha');

        await marker.writeAsString(
          jsonEncode({'wordId': alpha.id, 'reviewCount': alpha.reviewCount}),
        );

        evidence['phase'] = 'rated';
        evidence['ratedReviewCount'] = alpha.reviewCount;
      } else {
        // 第二轮：强杀后重启，检查服务端没有被自动重放。
        final saved = jsonDecode(await marker.readAsString()) as Map<String, dynamic>;
        final wordId = (saved['wordId'] as num).toInt();
        final ratedReviewCount = (saved['reviewCount'] as num).toInt();

        final history = await learningApi.fetchHistory();
        final alpha = history.words.firstWhere((word) => word.id == wordId);

        evidence['phase'] = 'restarted';
        evidence['ratedReviewCount'] = ratedReviewCount;
        evidence['reviewCountAfterRestart'] = alpha.reviewCount;
        evidence['noAutoReplay'] = alpha.reviewCount == ratedReviewCount;

        // 重启后应回到“下一个词”（beta），而不是重放 alpha。
        await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
        await _pumpUntilFound(tester, find.text('今日新词'));
        await tester.tap(find.byTooltip('刷新'));
        await tester.pump(const Duration(seconds: 2));
        await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
        await _pumpUntilFound(tester, find.text('beta'));
        evidence['positionPointsToNextWord'] = find.text('alpha').evaluate().isEmpty;
      }
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('KILL_REPLAY_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    if (evidence['phase'] == 'restarted') {
      expect(evidence['noAutoReplay'], isTrue);
      expect(evidence['positionPointsToNextWord'], isTrue);
    }
  });
}

Future<File> _markerFile() async {
  final dir = await getApplicationDocumentsDirectory();

  return File('${dir.path}/kill_replay_marker.json');
}

Future<void> _pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 40),
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

Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/kill_replay_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
