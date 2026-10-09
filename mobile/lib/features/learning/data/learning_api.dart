import '../../../core/network/api_client.dart';
import 'learning_models.dart';

export 'learning_models.dart';

/// 学习相关接口。抽成接口是为了让学习状态机能在纯测试里替换掉网络。
abstract class LearningApi {
  Future<StudyOverview> fetchOverview();

  Future<NewWordQueue> fetchNewWords({int? limit});

  Future<StudyWord> completeNewWord({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
    required ReviewRating rating,
    required String operationId,
  });

  Future<List<StudyWord>> fetchTodayWords();

  Future<StudyWord> reviewWord({
    required int wordId,
    required ReviewRating rating,
    required String operationId,
    required int expectedVersion,
  });

  /// 撤销只认服务端记录的评分操作，所以必须带上那次评分的 operationId。
  Future<StudyWord> rollbackReview({
    required int wordId,
    required String targetOperationId,
    required String operationId,
  });

  Future<WordLookupEntry> lookup(String word);

  Future<GeneratedWordCard> generate(String word, {int? systemBookItemId});

  Future<StudyWord> saveCard({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
  });

  Future<HistoryArchive> fetchHistory();
}

class HttpLearningApi implements LearningApi {
  HttpLearningApi(this._client);

  final ApiClient _client;

  @override
  Future<StudyOverview> fetchOverview() async {
    final data = await _client.get<Map<String, dynamic>>('/word/overview');

    return StudyOverview.fromJson(data);
  }

  @override
  Future<NewWordQueue> fetchNewWords({int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/word/new',
      query: limit == null ? null : {'limit': limit},
    );

    return NewWordQueue.fromJson(data);
  }

  @override
  Future<StudyWord> completeNewWord({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
    required ReviewRating rating,
    required String operationId,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/word/complete-new',
      body: {
        'word': word,
        'phonetic': phonetic,
        'meanings': meanings.map(_meaningToJson).toList(),
        'rating': rating.name,
        'operationId': operationId,
      },
    );

    return StudyWord.fromJson(data);
  }

  @override
  Future<List<StudyWord>> fetchTodayWords() async {
    final data = await _client.get<List<dynamic>>('/word/today');

    return data
        .map((item) => StudyWord.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<StudyWord> reviewWord({
    required int wordId,
    required ReviewRating rating,
    required String operationId,
    required int expectedVersion,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/word/review',
      body: {
        'wordId': wordId,
        'rating': rating.name,
        'operationId': operationId,
        'expectedVersion': expectedVersion,
      },
    );

    return StudyWord.fromJson(data);
  }

  @override
  Future<StudyWord> rollbackReview({
    required int wordId,
    required String targetOperationId,
    required String operationId,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/word/review/rollback',
      body: {
        'wordId': wordId,
        'targetOperationId': targetOperationId,
        'operationId': operationId,
      },
    );

    return StudyWord.fromJson(data);
  }

  @override
  Future<WordLookupEntry> lookup(String word) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/words/lookup',
      body: {'word': word},
    );

    return WordLookupEntry.fromJson(data);
  }

  @override
  Future<GeneratedWordCard> generate(String word, {int? systemBookItemId}) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/words/generate',
      body: {'word': word, 'systemBookItemId': ?systemBookItemId},
    );

    return GeneratedWordCard.fromJson(data);
  }

  @override
  Future<StudyWord> saveCard({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/word/add',
      body: {
        'word': word,
        'phonetic': phonetic,
        'meanings': meanings.map(_meaningToJson).toList(),
      },
    );

    return StudyWord.fromJson(data);
  }

  @override
  Future<HistoryArchive> fetchHistory() async {
    final data = await _client.get<Map<String, dynamic>>('/history');

    return HistoryArchive.fromJson(data);
  }

  /// 保存词卡时后端要完整义项，所以这里把模型字段原样发回去。
  Map<String, Object?> _meaningToJson(WordMeaning meaning) {
    return {
      'partOfSpeech': meaning.partOfSpeech,
      'meaning': meaning.meaning,
      'sceneTitle': meaning.sceneTitle,
      'examples': meaning.examples,
      'explanation': meaning.explanation,
      'imageQueries': const <String>[],
      'example': meaning.examples.isEmpty ? '' : meaning.examples.first,
      'tip': meaning.tip,
    };
  }
}
