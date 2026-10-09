import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../data/words_api.dart';

/// 系统词书详情：按词书顺序浏览，标记已学，可设为当前学习词书。
class SystemBookDetailPage extends ConsumerStatefulWidget {
  const SystemBookDetailPage({super.key, required this.bookId});

  final int bookId;

  @override
  ConsumerState<SystemBookDetailPage> createState() => _SystemBookDetailPageState();
}

class _SystemBookDetailPageState extends ConsumerState<SystemBookDetailPage> {
  static const _pageSize = 60;

  SystemBookDetail? _detail;
  bool _loading = true;
  bool _busy = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool append = false}) async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final offset = append ? (_detail?.items.length ?? 0) : 0;
      final detail = await ref
          .read(wordsApiProvider)
          .fetchSystemBookDetail(widget.bookId, limit: _pageSize, offset: offset);

      if (!mounted) {
        return;
      }

      setState(() {
        _detail = append && _detail != null
            ? SystemBookDetail(
                book: detail.book,
                items: [..._detail!.items, ...detail.items],
              )
            : detail;
        _loading = false;
      });
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = describeFailure(error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _setAsCurrentBook() async {
    if (_busy) {
      return;
    }

    setState(() => _busy = true);

    try {
      await ref
          .read(settingsApiProvider)
          .updateLearningSettings(currentSystemBookId: widget.bookId);

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('已设为当前学习词书。')));
      }
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
      appBar: AppBar(title: Text(detail?.book.name ?? '系统词书')),
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
                  if (detail != null) ...[
                    ListTile(
                      title: Text(detail.book.description),
                      subtitle: Text(
                        '已学 ${detail.book.learnedWords} / ${detail.book.totalWords}',
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: FilledButton(
                        onPressed: _busy ? null : _setAsCurrentBook,
                        child: const Text('设为当前学习词书'),
                      ),
                    ),
                    const Divider(),
                    for (final item in detail.items)
                      ListTile(
                        title: Text(item.word),
                        subtitle: Text(item.unit),
                        trailing: item.learned
                            ? const Chip(label: Text('已学'))
                            : null,
                        onTap: () => context.push(
                          '/lookup?word=${Uri.encodeComponent(item.word)}&itemId=${item.id}',
                        ),
                      ),
                    if (detail.items.length >= _pageSize)
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: OutlinedButton(
                          onPressed: _loading ? null : () => _load(append: true),
                          child: const Text('加载更多'),
                        ),
                      ),
                  ],
                ],
              ),
      ),
    );
  }
}
