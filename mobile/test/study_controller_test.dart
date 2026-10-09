import 'package:app/app/providers.dart';
import 'package:app/core/network/api_failure.dart';
import 'package:app/core/storage/device_prefs.dart';
import 'package:app/features/learning/application/study_controller.dart';
import 'package:app/features/learning/data/learning_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// 学习状态机必须真跑逻辑：防连点、提交失败不前进、撤销只认服务端操作、恢复要校验。
void main() {
  test('提交期间再点评分会被忽略，只发一次请求', () async {
    final api = _FakeLearningApi()..reviewDelay = const Duration(milliseconds: 50);
    final container = _buildContainer(api);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);
    container.read(studySessionProvider.notifier).reveal();

    final first = container
        .read(studySessionProvider.notifier)
        .rate(ReviewRating.good, userId: 1);
    // 第一次还没返回就再点一次：必须被忽略。
    await container
        .read(studySessionProvider.notifier)
        .rate(ReviewRating.good, userId: 1);
    await first;

    expect(api.reviewCalls, 1);
    expect(container.read(studySessionProvider).index, 1);
  });

  test('评分失败时留在当前词并给出提示，不前进', () async {
    final api = _FakeLearningApi()..reviewFailure = const NetworkFailure();
    final container = _buildContainer(api);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    final state = container.read(studySessionProvider);

    expect(state.index, 0);
    expect(state.submitting, isFalse);
    expect(state.errorMessage, isNotNull);
    expect(state.lastRated, isNull);
  });

  test('评分成功才前进，并把下一个词的位置存下来', () async {
    final api = _FakeLearningApi();
    final store = _InMemoryKeyValueStore();
    final container = _buildContainer(api, store: store);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 7);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 7);

    expect(container.read(studySessionProvider).index, 1);
    final saved = await DevicePrefs(store).readStudyPosition(7);

    expect(saved?.wordId, 2);
    expect(saved?.mode, 'review');
    expect(saved?.bookItemId, isNull);
  });

  test('撤销用服务端记录的 operationId，并把卡片退回上一词', () async {
    final api = _FakeLearningApi();
    final container = _buildContainer(api);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);
    final ratedOperationId = container.read(studySessionProvider).lastRated?.operationId;

    await container.read(studySessionProvider.notifier).undoLast(userId: 1);

    expect(api.rollbackTargetOperationId, ratedOperationId);
    final state = container.read(studySessionProvider);

    expect(state.index, 0);
    expect(state.revealed, isTrue);
    expect(state.lastRated, isNull);
  });

  test('另一端改过导致撤销失败时，保持当前状态并提示', () async {
    final api = _FakeLearningApi()
      ..rollbackFailure = const RequestFailure(409, '这条记录之后已被其他操作更新，不能再撤销');
    final container = _buildContainer(api);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);
    await container.read(studySessionProvider.notifier).undoLast(userId: 1);

    final state = container.read(studySessionProvider);

    expect(state.index, 1);
    expect(state.errorMessage, contains('不能再撤销'));
  });

  test('位置还在队列里就恢复，不在就从头开始并清掉过期位置', () async {
    final api = _FakeLearningApi();
    final store = _InMemoryKeyValueStore();
    final prefs = DevicePrefs(store);

    await prefs.saveStudyPosition(
      1,
      const StudyPosition(mode: 'review', wordId: 3),
    );
    final restored = _buildContainer(api, store: store);

    await restored.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);

    expect(restored.read(studySessionProvider).index, 2);
    expect(restored.read(studySessionProvider).restoredPosition, isTrue);

    // 换成一个队列里没有的词：属于过期任务，必须从头开始并清掉。
    await prefs.saveStudyPosition(
      1,
      const StudyPosition(mode: 'review', wordId: 999),
    );
    final stale = _buildContainer(api, store: store);

    await stale.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);

    expect(stale.read(studySessionProvider).index, 0);
    expect(stale.read(studySessionProvider).restoredPosition, isFalse);
    expect(await prefs.readStudyPosition(1), isNull);
  });

  test('模式不一致时不恢复（新词位置不能拿去恢复复习）', () async {
    final api = _FakeLearningApi();
    final store = _InMemoryKeyValueStore();

    await DevicePrefs(store).saveStudyPosition(
      1,
      const StudyPosition(mode: 'new', bookItemId: 12),
    );
    final container = _buildContainer(api, store: store);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);

    expect(container.read(studySessionProvider).index, 0);
  });

  test('换账号不恢复上一账号的位置', () async {
    final api = _FakeLearningApi();
    final store = _InMemoryKeyValueStore();

    await DevicePrefs(store).saveStudyPosition(
      1,
      const StudyPosition(mode: 'review', wordId: 3),
    );
    final container = _buildContainer(api, store: store);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 2);

    expect(container.read(studySessionProvider).index, 0);
  });

  test('新词先按需生成词卡，完成时提交生成出来的内容', () async {
    final api = _FakeLearningApi();
    final container = _buildContainer(api);

    await container
        .read(studySessionProvider.notifier)
        .start(StudyMode.newWords, userId: 1);

    expect(api.generateCalls, 1);
    expect(api.lastSystemBookItemId, 11);
    expect(container.read(studySessionProvider).generated?.meanings, isNotEmpty);

    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    expect(api.completedWords, ['alpha']);
    expect(api.completedPhonetic, '/ˈælfə/');
  });

  test('新词完成后撤销用完成后的 wordId，再评分改走复习接口', () async {
    final api = _FakeLearningApi();
    final container = _buildContainer(api);

    await container
        .read(studySessionProvider.notifier)
        .start(StudyMode.newWords, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    // 撤销：新词在完成前没有 id，必须用后端返回的 99。
    await container.read(studySessionProvider.notifier).undoLast(userId: 1);

    expect(api.rollbackWordId, 99);
    expect(container.read(studySessionProvider).index, 0);

    // 再评一次要走 /word/review，并且用撤销返回的新版本，否则会被判成双端冲突。
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    expect(api.reviewCalls, 1);
    expect(api.lastExpectedVersion, 4);
  });

  test('新词模式按词条 id 记位置，重新进入能接着学', () async {
    final api = _FakeLearningApi();
    final store = _InMemoryKeyValueStore();
    final container = _buildContainer(api, store: store);

    await container
        .read(studySessionProvider.notifier)
        .start(StudyMode.newWords, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    final saved = await DevicePrefs(store).readStudyPosition(1);

    // 新词没有个人词 id，必须用词条 id 记住位置。
    expect(saved?.mode, 'new');
    expect(saved?.wordId, isNull);
    expect(saved?.bookItemId, 12);

    final restored = _buildContainer(api, store: store);

    await restored.read(studySessionProvider.notifier).start(StudyMode.newWords, userId: 1);

    expect(restored.read(studySessionProvider).index, 1);
    expect(restored.read(studySessionProvider).restoredPosition, isTrue);
  });

  test('一轮学完后清掉位置，下次不再恢复已完成的词', () async {
    final api = _FakeLearningApi()..reviewWords = [_reviewWord(1)];
    final store = _InMemoryKeyValueStore();
    final container = _buildContainer(api, store: store);

    await container.read(studySessionProvider.notifier).start(StudyMode.review, userId: 1);
    await container.read(studySessionProvider.notifier).rate(ReviewRating.good, userId: 1);

    expect(container.read(studySessionProvider).finished, isTrue);
    expect(await DevicePrefs(store).readStudyPosition(1), isNull);
  });
}

ProviderContainer _buildContainer(_FakeLearningApi api, {KeyValueStore? store}) {
  return ProviderContainer(
    overrides: [
      learningApiProvider.overrideWithValue(api),
      devicePrefsProvider.overrideWithValue(
        DevicePrefs(store ?? _InMemoryKeyValueStore()),
      ),
    ],
  );
}

class _InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _values.remove(key);
  }
}

