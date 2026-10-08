<template>
  <!--
    方案 C：向导式（一步一问）。
    新用户面对「地址 / Key / 模型 / 视觉模型」会懵，所以拆成一步一个问题，测试通过才继续。
    和 A、B 的差别最大：A 和 B 是「先有列表，再编辑」，C 是「先走完流程，再看到列表」。
  -->
  <section class="vc">
    <header class="vc-head">
      <h2>设置</h2>
    </header>

    <!-- 空状态：没有端点时直接给三个大按钮，而不是一个空列表 -->
    <div v-if="endpoints.length === 0 && !wizardOpen" class="vc-empty">
      <p class="vc-empty-title">先配一个模型端点</p>
      <p class="vc-empty-note">
        没有服务器兜底，配好端点才能生成词卡和做 OCR。选一个开始：
      </p>
      <div class="vc-empty-actions">
        <button
          v-for="preset in ENDPOINT_PRESETS"
          :key="preset.id"
          type="button"
          class="vc-big"
          @click="startWizard(preset.id)"
        >
          <strong>{{ preset.name }}</strong>
          <small>{{ preset.hint }}</small>
        </button>
        <button type="button" class="vc-big is-plain" @click="startWizard('custom')">
          <strong>其他</strong>
          <small>任何 OpenAI 兼容地址</small>
        </button>
      </div>
    </div>

    <!-- 向导 -->
    <div v-else-if="wizardOpen" class="vc-wizard">
      <ol class="vc-steps">
        <li v-for="(item, index) in STEPS" :key="item" :class="{ 'is-active': step === index, 'is-done': step > index }">
          <span class="vc-step-dot">{{ step > index ? '✓' : index + 1 }}</span>
          <span class="vc-step-label">{{ item }}</span>
        </li>
      </ol>

      <div class="vc-step-body">
        <!-- 1 选服务 -->
        <template v-if="step === 0">
          <p class="vc-question">你要接哪个服务？</p>
          <div class="vc-choice-grid">
            <button
              v-for="preset in ENDPOINT_PRESETS"
              :key="preset.id"
              type="button"
              class="vc-choice"
              :class="{ 'is-active': presetId === preset.id }"
              @click="choosePreset(preset.id)"
            >
              <strong>{{ preset.name }}</strong>
              <small>{{ preset.baseUrl }}</small>
            </button>
            <button
              type="button"
              class="vc-choice"
              :class="{ 'is-active': presetId === 'custom' }"
              @click="choosePreset('custom')"
            >
              <strong>其他</strong>
              <small>自己填地址</small>
            </button>
          </div>
        </template>

        <!-- 2 地址与 Key -->
        <template v-else-if="step === 1">
          <p class="vc-question">填地址和 API Key</p>
          <label class="vc-field">
            <span>接口地址</span>
            <input v-model.trim="draft.baseUrl" type="text" spellcheck="false" placeholder="https://api.example.com/v1" />
          </label>
          <label class="vc-field">
            <span>API Key</span>
            <input v-model.trim="draft.apiKey" type="password" autocomplete="off" placeholder="粘贴 Key" />
          </label>
          <p class="vc-hint">地址必须是 OpenAI 兼容的，我们会请求 <code>/chat/completions</code>。</p>
        </template>

        <!-- 3 测试 -->
        <template v-else-if="step === 2">
          <p class="vc-question">先测一下能不能连通</p>
          <p class="vc-hint">测试通过才能继续，避免配完才发现 Key 是错的。</p>
          <div class="vc-test-box">
            <button type="button" class="vc-primary" :disabled="testing" @click="runTest">
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
            <span v-if="testResult" class="vc-test-msg" :class="{ 'is-bad': !testResult.ok }">
              {{ testResult.message }}
            </span>
          </div>
        </template>

        <!-- 4 模型与命名 -->
        <template v-else>
          <p class="vc-question">选模型，起个名字</p>
          <label class="vc-field">
            <span>模型</span>
            <select v-model="draft.model">
              <option v-for="name in discoveredModels" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label class="vc-field">
            <span>视觉模型（可选，用于 OCR）</span>
            <select v-model="draft.visionModel">
              <option value="">不做 OCR</option>
              <option v-for="name in discoveredModels" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label class="vc-field">
            <span>名称</span>
            <input v-model.trim="draft.label" type="text" placeholder="例如：我的 DeepSeek" />
          </label>
        </template>
      </div>

      <footer class="vc-foot">
        <button v-if="step > 0" type="button" class="vc-secondary" @click="step -= 1">上一步</button>
        <span class="vc-spacer" />
        <button type="button" class="vc-link" @click="cancelWizard">取消</button>
        <button
          v-if="step < STEPS.length - 1"
          type="button"
          class="vc-primary"
          :disabled="!canAdvance"
          @click="next"
        >
          下一步
        </button>
        <button v-else type="button" class="vc-primary" :disabled="!draft.label" @click="finish">
          保存并完成
        </button>
      </footer>
    </div>

    <!-- 已有端点 -->
    <template v-else>
      <div class="vc-list-head">
        <p class="vc-title">我的端点</p>
        <button type="button" class="vc-secondary" @click="startWizard('custom')">+ 添加</button>
      </div>

      <div v-for="item in endpoints" :key="item.id" class="vc-item">
        <div>
          <p class="vc-item-title">
            <strong>{{ item.label }}</strong>
            <span v-if="item.isDefault" class="vc-tag">默认</span>
            <span v-if="item.visionModel" class="vc-tag is-plain">OCR</span>
          </p>
          <p class="vc-item-meta">{{ item.baseUrl }} · {{ item.model }}</p>
        </div>
        <div class="vc-item-actions">
          <button v-if="!item.isDefault" type="button" class="vc-link" @click="makeDefault(item.id)">
            设为默认
          </button>
          <button type="button" class="vc-link" @click="remove(item.id)">删除</button>
        </div>
      </div>
    </template>

    <div class="vc-review">
      <p class="vc-title">复习节奏</p>
      <p class="vc-review-line">
        每天最多推
        <input
          v-model.number="reviewLimit"
          type="number"
          class="vc-inline-number"
          :min="REVIEW_LIMIT_MIN"
          :max="REVIEW_LIMIT_MAX"
          :disabled="!reviewLimitEnabled"
          @change="clampLimit"
        />
        个到期词
        <button type="button" class="vc-link" @click="reviewLimitEnabled = !reviewLimitEnabled">
          {{ reviewLimitEnabled ? '改成不限量' : '改成限量' }}
        </button>
      </p>
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

