<template>
  <!--
    方案 A：卡片列表 + 抽屉编辑。
    预设是入口（点一下带出地址和模型建议），完整表单放在右侧抽屉里。
    主页面始终保持「我的端点」列表这个视角，不被表单打断。
  -->
  <section class="va">
    <header class="va-head">
      <div>
        <h2>设置</h2>
        <p class="va-lead">模型端点决定词卡和阅读问答用哪个服务；视觉模型决定 OCR 用哪个。</p>
      </div>
    </header>

    <div class="va-block">
      <div class="va-block-head">
        <p class="va-block-title">我的端点</p>
        <button type="button" class="va-primary" @click="openDrawer()">+ 添加端点</button>
      </div>

      <p v-if="endpoints.length === 0" class="va-empty">
        还没有配置端点。没有服务器兜底，所以配置一个才能使用生成和 OCR。
      </p>

      <article v-for="item in endpoints" :key="item.id" class="va-card" :class="{ 'is-default': item.isDefault }">
        <div class="va-card-main">
          <div class="va-card-title">
            <strong>{{ item.label }}</strong>
            <span v-if="item.isDefault" class="va-tag is-default">默认</span>
            <span v-if="item.visionModel" class="va-tag">可做 OCR</span>
          </div>
          <p class="va-card-url">{{ item.baseUrl }}</p>
          <p class="va-card-meta">
            模型 {{ item.model }} · Key {{ item.keyPreview }}
            <template v-if="item.visionModel"> · 视觉 {{ item.visionModel }}</template>
          </p>
        </div>

        <div class="va-card-side">
          <span class="va-status" :class="`is-${statusOf(item.id).tone}`">{{ statusOf(item.id).text }}</span>
          <div class="va-card-actions">
            <button type="button" class="va-link" :disabled="busyId === item.id" @click="test(item)">
              {{ busyId === item.id ? '测试中…' : '测试' }}
            </button>
            <button type="button" class="va-link" @click="openDrawer(item)">编辑</button>
            <button v-if="!item.isDefault" type="button" class="va-link" @click="makeDefault(item.id)">
              设为默认
            </button>
            <button type="button" class="va-link is-danger" @click="remove(item.id)">删除</button>
          </div>
        </div>
      </article>
    </div>

    <div class="va-block">
      <p class="va-block-title">复习节奏</p>
      <div class="va-row">
        <span>每天最多推 {{ reviewLimitEnabled ? reviewLimit : '全部' }} 个到期词</span>
        <button type="button" class="va-switch" :class="{ 'is-on': reviewLimitEnabled }" @click="reviewLimitEnabled = !reviewLimitEnabled">
          <span class="va-switch-thumb" />
        </button>
      </div>
      <input
        v-if="reviewLimitEnabled"
        v-model.number="reviewLimit"
        type="range"
        :min="REVIEW_LIMIT_MIN"
        :max="REVIEW_LIMIT_MAX"
        class="va-range"
      />
    </div>

    <!-- 抽屉 -->
    <div v-if="drawerOpen" class="va-scrim" @click.self="closeDrawer">
      <aside class="va-drawer">
        <header class="va-drawer-head">
          <h3>{{ editingId ? '编辑端点' : '添加端点' }}</h3>
          <button type="button" class="va-link" @click="closeDrawer">关闭</button>
        </header>

        <p class="va-field-label">从预设开始</p>
        <div class="va-presets">
          <button
            v-for="preset in ENDPOINT_PRESETS"
            :key="preset.id"
            type="button"
            class="va-preset"
            :class="{ 'is-active': draftPresetId === preset.id }"
            @click="applyPreset(preset)"
          >
            <strong>{{ preset.name }}</strong>
            <small>{{ preset.hint }}</small>
          </button>
          <button
            type="button"
            class="va-preset"
            :class="{ 'is-active': draftPresetId === 'custom' }"
            @click="applyPreset(null)"
          >
            <strong>自定义</strong>
            <small>任何 OpenAI 兼容地址</small>
          </button>
        </div>

        <label class="va-field">
          <span>名称</span>
          <input v-model.trim="draft.label" type="text" placeholder="例如：我的 DeepSeek" />
        </label>

        <label class="va-field">
          <span>接口地址</span>
          <input v-model.trim="draft.baseUrl" type="text" spellcheck="false" placeholder="https://api.example.com/v1" />
        </label>

        <label class="va-field">
          <span>API Key</span>
          <input v-model.trim="draft.apiKey" type="password" autocomplete="off" placeholder="粘贴 Key" />
        </label>

        <label class="va-field">
          <span>模型名</span>
          <input v-model.trim="draft.model" type="text" spellcheck="false" list="va-models" placeholder="deepseek-v4-flash" />
          <datalist id="va-models">
            <option v-for="name in modelSuggestions" :key="name" :value="name" />
          </datalist>
        </label>

        <label class="va-field">
          <span>视觉模型（留空则不做 OCR）</span>
          <input v-model.trim="draft.visionModel" type="text" spellcheck="false" :placeholder="presetVisionHint" />
        </label>

        <div class="va-test-row">
          <button type="button" class="va-secondary" :disabled="testing" @click="runTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <span v-if="testResult" class="va-test-result" :class="{ 'is-bad': !testResult.ok }">
            {{ testResult.message }}
          </span>
        </div>

        <footer class="va-drawer-foot">
          <button type="button" class="va-primary" :disabled="!canSave" @click="save">保存端点</button>
        </footer>
      </aside>
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
  type EndpointPreset,
  type PrototypeEndpoint,
} from './settingsPrototypeData';

