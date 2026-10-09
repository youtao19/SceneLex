import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_failure.dart';
import '../application/auth_controller.dart';
import '../data/auth_user.dart';

/// 我的：资料、头像、学习设置/端点入口和退出登录。
class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  bool _busy = false;

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _editNickname(AuthUser user) async {
    final controller = TextEditingController(text: user.nickname);
    final nickname = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('修改昵称'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );

    if (nickname == null || nickname.isEmpty || nickname == user.nickname) {
      return;
    }

    await _run(() => ref.read(authControllerProvider.notifier).updateNickname(nickname));
  }

  /// 头像取相册原图，不做压缩；大小限制由后端判定并给出可读的错误。
  Future<void> _pickAvatar() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);

    if (picked == null) {
      return;
    }

    await _run(
      () => ref
          .read(authControllerProvider.notifier)
          .uploadAvatar(filePath: picked.path, fileName: picked.name),
    );
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('退出后本机不再保留这个账号的登录状态。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('退出'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      return;
    }

    await _run(() => ref.read(authControllerProvider.notifier).logout());
  }

  /// 统一处理提交状态和失败提示，避免每个操作各写一遍。
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) {
      return;
    }

    setState(() => _busy = true);

    try {
      await action();
    } on ApiFailure catch (error) {
      _showMessage(describeFailure(error));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;

    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ListTile(
              leading: _buildAvatar(user),
              title: Text(user.nickname),
              subtitle: Text(user.email),
              trailing: const Icon(Icons.edit_outlined),
              onTap: _busy ? null : () => _editNickname(user),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('更换头像'),
              subtitle: const Text('从相册选原图，App 不做压缩'),
              enabled: !_busy,
              onTap: _pickAvatar,
            ),
            ListTile(
              leading: const Icon(Icons.tune_outlined),
              title: const Text('学习设置与模型端点'),
              enabled: !_busy,
              onTap: () => context.go('/settings'),
            ),
            const Divider(),
            ListTile(
              title: Text('账号状态：${user.accessStatus}'),
              subtitle: Text('有效期至 ${_formatDate(user.accessExpiresAt)}'),
            ),
            ListTile(
              title: Text(user.isVip ? 'VIP：可使用系统端点' : '普通账号'),
              // VIP 只代表能用系统端点，不代表账号一定在有效期内。
              subtitle: const Text('VIP 是端点权限，账号有效期单独判断'),
            ),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: _busy ? null : _logout,
              child: const Text('退出登录'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(AuthUser user) {
    final avatarUrl = user.avatarUrl;

    if (avatarUrl == null || avatarUrl.isEmpty) {
      return const CircleAvatar(child: Icon(Icons.person_outline));
    }

    return CircleAvatar(
      backgroundImage: NetworkImage(AppConfig.absoluteUrl(avatarUrl)),
    );
  }

  String _formatDate(String value) {
    if (value.length < 10) {
      return value;
    }

    return value.substring(0, 10);
  }
}