StudyWord _reviewWord(int id) {
  return StudyWord(
    id: id,
    word: 'word$id',
    phonetic: '/w$id/',
    primaryMeaning: '意思$id',
    meanings: const [],
    nextReview: '2026-10-01',
    reviewCount: 1,
    studyVersion: 3,
    firstLearnedAt: '2026-09-01T00:00:00.000Z',
  );
}

class _FakeLearningApi implements LearningApi {
  List<StudyWord> reviewWords = [_reviewWord(1), _reviewWord(2), _reviewWord(3)];
  Duration reviewDelay = Duration.zero;
  ApiFailure? reviewFailure;
  ApiFailure? rollbackFailure;
  int reviewCalls = 0;
  int generateCalls = 0;
  int? lastSystemBookItemId;
  String? rollbackTargetOperationId;
  int? rollbackWordId;
  int? lastExpectedVersion;
  final List<String> completedWords = [];
  String? completedPhonetic;

  @override
  Future<StudyOverview> fetchOverview() async {
    return const StudyOverview(
      learningDay: '2026-10-09',
      newWordTarget: 20,
      newWordCompleted: 0,
      currentSystemBookId: 1,
      currentSystemBookName: '测试词书',
      dueTotal: 3,
      queueCount: 3,
      dailyReviewLimitEnabled: false,
      dailyReviewLimit: 20,
    );
  }

