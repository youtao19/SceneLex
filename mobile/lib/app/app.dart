import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';

class SceneLexApp extends ConsumerWidget {
  const SceneLexApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'SceneLex',
      theme: buildAppTheme(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
