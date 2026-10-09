import 'package:flutter/material.dart';

/// 正式功能尚在开发，不把脚手架误呈现为可用学习入口。
void main() => runApp(const SceneLexApp());

class SceneLexApp extends StatelessWidget {
  const SceneLexApp({super.key});

  /// 设备探针使用独立入口，避免发布入口自动发音或请求设备权限。
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SceneLex',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff4f46e5)),
        brightness: Brightness.light,
      ),
      home: const Scaffold(
        body: SafeArea(child: Center(child: Text('SceneLex 移动客户端开发中'))),
      ),
    );
  }
}
