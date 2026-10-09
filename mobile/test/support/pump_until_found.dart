import 'package:flutter_test/flutter_test.dart';

/// splash 上有个一直转的进度圈，pumpAndSettle 永远等不到静止；
/// 网络和平台通道的完成时间也不确定，所以统一按条件轮询。
Future<void> pumpUntilFound(
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
