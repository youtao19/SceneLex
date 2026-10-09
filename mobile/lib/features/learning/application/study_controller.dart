import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/storage/device_prefs.dart';
import '../../../core/network/operation_id.dart';
import '../data/learning_api.dart';

export '../data/learning_models.dart';

/// 学习模式：新词按词书顺序，复习只看到期词。
enum StudyMode { newWords, review }

/// 一个待学的词。复习词自带内容；新词要先按需生成完整词卡。
class StudyItem {
  const StudyItem.review(StudyWord this.word) : candidate = null;

  const StudyItem.newWord(NewWordCandidate this.candidate) : word = null;

  final StudyWord? word;
  final NewWordCandidate? candidate;

  int? get wordId => word?.id;

  int? get bookItemId => candidate?.itemId;

  String get text => word?.word ?? candidate?.word ?? '';
}

/// 刚提交成功的一次评分，撤销要靠它指向服务端的操作记录。
/// wordId 用提交后拿到的 id：新词在完成前还没有 id，不能拿候选里的 null 去撤销。
class RatedItem {
  const RatedItem({
    required this.item,
    required this.operationId,
    required this.wordId,
  });

  final StudyItem item;
  final String operationId;
  final int wordId;
}

class StudySessionState {
  const StudySessionState({
    this.mode = StudyMode.review,
    this.items = const [],
    this.index = 0,
    this.generated,
    this.generating = false,
    this.revealed = false,
    this.submitting = false,
    this.lastRated,
    this.errorMessage,
    this.restoredPosition = false,
    this.loading = false,
  });

  final StudyMode mode;
  final List<StudyItem> items;
  final int index;

  /// 当前新词生成出来的完整词卡（复习词为 null，直接用 word 里的内容）。
  final GeneratedWordCard? generated;
  final bool generating;
  final bool revealed;
  final bool submitting;
  final RatedItem? lastRated;
  final String? errorMessage;

  /// 是否是从上次没学完的位置继续的，界面要说明这一点。
  final bool restoredPosition;
  final bool loading;

  StudyItem? get current =>
      index >= 0 && index < items.length ? items[index] : null;

  bool get finished => !loading && index >= items.length;

  StudyWord? get currentWord => current?.word;

  /// 正面只显示单词、音标和发音按钮，所以中文释义只在揭晓后才给界面。
  List<WordMeaning> get currentMeanings =>
      current?.word?.meanings ?? generated?.meanings ?? const [];

  String get currentPhonetic => current?.word?.phonetic ?? generated?.phonetic ?? '';

  bool get canUndo => lastRated != null && !submitting;

  StudySessionState copyWith({
    StudyMode? mode,
    List<StudyItem>? items,
    int? index,
    GeneratedWordCard? generated,
    bool clearGenerated = false,
    bool? generating,
    bool? revealed,
    bool? submitting,
    RatedItem? lastRated,
    bool clearLastRated = false,
    String? errorMessage,
    bool clearError = false,
    bool? restoredPosition,
    bool? loading,
  }) {
    return StudySessionState(
      mode: mode ?? this.mode,
      items: items ?? this.items,
      index: index ?? this.index,
      generated: clearGenerated ? null : (generated ?? this.generated),
      generating: generating ?? this.generating,
      revealed: revealed ?? this.revealed,
      submitting: submitting ?? this.submitting,
      lastRated: clearLastRated ? null : (lastRated ?? this.lastRated),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      restoredPosition: restoredPosition ?? this.restoredPosition,
      loading: loading ?? this.loading,
    );
  }
}

final studySessionProvider =
    NotifierProvider<StudySessionController, StudySessionState>(
      StudySessionController.new,
    );

/// 专注学习的状态机：一次只推进一个词，评分必须服务端确认成功才前进。
class StudySessionController extends Notifier<StudySessionState> {
  @override
  StudySessionState build() => const StudySessionState();

  LearningApi get _api => ref.read(learningApiProvider);

  DevicePrefs get _prefs => ref.read(devicePrefsProvider);

  /// 开始学习：先按模式取队列，再校验并应用上次的位置。
  Future<void> start(StudyMode mode, {required int userId}) async {
    state = state.copyWith(loading: true, clearError: true);

    try {
      final items = mode == StudyMode.newWords
          ? (await _api.fetchNewWords())
                .words
                .map(StudyItem.newWord)
                .toList()
          : (await _api.fetchTodayWords()).map(StudyItem.review).toList();

      final position = await _prefs.readStudyPosition(userId);
      final restoredIndex = _resolveRestoredIndex(mode, items, position);

      // 位置对不上（网页已完成、词被删、词书换了）就从头开始，并清掉过期位置。
      if (position != null && restoredIndex == null) {
        await _prefs.clearStudyPosition(userId);
      }

      state = StudySessionState(
        mode: mode,
        items: items,
        index: restoredIndex ?? 0,
        restoredPosition: restoredIndex != null,
      );

      await _prepareCurrent();
    } on ApiFailure catch (error) {
      state = state.copyWith(loading: false, errorMessage: describeFailure(error));
    }
  }

