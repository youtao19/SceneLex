import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../data/auth_user.dart';

/// 当前登录用户。null 表示未登录；抛错表示“还没法确认”（例如冷启动断网），
/// 界面据此显示重试，而不是把用户当成已登录或已登出。
final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthUser?>(AuthController.new);

class AuthController extends AsyncNotifier<AuthUser?> {
  @override
  Future<AuthUser?> build() async {
    final session = ref.read(sessionCookieStoreProvider);
    final cookie = await session.readCookie();

    if (cookie == null) {
      return null;
    }

    try {
      // 有 Cookie 也要向后端校验：会话可能已经在服务端失效。
      return await ref.read(authApiProvider).fetchMe();
    } on SessionExpiredFailure {
      await session.clear();
      return null;
    } on AccessDeniedFailure {
      // 账号到期或被停用：保留会话以便续期后继续，但当前不算已登录。
      return null;
    }
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(authApiProvider).login(email: email, password: password),
    );
  }

  Future<void> register({
    required String email,
    required String password,
    required String inviteCode,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(authApiProvider).register(
        email: email,
        password: password,
        inviteCode: inviteCode,
      ),
    );
  }

  Future<void> updateNickname(String nickname) async {
    final user = await ref.read(authApiProvider).updateProfile(nickname: nickname);
    state = AsyncValue.data(user);
  }

  Future<void> uploadAvatar({
    required String filePath,
    required String fileName,
  }) async {
    final user = await ref
        .read(authApiProvider)
        .uploadAvatar(filePath: filePath, fileName: fileName);
    state = AsyncValue.data(user);
  }

  /// 登出必须清掉本地凭据：切换账号时不能恢复上一账号的会话和内存内容。
  /// 服务端登出失败也要让本地退出，否则用户会卡在登录态里。
  Future<void> logout() async {
    try {
      await ref.read(authApiProvider).logout();
    } on ApiFailure {
      // 忽略：本地清理才是登出的必要条件。
    }

    await ref.read(sessionCookieStoreProvider).clear();
    state = const AsyncValue.data(null);
  }
}
