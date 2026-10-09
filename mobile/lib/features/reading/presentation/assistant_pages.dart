import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../application/reading_providers.dart';
import '../data/reading_api.dart';

/// 助手会话列表：已有的会话和文章绑定关系都来自服务端。
class AssistantChatsPage extends ConsumerWidget {
  const AssistantChatsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(assistantChatsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('阅读助手')),
      body: SafeArea(
        child: chats.when(
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
                    onPressed: () => ref.invalidate(assistantChatsProvider),
                    child: const Text('重试'),
                  ),
                ],
              ),
            ),
          ),
          data: (items) {
            if (items.isEmpty) {
              return const Center(child: Text('还没有会话。在文章里选句子提问就会建一个。'));
            }

            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final chat = items[index];

                return ListTile(
                  title: Text(chat.title),
                  subtitle: Text(
                    chat.articleContent.length > 40
                        ? '${chat.articleContent.substring(0, 40)}…'
                        : chat.articleContent,
                  ),
                  onTap: () => context.push('/reading/chat/${chat.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// 助手聊天页：流式逐字显示，只有服务端确认完成才算完整回答。
class AssistantChatPage extends ConsumerStatefulWidget {
  const AssistantChatPage({super.key, required this.chatId, this.initialQuestion});

  final int chatId;

  /// 从阅读页带过来的问题，进页面就自动问一次。
  final String? initialQuestion;

  @override
  ConsumerState<AssistantChatPage> createState() => _AssistantChatPageState();
}

class _AssistantChatPageState extends ConsumerState<AssistantChatPage> {
  final _controller = TextEditingController();
  final List<AssistantMessage> _messages = [];
  String _streamingText = '';
  bool _streaming = false;
  bool _loadingHistory = true;
  bool _incomplete = false;
  String? _errorMessage;
  bool _autoAsked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _loadHistory();

      if (!_autoAsked && (widget.initialQuestion ?? '').isNotEmpty) {
        _autoAsked = true;
        await _send(widget.initialQuestion!);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final messages = await ref
          .read(readingApiProvider)
          .fetchMessages(widget.chatId);

      if (mounted) {
        setState(() {
          _messages
            ..clear()
            ..addAll(messages);
          _loadingHistory = false;
        });
      }
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = describeFailure(error);
          _loadingHistory = false;
        });
      }
    }
  }

  /// 提问期间禁用发送（防连点），并把每个事件按类型落到界面上。
  Future<void> _send(String question) async {
    if (_streaming || question.trim().isEmpty) {
      return;
    }

    setState(() {
      _streaming = true;
      _streamingText = '';
      _incomplete = false;
      _errorMessage = null;
    });

    try {
      await for (final event in ref
          .read(readingApiProvider)
          .streamMessage(
            widget.chatId,
            question.trim(),
            AssistantQuestionMode.article,
          )) {
        if (!mounted) {
          return;
        }

        switch (event) {
          case UserMessageEvent(:final message):
            setState(() => _messages.add(message));
          case DeltaEvent(:final delta):
            setState(() => _streamingText += delta);
          case DoneEvent(:final message):
            setState(() {
              _messages.add(message);
              _streamingText = '';
            });
          case ErrorEvent(:final message):
            setState(() {
              _errorMessage = message;
              _streamingText = '';
            });
        }
      }
    } on StreamIncompleteFailure catch (error) {
      // 断流：保留已收到的片段，但必须标明它不是完整答案。
      if (mounted) {
        setState(() {
          _incomplete = true;
          _errorMessage = describeFailure(error);
        });
      }
    } on ApiFailure catch (error) {
      if (mounted) {
        setState(() => _errorMessage = describeFailure(error));
      }
    } finally {
      if (mounted) {
        setState(() => _streaming = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('阅读助手')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loadingHistory
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        for (final message in _messages)
                          _MessageBubble(
                            isUser: message.isUser,
                            text: message.content,
                          ),
                        if (_streamingText.isNotEmpty)
                          _MessageBubble(
                            isUser: false,
                            text: _streamingText,
                            incomplete: _incomplete,
                          ),
                        if (_streaming && _streamingText.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: Text('正在等待回复…'),
                          ),
                        if (_errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              _errorMessage!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: const InputDecoration(
                        hintText: '问这篇文章的问题',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (value) {
                        _controller.clear();
                        _send(value);
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _streaming
                        ? null
                        : () {
                            final question = _controller.text;
                            _controller.clear();
                            _send(question);
                          },
                    child: const Text('发送'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.isUser,
    required this.text,
    this.incomplete = false,
  });

  final bool isUser;
  final String text;
  final bool incomplete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: isUser ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text),
            if (incomplete)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '（未完成，不代表完整答案）',
                  style: TextStyle(color: scheme.error, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
