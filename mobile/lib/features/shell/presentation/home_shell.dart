import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 四栏导航：学习 / 词库 / 阅读 / 我的。主要操作都放在单手够得到的位置。
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.child});

  final Widget child;

  static const _tabPaths = ['/study', '/words', '/reading', '/me'];

  /// 子页也算在所属的那一栏里（例如词书详情仍高亮“词库”），
  /// 否则高亮会跳到“学习”，用户会以为自己走错了地方。
  int _indexFor(String location) {
    if (location.startsWith('/words')) {
      return 1;
    }

    if (location.startsWith('/reading')) {
      return 2;
    }

    if (location.startsWith('/me') || location.startsWith('/settings')) {
      return 3;
    }

    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final index = _indexFor(GoRouterState.of(context).uri.path);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => context.go(_tabPaths[value]),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.school_outlined),
            selectedIcon: Icon(Icons.school),
            label: '学习',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: '词库',
          ),
          NavigationDestination(
            icon: Icon(Icons.article_outlined),
            selectedIcon: Icon(Icons.article),
            label: '阅读',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: '我的',
          ),
        ],
      ),
    );
  }
}
