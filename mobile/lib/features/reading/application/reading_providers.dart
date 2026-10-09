import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../data/reading_api.dart';

/// 文章列表和会话列表都用 FutureProvider：失败要能重试，不能显示成空数据。
final readingArticlesProvider = FutureProvider.autoDispose<List<ReadingArticle>>((
  ref,
) {
  return ref.watch(readingApiProvider).fetchArticles();
});

final assistantChatsProvider = FutureProvider.autoDispose<List<AssistantChat>>((ref) {
  return ref.watch(readingApiProvider).fetchChats();
});

final assistantMessagesProvider = FutureProvider.autoDispose
    .family<List<AssistantMessage>, int>((ref, chatId) {
      return ref.watch(readingApiProvider).fetchMessages(chatId);
    });