const endpoints = ref<PrototypeEndpoint[]>(buildPrototypeEndpoints());
const reviewLimitEnabled = ref(true);
const reviewLimit = ref(20);
const drawerOpen = ref(false);
const editingId = ref<number | null>(null);
const draftPresetId = ref('custom');
const testing = ref(false);
const busyId = ref<number | null>(null);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const statuses = reactive<Record<number, { tone: string; text: string }>>({});

const draft = reactive({
  label: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  visionModel: '',
});

const currentPreset = computed<EndpointPreset | null>(
  () => ENDPOINT_PRESETS.find((preset) => preset.id === draftPresetId.value) ?? null,
);
const modelSuggestions = computed(() => {
  const preset = currentPreset.value;
  return preset ? [...preset.models, ...preset.visionModels] : [];
});
const presetVisionHint = computed(() => currentPreset.value?.visionModels[0] ?? '例如 qwen3-vl:8b');
const canSave = computed(
  () => Boolean(draft.label && draft.baseUrl && draft.model && (editingId.value || draft.apiKey)),
);

function statusOf(id: number) {
  return statuses[id] ?? { tone: 'idle', text: '未测试' };
}

function applyPreset(preset: EndpointPreset | null) {
  draftPresetId.value = preset?.id ?? 'custom';
  testResult.value = null;

  if (!preset) {
    return;
  }

  draft.label = preset.name;
  draft.baseUrl = preset.baseUrl;
  draft.model = preset.models[0] ?? '';
  draft.visionModel = preset.visionModels[0] ?? '';
}

function openDrawer(item?: PrototypeEndpoint) {
  drawerOpen.value = true;
  testResult.value = null;
  editingId.value = item?.id ?? null;

  if (item) {
    draftPresetId.value = 'custom';
    draft.label = item.label;
    draft.baseUrl = item.baseUrl;
    draft.model = item.model;
    draft.visionModel = item.visionModel;
    draft.apiKey = '';
    return;
  }

  applyPreset(ENDPOINT_PRESETS[0]);
  draft.apiKey = '';
}

function closeDrawer() {
  drawerOpen.value = false;
  editingId.value = null;
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
  statuses[item.id] = result.ok
    ? { tone: 'ok', text: '可用' }
    : { tone: 'bad', text: '连接失败' };
  busyId.value = null;
}

