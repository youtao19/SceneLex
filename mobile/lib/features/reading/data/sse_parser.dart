import 'dart:convert';

import '../../../core/network/api_failure.dart';
import 'reading_models.dart';

/// 助手流式事件。只有 `done` 才算服务端确认完成。
sealed class AssistantStreamEvent {
  const AssistantStreamEvent();
}

class UserMessageEvent extends AssistantStreamEvent {
  const UserMessageEvent(this.message);

  final AssistantMessage message;
}

class DeltaEvent extends AssistantStreamEvent {
  const DeltaEvent(this.delta);

  final String delta;
}

class DoneEvent extends AssistantStreamEvent {
  const DoneEvent(this.message);

  final AssistantMessage message;
}

class ErrorEvent extends AssistantStreamEvent {
  const ErrorEvent(this.message);

  final String message;
}

/// 增量解析 SSE：后端每个事件只有一个 data JSON。
/// 分包位置不确定，所以半个事件要留到下一块再拼；流结束时没见到 done 就是断流。
class AssistantStreamParser {
  final StringBuffer _buffer = StringBuffer();
  bool _sawDone = false;

  bool get sawDone => _sawDone;

  /// 喂入一段文本，返回本次能完整解析出来的事件。
  List<AssistantStreamEvent> add(String chunk) {
    _buffer.write(chunk);

    final events = <AssistantStreamEvent>[];
    var text = _buffer.toString();
    var separatorIndex = _findSeparator(text);

    while (separatorIndex != null) {
      final block = text.substring(0, separatorIndex.start);
      text = text.substring(separatorIndex.end);
      events.addAll(_parseBlock(block));
      separatorIndex = _findSeparator(text);
    }

    _buffer
      ..clear()
      ..write(text);

    return events;
  }

  /// 流结束：把残留的最后一块也解析掉，然后检查是否真的收到过 done。
  List<AssistantStreamEvent> finish() {
    final events = _parseBlock(_buffer.toString());
    _buffer.clear();

    if (!_sawDone) {
      throw const StreamIncompleteFailure();
    }

    return events;
  }

  List<AssistantStreamEvent> _parseBlock(String block) {
    final payload = block
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.startsWith('data:'))
        .map((line) => line.substring(5).trim())
        .join('\n');

    if (payload.isEmpty) {
      return const [];
    }

    final event = _decodeEvent(payload);

    if (event is DoneEvent) {
      _sawDone = true;
    }

    return [event];
  }

  AssistantStreamEvent _decodeEvent(String payload) {
    final decoded = jsonDecode(payload) as Map<String, dynamic>;
    final type = decoded['type'] as String? ?? '';

    switch (type) {
      case 'user_message':
        return UserMessageEvent(
          AssistantMessage.fromJson(decoded['message'] as Map<String, dynamic>),
        );
      case 'delta':
        return DeltaEvent(decoded['delta'] as String? ?? '');
      case 'done':
        return DoneEvent(
          AssistantMessage.fromJson(
            decoded['assistantMessage'] as Map<String, dynamic>,
          ),
        );
      case 'error':
        return ErrorEvent(decoded['message'] as String? ?? '助手返回错误');
      default:
        // 未知事件类型不静默丢弃：后端加新事件时前端要立刻看得见。
        return ErrorEvent('未知的流式事件类型：$type');
    }
  }

  /// 兼容 \n\n 与 \r\n\r\n 两种分隔。
  _SeparatorMatch? _findSeparator(String text) {
    final lf = text.indexOf('\n\n');
    final crlf = text.indexOf('\r\n\r\n');

    if (lf == -1 && crlf == -1) {
      return null;
    }

    if (crlf != -1 && (lf == -1 || crlf < lf)) {
      return _SeparatorMatch(crlf, crlf + 4);
    }

    return _SeparatorMatch(lf, lf + 2);
  }
}

class _SeparatorMatch {
  const _SeparatorMatch(this.start, this.end);

  final int start;
  final int end;
}
