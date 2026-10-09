import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/platform/tts_service.dart';
import '../application/reading_providers.dart';
import '../data/reading_api.dart';

/// 阅读页：点单词看上下文释义，选句子翻译或提问；返回时保留当前阅读位置。
class ReaderPage extends ConsumerStatefulWidget {
  const ReaderPage({super.key, required this.articleId});

  final int articleId;

  @override
  ConsumerState<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends ConsumerState<ReaderPage> {
  String? _selectedText;
  bool _busy = false;
  String? _errorMessage;

  /// 选中范围来自 SelectableText 的偏移，所以按偏移切原文即可。
  void _handleSelection(TextSelection selection, String content) {
    if (selection.isCollapsed) {
      return;
    }

    final start = selection.start.clamp(0, content.length);
    final end = selection.end.clamp(0, content.length);

    setState(() {
      _selectedText = content.substring(start, end).trim();
      _errorMessage = null;
    });
  }

  /// 点单词时偏移是光标位置，所以往两边扩到单词边界。
  void _handleTap(int offset, String content) {
    if (offset < 0 || offset > content.length) {
      return;
    }

    final word = _wordAt(content, offset);

    if (word.isEmpty) {
      return;
    }

    _showWordSheet(word, _sentenceAround(content, offset));
  }

  String _wordAt(String content, int offset) {
    final isWordChar = RegExp(r"[A-Za-z'-]");
    var start = offset;
    var end = offset;

    while (start > 0 && isWordChar.hasMatch(content[start - 1])) {
      start -= 1;
    }

    while (end < content.length && isWordChar.hasMatch(content[end])) {
      end += 1;
    }

    return content.substring(start, end).trim();
  }

  String _sentenceAround(String content, int offset) {
    var start = content.lastIndexOf(RegExp(r'[.!?\n]'), offset - 1);
    var end = content.indexOf(RegExp(r'[.!?\n]'), offset);

    start = start == -1 ? 0 : start + 1;
    end = end == -1 ? content.length : end;

    return content.substring(start, end).trim();
  }

  /// 上下文释义要带所在句子，模型才知道这个词在这句话里的意思。
  Future<void> _showWordSheet(String word, String sentence) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _WordSheet(word: word, sentence: sentence),
    );
  }

  Future<void> _translateSelected() async {
    final text = _selectedText;

    if (text == null || text.isEmpty || _busy) {
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      final translated = await ref.read(readingApiProvider).translateSentence(text);

      if (!mounted) {
        return;
      }

      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('翻译'),
          content: SingleChildScrollView(child: Text(translated)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('关闭'),
            ),
          ],
        ),
      );
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() => _errorMessage = describeFailure(error));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  /// 提问用选中句子作为上下文，进入独立聊天页，返回后仍停在这篇文章。
  Future<void> _askAboutSelection(String content) async {
    final question = _selectedText;

    if (question == null || question.isEmpty) {
      return;
    }

    await _openAssistant(content, presetQuestion: question);
  }

  Future<void> _openAssistant(String content, {String? presetQuestion}) async {
    if (_busy) {
      return;
    }

    setState(() => _busy = true);

    try {
      final chat = await ref
          .read(readingApiProvider)
          .createChat(content, articleId: widget.articleId);

      if (!mounted) {
        return;
      }

      await context.push(
        '/reading/chat/${chat.id}${presetQuestion == null ? '' : '?ask=${Uri.encodeComponent(presetQuestion)}'}',
      );
      ref.invalidate(assistantChatsProvider);
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() => _errorMessage = describeFailure(error));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final articles = ref.watch(readingArticlesProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          articles.value?.firstWhere(
                (item) => item.id == widget.articleId,
                orElse: () => const ReadingArticle(
                  id: 0,
                  title: '文章',
                  content: '',
                  charCount: 0,
                  updatedAt: '',
                ),
              ).title ??
              '文章',
        ),
        actions: [
          IconButton(
            onPressed: _busy
                ? null
                : () {
                    final content = articles.value
                        ?.firstWhere(
                          (item) => item.id == widget.articleId,
                          orElse: () => const ReadingArticle(
                            id: 0,
                            title: '',
                            content: '',
                            charCount: 0,
                            updatedAt: '',
                          ),
                        )
                        .content;

                    if (content != null && content.isNotEmpty) {
                      _openAssistant(content);
                    }
                  },
            icon: const Icon(Icons.forum_outlined),
            tooltip: '阅读助手',
          ),
        ],
      ),
      body: SafeArea(
        child: articles.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text(describeFailure(error))),
          data: (items) {
            final article = items.where((item) => item.id == widget.articleId).firstOrNull;

            if (article == null) {
              return const Center(child: Text('这篇文章已经不在了。'));
            }

            return Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: SelectableText(
                      article.content,
                      onSelectionChanged: (selection, cause) {
                        if (selection.isCollapsed &&
                            cause == SelectionChangedCause.tap) {
                          _handleTap(selection.baseOffset, article.content);
                          return;
                        }

                        _handleSelection(selection, article.content);
                      },
                    ),
                  ),
                ),
                if (_selectedText != null && _selectedText!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _busy ? null : _translateSelected,
                            child: const Text('翻译选中'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: _busy
                                ? null
                                : () => _askAboutSelection(article.content),
                            child: const Text('向助手提问'),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (_errorMessage != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(
                      _errorMessage!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// 单词底部弹层：上下文释义 + 发音 + 生成词卡并保存。
class _WordSheet extends ConsumerStatefulWidget {
  const _WordSheet({required this.word, required this.sentence});

  final String word;
  final String sentence;

  @override
  ConsumerState<_WordSheet> createState() => _WordSheetState();
}

class _WordSheetState extends ConsumerState<_WordSheet> {
  String? _meaning;
  bool _loading = true;
  bool _saving = false;
  String? _errorMessage;
  String? _savedMessage;

  @override
  void initState() {
    super.initState();
    _loadMeaning();
  }

  Future<void> _loadMeaning() async {
    try {
      final meaning = await ref
          .read(readingApiProvider)
          .lookupWord(widget.word, widget.sentence);

      if (mounted) {
        setState(() {
          _meaning = meaning;
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

  /// 保存时先生成完整词卡，再按学习流程入库，保证和 PC 看到的内容一致。
  Future<void> _save() async {
    if (_saving) {
      return;
    }

    setState(() {
      _saving = true;
      _errorMessage = null;
    });

    try {
      final learning = ref.read(learningApiProvider);
      final card = await learning.generate(widget.word);
      await learning.saveCard(
        word: card.word,
        phonetic: card.phonetic,
        meanings: card.meanings,
      );

      if (mounted) {
        setState(() => _savedMessage = '已保存到单词本。');
      }
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() => _errorMessage = describeFailure(error));
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _speak() async {
    final tts = ref.read(ttsServiceProvider);

    if (tts.status != TtsStatus.ready) {
      await tts.prepare();
    }

    if (tts.status != TtsStatus.ready) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text(missingVoiceGuidance)));
      }

      return;
    }

    await tts.speak(widget.word);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.word,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
              IconButton(
                onPressed: _speak,
                icon: const Icon(Icons.volume_up),
                tooltip: '发音',
              ),
            ],
          ),
          Text(
            widget.sentence,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (_loading) const LinearProgressIndicator(),
          if (_meaning != null) Text(_meaning!),
          if (_errorMessage != null)
            Text(
              _errorMessage!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          if (_savedMessage != null) Text(_savedMessage!),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: const Text('生成词卡并保存到单词本'),
          ),
        ],
      ),
    );
  }
}