const props = withDefaults(defineProps<{ initial?: PrototypeEndpoint[] }>(), { initial: undefined });

const STEPS = ['选择服务', '填地址和 Key', '测试连接', '选模型'] as const;

const endpoints = ref<PrototypeEndpoint[]>(props.initial ?? buildPrototypeEndpoints());
const reviewLimitEnabled = ref(true);
const reviewLimit = ref(20);
const wizardOpen = ref(false);
const step = ref(0);
const presetId = ref<string>('custom');
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const discoveredModels = ref<string[]>([]);
const draft = reactive({ label: '', baseUrl: '', apiKey: '', model: '', visionModel: '' });

const canAdvance = computed(() => {
  if (step.value === 0) {
    return Boolean(presetId.value);
  }

  if (step.value === 1) {
    return Boolean(draft.baseUrl && draft.apiKey);
  }

  if (step.value === 2) {
    return testResult.value?.ok === true;
  }

  return true;
});

function startWizard(id: string) {
  wizardOpen.value = true;
  step.value = 0;
  testResult.value = null;
  discoveredModels.value = [];
  draft.label = '';
  draft.baseUrl = '';
  draft.apiKey = '';
  draft.model = '';
  draft.visionModel = '';
  choosePreset(id);
}

function choosePreset(id: string) {
  presetId.value = id;
  const preset = ENDPOINT_PRESETS.find((item) => item.id === id);

  if (!preset) {
    draft.baseUrl = '';
    draft.label = '';
    return;
  }

  draft.baseUrl = preset.baseUrl;
  draft.label = preset.name;
}

async function runTest() {
  testing.value = true;
  testResult.value = null;
  const result = await fakeTestConnection(draft.baseUrl);
  testResult.value = { ok: result.ok, message: result.message };
  discoveredModels.value = result.models;
  testing.value = false;
}

function next() {
  // 测通了才有模型列表可选，所以进入最后一步时先给个默认值。
  if (step.value === 2 && !draft.model) {
    draft.model = discoveredModels.value[0] ?? '';
  }

  step.value += 1;
}

function cancelWizard() {
  wizardOpen.value = false;
}

function finish() {
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
  wizardOpen.value = false;
}

function makeDefault(id: number) {
  endpoints.value = endpoints.value.map((item) => ({ ...item, isDefault: item.id === id }));
}

function remove(id: number) {
  const wasDefault = endpoints.value.find((item) => item.id === id)?.isDefault;
  endpoints.value = endpoints.value.filter((item) => item.id !== id);

  if (wasDefault && endpoints.value.length > 0) {
    endpoints.value[0].isDefault = true;
  }
}

