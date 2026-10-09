import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/auth/presentation/profile_page.dart';
import '../features/auth/presentation/register_page.dart';
import '../features/settings/presentation/settings_page.dart';
import '../features/shell/presentation/home_shell.dart';
import '../features/shell/presentation/placeholder_tab.dart';

/// 路由守卫只做一件事：没登录去登录页，已登录别停在登录页。
/// 会话还在校验时不跳转，避免冷启动闪一下登录页。
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value += 1);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/study',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);

      if (auth.isLoading) {
        return null;
      }

      final isGuestRoute =
          state.matchedLocation == '/login' || state.matchedLocation == '/register';
      final signedIn = auth.value != null;

      if (!signedIn && !isGuestRoute) {
        return '/login';
      }

      if (signedIn && isGuestRoute) {
        return '/study';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterPage()),
      GoRoute(path: '/settings', builder: (context, state) => const SettingsPage()),
      ShellRoute(
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: '/study',
            builder: (context, state) => const PlaceholderTab(
              title: '学习',
              note: '今日计划、专注词卡和发音还在开发中，暂时没有可用的学习入口。',
            ),
          ),
          GoRoute(
            path: '/words',
            builder: (context, state) => const PlaceholderTab(
              title: '词库',
              note: '查词、系统词书和个人单词本还在开发中。',
            ),
          ),
          GoRoute(
            path: '/reading',
            builder: (context, state) => const PlaceholderTab(
              title: '阅读',
              note: '文章、拍照识别和阅读助手还在开发中。',
            ),
          ),
          GoRoute(path: '/me', builder: (context, state) => const ProfilePage()),
        ],
      ),
    ],
  );
});
