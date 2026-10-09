import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/platform/tts_service.dart';
import '../../auth/application/auth_controller.dart';
import '../application/study_controller.dart';
import 'word_card_view.dart';

/// 专注词卡：正面只给单词、音标和发音按钮，揭晓后才是完整词卡和四档评分。
/// 提交期间禁用评分（防连点），服务端确认成功才进入下一词。
class FocusCardPage extends ConsumerStatefulWidget {
  const FocusCardPage({super.key, required this.mode});

  final StudyMode mode;

  @override
  ConsumerState<FocusCardPage> createState() => _FocusCardPageState();
}

class _FocusCardPageState extends ConsumerState<FocusCardPage> {
  bool _started = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    if (_started) {
      return;
    }

    _started = true;
    final userId = ref.read(authControllerProvider).value?.id ?? 0;
    // 语音缺失只影响发音按钮，不挡学习流程。
    await ref.read(ttsServiceProvider).prepare();
    await ref.read(studySessionProvider.notifier).start(widget.mode, userId: userId);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studySessionProvider);
    final notifier = ref.read(studySessionProvider.notifier);
    final userId = ref.watch(authControllerProvider).value?.id ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.mode == StudyMode.newWords ? '学新词' : '复习'),
        actions: [
          if (state.canUndo)
            TextButton(
              onPressed: () => notifier.undoLast(userId: userId),
              child: const Text('撤销上一词'),
            ),
        ],
      ),
      body: SafeArea(child: _buildBody(state, notifier, userId)),
    );
  }

  Widget _buildBody(
    StudySessionState state,
    StudySessionController notifier,
    int userId,
  ) {
    if (state.loading || state.generating) {
      return const Center(child: CircularProgressIndicator());
    }

    final current = state.current;

    if (current == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('这一轮学完了。'),
              if (state.errorMessage != null) ...[
                const SizedBox(height: 8),
                Text(state.errorMessage!, textAlign: TextAlign.center),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => notifier.start(widget.mode, userId: userId),
                child: const Text('再来一轮'),
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (state.restoredPosition)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text('已从上次没学完的位置继续。'),
          ),
        Text(
          current.text,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.displaySmall,
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(state.currentPhonetic, style: Theme.of(context).textTheme.bodyLarge),
            IconButton(
              onPressed: () => _speak(current.text),
              icon: const Icon(Icons.volume_up),
              tooltip: '发音',
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (!state.revealed)
          FilledButton(
            onPressed: state.generating ? null : notifier.reveal,
            child: const Text('揭晓释义'),
          ),
        if (state.revealed) ...[
          WordCardView(meanings: state.currentMeanings),
          const SizedBox(height: 8),
          _RatingButtons(
            submitting: state.submitting,
            onRate: (rating) => notifier.rate(rating, userId: userId),
          ),
        ],
        if (state.errorMessage != null) ...[
          const SizedBox(height: 16),
          Text(
            state.errorMessage!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
      ],
    );
  }

  /// 只有拿到离线美式语音才出声；没有就明确告诉用户怎么装。
  Future<void> _speak(String word) async {
    final tts = ref.read(ttsServiceProvider);

    if (tts.status != TtsStatus.ready) {
      await tts.prepare();
    }

    if (tts.status != TtsStatus.ready) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(missingVoiceGuidance)));

      return;
    }

    await tts.speak(word);
  }
}

class _RatingButtons extends StatelessWidget {
  const _RatingButtons({required this.submitting, required this.onRate});

  final bool submitting;
  final ValueChanged<ReviewRating> onRate;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final rating in ReviewRating.values)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: OutlinedButton(
                onPressed: submitting ? null : () => onRate(rating),
                child: Text(_label(rating)),
              ),
            ),
          ),
      ],
    );
  }

  String _label(ReviewRating rating) {
    return switch (rating) {
      ReviewRating.again => '不记得',
      ReviewRating.hard => '模糊',
      ReviewRating.good => '记得',
      ReviewRating.easy => '很轻松',
    };
  }
}
