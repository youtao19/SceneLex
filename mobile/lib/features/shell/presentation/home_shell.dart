import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 四栏导航：学习 / 词库 / 阅读 / 我的。主要操作都放在单手够得到的位置。
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.child});

  final Widget child;

  static const _tabPaths = ['/study', '/words', '/reading', '/me'];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    // 设置页属于“我的”这一栏，不能让它把高亮留在“学习”。
    final tabLocation = location == '/settings' ? '/me' : location;
    final index = _tabPaths.indexOf(tabLocation);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
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
