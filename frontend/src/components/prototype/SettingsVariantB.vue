<template>
  <!--
    方案 B：表格 + 行内编辑。
    所有端点一屏看完，编辑就地展开成表单行，不用弹层。
    和 A 的差别：A 是「一次看一个端点的卡片」，B 是「同时比较所有端点」。
  -->
  <section class="vb">
    <header class="vb-head">
      <h2>设置</h2>
    </header>

    <div class="vb-toolbar">
      <p class="vb-title">模型端点</p>
      <div class="vb-toolbar-actions">
        <button type="button" class="vb-secondary" @click="addFromPreset">从预设添加</button>
        <button type="button" class="vb-primary" @click="addCustom">+ 自定义端点</button>
      </div>
    </div>

    <p v-if="endpoints.length === 0" class="vb-empty">
      还没有端点。没有服务器兜底，配置一个才能用生成和 OCR。
    </p>

    <table v-else class="vb-table">
      <thead>
        <tr>
          <th>名称</th>
          <th>接口地址</th>
          <th>模型</th>
          <th>视觉</th>
          <th>状态</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.key">
          <tr class="vb-row" :class="{ 'is-editing': isEditing(row.key) }">
            <template v-if="row.endpoint">
              <td>
                <span class="vb-name">{{ row.endpoint.label }}</span>
                <span v-if="row.endpoint.isDefault" class="vb-tag">默认</span>
              </td>
              <td class="vb-mono">{{ shortUrl(row.endpoint.baseUrl) }}</td>
              <td class="vb-mono">{{ row.endpoint.model }}</td>
              <td class="vb-mono">{{ row.endpoint.visionModel || '—' }}</td>
              <td>
                <span class="vb-status" :class="`is-${statusOf(row.endpoint.id).tone}`">
                  {{ statusOf(row.endpoint.id).text }}
                </span>
              </td>
              <td class="vb-actions">
                <button type="button" class="vb-link" :disabled="busyId === row.endpoint.id" @click="test(row.endpoint)">
                  {{ busyId === row.endpoint.id ? '…' : '测试' }}
                </button>
                <button type="button" class="vb-link" @click="toggleEdit(row.endpoint)">
                  {{ isEditing(row.key) ? '收起' : '编辑' }}
                </button>
                <button
                  v-if="!row.endpoint.isDefault"
                  type="button"
                  class="vb-link"
                  @click="makeDefault(row.endpoint.id)"
                >
                  设为默认
                </button>
                <button type="button" class="vb-link is-danger" @click="remove(row.endpoint.id)">删除</button>
              </td>
            </template>
            <td v-else colspan="6" class="vb-new-label">新端点（未保存）</td>
          </tr>

          <tr v-if="isEditing(row.key)" class="vb-edit-row">
            <td colspan="6">
              <div class="vb-form">
                <div class="vb-form-grid">
                  <label>
                    <span>名称</span>
                    <input v-model.trim="draft.label" type="text" />
                  </label>
                  <label class="is-wide">
                    <span>接口地址</span>
                    <input v-model.trim="draft.baseUrl" type="text" spellcheck="false" />
                  </label>
                  <label class="is-wide">
                    <span>API Key{{ editingId ? '（留空保持不变）' : '' }}</span>
                    <input v-model.trim="draft.apiKey" type="password" autocomplete="off" />
                  </label>
                  <label>
                    <span>模型名</span>
                    <input v-model.trim="draft.model" type="text" spellcheck="false" list="vb-models" />
                  </label>
                  <label>
                    <span>视觉模型（可空）</span>
                    <input v-model.trim="draft.visionModel" type="text" spellcheck="false" list="vb-models" />
                  </label>
                </div>

                <datalist id="vb-models">
                  <option v-for="name in allModelNames" :key="name" :value="name" />
                </datalist>

                <div class="vb-form-foot">
                  <button type="button" class="vb-secondary" :disabled="testing" @click="runTest">
                    {{ testing ? '测试中…' : '测试连接' }}
                  </button>
                  <span v-if="testResult" class="vb-test" :class="{ 'is-bad': !testResult.ok }">
                    {{ testResult.message }}
                  </span>
                  <span class="vb-spacer" />
                  <button type="button" class="vb-link is-danger" @click="cancelEdit">取消</button>
                  <button type="button" class="vb-primary" :disabled="!canSave" @click="save">保存</button>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <div class="vb-review">
      <p class="vb-title">复习节奏</p>
      <div class="vb-review-row">
        <label class="vb-check">
          <input v-model="reviewLimitEnabled" type="checkbox" />
          <span>限制每天推送数量</span>
        </label>
        <input
          v-model.number="reviewLimit"
          type="number"
          class="vb-number"
          :min="REVIEW_LIMIT_MIN"
          :max="REVIEW_LIMIT_MAX"
          :disabled="!reviewLimitEnabled"
        />
        <span class="vb-hint">个到期词 / 天（{{ REVIEW_LIMIT_MIN }}–{{ REVIEW_LIMIT_MAX }}）</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ENDPOINT_PRESETS,
  REVIEW_LIMIT_MAX,
  REVIEW_LIMIT_MIN,
  buildPrototypeEndpoints,
  fakeTestConnection,
  type PrototypeEndpoint,
} from './settingsPrototypeData';

