import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../data/learning_api.dart';

/// 学习概览每次进入学习页重新取，避免拿旧的目标/到期数当权威。
final studyOverviewProvider = FutureProvider.autoDispose<StudyOverview>((ref) {
  return ref.watch(learningApiProvider).fetchOverview();
});

/// 历史概览同理：网络失败要能重试，不能显示成空数据。
final historyProvider = FutureProvider.autoDispose<HistoryArchive>((ref) {
  return ref.watch(learningApiProvider).fetchHistory();
});