function clampLimit() {
  reviewLimit.value = Math.min(
    REVIEW_LIMIT_MAX,
    Math.max(REVIEW_LIMIT_MIN, Math.round(Number(reviewLimit.value) || REVIEW_LIMIT_MIN)),
  );
}
</script>

<style scoped>
.vc {
  --ink: #1d1a17;
  --soft: #6f665d;
  --line: rgba(42, 36, 31, 0.12);
  --rose: #e0445f;
  --green: #047857;

  width: min(100%, 720px);
  margin: 0 auto;
  padding: 30px 4px 90px;
  color: var(--ink);
}

.vc-head h2 {
  margin: 0 0 24px;
  font-size: 30px;
}

.vc-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft);
}

/* 空状态 */
.vc-empty {
  padding: 26px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 40px rgba(255, 110, 130, 0.1);
}

.vc-empty-title {
  margin: 0 0 6px;
  font-size: 19px;
  font-weight: 600;
}

.vc-empty-note {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--soft);
}

.vc-empty-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.vc-big {
  display: grid;
  gap: 4px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.vc-big:hover {
  border-color: var(--rose);
}

.vc-big strong {
  font-size: 15px;
}

.vc-big small {
  font-size: 12px;
  color: var(--soft);
}

/* 向导 */
.vc-wizard {
  padding: 22px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 12px 40px rgba(255, 110, 130, 0.1);
}

.vc-steps {
  display: flex;
  gap: 6px;
  margin: 0 0 22px;
  padding: 0;
  list-style: none;
}

.vc-steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  font-size: 12px;
  color: var(--soft);
}

.vc-steps li.is-active {
  color: var(--ink);
  font-weight: 600;
}

.vc-steps li.is-done {
  color: var(--green);
}

.vc-step-dot {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(42, 36, 31, 0.08);
  font-size: 11px;
}

.vc-steps li.is-active .vc-step-dot {
  background: var(--rose);
  color: #fff;
}

.vc-steps li.is-done .vc-step-dot {
  background: rgba(4, 120, 87, 0.16);
  color: var(--green);
}

.vc-step-label {
  white-space: nowrap;
}

.vc-step-body {
  display: grid;
  gap: 14px;
  min-height: 210px;
  align-content: start;
}

.vc-question {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.vc-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.vc-choice {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.vc-choice.is-active {
  border-color: var(--rose);
  background: rgba(224, 68, 95, 0.05);
}

.vc-choice strong {
  font-size: 14px;
}

.vc-choice small {
  font-size: 11px;
  color: var(--soft);
  word-break: break-all;
}

.vc-field {
  display: grid;
  gap: 6px;
}

.vc-field span {
  font-size: 12px;
  color: var(--soft);
}

.vc-field input,
.vc-field select {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}

.vc-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--soft);
}

.vc-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(42, 36, 31, 0.07);
  font-size: 11px;
}

.vc-test-box {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 16px;
  border: 1px dashed var(--line);
  border-radius: 12px;
}

.vc-test-msg {
  font-size: 13px;
  color: var(--green);
}

.vc-test-msg.is-bad {
  color: var(--rose);
}

.vc-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.vc-spacer {
  flex: 1;
}

/* 列表 */
.vc-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.vc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}

.vc-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
}

.vc-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(4, 120, 87, 0.14);
  font-size: 10px;
  color: var(--green);
}

.vc-tag.is-plain {
  background: rgba(42, 36, 31, 0.07);
  color: var(--soft);
}

.vc-item-meta {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--soft);
}

.vc-item-actions {
  display: flex;
  gap: 12px;
  flex: none;
}

.vc-link {
  border: 0;
  padding: 0;
  background: none;
  font-size: 13px;
  color: var(--rose);
  cursor: pointer;
}

.vc-primary,
.vc-secondary {
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}

.vc-primary {
  border: 0;
  background: var(--rose);
  color: #fff;
}

.vc-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vc-secondary {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.vc-review {
  margin-top: 34px;
}

.vc-review-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 16px;
}

.vc-inline-number {
  width: 74px;
  padding: 5px 8px;
  border: 0;
  border-bottom: 2px solid rgba(224, 68, 95, 0.35);
  background: none;
  text-align: center;
  font-size: 18px;
  color: var(--rose);
  -moz-appearance: textfield;
}

.vc-inline-number::-webkit-outer-spin-button,
.vc-inline-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
