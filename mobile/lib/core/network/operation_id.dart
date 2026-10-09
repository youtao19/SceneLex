import 'dart:math';

/// 操作 ID 用于服务端重试去重：同一次点击必须复用同一个值，重试才不会重复写。
/// 只要求用户作用域内唯一，所以时间戳加随机后缀就够，不引第三方 uuid。
String createOperationId() {
  final random = Random.secure();
  final suffix = List.generate(
    8,
    (_) => random.nextInt(16).toRadixString(16),
  ).join();

  return 'op-${DateTime.now().microsecondsSinceEpoch}-$suffix';
}
