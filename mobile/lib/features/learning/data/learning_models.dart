/// 四档评分。名字和后端约定一致（again/hard/good/easy），直接按 name 提交。
enum ReviewRating { again, hard, good, easy }

/// 词卡的一个义项。字段名与后端 `/word/*` 返回保持一致，避免两套命名。
class WordMeaning {
  const WordMeaning({
    required this.partOfSpeech,
    required this.meaning,
    required this.sceneTitle,
    required this.examples,
    required this.explanation,
    required this.tip,
  });

  factory WordMeaning.fromJson(Map<String, dynamic> json) {
    return WordMeaning(
      partOfSpeech: json['partOfSpeech'] as String? ?? '',
      meaning: json['meaning'] as String? ?? '',
      sceneTitle: json['sceneTitle'] as String? ?? '',
      examples: (json['examples'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      explanation: json['explanation'] as String? ?? '',
      tip: json['tip'] as String? ?? '',
    );
  }

  final String partOfSpeech;
  final String meaning;
  final String sceneTitle;
  final List<String> examples;
  final String explanation;
  final String tip;
}

/// 用户自己的词卡（个人 words 表的一行）。
class StudyWord {
  const StudyWord({
    required this.id,
    required this.word,
    required this.phonetic,
    required this.primaryMeaning,
    required this.meanings,
    required this.nextReview,
    required this.reviewCount,
    required this.studyVersion,
    required this.firstLearnedAt,
  });

  factory StudyWord.fromJson(Map<String, dynamic> json) {
    return StudyWord(
      id: (json['id'] as num).toInt(),
      word: json['word'] as String? ?? '',
      phonetic: json['phonetic'] as String? ?? '',
      primaryMeaning: json['primaryMeaning'] as String? ?? '',
      meanings: (json['meanings'] as List<dynamic>? ?? const [])
          .map((item) => WordMeaning.fromJson(item as Map<String, dynamic>))
          .toList(),
      nextReview: json['nextReview'] as String? ?? '',
      reviewCount: (json['reviewCount'] as num? ?? 0).toInt(),
      studyVersion: (json['studyVersion'] as num? ?? 0).toInt(),
      firstLearnedAt: json['firstLearnedAt'] as String?,
    );
  }

  final int id;
  final String word;
  final String phonetic;
  final String primaryMeaning;
  final List<WordMeaning> meanings;
  final String nextReview;
  final int reviewCount;
  final int studyVersion;
  final String? firstLearnedAt;
}

/// 学习概览：新词目标与完成数、当前词书、到期总数和受限队列一起由后端算好。
class StudyOverview {
  const StudyOverview({
    required this.learningDay,
    required this.newWordTarget,
    required this.newWordCompleted,
    required this.currentSystemBookId,
    required this.currentSystemBookName,
    required this.dueTotal,
    required this.queueCount,
    required this.dailyReviewLimitEnabled,
    required this.dailyReviewLimit,
  });

  factory StudyOverview.fromJson(Map<String, dynamic> json) {
    return StudyOverview(
      learningDay: json['learningDay'] as String? ?? '',
      newWordTarget: (json['newWordTarget'] as num? ?? 20).toInt(),
      newWordCompleted: (json['newWordCompleted'] as num? ?? 0).toInt(),
      currentSystemBookId: (json['currentSystemBookId'] as num?)?.toInt(),
      currentSystemBookName: json['currentSystemBookName'] as String?,
      dueTotal: (json['dueTotal'] as num? ?? 0).toInt(),
      queueCount: (json['queueCount'] as num? ?? 0).toInt(),
      dailyReviewLimitEnabled: json['dailyReviewLimitEnabled'] == true,
      dailyReviewLimit: (json['dailyReviewLimit'] as num? ?? 20).toInt(),
    );
  }

  final String learningDay;
  final int newWordTarget;
  final int newWordCompleted;
  final int? currentSystemBookId;
  final String? currentSystemBookName;
  final int dueTotal;
  final int queueCount;
  final bool dailyReviewLimitEnabled;
  final int dailyReviewLimit;

  int get newWordRemaining =>
      newWordTarget - newWordCompleted > 0 ? newWordTarget - newWordCompleted : 0;
}

/// 顺序新词队列里的一项：只带学词需要的最小信息，完整词卡再按需生成。
class NewWordCandidate {
  const NewWordCandidate({
    required this.itemId,
    required this.word,
    required this.orderIndex,
    required this.unit,
  });

  factory NewWordCandidate.fromJson(Map<String, dynamic> json) {
    return NewWordCandidate(
      itemId: (json['itemId'] as num).toInt(),
      word: json['word'] as String? ?? '',
      orderIndex: (json['orderIndex'] as num? ?? 0).toInt(),
      unit: json['unit'] as String? ?? '',
    );
  }

  final int itemId;
  final String word;
  final int orderIndex;
  final String unit;
}

class NewWordQueue {
  const NewWordQueue({
    required this.bookId,
    required this.bookName,
    required this.newWordTarget,
    required this.newWordCompleted,
    required this.remainingTarget,
    required this.words,
  });

  factory NewWordQueue.fromJson(Map<String, dynamic> json) {
    return NewWordQueue(
      bookId: (json['bookId'] as num?)?.toInt(),
      bookName: json['bookName'] as String?,
      newWordTarget: (json['newWordTarget'] as num? ?? 20).toInt(),
      newWordCompleted: (json['newWordCompleted'] as num? ?? 0).toInt(),
      remainingTarget: (json['remainingTarget'] as num? ?? 0).toInt(),
      words: (json['words'] as List<dynamic>? ?? const [])
          .map((item) => NewWordCandidate.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  final int? bookId;
  final String? bookName;
  final int newWordTarget;
  final int newWordCompleted;
  final int remainingTarget;
  final List<NewWordCandidate> words;
}

/// 查词结果只含词典事实；要完整词卡得再调生成接口。
class WordLookupEntry {
  const WordLookupEntry({
    required this.word,
    required this.phonetic,
    required this.meanings,
  });

  factory WordLookupEntry.fromJson(Map<String, dynamic> json) {
    return WordLookupEntry(
      word: json['word'] as String? ?? '',
      phonetic: json['phonetic'] as String? ?? '',
      meanings: (json['meanings'] as List<dynamic>? ?? const [])
          .map((item) {
            final data = item as Map<String, dynamic>;

            return '${data['partOfSpeech'] ?? ''} ${data['meaning'] ?? ''}'.trim();
          })
          .toList(),
    );
  }

  final String word;
  final String phonetic;
  final List<String> meanings;
}

/// 生成结果：完整词卡内容，未保存时 saved 为 false。
class GeneratedWordCard {
  const GeneratedWordCard({
    required this.word,
    required this.phonetic,
    required this.meanings,
  });

  factory GeneratedWordCard.fromJson(Map<String, dynamic> json) {
    return GeneratedWordCard(
      word: json['word'] as String? ?? '',
      phonetic: json['phonetic'] as String? ?? '',
      meanings: (json['meanings'] as List<dynamic>? ?? const [])
          .map((item) => WordMeaning.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  final String word;
  final String phonetic;
  final List<WordMeaning> meanings;
}

/// 历史概览：总数、今日到期、已复习数。
class HistorySummary {
  const HistorySummary({
    required this.totalWords,
    required this.dueToday,
    required this.reviewedWords,
  });

  factory HistorySummary.fromJson(Map<String, dynamic> json) {
    return HistorySummary(
      totalWords: (json['totalWords'] as num? ?? 0).toInt(),
      dueToday: (json['dueToday'] as num? ?? 0).toInt(),
      reviewedWords: (json['reviewedWords'] as num? ?? 0).toInt(),
    );
  }

  final int totalWords;
  final int dueToday;
  final int reviewedWords;
}

class HistoryArchive {
  const HistoryArchive({required this.summary, required this.words});

  factory HistoryArchive.fromJson(Map<String, dynamic> json) {
    return HistoryArchive(
      summary: HistorySummary.fromJson(
        json['summary'] as Map<String, dynamic>? ?? const {},
      ),
      words: (json['words'] as List<dynamic>? ?? const [])
          .map((item) => StudyWord.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  final HistorySummary summary;
  final List<StudyWord> words;
}
