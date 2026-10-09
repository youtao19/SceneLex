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
import '../features/shell/presentation/splash_page.dart';

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
      final location = state.matchedLocation;

      // 会话还没校验完就先去 splash：未登录绝不能先看到学习入口。
      if (auth.isLoading) {
        return location == '/splash' ? null : '/splash';
      }

      final isGuestRoute = location == '/login' || location == '/register';
      final signedIn = auth.value != null;

      if (!signedIn) {
        // 校验失败（例如冷启动断网）也回登录页，由页面把原因说清楚。
        return isGuestRoute ? null : '/login';
      }

      return isGuestRoute || location == '/splash' ? '/study' : null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterPage()),
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
          // 设置页留在四栏壳里：手机返回键先退子页，底部导航也一直在。
          GoRoute(path: '/settings', builder: (context, state) => const SettingsPage()),
        ],
      ),
    ],
  );
});