function save() {
  if (editingId.value) {
    endpoints.value = endpoints.value.map((item) =>
      item.id === editingId.value
        ? { ...item, label: draft.label, baseUrl: draft.baseUrl, model: draft.model, visionModel: draft.visionModel }
        : item,
    );
  } else {
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
  }

  closeDrawer();
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
.va {
  --ink: #1d1a17;
  --soft: #6f665d;
  --line: rgba(42, 36, 31, 0.12);
  --rose: #e0445f;
  --green: #047857;

  width: min(100%, 820px);
  margin: 0 auto;
  padding: 30px 4px 90px;
  color: var(--ink);
}

.va-head h2 {
  margin: 0 0 6px;
  font-size: 30px;
}

.va-lead {
  margin: 0 0 26px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--soft);
}

.va-block {
  margin-bottom: 30px;
}

.va-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.va-block-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft);
}

.va-block-head .va-block-title {
  margin: 0;
}

.va-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--soft);
}

.va-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
  margin-bottom: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
}

.va-card.is-default {
  border-color: rgba(4, 120, 87, 0.35);
  background: rgba(4, 120, 87, 0.04);
}

.va-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.va-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(42, 36, 31, 0.07);
  font-size: 11px;
  color: var(--soft);
}

.va-tag.is-default {
  background: rgba(4, 120, 87, 0.14);
  color: var(--green);
}

.va-card-url {
  margin: 0 0 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--soft);
}

.va-card-meta {
  margin: 0;
  font-size: 12px;
  color: var(--soft);
}

.va-card-side {
  display: grid;
  gap: 10px;
  justify-items: end;
  flex: none;
}

.va-status {
  font-size: 12px;
  color: var(--soft);
}

.va-status.is-ok {
  color: var(--green);
}

.va-status.is-bad {
  color: var(--rose);
}

.va-card-actions {
  display: flex;
  gap: 12px;
}

.va-link {
  border: 0;
  padding: 0;
  background: none;
  font-size: 13px;
  color: var(--rose);
  cursor: pointer;
}

.va-link.is-danger {
  color: var(--soft);
}

.va-link:disabled {
  opacity: 0.5;
  cursor: default;
}

.va-primary,
.va-secondary {
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}

.va-primary {
  border: 0;
  background: var(--rose);
  color: #fff;
}

.va-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.va-secondary {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.va-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  font-size: 14px;
}

.va-switch {
  flex: none;
  width: 52px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: rgba(42, 36, 31, 0.18);
  cursor: pointer;
}

.va-switch.is-on {
  background: var(--green);
}

.va-switch-thumb {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transform: translateX(3px);
  transition: transform 0.2s ease;
}

.va-switch.is-on .va-switch-thumb {
  transform: translateX(25px);
}

.va-range {
  width: 100%;
  accent-color: var(--green);
}

/* 抽屉 */
.va-scrim {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  justify-content: flex-end;
  background: rgba(22, 18, 28, 0.35);
}

.va-drawer {
  width: min(100%, 460px);
  height: 100%;
  overflow-y: auto;
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 24px;
  background: #fffdfa;
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.2);
}

.va-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.va-drawer-head h3 {
  margin: 0;
  font-size: 20px;
}

.va-field-label {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--soft);
}

.va-presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.va-preset {
  display: grid;
  gap: 3px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.va-preset.is-active {
  border-color: var(--rose);
  background: rgba(224, 68, 95, 0.05);
}

.va-preset strong {
  font-size: 13px;
}

.va-preset small {
  font-size: 11px;
  color: var(--soft);
}

.va-field {
  display: grid;
  gap: 6px;
}

.va-field span {
  font-size: 12px;
  color: var(--soft);
}

.va-field input {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}

.va-test-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.va-test-result {
  font-size: 12px;
  color: var(--green);
}

.va-test-result.is-bad {
  color: var(--rose);
}

.va-drawer-foot {
  padding-top: 6px;
}
</style>