  /// 只有同一个词还在队列里才算能恢复：不能恢复过期任务。
  int? _resolveRestoredIndex(
    StudyMode mode,
    List<StudyItem> items,
    StudyPosition? position,
  ) {
    if (position == null || position.mode != _modeKey(mode)) {
      return null;
    }

    final index = items.indexWhere((item) {
      return mode == StudyMode.newWords
          ? item.bookItemId == position.bookItemId
          : item.wordId == position.wordId;
    });

    return index >= 0 ? index : null;
  }

  String _modeKey(StudyMode mode) =>
      mode == StudyMode.newWords ? 'new' : 'review';

  /// 新词要先生成完整词卡；复习词卡后端已经给了完整内容。
  Future<void> _prepareCurrent() async {
    final current = state.current;

    if (current == null) {
      state = state.copyWith(loading: false, generating: false, clearGenerated: true);

      return;
    }

    if (current.word != null) {
      state = state.copyWith(loading: false, clearGenerated: true);

      return;
    }

    state = state.copyWith(generating: true, clearGenerated: true);

    try {
      final generated = await _api.generate(
        current.text,
        systemBookItemId: current.candidate?.itemId,
      );
      state = state.copyWith(generating: false, generated: generated);
    } on ApiFailure catch (error) {
      state = state.copyWith(generating: false, errorMessage: describeFailure(error));
    }
  }

  void reveal() {
    if (state.current == null || state.revealed) {
      return;
    }

    state = state.copyWith(revealed: true);
  }

  /// 评分：提交期间忽略重复点击，服务端确认成功才进入下一词。
  Future<void> rate(ReviewRating rating, {required int userId}) async {
    final current = state.current;

    if (current == null || state.submitting) {
      return;
    }

    state = state.copyWith(submitting: true, clearError: true);

    final operationId = createOperationId();
    final StudyWord submitted;

    try {
      if (current.word != null) {
        submitted = await _api.reviewWord(
          wordId: current.word!.id,
          rating: rating,
          operationId: operationId,
          expectedVersion: current.word!.studyVersion,
        );
      } else {
        submitted = await _api.completeNewWord(
          word: current.text,
          phonetic: state.generated?.phonetic ?? '',
          meanings: state.generated?.meanings ?? const [],
          rating: rating,
          operationId: operationId,
        );
      }
    } on ApiFailure catch (error) {
      // 失败就留在当前词，明确提示重试，不乐观宣称成功。
      state = state.copyWith(submitting: false, errorMessage: describeFailure(error));

      return;
    }

    // 完成新词后把这一项换成复习词卡：撤销后再评分要走 /word/review，
    // 否则会被“完成新词”的首次完成判断吞掉，评分看起来没生效。
    final items = [...state.items];

    if (current.word == null) {
      items[state.index] = StudyItem.review(submitted);
    }

    state = state.copyWith(
      submitting: false,
      items: items,
      index: state.index + 1,
      revealed: false,
      clearGenerated: true,
      lastRated: RatedItem(
        item: items[state.index],
        operationId: operationId,
        wordId: submitted.id,
      ),
      restoredPosition: false,
    );

    await _savePosition(userId);
    await _prepareCurrent();
  }

  /// 撤销上一词评分：必须服务端确认成功，才把卡片退回上一词。
  Future<void> undoLast({required int userId}) async {
    final lastRated = state.lastRated;

    if (lastRated == null || state.submitting) {
      return;
    }

    state = state.copyWith(submitting: true, clearError: true);

    final StudyWord restored;

    try {
      restored = await _api.rollbackReview(
        wordId: lastRated.wordId,
        targetOperationId: lastRated.operationId,
        operationId: createOperationId(),
      );
    } on ApiFailure catch (error) {
      state = state.copyWith(submitting: false, errorMessage: describeFailure(error));

      return;
    }

    // 撤销本身会让服务端版本 +1，必须用返回的卡片刷新队列项，
    // 否则用户重新评分时会拿旧版本提交，直接被判成双端冲突。
    final restoredIndex = state.index - 1;
    final items = [...state.items];

    if (restoredIndex >= 0 && items[restoredIndex].word != null) {
      items[restoredIndex] = StudyItem.review(restored);
    }

    state = state.copyWith(
      submitting: false,
      items: items,
      index: restoredIndex,
      revealed: true,
      clearLastRated: true,
      clearGenerated: true,
    );

    await _savePosition(userId);
  }

  /// 离开学习流程时清掉位置：下次进来重新按到期/顺序开始。
  Future<void> clearPosition(int userId) async {
    await _prefs.clearStudyPosition(userId);
    state = state.copyWith(restoredPosition: false);
  }

  Future<void> _savePosition(int userId) async {
    final current = state.current;

    if (current == null) {
      // 学完这一轮就把位置清掉，避免下次恢复到一个已完成的词。
      await _prefs.clearStudyPosition(userId);

      return;
    }

    await _prefs.saveStudyPosition(
      userId,
      StudyPosition(
        mode: _modeKey(state.mode),
        wordId: current.wordId,
        bookItemId: current.bookItemId,
      ),
    );
  }
}
