/// 阅读文章。正文由服务端保存，移动端不做离线词库。
class ReadingArticle {
  const ReadingArticle({
    required this.id,
    required this.title,
    required this.content,
    required this.charCount,
    required this.updatedAt,
  });

  factory ReadingArticle.fromJson(Map<String, dynamic> json) {
    return ReadingArticle(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      content: json['content'] as String? ?? '',
      charCount: (json['charCount'] as num? ?? 0).toInt(),
      updatedAt: json['updatedAt'] as String? ?? '',
    );
  }

  final int id;
  final String title;
  final String content;
  final int charCount;
  final String updatedAt;
}

/// 助手会话：绑定一篇文章（articleId 可能为空，表示纯文本提问）。
class AssistantChat {
  const AssistantChat({
    required this.id,
    required this.title,
    required this.articleContent,
    required this.articleId,
  });

  factory AssistantChat.fromJson(Map<String, dynamic> json) {
    return AssistantChat(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      articleContent: json['articleContent'] as String? ?? '',
      articleId: (json['articleId'] as num?)?.toInt(),
    );
  }

  final int id;
  final String title;
  final String articleContent;
  final int? articleId;
}

class AssistantMessage {
  const AssistantMessage({
    required this.id,
    required this.role,
    required this.content,
  });

  factory AssistantMessage.fromJson(Map<String, dynamic> json) {
    return AssistantMessage(
      id: (json['id'] as num).toInt(),
      role: json['role'] as String? ?? 'assistant',
      content: json['content'] as String? ?? '',
    );
  }

  final int id;
  final String role;
  final String content;

  bool get isUser => role == 'user';
}

/// 提问模式：整篇文章或某个句子。
enum AssistantQuestionMode { article, sentence }
