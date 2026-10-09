import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../../learning/application/study_providers.dart';
import '../../learning/data/learning_models.dart';
import '../../learning/presentation/word_card_view.dart';
import '../application/words_providers.dart';
import '../data/words_api.dart';

/// 词库：系统词书、个人单词本和历史概览。
class WordsPage extends ConsumerWidget {
  const WordsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('词库'),
          actions: [
            Consumer(
              builder: (context, ref, child) => IconButton(
                onPressed: () => _WordBooksTab.openCreateDialog(context, ref),
                icon: const Icon(Icons.add),
                tooltip: '新建单词本',
              ),
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: '系统词书'),
              Tab(text: '我的单词本'),
              Tab(text: '历史'),
            ],
          ),
        ),
        body: const SafeArea(
          child: TabBarView(
            children: [_SystemBooksTab(), _WordBooksTab(), _HistoryTab()],
          ),
        ),
      ),
    );
  }
}

/// 列表页统一的加载/错误/重试外壳，避免每个 tab 各写一遍。
class _AsyncList<T> extends ConsumerWidget {
  const _AsyncList({required this.provider, required this.builder});

  final FutureProvider<T> provider;
  final Widget Function(BuildContext context, T data) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(provider);

    return value.when(
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
                onPressed: () => ref.invalidate(provider),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      ),
      data: (data) => builder(context, data),
    );
  }
}

class _SystemBooksTab extends ConsumerWidget {
  const _SystemBooksTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _AsyncList<List<SystemBook>>(
      provider: systemBooksProvider,
      builder: (context, books) {
        if (books.isEmpty) {
          return const Center(child: Text('还没有可用的系统词书。'));
        }

        return ListView.builder(
          itemCount: books.length,
          itemBuilder: (context, index) {
            final book = books[index];

            return ListTile(
              title: Text(book.name),
              subtitle: Text(
                '${book.description}\n已学 ${book.learnedWords} / ${book.totalWords}',
              ),
              isThreeLine: true,
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/words/system/${book.id}'),
            );
          },
        );
      },
    );
  }
}

class _WordBooksTab extends ConsumerWidget {
  const _WordBooksTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _AsyncList<List<WordBook>>(
      provider: wordBooksProvider,
      builder: (context, books) {
        return ListView(
          children: [
            for (final book in books)
              ListTile(
                title: Text(book.name),
                subtitle: Text(
                  '${book.wordCount} 个词${book.isDefault ? ' · 默认' : ''}',
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (value) async {
                    if (value == 'delete') {
                      await ref.read(wordsApiProvider).deleteWordBook(book.id);
                      ref.invalidate(wordBooksProvider);
                    }
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(value: 'delete', child: Text('删除')),
                  ],
                ),
                onTap: () => context.push('/words/book/${book.id}'),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('新建单词本'),
              onTap: () => _WordBooksTab.openCreateDialog(context, ref),
            ),
          ],
        );
      },
    );
  }

  /// 列表底部和 AppBar 共用同一个新建流程，避免两个入口行为不一致。
  static Future<void> openCreateDialog(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新建单词本'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('创建'),
          ),
        ],
      ),
    );

    if (name == null || name.isEmpty) {
      return;
    }

    try {
      await ref.read(wordsApiProvider).createWordBook(name);
      ref.invalidate(wordBooksProvider);
    } on ApiFailure catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(describeFailure(error))));
      }
    }
  }
}

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _AsyncList<HistoryArchive>(
      provider: historyProvider,
      builder: (context, archive) {
        if (archive.words.isEmpty) {
          return const Center(child: Text('还没有保存过单词。'));
        }

        return ListView(
          children: [
            ListTile(
              title: Text('共 ${archive.summary.totalWords} 个词'),
              subtitle: Text(
                '今天到期 ${archive.summary.dueToday} 个 · 已复习 ${archive.summary.reviewedWords} 个',
              ),
            ),
            const Divider(),
            for (final word in archive.words)
              ListTile(
                title: Text(word.word),
                subtitle: Text(
                  '${word.primaryMeaning} · 复习 ${word.reviewCount} 次 · 下次 ${word.nextReview}',
                ),
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: Text(word.word),
                    content: SingleChildScrollView(
                      child: WordCardView(meanings: word.meanings),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('关闭'),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
