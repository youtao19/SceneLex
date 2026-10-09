import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';

/// 正式功能仍在开发中：这里只组装真实入口，不把未实现的功能装成可用。
/// 设备探针用独立入口（integration_test/），避免发布入口自动发音或申请权限。
void main() => runApp(const ProviderScope(child: SceneLexApp()));
