import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../application/ocr_controller.dart';
import '../data/ocr_api.dart';

/// 拍照/选图识别：多页排序、逐页状态、失败页重试或跳过，最后合并成文章。
/// 原图不压缩不改写，只放应用私有临时目录，退出流程就清掉。
class OcrCapturePage extends ConsumerStatefulWidget {
  const OcrCapturePage({super.key});

  @override
  ConsumerState<OcrCapturePage> createState() => _OcrCapturePageState();
}

class _OcrCapturePageState extends ConsumerState<OcrCapturePage> {
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    if (_busy) {
      return;
    }

    setState(() => _busy = true);

    try {
      final picker = ImagePicker();
      final cameraFile = source == ImageSource.camera
          ? await picker.pickImage(source: ImageSource.camera)
          : null;
      final picked = source == ImageSource.gallery
          ? await picker.pickMultiImage()
          : [?cameraFile];

      if (picked.isNotEmpty) {
        // 不传 imageQuality / maxWidth：插件按原图返回，App 不做压缩。
        await ref.read(ocrFlowProvider.notifier).addPages(
          picked
              .map((file) => OcrPickedImage(path: file.path, fileName: file.name))
              .toList(),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _confirmLeave() async {
    final state = ref.read(ocrFlowProvider);

    if (state.pages.isEmpty) {
      await ref.read(ocrFlowProvider.notifier).clearLocalDrafts();
      return;
    }

    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('离开会丢掉这些照片'),
        content: const Text('未识别的照片不会保留，也不会自动上传。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('留下'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('离开并清理'),
          ),
        ],
      ),
    );

    if (leave == true) {
      await ref.read(ocrFlowProvider.notifier).cancel();
    }
  }

  Future<void> _save() async {
    final articleId = await ref.read(ocrFlowProvider.notifier).saveArticle();

    if (articleId != null && mounted) {
      context.pushReplacement('/reading/article/$articleId');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(ocrFlowProvider);
    final notifier = ref.read(ocrFlowProvider.notifier);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) {
          return;
        }

        await _confirmLeave();

        if (mounted && ref.read(ocrFlowProvider).pages.isEmpty) {
          if (context.mounted) {
            context.pop();
          }
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('拍照识别'),
          actions: [
            IconButton(
              onPressed: state.busy ? null : _save,
              icon: const Icon(Icons.save_outlined),
              tooltip: '保存为文章',
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _pick(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined),
                        label: const Text('从相册选'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _pick(ImageSource.camera),
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: const Text('拍照'),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  '共 ${state.pages.length} 张 · ${(state.totalBytes / 1000000).toStringAsFixed(1)} MB'
                  '（最多 ${OcrLimits.maxPages} 张，单张 20 MB，总共 200 MB）',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (state.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    state.errorMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              Expanded(
                child: state.pages.isEmpty
                    ? const Center(child: Text('还没有照片。可以拍照或从相册选，最多 10 张。'))
                    : ListView.builder(
                        itemCount: state.pages.length,
                        itemBuilder: (context, index) => _PageTile(
                          index: index,
                          page: state.pages[index],
                          busy: state.busy,
                          onMoveUp: () => notifier.moveUp(index),
                          onMoveDown: () => notifier.moveDown(index),
                          onRemove: () => notifier.removeAt(index),
                          onReplace: () => _pick(ImageSource.gallery),
                          onRetry: () => notifier.retryAt(index),
                          onSkip: () => notifier.skipAt(index),
                        ),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed: state.busy || state.pages.isEmpty
                      ? null
                      : () => notifier.recognize(),
                  child: Text(
                    state.batchId == null ? '开始识别' : '继续识别未完成的页',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PageTile extends StatelessWidget {
  const _PageTile({
    required this.index,
    required this.page,
    required this.busy,
    required this.onMoveUp,
    required this.onMoveDown,
    required this.onRemove,
    required this.onReplace,
    required this.onRetry,
    required this.onSkip,
  });

  final int index;
  final OcrDraftPage page;
  final bool busy;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;
  final VoidCallback onRemove;
  final VoidCallback onReplace;
  final VoidCallback onRetry;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(child: Text('${index + 1}')),
      title: Text(_statusLabel(page.status)),
      subtitle: Text(
        page.status == OcrPageStatus.failed && page.error.isNotEmpty
            ? page.error
            : '${(page.draft.byteSize / 1000000).toStringAsFixed(1)} MB',
      ),
      trailing: Wrap(
        children: [
          IconButton(
            onPressed: busy ? null : onMoveUp,
            icon: const Icon(Icons.arrow_upward),
            tooltip: '上移',
          ),
          IconButton(
            onPressed: busy ? null : onMoveDown,
            icon: const Icon(Icons.arrow_downward),
            tooltip: '下移',
          ),
          IconButton(
            onPressed: busy ? null : onReplace,
            icon: const Icon(Icons.swap_horiz),
            tooltip: '换图',
          ),
          if (page.canRetry)
            IconButton(
              onPressed: busy ? null : onRetry,
              icon: const Icon(Icons.refresh),
              tooltip: '重试这一页',
            ),
          if (page.status != OcrPageStatus.success)
            IconButton(
              onPressed: busy ? null : onSkip,
              icon: const Icon(Icons.skip_next),
              tooltip: '跳过这一页',
            ),
          IconButton(
            onPressed: busy ? null : onRemove,
            icon: const Icon(Icons.delete_outline),
            tooltip: '删除',
          ),
        ],
      ),
    );
  }

  String _statusLabel(OcrPageStatus status) {
    return switch (status) {
      OcrPageStatus.pending => '待识别',
      OcrPageStatus.success => '识别成功',
      OcrPageStatus.failed => '识别失败',
      OcrPageStatus.skipped => '已跳过',
    };
  }
}
