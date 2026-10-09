import 'dart:convert';

import '../../../core/network/api_client.dart';
import 'reading_models.dart';
import 'sse_parser.dart';

export 'reading_models.dart';
export 'sse_parser.dart';

/// 阅读相关接口。抽成接口便于测试替换。
abstract class ReadingApi {
  Future<List<ReadingArticle>> fetchArticles();

  Future<ReadingArticle> importArticle(String content);

  Future<void> deleteArticle(int articleId);

  Future<ReadingArticle> updateTitle(int articleId, String title);

  /// 上下文释义：带上所在句子，模型才能给出贴合语境的解释。
  Future<String> lookupWord(String word, String sentence);

  Future<String> translateSentence(String sentence);

  Future<List<AssistantChat>> fetchChats();

  Future<AssistantChat> createChat(String content, {int? articleId});

  Future<List<AssistantMessage>> fetchMessages(int chatId);

  /// 流式提问：只有收到 done 才算完成，断流由解析器抛 StreamIncompleteFailure。
  Stream<AssistantStreamEvent> streamMessage(
    int chatId,
    String question,
    AssistantQuestionMode mode,
  );
}

class HttpReadingApi implements ReadingApi {
  HttpReadingApi(this._client);

  final ApiClient _client;

  @override
  Future<List<ReadingArticle>> fetchArticles() async {
    final data = await _client.get<List<dynamic>>('/reading/articles');

    return data
        .map((item) => ReadingArticle.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<ReadingArticle> importArticle(String content) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/reading/articles',
      body: {'content': content},
    );

    return ReadingArticle.fromJson(data);
  }

  @override
  Future<void> deleteArticle(int articleId) =>
      _client.delete('/reading/articles/$articleId');

  @override
  Future<ReadingArticle> updateTitle(int articleId, String title) async {
    final data = await _client.patch<Map<String, dynamic>>(
      '/reading/articles/$articleId/title',
      body: {'title': title},
    );

    return ReadingArticle.fromJson(data);
  }

  @override
  Future<String> lookupWord(String word, String sentence) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/reading/word',
      body: {'word': word, 'sentence': sentence},
    );

    return data['text'] as String? ?? '';
  }

  @override
  Future<String> translateSentence(String sentence) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/reading/sentence',
      body: {'sentence': sentence},
    );

    return data['text'] as String? ?? '';
  }

  @override
  Future<List<AssistantChat>> fetchChats() async {
    final data = await _client.get<List<dynamic>>('/reading/assistant-chats');

    return data
        .map((item) => AssistantChat.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<AssistantChat> createChat(String content, {int? articleId}) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/reading/assistant-chats',
      body: {'content': content, 'articleId': articleId},
    );

    return AssistantChat.fromJson(data);
  }

  @override
  Future<List<AssistantMessage>> fetchMessages(int chatId) async {
    final data = await _client.get<List<dynamic>>(
      '/reading/assistant-chats/$chatId/messages',
    );

    return data
        .map((item) => AssistantMessage.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Stream<AssistantStreamEvent> streamMessage(
    int chatId,
    String question,
    AssistantQuestionMode mode,
  ) async* {
    final body = await _client.postStream(
      '/reading/assistant-chats/$chatId/messages/stream',
      body: {'question': question, 'questionMode': mode.name},
    );
    final parser = AssistantStreamParser();

    await for (final chunk in body.stream
        .cast<List<int>>()
        .transform(utf8.decoder)) {
      for (final event in parser.add(chunk)) {
        yield event;
      }
    }

    // 连接结束：没有 done 时这里会抛断流失败，调用方不能当成完整回答。
    for (final event in parser.finish()) {
      yield event;
    }
  }
}
