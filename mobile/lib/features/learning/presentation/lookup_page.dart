import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import 'word_card_view.dart';
import '../data/learning_api.dart';

/// 查词：先给词典事实，用户确认需要时再生成完整词卡，最后按需保存。
class LookupPage extends ConsumerStatefulWidget {
  const LookupPage({super.key, this.initialWord, this.systemBookItemId});

  final String? initialWord;

  /// 从系统词书进来时带上词条 id，生成结果会写进对应词条缓存。
  final int? systemBookItemId;

  @override
  ConsumerState<LookupPage> createState() => _LookupPageState();
}

class _LookupPageState extends ConsumerState<LookupPage> {
  late final TextEditingController _controller;
  WordLookupEntry? _entry;
  GeneratedWordCard? _card;
  bool _busy = false;
  String? _errorMessage;
  String? _savedMessage;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialWord ?? '');

    if ((widget.initialWord ?? '').isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _lookup());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) {
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
      _savedMessage = null;
    });

    try {
      await action();
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

  Future<void> _lookup() => _run(() async {
    final word = _controller.text.trim();

    if (word.isEmpty) {
      throw const RequestFailure(400, '请输入要查的单词');
    }

    final entry = await ref.read(learningApiProvider).lookup(word);

    if (mounted) {
      setState(() {
        _entry = entry;
        _card = null;
      });
    }
  });

  Future<void> _generate() => _run(() async {
    final word = _entry?.word ?? _controller.text.trim();
    final card = await ref
        .read(learningApiProvider)
        .generate(word, systemBookItemId: widget.systemBookItemId);

    if (mounted) {
      setState(() => _card = card);
    }
  });

  Future<void> _save() => _run(() async {
    final card = _card;

    if (card == null) {
      return;
    }

    await ref
        .read(learningApiProvider)
        .saveCard(
          word: card.word,
          phonetic: card.phonetic,
          meanings: card.meanings,
        );

    if (mounted) {
      setState(() => _savedMessage = '已保存到单词本，之后会按排期进入复习。');
    }
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('查词')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: '单词',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _lookup(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy ? null : _lookup,
                  child: const Text('查词'),
                ),
              ],
            ),
            if (_entry != null) ...[
              const SizedBox(height: 16),
              Text(_entry!.word, style: Theme.of(context).textTheme.headlineSmall),
              Text(_entry!.phonetic),
              const SizedBox(height: 8),
              for (final meaning in _entry!.meanings) Text('· $meaning'),
              const SizedBox(height: 16),
              if (_card == null)
                OutlinedButton(
                  onPressed: _busy ? null : _generate,
                  child: const Text('生成完整词卡'),
                ),
            ],
            if (_card != null) ...[
              const SizedBox(height: 16),
              WordCardView(meanings: _card!.meanings),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: const Text('保存到单词本'),
              ),
            ],
            if (_savedMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_savedMessage!),
              ),
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _errorMessage!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
