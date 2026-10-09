import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../application/reading_providers.dart';
import '../data/reading_api.dart';

/// 阅读首页：文章列表 + 文本导入；拍照导入在 mobile-ocr 里接上。
class ArticlesPage extends ConsumerWidget {
  const ArticlesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final articles = ref.watch(readingArticlesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('阅读'),
        actions: [
          IconButton(
            onPressed: () => context.push('/reading/assistant'),
            icon: const Icon(Icons.forum_outlined),
            tooltip: '阅读助手',
          ),
          IconButton(
            onPressed: () => context.push('/ocr'),
            icon: const Icon(Icons.photo_camera_outlined),
            tooltip: '拍照导入',
          ),
          IconButton(
            onPressed: () => _import(context, ref),
            icon: const Icon(Icons.add),
            tooltip: '导入文章',
          ),
        ],
      ),
      body: SafeArea(
        child: articles.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(describeFailure(error), textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => ref.invalidate(readingArticlesProvider),
                    child: const Text('重试'),
                  ),
                ],
              ),
            ),
          ),
          data: (items) {
            if (items.isEmpty) {
              return const Center(child: Text('还没有文章。可以粘贴一段英文导入。'));
            }

            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final article = items[index];

                return ListTile(
                  title: Text(article.title),
                  subtitle: Text('${article.charCount} 字符 · ${article.updatedAt.substring(0, 10)}'),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) async {
                      if (value == 'rename') {
                        await _rename(context, ref, article);
                      } else if (value == 'delete') {
                        await _delete(context, ref, article);
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'rename', child: Text('改标题')),
                      PopupMenuItem(value: 'delete', child: Text('删除')),
                    ],
                  ),
                  onTap: () => context.push('/reading/article/${article.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _import(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final content = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('导入文章'),
        content: SizedBox(
          width: 320,
          child: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 8,
            decoration: const InputDecoration(
              hintText: '粘贴英文原文',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('导入'),
          ),
        ],
      ),
    );

    if (content == null || content.isEmpty) {
      return;
    }

    try {
      final article = await ref.read(readingApiProvider).importArticle(content);

      ref.invalidate(readingArticlesProvider);

      if (context.mounted) {
        context.push('/reading/article/${article.id}');
      }
    } on ApiFailure catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(describeFailure(error))));
      }
    }
  }

  Future<void> _rename(
    BuildContext context,
    WidgetRef ref,
    ReadingArticle article,
  ) async {
    final controller = TextEditingController(text: article.title);
    final title = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('改标题'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );

    if (title == null || title.isEmpty || title == article.title) {
      return;
    }

    try {
      await ref.read(readingApiProvider).updateTitle(article.id, title);
      ref.invalidate(readingArticlesProvider);
    } on ApiFailure catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(describeFailure(error))));
      }
    }
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    ReadingArticle article,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('删除 ${article.title}'),
        content: const Text('删除后这篇文章的正文不再保留。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      return;
    }

    try {
      await ref.read(readingApiProvider).deleteArticle(article.id);
      ref.invalidate(readingArticlesProvider);
    } on ApiFailure catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(describeFailure(error))));
      }
    }
  }
}