  @override
  Future<NewWordQueue> fetchNewWords({int? limit}) async {
    return const NewWordQueue(
      bookId: 1,
      bookName: '测试词书',
      newWordTarget: 20,
      newWordCompleted: 0,
      remainingTarget: 20,
      words: [
        NewWordCandidate(itemId: 11, word: 'alpha', orderIndex: 1, unit: 'U1'),
        NewWordCandidate(itemId: 12, word: 'beta', orderIndex: 2, unit: 'U1'),
      ],
    );
  }

  @override
  Future<GeneratedWordCard> generate(String word, {int? systemBookItemId}) async {
    generateCalls += 1;
    lastSystemBookItemId = systemBookItemId;

    return GeneratedWordCard(
      word: word,
      phonetic: '/ˈælfə/',
      meanings: const [
        WordMeaning(
          partOfSpeech: 'n.',
          meaning: '第一个',
          sceneTitle: '测试场景',
          examples: ['alpha test'],
          explanation: '解释',
          tip: '提示',
        ),
      ],
    );
  }

  @override
  Future<StudyWord> completeNewWord({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
    required ReviewRating rating,
    required String operationId,
  }) async {
    completedWords.add(word);
    completedPhonetic = phonetic;

    return _reviewWord(99);
  }

  @override
  Future<List<StudyWord>> fetchTodayWords() async => reviewWords;

  @override
  Future<StudyWord> reviewWord({
    required int wordId,
    required ReviewRating rating,
    required String operationId,
    required int expectedVersion,
  }) async {
    reviewCalls += 1;
    lastExpectedVersion = expectedVersion;

    if (reviewDelay > Duration.zero) {
      await Future<void>.delayed(reviewDelay);
    }

    if (reviewFailure != null) {
      throw reviewFailure!;
    }

    return _reviewWord(wordId);
  }

  @override
  Future<StudyWord> rollbackReview({
    required int wordId,
    required String targetOperationId,
    required String operationId,
  }) async {
    rollbackTargetOperationId = targetOperationId;
    rollbackWordId = wordId;

    if (rollbackFailure != null) {
      throw rollbackFailure!;
    }

    // 撤销会让服务端版本 +1，这里模拟返回刷新后的卡片。
    return StudyWord(
      id: wordId,
      word: 'word$wordId',
      phonetic: '/w$wordId/',
      primaryMeaning: '意思$wordId',
      meanings: const [],
      nextReview: '2026-10-01',
      reviewCount: 0,
      studyVersion: 4,
      firstLearnedAt: null,
    );
  }

  @override
  Future<WordLookupEntry> lookup(String word) async {
    return WordLookupEntry(word: word, phonetic: '/x/', meanings: const ['n. 测试']);
  }

  @override
  Future<StudyWord> saveCard({
    required String word,
    required String phonetic,
    required List<WordMeaning> meanings,
  }) async {
    return _reviewWord(98);
  }

  @override
  Future<HistoryArchive> fetchHistory() async {
    return HistoryArchive(
      summary: const HistorySummary(totalWords: 3, dueToday: 1, reviewedWords: 2),
      words: reviewWords,
    );
  }
}