const endpoints = ref<PrototypeEndpoint[]>(buildPrototypeEndpoints());
const reviewLimitEnabled = ref(true);
const reviewLimit = ref(20);
const editingId = ref<number | 'new' | null>(null);
const testing = ref(false);
const busyId = ref<number | null>(null);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const statuses = reactive<Record<number, { tone: string; text: string }>>({});
const draft = reactive({ label: '', baseUrl: '', apiKey: '', model: '', visionModel: '' });

const allModelNames = computed(() =>
  ENDPOINT_PRESETS.flatMap((preset) => [...preset.models, ...preset.visionModels]),
);

/**
 * 正在新增的端点还没有行可以挂表单，所以造一个占位行，
 * 否则点「添加」什么都不会出现。
 */
const rows = computed(() => {
  const list: Array<{ key: string; endpoint: PrototypeEndpoint | null }> = endpoints.value.map(
    (endpoint) => ({ key: String(endpoint.id), endpoint }),
  );

  if (editingId.value === 'new') {
    list.push({ key: 'new', endpoint: null });
  }

  return list;
});

function isEditing(key: string) {
  return editingId.value === 'new' ? key === 'new' : String(editingId.value) === key;
}
const canSave = computed(
  () => Boolean(draft.label && draft.baseUrl && draft.model && (editingId.value !== 'new' || draft.apiKey)),
);

function statusOf(id: number) {
  return statuses[id] ?? { tone: 'idle', text: '未测试' };
}

