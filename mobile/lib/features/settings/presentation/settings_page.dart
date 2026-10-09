import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/api_failure.dart';
import '../../auth/application/auth_controller.dart';
import '../../learning/application/study_providers.dart';
import '../../notifications/application/reminder_controller.dart';
import '../data/settings_models.dart';

const _newWordTargetMin = 0;
const _newWordTargetMax = 200;
const _reviewLimitMin = 1;
const _reviewLimitMax = 200;

/// 学习设置与模型端点。两端共用同一份服务端设置，改完立即生效。
class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  EndpointListData? _endpoints;
  LearningSettings? _learning;
  List<SystemWordBookSummary> _books = const [];
  bool _loading = true;
  bool _busy = false;
  String? _errorMessage;
  int? _newWordTarget;
  int? _reviewLimit;

  @override
  void initState() {
    super.initState();
    _load();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final userId = ref.read(authControllerProvider).value?.id;

      if (userId != null) {
        ref.read(reminderProvider.notifier).loadForUser(userId);
      }
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final api = ref.read(settingsApiProvider);

    try {
      final results = await Future.wait([
        api.fetchEndpoints(),
        api.fetchLearningSettings(),
        api.fetchSystemWordBooks(),
      ]);

      if (!mounted) {
        return;
      }

      final learning = results[1] as LearningSettings;
      setState(() {
        _endpoints = results[0] as EndpointListData;
        _learning = learning;
        _books = results[2] as List<SystemWordBookSummary>;
        _newWordTarget = learning.dailyNewWordTarget;
        _reviewLimit = learning.dailyReviewLimit;
        _loading = false;
      });
    } on ApiFailure catch (error) {
      if (!mounted) {
        return;
      }

      // 失败要显示错误和重试，不能当成“没有数据”。
      setState(() {
        _errorMessage = describeFailure(error);
        _loading = false;
      });
    }
  }

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

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

  Future<void> _saveNewWordTarget(int value) => _run(() async {
    final updated = await ref
        .read(settingsApiProvider)
        .updateLearningSettings(dailyNewWordTarget: value);

    setState(() => _learning = updated);
  });

  Future<void> _saveCurrentBook(int? bookId) => _run(() async {
    final updated = await ref
        .read(settingsApiProvider)
        .updateLearningSettings(currentSystemBookId: bookId);

    setState(() => _learning = updated);
  });

  Future<void> _saveReviewLimit({bool? enabled, int? limit}) => _run(() async {
    final updated = await ref.read(settingsApiProvider).updateLearningSettings(
      dailyReviewLimitEnabled: enabled,
      dailyReviewLimit: limit,
    );

    setState(() => _learning = updated);
  });

  Future<void> _testEndpoint(AiEndpoint endpoint) => _run(() async {
    final result = await ref.read(settingsApiProvider).testSavedEndpoint(endpoint.id);

    _showMessage('${endpoint.label}：${result.message}');
  });

  Future<void> _setDefault(AiEndpoint endpoint) => _run(() async {
    await ref.read(settingsApiProvider).setDefaultEndpoint(endpoint.id);
    await _load();
  });

  Future<void> _deleteEndpoint(AiEndpoint endpoint) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('删除 ${endpoint.label}'),
        content: const Text('删除后用它生成的内容不受影响，但这个端点不能再选。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      return;
    }

    await _run(() async {
      await ref.read(settingsApiProvider).deleteEndpoint(endpoint.id);
      await _load();
    });
  }

  Future<void> _openEndpointDialog({AiEndpoint? endpoint}) async {
    final result = await showDialog<EndpointFormResult>(
      context: context,
      builder: (context) => _EndpointDialog(endpoint: endpoint),
    );

    if (result == null) {
      return;
    }

    await _run(() async {
      final api = ref.read(settingsApiProvider);

      if (endpoint == null) {
        await api.createEndpoint(
          label: result.label,
          baseUrl: result.baseUrl,
          model: result.model,
          visionModel: result.visionModel,
          apiKey: result.apiKey,
        );
      } else {
        await api.updateEndpoint(
          endpoint.id,
          label: result.label,
          baseUrl: result.baseUrl,
          model: result.model,
          visionModel: result.visionModel,
          apiKey: result.apiKey,
        );
      }

      await _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('学习设置与模型端点'),
        actions: [
          IconButton(
            onPressed: _loading || _busy ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: '重新加载',
          ),
        ],
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_errorMessage!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('重试')),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildLearningSection(),
        const SizedBox(height: 24),
        _buildReminderSection(),
        const SizedBox(height: 24),
        _buildEndpointSection(),
      ],
    );
  }

  Widget _buildLearningSection() {
    final learning = _learning;
    final target = _newWordTarget ?? 20;
    final limit = _reviewLimit ?? 20;

    if (learning == null) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('学习计划', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Text('每天新学 $target 个新词'),
        Text(
          target == 0 ? '0 表示只复习，不安排新词' : '按词书顺序学，完成目标后仍可继续',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        Slider(
          value: target.toDouble(),
          min: _newWordTargetMin.toDouble(),
          max: _newWordTargetMax.toDouble(),
          divisions: _newWordTargetMax - _newWordTargetMin,
          label: '$target',
          onChanged: _busy ? null : (value) => setState(() => _newWordTarget = value.round()),
          onChangeEnd: (value) => _saveNewWordTarget(value.round()),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<int?>(
          initialValue: learning.currentSystemBookId,
          decoration: const InputDecoration(
            labelText: '当前学习词书',
            border: OutlineInputBorder(),
          ),
          items: [
            const DropdownMenuItem<int?>(value: null, child: Text('未选择')),
            ..._books.map(
              (book) => DropdownMenuItem<int?>(value: book.id, child: Text(book.name)),
            ),
          ],
          onChanged: _busy ? null : _saveCurrentBook,
        ),
        const SizedBox(height: 16),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: learning.dailyReviewLimitEnabled,
          title: Text(
            learning.dailyReviewLimitEnabled ? '每天最多复习 $limit 个到期词' : '复习不限制数量',
          ),
          subtitle: const Text('这是复习数量限制，和新词目标是两个设置'),
          onChanged: _busy
              ? null
              : (value) => _saveReviewLimit(enabled: value),
        ),
        Slider(
          value: limit.toDouble(),
          min: _reviewLimitMin.toDouble(),
          max: _reviewLimitMax.toDouble(),
          divisions: _reviewLimitMax - _reviewLimitMin,
          label: '$limit',
          onChanged: learning.dailyReviewLimitEnabled && !_busy
              ? (value) => setState(() => _reviewLimit = value.round())
              : null,
          onChangeEnd: (value) => _saveReviewLimit(limit: value.round()),
        ),
      ],
    );
  }

  /// 每日提醒：时间可改、可关闭；拒绝权限只影响提醒，不影响学习。
  Widget _buildReminderSection() {
    final reminder = ref.watch(reminderProvider);
    final userId = ref.read(authControllerProvider).value?.id;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('每日提醒', style: Theme.of(context).textTheme.titleMedium),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: reminder.enabled,
          title: Text(reminder.enabled ? '开启每日提醒' : '已关闭每日提醒'),
          subtitle: const Text('默认北京时间 20:00；今天计划完成会跳过今天，明天照旧'),
          onChanged: userId == null
              ? null
              : (value) async {
                  await ref
                      .read(reminderProvider.notifier)
                      .updateSettings(userId: userId, enabled: value);

                  final overview = ref.read(studyOverviewProvider).value;

                  if (overview != null) {
                    await ref
                        .read(reminderProvider.notifier)
                        .syncWithPlan(
                          userId: userId,
                          newWordTarget: overview.newWordTarget,
                          newWordCompleted: overview.newWordCompleted,
                          dueTotal: overview.dueTotal,
                        );
                  }
                },
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('提醒时间'),
          subtitle: Text(
            '${reminder.hour.toString().padLeft(2, '0')}:${reminder.minute.toString().padLeft(2, '0')}',
          ),
          trailing: const Icon(Icons.schedule),
          enabled: userId != null && reminder.enabled,
          onTap: userId == null
              ? null
              : () async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: TimeOfDay(
                      hour: reminder.hour,
                      minute: reminder.minute,
                    ),
                  );

                  if (picked == null) {
                    return;
                  }

                  await ref
                      .read(reminderProvider.notifier)
                      .updateSettings(
                        userId: userId,
                        hour: picked.hour,
                        minute: picked.minute,
                      );

                  final overview = ref.read(studyOverviewProvider).value;

                  if (overview != null) {
                    await ref
                        .read(reminderProvider.notifier)
                        .syncWithPlan(
                          userId: userId,
                          newWordTarget: overview.newWordTarget,
                          newWordCompleted: overview.newWordCompleted,
                          dueTotal: overview.dueTotal,
                        );
                  }
                },
        ),
        if (!reminder.permissionGranted)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('系统通知权限还没开，提醒不会出现；学习功能不受影响。'),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () =>
                      ref.read(reminderProvider.notifier).requestPermission(),
                  child: const Text('开启通知权限'),
                ),
              ],
            ),
          ),
        if (reminder.enabled && reminder.nextAt != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '下一次提醒：${reminder.nextAt!.year}-${reminder.nextAt!.month.toString().padLeft(2, '0')}-${reminder.nextAt!.day.toString().padLeft(2, '0')} '
              '${reminder.nextAt!.hour.toString().padLeft(2, '0')}:${reminder.nextAt!.minute.toString().padLeft(2, '0')}（北京时间）',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    );
  }

  Widget _buildEndpointSection() {
    final endpoints = _endpoints;
    final system = endpoints?.system;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('模型端点', style: Theme.of(context).textTheme.titleMedium),
            TextButton.icon(
              onPressed: _busy ? null : () => _openEndpointDialog(),
              icon: const Icon(Icons.add),
              label: const Text('添加'),
            ),
          ],
        ),
        if (system != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              _describeSystemEndpoint(system),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        if (endpoints == null || endpoints.endpoints.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('还没有自己的端点。生成词卡和图片识别都需要一个可用端点。'),
          ),
        ...?endpoints?.endpoints.map(
          (endpoint) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Row(
                children: [
                  Flexible(child: Text(endpoint.label)),
                  if (endpoint.isDefault) ...[
                    const SizedBox(width: 8),
                    const Chip(label: Text('默认')),
                  ],
                ],
              ),
              subtitle: Text(
                '${endpoint.model} · 密钥 ${endpoint.keyPreview}'
                '${endpoint.supportsVision ? '' : ' · 不支持图片识别'}',
              ),
              onTap: _busy ? null : () => _openEndpointDialog(endpoint: endpoint),
              trailing: PopupMenuButton<String>(
                enabled: !_busy,
                onSelected: (value) {
                  if (value == 'test') {
                    _testEndpoint(endpoint);
                  } else if (value == 'default') {
                    _setDefault(endpoint);
                  } else if (value == 'delete') {
                    _deleteEndpoint(endpoint);
                  }
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(value: 'test', child: Text('测试连接')),
                  PopupMenuItem(value: 'default', child: Text('设为默认')),
                  PopupMenuItem(value: 'delete', child: Text('删除')),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _describeSystemEndpoint(SystemEndpointStatus system) {
    if (!system.canUse) {
      return '系统端点只对管理员和 VIP 开放；没有自己的端点时可以联系管理员。';
    }

    if (!system.available) {
      return '你有系统端点权限，但管理员还没配置，需要联系管理员。';
    }

    return '系统端点可用：${system.label ?? ''} ${system.model ?? ''}';
  }
}

/// 端点表单结果：编辑时 apiKey 留空表示保持原密钥。
class EndpointFormResult {
  const EndpointFormResult({
    required this.label,
    required this.baseUrl,
    required this.model,
    required this.visionModel,
    required this.apiKey,
  });

  final String label;
  final String baseUrl;
  final String model;
  final String visionModel;
  final String apiKey;
}

class _EndpointDialog extends StatefulWidget {
  const _EndpointDialog({this.endpoint});

  final AiEndpoint? endpoint;

  @override
  State<_EndpointDialog> createState() => _EndpointDialogState();
}

class _EndpointDialogState extends State<_EndpointDialog> {
  late final TextEditingController _label;
  late final TextEditingController _baseUrl;
  late final TextEditingController _model;
  late final TextEditingController _visionModel;
  final _apiKey = TextEditingController();

  @override
  void initState() {
    super.initState();
    final endpoint = widget.endpoint;
    _label = TextEditingController(text: endpoint?.label ?? '');
    _baseUrl = TextEditingController(text: endpoint?.baseUrl ?? '');
    _model = TextEditingController(text: endpoint?.model ?? '');
    _visionModel = TextEditingController(text: endpoint?.visionModel ?? '');
  }

  @override
  void dispose() {
    _label.dispose();
    _baseUrl.dispose();
    _model.dispose();
    _visionModel.dispose();
    _apiKey.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.endpoint != null;

    return AlertDialog(
      title: Text(editing ? '编辑端点' : '添加端点'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _label,
              decoration: const InputDecoration(labelText: '名称'),
            ),
            TextField(
              controller: _baseUrl,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: '接口地址',
                hintText: 'https://api.example.com/v1',
              ),
            ),
            TextField(
              controller: _model,
              autocorrect: false,
              decoration: const InputDecoration(labelText: '文本模型'),
            ),
            TextField(
              controller: _visionModel,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: '视觉模型（可留空）',
                helperText: '留空表示这个端点不做图片识别',
              ),
            ),
            TextField(
              controller: _apiKey,
              autocorrect: false,
              obscureText: true,
              decoration: InputDecoration(
                labelText: 'API Key',
                helperText: editing ? '留空表示保持原密钥不变' : '只提交给后端，App 不保存明文',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            EndpointFormResult(
              label: _label.text.trim(),
              baseUrl: _baseUrl.text.trim(),
              model: _model.text.trim(),
              visionModel: _visionModel.text.trim(),
              apiKey: _apiKey.text.trim(),
            ),
          ),
          child: const Text('保存'),
        ),
      ],
    );
  }
}
