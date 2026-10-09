import 'package:flutter/material.dart';

/// 浅色主题，沿用网页的靛蓝主色；手机布局单独设计，不照搬 PC 表格。
ThemeData buildAppTheme() {
  final colorScheme = ColorScheme.fromSeed(seedColor: const Color(0xff4f46e5));

  return ThemeData(
    colorScheme: colorScheme,
    brightness: Brightness.light,
    // 系统字体放大时布局要还能点得到按钮，所以不用固定行高。
    visualDensity: VisualDensity.standard,
  );
}
