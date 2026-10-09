import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 验证真机上 POST + SSE 会不会被整段缓冲：阅读助手要靠逐字到达判断进度，
/// 一次性收到全部内容就说明客户端栈把流缓存了，需要改连接方式。
/// 用设备自己的回环服务器代替后端，不碰生产账号；同时验证断流（没有 done）能否被识别。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('POST 的 SSE 响应能逐段到达，断流可被识别', (tester) async {
    var serverFinishedAt = DateTime.now();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final response = request.response;
      response.headers.contentType = ContentType('text', 'event-stream');
      response.bufferOutput = false;

      if (request.uri.path == '/truncated') {
        response.write('data: {"type":"delta","text":"half"}\n\n');
        await response.flush();
        await response.close();
        return;
      }

      response.write('data: {"type":"user_message"}\n\n');
      await response.flush();
      await Future<void>.delayed(const Duration(milliseconds: 400));
      response.write('data: {"type":"delta","text":"a"}\n\n');
      await response.flush();
      await Future<void>.delayed(const Duration(milliseconds: 400));
      response.write('data: {"type":"done"}\n\n');
      await response.close();
      serverFinishedAt = DateTime.now();
    });

    final dio = Dio(
      BaseOptions(
        // SSE 是长连接，整体响应超时给足；逐段到达靠下面的时间戳判断。
        receiveTimeout: const Duration(seconds: 20),
        sendTimeout: const Duration(seconds: 10),
      ),
    );
    final base = 'http://127.0.0.1:${server.port}';
    final evidence = <String, Object?>{
      'chunksReceived': 0,
      'firstChunkBeforeServerFinished': false,
      'sawDone': false,
      'truncatedSawEofWithoutDone': false,
    };

    try {
      final received = <String>[];
      DateTime? firstChunkAt;

      final response = await dio.post<ResponseBody>(
        '$base/stream',
        data: {'type': 'article'},
        options: Options(responseType: ResponseType.stream),
      );
      await for (final text in response.data!.stream
          .cast<List<int>>()
          .transform(utf8.decoder)) {
        firstChunkAt ??= DateTime.now();
        received.add(text);
      }

      final joined = received.join();
      evidence['chunksReceived'] = received.length;
      evidence['firstChunkBeforeServerFinished'] =
          firstChunkAt != null && firstChunkAt.isBefore(serverFinishedAt);
      evidence['sawDone'] = joined.contains('"type":"done"');

      final truncated = await dio.post<ResponseBody>(
        '$base/truncated',
        data: {'type': 'article'},
        options: Options(responseType: ResponseType.stream),
      );
      final truncatedText = await truncated.data!.stream
          .cast<List<int>>()
          .transform(utf8.decoder)
          .join();
      // 没有 done 就结束，必须能和正常完成区分开，否则会显示成完整回答。
      evidence['truncatedSawEofWithoutDone'] =
          !truncatedText.contains('"type":"done"');

      // 先落盘再断言：断言失败时也能从文件看到到底哪一步没成。
      await _writeEvidence(evidence);

      expect(evidence['chunksReceived'], greaterThan(1));
      expect(evidence['firstChunkBeforeServerFinished'], isTrue);
      expect(evidence['sawDone'], isTrue);
      expect(evidence['truncatedSawEofWithoutDone'], isTrue);
    } finally {
      dio.close(force: true);
      await server.close(force: true);
    }

    // 只输出布尔和计数结果，不包含文章或回复内容。
    // ignore: avoid_print
    print('SSE_PROBE: ${jsonEncode(evidence)}');
  });
}

/// standalone 启动时 print 不会进 logcat，只能把证据写进应用私有目录用 adb 读。
Future<void> _writeEvidence(Map<String, Object?> evidence) async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/sse_probe_evidence.json');
  await file.writeAsString(jsonEncode(evidence));
}
