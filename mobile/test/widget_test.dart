import 'package:app/main.dart';
import 'package:flutter_test/flutter_test.dart';

/// 脚手架不能误导用户认为尚未实现的学习功能已经可用。
void main() {
  testWidgets('显示开发状态而不是演示计数器', (tester) async {
    await tester.pumpWidget(const SceneLexApp());
    expect(find.text('SceneLex 移动客户端开发中'), findsOneWidget);
  });
}
