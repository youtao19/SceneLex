import '../../../core/network/api_client.dart';
import 'auth_user.dart';

/// 账号相关的接口。登录/注册成功后后端会下发会话 Cookie，
/// Cookie 的保存与回传由 ApiClient 的拦截器负责，这里不碰凭据。
class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  /// 朋友注册要带作者给的访问密钥，后端按密钥给账号有效期。
  Future<AuthUser> register({
    required String email,
    required String password,
    required String inviteCode,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/register',
      body: {'email': email, 'password': password, 'inviteCode': inviteCode},
    );

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'email': email, 'password': password},
    );

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// 启动和恢复时用它校验会话，不靠本地状态自称已登录。
  Future<AuthUser> fetchMe() async {
    final data = await _client.get<Map<String, dynamic>>('/auth/me');

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<AuthUser> updateProfile({required String nickname}) async {
    final data = await _client.patch<Map<String, dynamic>>(
      '/auth/me',
      body: {'nickname': nickname},
    );

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<AuthUser> uploadAvatar({
    required String filePath,
    required String fileName,
  }) async {
    final data = await _client.upload<Map<String, dynamic>>(
      '/auth/me/avatar',
      field: 'avatar',
      filePath: filePath,
      fileName: fileName,
    );

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// 服务端失败也要让本地能退出，所以调用方要吞掉这里的异常。
  Future<void> logout() => _client.postNoContent('/auth/logout');
}
