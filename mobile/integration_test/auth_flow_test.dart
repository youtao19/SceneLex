import 'dart:convert';
import 'dart:io';

import 'package:app/app/app.dart';
import 'package:app/core/network/api_client.dart';
import 'package:app/core/network/session_cookie.dart';
import 'package:app/features/auth/data/auth_api.dart';
import 'package:app/features/settings/data/settings_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 真机跑真实后端：注册 → 四栏 → 资料（昵称/头像）→ 学习设置与端点管理 → 登出。
///
/// 这台 vivo 上 `flutter test -d` 的宿主连接会挂住，所以按探针方式跑：测试自己把结论写文件。
///   adb reverse tcp:3003 tcp:3003
///   fvm flutter build apk --debug --target=integration_test/auth_flow_test.dart \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3003/api
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb shell am start -n cn.scenlex.app/.MainActivity
///   adb shell run-as cn.scenlex.app cat app_flutter/auth_flow_evidence.json
/// 访问密钥来自隔离测试库的 SLX-TEST-TEST-TEST-TEST，绝不指向生产库。
/// 账号到期用单独一轮验证：把测试库里某个账号改成过期，再用它登录。
/// 需要 --dart-define=EXPIRED_EMAIL=... --dart-define=EXPIRED_PASSWORD=...
const _expiredEmail = String.fromEnvironment('EXPIRED_EMAIL');
const _expiredPassword = String.fromEnvironment('EXPIRED_PASSWORD');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  if (_expiredEmail.isNotEmpty) {
    testWidgets('账号到期时给可操作提示且不进学习入口', (tester) async {
      final evidence = <String, Object?>{
        'showedExpiryMessage': false,
        'stayedOnLoginPage': false,
        'noSessionSaved': false,
        'error': null,
      };

      try {
        await SessionCookieStore().clear();
        await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
        await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));

        await tester.enterText(
          find.widgetWithText(TextField, '邮箱'),
          _expiredEmail,
        );
        await tester.enterText(
          find.widgetWithText(TextField, '密码'),
          _expiredPassword,
        );
        await tester.tap(find.widgetWithText(FilledButton, '登录'));

        // 后端对到期账号返回 403，页面要把这句话原样显示出来。
        await _pumpUntilFound(tester, find.textContaining('过期'));
        evidence['showedExpiryMessage'] = true;
        evidence['stayedOnLoginPage'] =
            find.byType(NavigationBar).evaluate().isEmpty;
        evidence['noSessionSaved'] = await SessionCookieStore().readCookie() == null;
      } catch (error) {
        evidence['error'] = error.toString();
      }

      await _writeEvidence(evidence, 'expired_account_evidence.json');
      // ignore: avoid_print
      print('EXPIRED_ACCOUNT_PROBE: ${jsonEncode(evidence)}');

      expect(evidence['error'], isNull);
      expect(evidence['showedExpiryMessage'], isTrue);
      expect(evidence['stayedOnLoginPage'], isTrue);
      expect(evidence['noSessionSaved'], isTrue);
    });

    return;
  }

  testWidgets('注册、资料、设置、端点管理与登出在真机上走通', (tester) async {
    final evidence = <String, Object?>{
      'secureStorageProbe': null,
      'startedAtLoginPage': false,
      'registeredAndSawShell': false,
      'cookieSavedAfterRegister': false,
      'profileShowsEmail': false,
      'nicknameUpdated': false,
      'coldStartStayedSignedIn': false,
      'avatarUploaded': false,
      'learningTargetUpdated': false,
      'endpointCreated': false,
      'endpointDeleted': false,
      'backToLoginAfterLogout': false,
      'cookieClearedAfterLogout': false,
      'error': null,
    };

    try {
      // 先单独探一次安全存储：如果是它卡住，后面的失败原因就不一样了。
      final stopwatch = Stopwatch()..start();
      final cookie = await SessionCookieStore()
          .readCookie()
          .timeout(const Duration(seconds: 5));
      evidence['secureStorageProbe'] =
          'ok(${cookie == null ? 'empty' : 'present'}) in ${stopwatch.elapsedMilliseconds}ms';

      // 上一次跑失败可能把会话留在设备上，先清干净，保证每次从“未登录”开始。
      await SessionCookieStore().clear();

      await tester.pumpWidget(const ProviderScope(child: SceneLexApp()));
      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));
      evidence['startedAtLoginPage'] = true;

      await tester.tap(find.text('有访问密钥？注册新账号'));
      await tester.pumpAndSettle();

      final email = 'mobile-${DateTime.now().millisecondsSinceEpoch}@example.test';
      await tester.enterText(find.widgetWithText(TextField, '邮箱'), email);
      await tester.enterText(find.widgetWithText(TextField, '密码'), 'Passw0rd!23');
      await tester.enterText(
        find.widgetWithText(TextField, '访问密钥'),
        'SLX-TEST-TEST-TEST-TEST',
      );
      await tester.tap(find.widgetWithText(FilledButton, '注册并登录'));

      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['registeredAndSawShell'] = true;
      evidence['cookieSavedAfterRegister'] =
          await SessionCookieStore().readCookie() != null;

      await tester.tap(find.text('我的'));
      await _pumpUntilFound(tester, find.text(email));
      evidence['profileShowsEmail'] = true;

      // 改昵称：点资料行 → 弹窗里改名 → 保存。
      final nickname = '真机测试${DateTime.now().millisecondsSinceEpoch % 100000}';
      await tester.tap(find.text(email));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, nickname);
      await tester.tap(find.widgetWithText(FilledButton, '保存'));
      // 先确认弹窗真的关了，否则输入框里的文字会让断言假通过。
      await _pumpUntilGone(tester, find.widgetWithText(FilledButton, '保存'));
      await _pumpUntilFound(tester, find.text(nickname));
      evidence['nicknameUpdated'] = true;

      // 头像：直接走真实 multipart 上传（相册选择器要人点，这里只验证上传链路）。
      final avatarFile = File(
        '${(await getApplicationDocumentsDirectory()).path}/avatar-probe.png',
      );
      await avatarFile.writeAsBytes(_onePixelPng);
      final uploadedUser = await AuthApi(
        ApiClient(session: SessionCookieStore()),
      ).uploadAvatar(filePath: avatarFile.path, fileName: 'avatar-probe.png');
      evidence['avatarUploaded'] = (uploadedUser.avatarUrl ?? '').isNotEmpty;

      // 学习设置：新词目标写进去再读回来，验证两端共用的是同一份服务端设置。
      final settingsApi = SettingsApi(ApiClient(session: SessionCookieStore()));
      await settingsApi.updateLearningSettings(dailyNewWordTarget: 33);
      final reloaded = await settingsApi.fetchLearningSettings();
      evidence['learningTargetUpdated'] = reloaded.dailyNewWordTarget == 33;

      // 端点管理：添加 → 出现在列表 → 删除 → 消失。
      await tester.tap(find.text('学习设置与模型端点'));
      await _pumpUntilFound(tester, find.text('模型端点'));

      await tester.tap(find.text('添加'));
      await tester.pumpAndSettle();
      final label = '真机端点${DateTime.now().millisecondsSinceEpoch % 100000}';
      await tester.enterText(find.widgetWithText(TextField, '名称'), label);
      await tester.enterText(
        find.widgetWithText(TextField, '接口地址'),
        'https://api.openai.com/v1',
      );
      await tester.enterText(find.widgetWithText(TextField, '文本模型'), 'probe-model');
      await tester.enterText(find.widgetWithText(TextField, 'API Key'), 'sk-probe-key');
      await tester.tap(find.widgetWithText(FilledButton, '保存'));
      await _pumpUntilFound(tester, find.text(label));
      evidence['endpointCreated'] = true;

      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('删除').last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, '删除'));
      await _pumpUntilGone(tester, find.text(label));
      evidence['endpointDeleted'] = true;

      // 冷启动校验：换一个全新的 Provider 容器再启动一次，
      // 用安全存储里的 Cookie 向后端校验会话（这一段专门验证 /auth/me 的响应形状）。
      await tester.pumpWidget(
        ProviderScope(key: UniqueKey(), child: const SceneLexApp()),
      );
      await _pumpUntilFound(tester, find.byType(NavigationBar));
      evidence['coldStartStayedSignedIn'] = true;
      await tester.tap(find.text('我的'));
      await _pumpUntilFound(tester, find.text(nickname));

      // 设置页在四栏壳里，直接点“我的”回资料页退出登录。
      // 底部导航里“我的”有两个 Text（选中/未选中各一份），所以限定在 NavigationBar 里取第一个。
      await tester.tap(
        find
            .descendant(of: find.byType(NavigationBar), matching: find.text('我的'))
            .first,
      );
      await tester.pumpAndSettle();
      await _pumpUntilFound(tester, find.text(nickname));
      await tester.tap(find.widgetWithText(OutlinedButton, '退出登录'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, '退出'));

      await _pumpUntilFound(tester, find.widgetWithText(FilledButton, '登录'));
      evidence['backToLoginAfterLogout'] = true;
      evidence['cookieClearedAfterLogout'] =
          await SessionCookieStore().readCookie() == null;
    } catch (error) {
      evidence['error'] = error.toString();
    }

    await _writeEvidence(evidence);
    // ignore: avoid_print
    print('AUTH_FLOW_PROBE: ${jsonEncode(evidence)}');

    expect(evidence['error'], isNull);
    for (final key in [
      'startedAtLoginPage',
      'registeredAndSawShell',
      'cookieSavedAfterRegister',
      'profileShowsEmail',
      'nicknameUpdated',
      'coldStartStayedSignedIn',
      'avatarUploaded',
      'learningTargetUpdated',
      'endpointCreated',
      'endpointDeleted',
      'backToLoginAfterLogout',
      'cookieClearedAfterLogout',
    ]) {
      expect(evidence[key], isTrue, reason: '$key 没有通过');
    }
  });
}

/// 1×1 透明 PNG：类型判断只看文件头，够验证上传链路。
final _onePixelPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
);

/// 网络请求完成时间不确定，所以按条件轮询而不是死等固定时长。
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

/// standalone 启动时 print 不会进 logcat，只能把证据写进应用私有目录用 adb 读。
Future<void> _writeEvidence(
  Map<String, Object?> evidence, [
  String fileName = 'auth_flow_evidence.json',
]) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/$fileName');
  await file.writeAsString(jsonEncode(evidence));
}
