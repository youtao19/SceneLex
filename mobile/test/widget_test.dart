import 'package:app/app/app.dart';
import 'package:app/app/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/in_memory_secret_storage.dart';

/// 没有会话时要停在登录页：脚手架不能把未实现的功能装成可用入口。
/// 空的内存存储让启动校验不需要任何网络请求。
void main() {
  testWidgets('没有会话时显示登录页而不是学习入口', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secretStorageProvider.overrideWithValue(InMemorySecretStorage()),
        ],
        child: const SceneLexApp(),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('SceneLex'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, '登录'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });
}
