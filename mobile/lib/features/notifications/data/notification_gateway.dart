import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// 通知统一从这里出：本地通知只在客户端观察到完成时触发，
/// 不承诺 App 被关闭后还能执行或送达。
abstract class NotificationGateway {
  Future<void> initialize();

  /// 权限被拒不影响学习，设置页只负责显示状态和引导。
  Future<bool> requestPermission();

  Future<bool> permissionGranted();

  Future<void> scheduleDailyReminder({
    required tz.TZDateTime at,
    required String title,
    required String body,
  });

  Future<void> cancelReminder();

  /// 三类完成通知：OCR、词卡生成、助手回复。
  Future<void> showCompletion({required String title, required String body});

  /// 登出时清掉：换账号后不能还看到上一个账号的提醒和通知。
  Future<void> cancelAll();

  /// 通知点击的跳转目标（payload 是客户端自己的路由）。
  void onTapRoute(void Function(String route) handler);
}

class LocalNotificationGateway implements NotificationGateway {
  LocalNotificationGateway({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const _reminderId = 1001;
  static const _completionId = 2001;
  static const _channelId = 'scenelex';

  final FlutterLocalNotificationsPlugin _plugin;
  void Function(String route)? _onTapRoute;
  bool _initialized = false;

  /// 插件和时区必须就绪才能排期；做成幂等，免得依赖调用顺序。
  Future<void> _ensureInitialized() async {
    if (_initialized) {
      return;
    }

    await initialize();
    _initialized = true;
  }

  @override
  Future<void> initialize() async {
    tz_data.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Shanghai'));

    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;

        if (payload != null && payload.isNotEmpty) {
          _onTapRoute?.call(payload);
        }
      },
    );
  }

  @override
  Future<bool> requestPermission() async {
    await _ensureInitialized();

    final android = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    return await android?.requestNotificationsPermission() ?? true;
  }

  @override
  Future<bool> permissionGranted() async {
    await _ensureInitialized();

    final android = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    return await android?.areNotificationsEnabled() ?? true;
  }

  /// 不申请精确闹钟权限：vivo 上可能延迟，规格也不要求准时。
  @override
  Future<void> scheduleDailyReminder({
    required tz.TZDateTime at,
    required String title,
    required String body,
  }) async {
    await _ensureInitialized();

    await _plugin.zonedSchedule(
      id: _reminderId,
      title: title,
      body: body,
      scheduledDate: at,
      notificationDetails: _details(),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: '/study',
    );
  }

  @override
  Future<void> cancelReminder() => _plugin.cancel(id: _reminderId);

  @override
  Future<void> showCompletion({required String title, required String body}) async {
    await _ensureInitialized();

    return _plugin.show(
      id: _completionId,
      title: title,
      body: body,
      notificationDetails: _details(),
      payload: '/study',
    );
  }

  @override
  Future<void> cancelAll() => _plugin.cancelAll();

  @override
  void onTapRoute(void Function(String route) handler) {
    _onTapRoute = handler;
  }

  NotificationDetails _details() {
    return const NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        'SceneLex 通知',
        channelDescription: '学习提醒与完成通知',
        importance: Importance.high,
        priority: Priority.high,
      ),
    );
  }
}
