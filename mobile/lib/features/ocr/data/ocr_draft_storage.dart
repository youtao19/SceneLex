import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// 选进来的原图只放应用私有临时目录：不自动进相册，也不放公共目录。
/// 拷贝一份是为了不依赖选图插件的缓存生命周期，退出流程时能自己清干净。
abstract class OcrDraftStorage {
  Future<OcrDraftFile> importImage(String sourcePath, String fileName);

  Future<void> removeDraft(String path);

  /// 启动时清残留：上次异常退出留下的草稿不该一直占着空间。
  Future<int> cleanupStaleDrafts();
}

class OcrDraftFile {
  const OcrDraftFile({
    required this.path,
    required this.fileName,
    required this.byteSize,
  });

  final String path;
  final String fileName;
  final int byteSize;
}

class FileOcrDraftStorage implements OcrDraftStorage {
  static const _folderName = 'ocr-drafts';

  Future<Directory> _draftsDir() async {
    final base = await getTemporaryDirectory();
    final dir = Directory('${base.path}/$_folderName');

    if (!dir.existsSync()) {
      await dir.create(recursive: true);
    }

    return dir;
  }

  @override
  Future<OcrDraftFile> importImage(String sourcePath, String fileName) async {
    final dir = await _draftsDir();
    final target = File(
      '${dir.path}/${DateTime.now().microsecondsSinceEpoch}-$fileName',
    );

    // 原图不压缩、不改写：直接按字节拷贝。
    await File(sourcePath).copy(target.path);

    return OcrDraftFile(
      path: target.path,
      fileName: fileName,
      byteSize: await target.length(),
    );
  }

  @override
  Future<void> removeDraft(String path) async {
    await File(path).delete().catchError((_) => File(path));
  }

  @override
  Future<int> cleanupStaleDrafts() async {
    final dir = await _draftsDir();
    var removed = 0;

    await for (final entity in dir.list()) {
      if (entity is File) {
        await entity.delete();
        removed += 1;
      }
    }

    return removed;
  }
}
