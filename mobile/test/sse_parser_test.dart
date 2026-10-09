import 'package:app/core/network/api_failure.dart';
import 'package:app/features/reading/data/sse_parser.dart';
import 'package:flutter_test/flutter_test.dart';

/// 流式完成判定是这一块最容易被改错的地方：
/// 只有收到 done 才算完成，连接正常结束但没有 done 必须当断流。
void main() {
  String frame(String payload) => 'data: $payload\n\n';

  test('按事件解析 user_message / delta / done', () {
    final parser = AssistantStreamParser();

    final events = parser.add(
      frame('{"type":"user_message","message":{"id":1,"role":"user","content":"问题"}}') +
          frame('{"type":"delta","delta":"你"}') +
          frame('{"type":"delta","delta":"好"}') +
          frame('{"type":"done","assistantMessage":{"id":2,"role":"assistant","content":"你好"}}'),
    );

    expect(events.length, 4);
    expect((events[0] as UserMessageEvent).message.content, '问题');
    expect((events[1] as DeltaEvent).delta, '你');
    expect((events[3] as DoneEvent).message.content, '你好');
    expect(parser.sawDone, isTrue);
    expect(parser.finish(), isEmpty);
  });

  test('事件被拆到两次分包也能拼回来', () {
    final parser = AssistantStreamParser();
    final payload = frame('{"type":"delta","delta":"半个事件"}');

    // 故意从中间切开：解析器必须把半个事件留到下一块。
    final firstHalf = parser.add(payload.substring(0, 20));
    final secondHalf = parser.add(payload.substring(20));

    expect(firstHalf, isEmpty);
    expect(secondHalf.length, 1);
    expect((secondHalf.single as DeltaEvent).delta, '半个事件');
  });

  test('连接结束但没收到 done 就是断流，不能当完成', () {
    final parser = AssistantStreamParser();

    parser.add(frame('{"type":"delta","delta":"只到了一半"}'));

    expect(parser.finish, throwsA(isA<StreamIncompleteFailure>()));
  });

  test('error 事件原样带出后端的话', () {
    final parser = AssistantStreamParser();

    final events = parser.add(frame('{"type":"error","message":"模型超时"}'));

    expect((events.single as ErrorEvent).message, '模型超时');
  });

  test('未知事件类型不静默丢弃', () {
    final parser = AssistantStreamParser();

    final events = parser.add(frame('{"type":"surprise","value":1}'));

    expect(events.single, isA<ErrorEvent>());
  });

  test('兼容 CRLF 分隔与空块', () {
    final parser = AssistantStreamParser();

    final events = parser.add(
      'data: {"type":"delta","delta":"a"}\r\n\r\n\r\ndata: {"type":"delta","delta":"b"}\r\n\r\n',
    );

    expect(events.length, 2);
    expect((events[1] as DeltaEvent).delta, 'b');
  });
}