function shortUrl(url: string) {
  return url.replace(/^https?:\/\//, '');
}

function toggleEdit(item: PrototypeEndpoint) {
  if (editingId.value === item.id) {
    cancelEdit();
    return;
  }

  editingId.value = item.id;
  testResult.value = null;
  draft.label = item.label;
  draft.baseUrl = item.baseUrl;
  draft.model = item.model;
  draft.visionModel = item.visionModel;
  draft.apiKey = '';
}

function addFromPreset() {
  const preset = ENDPOINT_PRESETS[0];
  editingId.value = 'new';
  testResult.value = null;
  draft.label = preset.name;
  draft.baseUrl = preset.baseUrl;
  draft.model = preset.models[0] ?? '';
  draft.visionModel = preset.visionModels[0] ?? '';
  draft.apiKey = '';
}

function addCustom() {
  editingId.value = 'new';
  testResult.value = null;
  draft.label = '';
  draft.baseUrl = '';
  draft.model = '';
  draft.visionModel = '';
  draft.apiKey = '';
}

function cancelEdit() {
  editingId.value = null;
  testResult.value = null;
}

async function runTest() {
  testing.value = true;
  testResult.value = null;
  const result = await fakeTestConnection(draft.baseUrl);
  testResult.value = { ok: result.ok, message: result.message };
  testing.value = false;
}

async function test(item: PrototypeEndpoint) {
  busyId.value = item.id;
  const result = await fakeTestConnection(item.baseUrl);
  statuses[item.id] = result.ok ? { tone: 'ok', text: '可用' } : { tone: 'bad', text: '失败' };
  busyId.value = null;
}

function save() {
  if (editingId.value === 'new') {
    endpoints.value = [
      ...endpoints.value,
      {
        id: Date.now(),
        label: draft.label,
        baseUrl: draft.baseUrl,
        model: draft.model,
        visionModel: draft.visionModel,
        keyPreview: `sk-••••••••${Math.random().toString(16).slice(2, 6)}`,
        isDefault: endpoints.value.length === 0,
      },
    ];
  } else if (typeof editingId.value === 'number') {
    endpoints.value = endpoints.value.map((item) =>
      item.id === editingId.value
        ? { ...item, label: draft.label, baseUrl: draft.baseUrl, model: draft.model, visionModel: draft.visionModel }
        : item,
    );
  }

  cancelEdit();
}

function makeDefault(id: number) {
  endpoints.value = endpoints.value.map((item) => ({ ...item, isDefault: item.id === id }));
}

function remove(id: number) {
  const wasDefault = endpoints.value.find((item) => item.id === id)?.isDefault;
  endpoints.value = endpoints.value.filter((item) => item.id !== id);

  // 删掉默认端点后把默认位交给剩下的第一个，避免出现「没有默认端点」的中间状态。
  if (wasDefault && endpoints.value.length > 0) {
    endpoints.value[0].isDefault = true;
  }
}
</script>

<style scoped>
.vb {
  --ink: #1d1a17;
  --soft: #6f665d;
  --line: rgba(42, 36, 31, 0.12);
  --rose: #e0445f;
  --green: #047857;

  width: min(100%, 980px);
  margin: 0 auto;
  padding: 30px 4px 90px;
  color: var(--ink);
}

.vb-head h2 {
  margin: 0 0 24px;
  font-size: 30px;
}

.vb-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft);
}

.vb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.vb-toolbar-actions {
  display: flex;
  gap: 8px;
}

.vb-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 13px;
  color: var(--soft);
}

.vb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.vb-table th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--soft);
}

.vb-row td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

.vb-row.is-editing td {
  border-bottom: 0;
}

.vb-new-label {
  color: var(--rose);
  font-style: italic;
}

.vb-name {
  font-weight: 500;
}

.vb-tag {
  margin-left: 7px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(4, 120, 87, 0.14);
  font-size: 10px;
  color: var(--green);
}

.vb-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--soft);
}

.vb-status {
  font-size: 12px;
  color: var(--soft);
}

.vb-status.is-ok {
  color: var(--green);
}

.vb-status.is-bad {
  color: var(--rose);
}

.vb-actions {
  display: flex;
  gap: 11px;
  white-space: nowrap;
}

.vb-link {
  border: 0;
  padding: 0;
  background: none;
  font-size: 12px;
  color: var(--rose);
  cursor: pointer;
}

.vb-link.is-danger {
  color: var(--soft);
}

.vb-link:disabled {
  opacity: 0.5;
}

.vb-edit-row td {
  padding: 0 10px 16px;
  border-bottom: 1px solid var(--line);
}

.vb-form {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(42, 36, 31, 0.035);
}

.vb-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.vb-form-grid label {
  display: grid;
  gap: 5px;
}

.vb-form-grid label.is-wide {
  grid-column: 1 / -1;
}

.vb-form-grid span {
  font-size: 11px;
  color: var(--soft);
}

.vb-form-grid input {
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 13px;
  background: #fff;
}

.vb-form-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.vb-spacer {
  flex: 1;
}

.vb-test {
  font-size: 12px;
  color: var(--green);
}

.vb-test.is-bad {
  color: var(--rose);
}

.vb-primary,
.vb-secondary {
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 13px;
  cursor: pointer;
}

.vb-primary {
  border: 0;
  background: var(--rose);
  color: #fff;
}

.vb-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vb-secondary {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.vb-review {
  margin-top: 32px;
}

.vb-review-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 14px;
}

.vb-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.vb-number {
  width: 76px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 14px;
  background: #fff;
}

.vb-number:disabled {
  opacity: 0.45;
}

.vb-hint {
  font-size: 12px;
  color: var(--soft);
}
</style>
