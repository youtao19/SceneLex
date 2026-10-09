import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_failure.dart';
import '../../auth/application/auth_controller.dart';
import '../../notifications/application/reminder_controller.dart';
import '../application/study_providers.dart';
import '../data/learning_models.dart';

/// 学习首页：共享的新词计划、到期复习数和当前词书。
/// 未选词书、没有到期词分别给准确空状态；网络失败显示错误和重试，不伪装成空数据。
class StudyPage extends ConsumerWidget {
  const StudyPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(studyOverviewProvider);

    // 计划一变就重排提醒：今天完成就跳过今天，明天照旧。
    ref.listen(studyOverviewProvider, (previous, next) {
      final userId = ref.read(authControllerProvider).value?.id;

      next.whenData((data) {
        if (userId == null) {
          return;
        }

        ref
            .read(reminderProvider.notifier)
            .syncWithPlan(
              userId: userId,
              newWordTarget: data.newWordTarget,
              newWordCompleted: data.newWordCompleted,
              dueTotal: data.dueTotal,
            );
      });
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('学习'),
        actions: [
          IconButton(
            onPressed: () => context.push('/lookup'),
            icon: const Icon(Icons.search),
            tooltip: '查词',
          ),
          IconButton(
            onPressed: () => ref.invalidate(studyOverviewProvider),
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
          ),
        ],
      ),
      body: SafeArea(
        child: overview.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: describeFailure(error),
            onRetry: () => ref.invalidate(studyOverviewProvider),
          ),
          data: (data) => _Overview(data: data),
        ),
      ),
    );
  }
}

class _Overview extends StatelessWidget {
  const _Overview({required this.data});

  final StudyOverview data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasBook = data.currentSystemBookId != null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('学习日 ${data.learningDay}', style: theme.textTheme.bodySmall),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('今日新词', style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  '已完成 ${data.newWordCompleted} / ${data.newWordTarget}',
                  style: theme.textTheme.headlineSmall,
                ),
                if (data.newWordTarget == 0)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('目标设为 0，今天只复习'),
                  )
                else if (data.newWordRemaining == 0)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('今日目标已完成，还可以继续学'),
                  ),
              ],
            ),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('待复习', style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text('${data.dueTotal} 个到期词', style: theme.textTheme.headlineSmall),
                if (data.dailyReviewLimitEnabled && data.queueCount < data.dueTotal)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '今天队列最多推 ${data.queueCount} 个（设置里的复习数量限制）',
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('当前学习词书'),
          subtitle: Text(
            data.currentSystemBookName ?? '还没有选择词书，先选一本再开始学新词',
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/settings'),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: hasBook && data.newWordRemaining > 0
              ? () => context.push('/study/new')
              : null,
          child: const Text('开始新词'),
        ),
        if (!hasBook)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('先在设置里选一本系统词书，新词会按它的顺序出现。'),
          ),
        if (hasBook && data.newWordRemaining == 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton(
              onPressed: () => context.push('/study/new'),
              child: const Text('继续学新词'),
            ),
          ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: data.dueTotal > 0 ? () => context.push('/study/review') : null,
          child: Text(data.dueTotal > 0 ? '开始复习' : '今天没有到期词'),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}
