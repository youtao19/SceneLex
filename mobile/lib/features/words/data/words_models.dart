import '../../learning/data/learning_api.dart';

/// 个人单词本。
class WordBook {
  const WordBook({
    required this.id,
    required this.name,
    required this.isDefault,
    required this.wordCount,
  });

  factory WordBook.fromJson(Map<String, dynamic> json) {
    return WordBook(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      isDefault: json['isDefault'] == true,
      wordCount: (json['wordCount'] as num? ?? 0).toInt(),
    );
  }

  final int id;
  final String name;
  final bool isDefault;
  final int wordCount;
}

class WordBookDetail {
  const WordBookDetail({required this.book, required this.words});

  final WordBook book;
  final List<StudyWord> words;
}

/// 系统词书：只读模板，学习进度由个人 words 决定。
class SystemBook {
  const SystemBook({
    required this.id,
    required this.name,
    required this.description,
    required this.totalWords,
    required this.learnedWords,
  });

  factory SystemBook.fromJson(Map<String, dynamic> json) {
    return SystemBook(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      totalWords: (json['totalWords'] as num? ?? 0).toInt(),
      learnedWords: (json['learnedWords'] as num? ?? 0).toInt(),
    );
  }

  final int id;
  final String name;
  final String description;
  final int totalWords;
  final int learnedWords;
}

class SystemBookItem {
  const SystemBookItem({
    required this.id,
    required this.word,
    required this.unit,
    required this.learned,
  });

  factory SystemBookItem.fromJson(Map<String, dynamic> json) {
    return SystemBookItem(
      id: (json['id'] as num).toInt(),
      word: json['word'] as String? ?? '',
      unit: json['unit'] as String? ?? '',
      learned: json['learned'] == true,
    );
  }

  final int id;
  final String word;
  final String unit;
  final bool learned;
}

class SystemBookDetail {
  const SystemBookDetail({required this.book, required this.items});

  factory SystemBookDetail.fromJson(Map<String, dynamic> json) {
    return SystemBookDetail(
      book: SystemBook.fromJson(json),
      items: (json['nextWords'] as List<dynamic>? ?? const [])
          .map((item) => SystemBookItem.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }

  final SystemBook book;
  final List<SystemBookItem> items;
}
