import 'package:flutter/material.dart';

/// 会话校验期间的占位页：宁可停在“正在校验”，也不能先放进未登录的学习入口。
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('正在校验登录状态…'),
            ],
          ),
        ),
      ),
    );
  }
}
