/// 账号信息。VIP 只是“能用系统端点”的权限，和账号是否有效是两件事，
/// 所以这里只存后端给的事实，不自己推导权限。
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.nickname,
    required this.role,
    required this.isVip,
    required this.accessStatus,
    required this.accessExpiresAt,
    this.avatarUrl,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: (json['id'] as num).toInt(),
      email: json['email'] as String? ?? '',
      nickname: json['nickname'] as String? ?? '',
      role: json['role'] as String? ?? 'user',
      isVip: json['isVip'] == true,
      accessStatus: json['accessStatus'] as String? ?? 'active',
      accessExpiresAt: json['accessExpiresAt'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  final int id;
  final String email;
  final String nickname;
  final String role;
  final bool isVip;
  final String accessStatus;
  final String accessExpiresAt;
  final String? avatarUrl;

  bool get isAdmin => role == 'admin';
}
