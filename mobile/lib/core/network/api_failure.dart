/// 网络层只暴露这几类失败，界面按类型给出不同的下一步，而不是自己解析 HTTP 码。
sealed class ApiFailure implements Exception {
  const ApiFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// 断网、超时、连接被拒：保留当前页面并给重试入口，绝不能伪装成空数据。
class NetworkFailure extends ApiFailure {
  const NetworkFailure([super.message = '网络不可用，请检查连接后重试']);
}

/// 401：会话失效，必须重新登录；不自动重放上传、评分等写入。
class SessionExpiredFailure extends ApiFailure {
  const SessionExpiredFailure([super.message = '登录状态已失效，请重新登录']);
}

/// 403：账号到期、停用或没有权限，引导联系管理员，不删云端数据。
class AccessDeniedFailure extends ApiFailure {
  const AccessDeniedFailure(super.message);
}

/// 其他后端错误：把后端的话原样带给用户，别在前端另编一套说法。
class RequestFailure extends ApiFailure {
  const RequestFailure(this.statusCode, super.message);

  final int statusCode;
}

/// 界面统一用它把异常变成一句话；非预期异常给兜底文案，不把堆栈丢给用户。
String describeFailure(Object? error) {
  if (error is ApiFailure) {
    return error.message;
  }

  return '操作失败，请稍后重试';
}
