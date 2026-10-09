import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/operation_id.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/learning/data/learning_api.dart';
import 'package:app/features/settings/data/settings_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 补齐验收清单里不需要人工配合的缺口：查无单词空状态、切换词书保留进度、
/// 四档评分、网页已完成时不恢复过期位置、网页改词书后刷新一致、同操作 ID 重试不重复计数。
///
/// 隔离环境与其它探针相同；测试库里有“真机测试词书”（alpha/beta/gamma/delta）
/// 与“真机测试词书二”（epsilon/zeta）。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('验收缺口：空状态、切书进度、四档评分、网页已完成与幂等重试', (tester) async {
    final evidence = <String, Object?>{
      'registered': false,
      'missingWordMessage': false,
      'newBookStartsFresh': false,
      'progressKeptAfterSwitchingBack': false,
      'allFourRatingsAccepted': false,
      'webCompletedWordNotResumed': false,
      'overviewFollowsServerBook': false,
      'idempotentRetryNoDoubleCount': false,
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
        'gaps-${DateTime.now().millisecondsSinceEpoch}@example.test',
      );
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-LEARN-TEST-0001',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registered'] = true;

      final session = SessionCookieStore();
      final settingsApi = SettingsApi(ApiClient(session: session));
      final learningApi = HttpLearningApi(ApiClient(session: session));
      await settingsApi.updateLearningSettings(
        currentSystemBookId: 1,
        dailyNewWordTarget: 20,
      );
      await _refreshOverview(tester);

      // 1) 查无单词：要给准确的“查不到”，不能显示成空数据。
      await tester.tap(find.byTooltip('查词'));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '查词'));
      await tester.enterText(find.widgetWithText(TextField, '单词'), 'zzzznotaword');
      await tester.tap(find.widgetWithText(FilledButton, '查词'));
      await _pumpUntilFound(tester, find.textContaining('暂未找到'));
      evidence['missingWordMessage'] = true;
      await _backToStudy(tester);

      // 2) 书一学 alpha（good），再切到书二：新词应从书二从头开始。
      await _learnWord(tester, 'alpha', '记得', expectNext: 'beta');
      await _backToStudy(tester);

      await settingsApi.updateLearningSettings(currentSystemBookId: 2);
      await _refreshOverview(tester);
      await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
      await _pumpUntilFound(tester, find.text('epsilon'));
      evidence['newBookStartsFresh'] = true;

      // 四档评分：again(epsilon) → hard(zeta)。
      await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, '不记得'));
      await _pumpUntilFound(tester, find.text('zeta'));
      await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, '模糊'));
      await _pumpUntilFound(tester, find.textContaining('这一轮学完了'));
      await _backToStudy(tester);

      // 切回书一：已学的 alpha 不能再次出现（进度保留）。
      await settingsApi.updateLearningSettings(currentSystemBookId: 1);
      await _refreshOverview(tester);
      await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
      await _pumpUntilFound(tester, find.text('beta'));
      evidence['progressKeptAfterSwitchingBack'] =
          find.text('alpha').evaluate().isEmpty;

      // 第四档：easy(beta) → 下一个是 gamma。
      await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, '很轻松'));
      await _pumpUntilFound(tester, find.text('gamma'));
      evidence['allFourRatingsAccepted'] = true;
      await _backToStudy(tester);

      // 3) 网页侧把 gamma 学掉（保存即已学），冷启动后不能恢复到这个过期位置。
      await learningApi.saveCard(
        word: 'gamma',
        phonetic: '/ˈɡæmə/',
        meanings: const [
          WordMeaning(
            partOfSpeech: 'n.',
            meaning: '伽马',
            sceneTitle: '测试',
            examples: ['gamma probe'],
            explanation: '探针用义项',
            tip: '探针',
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(key: UniqueKey(), child: const SceneLexApp()),
      );
      await _pumpUntilFound(tester, find.text('今日新词'));
      await _refreshOverview(tester);
      await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
      await _pumpUntilFound(tester, find.text('delta'));
      evidence['webCompletedWordNotResumed'] = find.text('gamma').evaluate().isEmpty;
      await _backToStudy(tester);

      // 4) 网页改当前词书后，App 刷新要跟着变。
      await settingsApi.updateLearningSettings(currentSystemBookId: 2);
      await _refreshOverview(tester);
      evidence['overviewFollowsServerBook'] =
          find.text('真机测试词书二').evaluate().isNotEmpty;

      // 5) 响应丢失后复用同一个操作 ID 重试，不能重复推进排期。
      final history = await learningApi.fetchHistory();
      final alpha = history.words.firstWhere((word) => word.word == 'alpha');
      final operationId = createOperationId();
      final first = await learningApi.reviewWord(
        wordId: alpha.id,
        rating: ReviewRating.good,
        operationId: operationId,
        expectedVersion: alpha.studyVersion,
      );
      final retry = await learningApi.reviewWord(
        wordId: alpha.id,
        rating: ReviewRating.good,
        operationId: operationId,
        expectedVersion: alpha.studyVersion,
      );

      evidence['idempotentRetryNoDoubleCount'] =
          retry.reviewCount == first.reviewCount;
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('ACCEPTANCE_GAPS_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'registered',
      'missingWordMessage',
      'newBookStartsFresh',
      'progressKeptAfterSwitchingBack',
      'allFourRatingsAccepted',
      'webCompletedWordNotResumed',
      'overviewFollowsServerBook',
      'idempotentRetryNoDoubleCount',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
  });
}

/// 学习页刷新概览：词书/目标是在外部改的，必须重新拉一次。
Future<void> _refreshOverview(WidgetTester tester) async {
  await _pumpUntilFound(tester, find.byTooltip('刷新'));
  await tester.tap(find.byTooltip('刷新'));
  await tester.pump(const Duration(seconds: 2));
}

Future<void> _backToStudy(WidgetTester tester) async {
  await tester.tap(
    find.descendant(of: find.byType(NavigationBar), matching: find.text('学习')).first,
  );
  await _pumpUntilFound(tester, find.text('今日新词'));
}

/// 从学习页开始学一个词并评分，等到下一个词出现。
Future<void> _learnWord(
  WidgetTester tester,
  String word,
  String rating, {
  required String expectNext,
}) async {
  await tester.tap(find.widgetWithText(FilledButton, '开始新词'));
  await _pumpUntilFound(tester, find.text(word));
  await tester.tap(find.widgetWithText(FilledButton, '揭晓释义'));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(OutlinedButton, rating));
  await _pumpUntilFound(tester, find.text(expectNext));
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
  final file = File('${dir.path}/acceptance_gaps_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
