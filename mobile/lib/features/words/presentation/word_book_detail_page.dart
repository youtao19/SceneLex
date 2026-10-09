import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../application/words_providers.dart';
import '../data/words_api.dart';

/// 个人单词本详情：改名、移除单词，也可以继续查词保存。
class WordBookDetailPage extends ConsumerStatefulWidget {
  const WordBookDetailPage({super.key, required this.bookId});

  final int bookId;

  @override
  ConsumerState<WordBookDetailPage> createState() => _WordBookDetailPageState();
}

class _WordBookDetailPageState extends ConsumerState<WordBookDetailPage> {
  WordBookDetail? _detail;
  bool _loading = true;
  bool _busy = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final detail = await ref
          .read(wordsApiProvider)
          .fetchWordBookDetail(widget.bookId);

      if (mounted) {
        setState(() {
          _detail = detail;
          _loading = false;
        });
      }
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = describeFailure(error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _rename() async {
    final detail = _detail;

    if (detail == null || _busy) {
      return;
    }

    final controller = TextEditingController(text: detail.book.name);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('改名'),
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

    if (name == null || name.isEmpty || name == detail.book.name) {
      return;
    }

    await _run(() async {
      await ref.read(wordsApiProvider).renameWordBook(widget.bookId, name);
      // 列表在导航栈下层还活着，必须显式失效才会显示新名字。
      ref.invalidate(wordBooksProvider);
    });
  }

  Future<void> _removeWord(int wordId) async {
    await _run(
      () => ref.read(wordsApiProvider).removeWordFromBook(widget.bookId, wordId),
    );
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) {
      return;
    }

    setState(() => _busy = true);

    try {
      await action();
      await _load();
    } on ApiFailure catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(describeFailure(error))));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;

    return Scaffold(
      appBar: AppBar(
        title: Text(detail?.book.name ?? '单词本'),
        actions: [
          if (detail != null)
            IconButton(
              onPressed: _busy ? null : _rename,
              icon: const Icon(Icons.edit_outlined),
              tooltip: '改名',
            ),
        ],
      ),
      body: SafeArea(
        child: _loading && detail == null
            ? const Center(child: CircularProgressIndicator())
            : _errorMessage != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_errorMessage!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _load, child: const Text('重试')),
                    ],
                  ),
                ),
              )
            : ListView(
                children: [
                  if (detail != null && detail.words.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('这个单词本还是空的。查词后保存时可以选它。'),
                    ),
                  for (final word in detail?.words ?? const [])
                    ListTile(
                      title: Text(word.word),
                      subtitle: Text(word.primaryMeaning),
                      trailing: IconButton(
                        onPressed: _busy ? null : () => _removeWord(word.id),
                        icon: const Icon(Icons.remove_circle_outline),
                        tooltip: '从这个单词本移除',
                      ),
                      onTap: () => context.push(
                        '/lookup?word=${Uri.encodeComponent(word.word)}',
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}
