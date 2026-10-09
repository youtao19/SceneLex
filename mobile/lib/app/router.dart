import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/auth/presentation/profile_page.dart';
import '../features/auth/presentation/register_page.dart';
import '../features/learning/application/study_controller.dart';
import '../features/learning/presentation/focus_card_page.dart';
import '../features/learning/presentation/lookup_page.dart';
import '../features/learning/presentation/study_page.dart';
import '../features/settings/presentation/settings_page.dart';
import '../features/shell/presentation/home_shell.dart';
import '../features/reading/presentation/articles_page.dart';
import '../features/reading/presentation/assistant_pages.dart';
import '../features/reading/presentation/reader_page.dart';
import '../features/shell/presentation/splash_page.dart';
import '../features/words/presentation/system_book_detail_page.dart';
import '../features/words/presentation/word_book_detail_page.dart';
import '../features/words/presentation/words_page.dart';

/// 路由守卫只做一件事：没登录去登录页，已登录别停在登录页。
/// 会话还在校验时先去 splash，避免未登录先看到学习入口。
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
          GoRoute(path: '/study', builder: (context, state) => const StudyPage()),
          GoRoute(
            path: '/study/new',
            builder: (context, state) =>
                const FocusCardPage(mode: StudyMode.newWords),
          ),
          GoRoute(
            path: '/study/review',
            builder: (context, state) =>
                const FocusCardPage(mode: StudyMode.review),
          ),
          GoRoute(
            path: '/lookup',
            builder: (context, state) => LookupPage(
              initialWord: state.uri.queryParameters['word'],
              systemBookItemId: int.tryParse(
                state.uri.queryParameters['itemId'] ?? '',
              ),
            ),
          ),
          GoRoute(path: '/words', builder: (context, state) => const WordsPage()),
          GoRoute(
            path: '/words/system/:bookId',
            builder: (context, state) => SystemBookDetailPage(
              bookId: int.parse(state.pathParameters['bookId']!),
            ),
          ),
          GoRoute(
            path: '/words/book/:bookId',
            builder: (context, state) => WordBookDetailPage(
              bookId: int.parse(state.pathParameters['bookId']!),
            ),
          ),
          GoRoute(
            path: '/reading',
            builder: (context, state) => const ArticlesPage(),
          ),
          GoRoute(
            path: '/reading/assistant',
            builder: (context, state) => const AssistantChatsPage(),
          ),
          GoRoute(
            path: '/reading/chat/:chatId',
            builder: (context, state) => AssistantChatPage(
              chatId: int.parse(state.pathParameters['chatId']!),
              initialQuestion: state.uri.queryParameters['ask'],
            ),
          ),
          GoRoute(
            path: '/reading/article/:articleId',
            builder: (context, state) => ReaderPage(
              articleId: int.parse(state.pathParameters['articleId']!),
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
