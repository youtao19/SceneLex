import '../../../core/network/api_client.dart';
import '../../learning/data/learning_api.dart';
import 'words_models.dart';

export 'words_models.dart';

/// 词库、单词本与历史。抽成接口便于测试替换。
abstract class WordsApi {
  Future<List<SystemBook>> fetchSystemBooks();

  Future<SystemBookDetail> fetchSystemBookDetail(int bookId, {int limit, int offset});

  Future<List<WordBook>> fetchWordBooks();

  Future<WordBookDetail> fetchWordBookDetail(int bookId);

  Future<WordBook> createWordBook(String name);

  Future<WordBook> renameWordBook(int bookId, String name);

  Future<void> deleteWordBook(int bookId);

  Future<void> removeWordFromBook(int bookId, int wordId);

  Future<HistoryArchive> fetchHistory();
}

class HttpWordsApi implements WordsApi {
  HttpWordsApi(this._client);

  final ApiClient _client;

  @override
  Future<List<SystemBook>> fetchSystemBooks() async {
    final data = await _client.get<List<dynamic>>('/system-word-books');

    return data
        .map((item) => SystemBook.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<SystemBookDetail> fetchSystemBookDetail(
    int bookId, {
    int limit = 60,
    int offset = 0,
  }) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/system-word-books/$bookId',
      query: {'limit': limit, 'offset': offset},
    );

    return SystemBookDetail.fromJson(data);
  }

  @override
  Future<List<WordBook>> fetchWordBooks() async {
    final data = await _client.get<List<dynamic>>('/word-books');

    return data
        .map((item) => WordBook.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<WordBookDetail> fetchWordBookDetail(int bookId) async {
    final data = await _client.get<Map<String, dynamic>>('/word-books/$bookId');

    return WordBookDetail(
      book: WordBook.fromJson(data),
      words: (data['words'] as List<dynamic>? ?? const [])
          .map((item) => StudyWord.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<WordBook> createWordBook(String name) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/word-books',
      body: {'name': name},
    );

    return WordBook.fromJson(data);
  }

  @override
  Future<WordBook> renameWordBook(int bookId, String name) async {
    final data = await _client.patch<Map<String, dynamic>>(
      '/word-books/$bookId',
      body: {'name': name},
    );

    return WordBook.fromJson(data);
  }

  @override
  Future<void> deleteWordBook(int bookId) => _client.delete('/word-books/$bookId');

  @override
  Future<void> removeWordFromBook(int bookId, int wordId) =>
      _client.delete('/word-books/$bookId/words/$wordId');

  @override
  Future<HistoryArchive> fetchHistory() async {
    final data = await _client.get<Map<String, dynamic>>('/history');

    return HistoryArchive.fromJson(data);
  }
}
