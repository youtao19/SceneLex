import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/app/providers.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/ocr/application/ocr_controller.dart';
import 'package:app/features/ocr/data/ocr_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 真机跑真实后端 + 假多模态模型的 OCR 闭环：
/// 原图不改写、按页序上传、只重试失败页、跳过页不合并、保存后清理。
///
/// 隔离环境：
///   node backend/scripts/fake-model-server.cjs
///   adb reverse tcp:3003 tcp:3003
///   fvm flutter build apk --debug --target=integration_test/ocr_flow_test.dart \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3003/api
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb shell am start -n cn.scenlex.app/.MainActivity
///   adb shell run-as cn.scenlex.app cat app_flutter/ocr_flow_evidence.json
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('多页识别、原图字节一致、跳过与保存清理在真机上走通', (tester) async {
    final evidence = <String, Object?>{
      'registered': false,
      'draftsCopiedToPrivateDir': false,
      'pagesRecognized': false,
      'serverBytesMatchLocal': false,
      'successPageRetryRejected': false,
      'skippedPageExcludedFromArticle': false,
      'draftsCleanedAfterSave': false,
      'originalFilesUntouched': false,
      'capturePageRenders': false,
      'error': null,
    };
    final container = ProviderContainer();

    try {
      await SessionCookieStore().clear();
      await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));

      await tester.tap(find.text('有访问密钥？注册新账号'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, '邮箱'),
        'ocr-${DateTime.now().millisecondsSinceEpoch}@example.test',
      );
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-LEARN-TEST-0001',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registered'] = true;

      // 造两张带真实 PNG 文件头的“原图”，内容故意是可校验的确定字节。
      final base = await getTemporaryDirectory();
      final first = File('${base.path}/ocr-source-1.png');
      final second = File('${base.path}/ocr-source-2.png');
      final third = File('${base.path}/ocr-source-3.png');
      await first.writeAsBytes(_probePng(3000));
      await second.writeAsBytes(_probePng(3100));
      await third.writeAsBytes(_probePng(3200));
      final firstSize = await first.length();
      final secondSize = await second.length();

      final notifier = container.read(ocrFlowProvider.notifier);

      await notifier.addPages([
        OcrPickedImage(path: first.path, fileName: 'ocr-source-1.png'),
        OcrPickedImage(path: second.path, fileName: 'ocr-source-2.png'),
        OcrPickedImage(path: third.path, fileName: 'ocr-source-3.png'),
      ]);

      final drafts = container.read(ocrFlowProvider).pages;
      evidence['draftsCopiedToPrivateDir'] =
          drafts.length == 3 &&
          drafts.every(
            (page) => page.draft.path != first.path && File(page.draft.path).existsSync(),
          );

      await notifier.recognize();

      final recognized = container.read(ocrFlowProvider);
      evidence['pagesRecognized'] =
          recognized.pages.every((page) => page.status == OcrPageStatus.success) &&
          recognized.pages.first.text.contains('Fake OCR article');

      // 服务端记下的字节数必须和本地原图一致：说明上传没有压缩或改写。
      final batchId = recognized.batchId!;
      final snapshot = await container.read(ocrApiProvider).getBatch(batchId);
      evidence['serverBytesMatchLocal'] =
          snapshot.pages.length == 3 &&
          snapshot.pages[0].byteSize == firstSize &&
          snapshot.pages[1].byteSize == secondSize;

      // 已成功的页不允许重试，避免重复调用模型。
      await notifier.retryAt(0);
      evidence['successPageRetryRejected'] =
          (container.read(ocrFlowProvider).errorMessage ?? '').contains('已经识别成功');

      // 跳过第二页后保存：文章里只能有第一页的正文。
      await notifier.skipAt(1);
      final articleId = await notifier.saveArticle();

      final articles = await container.read(readingApiProvider).fetchArticles();
      final article = articles.firstWhere((item) => item.id == articleId);

      // 跳过中间那页：文章里应只有第 1、3 页，且按页序拼接。
      evidence['skippedPageExcludedFromArticle'] =
          article.content.contains('#1') &&
          article.content.contains('#3') &&
          !article.content.contains('#2') &&
          article.content.indexOf('#1') < article.content.indexOf('#3');

      evidence['draftsCleanedAfterSave'] =
          container.read(ocrFlowProvider).pages.isEmpty &&
          !File(drafts.first.draft.path).existsSync();

      // 相册/相机的原文件不该被 App 的临时清理删掉。
      evidence['originalFilesUntouched'] =
          await first.exists() && await second.exists() && await third.exists();

      // 界面冒烟：拍照识别页能正常渲染（选图本身要人手操作，不在自动用例里）。
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('阅读')).first,
      );
      await _pumpUntilFound(tester, find.byTooltip('拍照导入'));
      await tester.tap(find.byTooltip('拍照导入'));
      await _pumpUntilFound(tester, find.text('拍照识别'));
      evidence['capturePageRenders'] =
          find.textContaining('最多 10 张').evaluate().isNotEmpty;
    } catch (error) {
      evidence['error'] = error.toString();
    } finally {
      container.dispose();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('OCR_FLOW_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'registered',
      'draftsCopiedToPrivateDir',
      'pagesRecognized',
      'serverBytesMatchLocal',
      'successPageRetryRejected',
      'skippedPageExcludedFromArticle',
      'draftsCleanedAfterSave',
      'originalFilesUntouched',
      'capturePageRenders',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
  });
}

/// 真 PNG 文件头 + 确定内容的填充字节：服务端按文件头判类型，这里也方便比对字节数。
List<int> _probePng(int size) {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  final bytes = <int>[...header];

  while (bytes.length < size) {
    bytes.add((bytes.length * 7) % 256);
  }

  return bytes;
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
  final file = File('${dir.path}/ocr_flow_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
