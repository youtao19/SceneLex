<template>
  <section class="settings-page">
    <header class="settings-head">
      <div>
        <h2>设置</h2>
        <p class="settings-lead">
          端点决定词卡和阅读问答用哪个服务；视觉模型决定 OCR 用哪个。
        </p>
      </div>
      <span class="settings-saved" :class="{ 'is-on': savedFlash }">
        {{ savedFlash || '' }}
      </span>
    </header>

    <p v-if="loadErrorMessage" class="settings-notice is-error">{{ loadErrorMessage }}</p>

    <!--
      说清「实际会用哪个端点」。用户看不出这件事的话，会以为系统端点失效了
      或者以为自己在花自己的额度。
    -->
    <p v-if="isLoading" class="settings-notice">正在读取端点...</p>
    <p v-else-if="hasOwnEndpoint" class="settings-notice">
      生成和 OCR 会优先用你自己配的默认端点，不占系统额度。
    </p>
    <p v-else-if="system.canUse && system.available" class="settings-notice is-info">
      你自己还没配端点，当前会使用<strong>系统端点：{{ system.label }}</strong>（{{ system.model }}）。
    </p>
    <p v-else-if="system.canUse" class="settings-notice is-error">
      你还没有配端点，而且管理员还没配置系统端点，所以现在不能生成词卡和做 OCR。
    </p>
    <p v-else class="settings-notice">
      你还没有配端点。可以自己添加一个，或联系管理员开通系统端点。
    </p>

    <div class="settings-block">
      <div class="settings-block-head">
        <p class="settings-block-title">我的端点</p>
        <button type="button" class="settings-primary" :disabled="!presets.length" @click="openDrawer()">
          + 添加端点
        </button>
      </div>

      <p v-if="isLoading" class="settings-notice">正在读取端点...</p>

      <p v-else-if="endpoints.length === 0" class="settings-empty">
        还没有配置端点。
      </p>

      <article
        v-for="item in endpoints"
        :key="item.id"
        class="endpoint-card"
        :class="{ 'is-default': item.isDefault }"
      >
        <div class="endpoint-main">
          <div class="endpoint-title">
            <strong>{{ item.label }}</strong>
            <span v-if="item.isDefault" class="endpoint-tag is-default">默认</span>
            <span v-if="item.visionModel" class="endpoint-tag">可做 OCR</span>
          </div>
          <p class="endpoint-url">{{ item.baseUrl }}</p>
          <p class="endpoint-meta">
            模型 {{ item.model }} · Key {{ item.keyPreview }}
            <template v-if="item.visionModel"> · 视觉 {{ item.visionModel }}</template>
          </p>
        </div>

        <div class="endpoint-side">
          <span class="endpoint-status" :class="`is-${statusOf(item.id).tone}`">
            {{ statusOf(item.id).text }}
          </span>
          <div class="endpoint-actions">
            <button type="button" class="settings-link" :disabled="busyId === item.id" @click="testSaved(item)">
              {{ busyId === item.id ? '测试中…' : '测试' }}
            </button>
            <button type="button" class="settings-link" @click="openDrawer(item)">编辑</button>
            <button
              v-if="!item.isDefault"
              type="button"
              class="settings-link"
              @click="makeDefault(item)"
            >
              设为默认
            </button>
            <button type="button" class="settings-link is-danger" @click="remove(item)">删除</button>
          </div>
        </div>
      </article>
    </div>

    <div class="settings-block">
      <p class="settings-block-title">复习节奏</p>
      <div class="review-row">
        <div class="review-main">
          <strong>每天最多推 {{ reviewLimitEnabled ? reviewLimit : '全部' }} 个到期词</strong>
          <small>{{ reviewLimitEnabled ? '按设定数量推送到期词' : '关闭后展示所有到期词' }}</small>
        </div>
        <button
          type="button"
          class="review-switch"
          :class="{ 'is-on': reviewLimitEnabled }"
          :aria-pressed="reviewLimitEnabled"
          @click="toggleReviewLimit"
        >
          <span class="review-switch-thumb" />
        </button>
      </div>

      <div class="review-row is-slider" :class="{ 'is-disabled': !reviewLimitEnabled }">
        <input
          v-model.number="reviewLimit"
          type="range"
          :min="REVIEW_LIMIT_MIN"
          :max="REVIEW_LIMIT_MAX"
          :disabled="!reviewLimitEnabled"
          @change="saveReview"
        />
        <span class="review-scale">{{ REVIEW_LIMIT_MIN }} – {{ REVIEW_LIMIT_MAX }}</span>
      </div>
      <p v-if="reviewErrorMessage" class="settings-notice is-error">{{ reviewErrorMessage }}</p>
    </div>

    <div class="settings-block">
      <p class="settings-block-title">新词计划</p>
      <div class="review-row">
        <div class="review-main">
          <strong>每天新学 {{ newWordTarget }} 个新词</strong>
          <small>{{ newWordTarget === 0 ? '0 表示只复习，不安排新词' : '按词书顺序学，完成目标后仍可继续' }}</small>
        </div>
      </div>
      <div class="review-row is-slider">
        <input
          v-model.number="newWordTarget"
          type="range"
          :min="NEW_WORD_TARGET_MIN"
          :max="NEW_WORD_TARGET_MAX"
          @change="saveNewWordTarget"
        />
        <span class="review-scale">{{ NEW_WORD_TARGET_MIN }} – {{ NEW_WORD_TARGET_MAX }}</span>
      </div>
      <div class="review-row">
        <div class="review-main">
          <strong>当前学习词书</strong>
          <small>新词按这本书的顺序学，切换词书会保留已有进度</small>
        </div>
        <select v-model="currentBookId" class="settings-select" @change="saveCurrentBook">
          <option :value="null">未选择</option>
          <option v-for="book in books" :key="book.id" :value="book.id">
            {{ book.name }}
          </option>
        </select>
      </div>
      <p v-if="newWordErrorMessage" class="settings-notice is-error">{{ newWordErrorMessage }}</p>
    </div>

    <!-- 抽屉：预设是入口，完整表单在这里 -->
    <div v-if="drawerOpen" class="drawer-scrim" @click.self="closeDrawer">
      <aside class="drawer">
        <header class="drawer-head">
          <h3>{{ editingId ? '编辑端点' : '添加端点' }}</h3>
          <button type="button" class="settings-link" @click="closeDrawer">关闭</button>
        </header>

        <p class="drawer-label">从预设开始</p>
        <div class="preset-grid">
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="preset-card"
            :class="{ 'is-active': draftPresetId === preset.id }"
            @click="applyPreset(preset)"
          >
            <strong>{{ preset.name }}</strong>
            <small>{{ preset.hint }}</small>
          </button>
          <button
            type="button"
            class="preset-card"
            :class="{ 'is-active': draftPresetId === 'custom' }"
            @click="applyPreset(null)"
          >
            <strong>自定义</strong>
            <small>任何 OpenAI 兼容地址</small>
          </button>
        </div>

        <label class="drawer-field">
          <span>名称</span>
          <input v-model.trim="draft.label" type="text" placeholder="例如：我的 DeepSeek" />
        </label>

        <label class="drawer-field">
          <span>接口地址</span>
          <input
            v-model.trim="draft.baseUrl"
            type="text"
            spellcheck="false"
            placeholder="https://api.example.com/v1"
          />
        </label>

        <label class="drawer-field">
          <span>API Key{{ editingId ? '（留空保持不变）' : '' }}</span>
          <input v-model.trim="draft.apiKey" type="password" autocomplete="off" placeholder="粘贴 Key" />
        </label>

        <label class="drawer-field">
          <span>模型名</span>
          <input v-model.trim="draft.model" type="text" spellcheck="false" list="endpoint-models" />
          <datalist id="endpoint-models">
            <option v-for="name in modelSuggestions" :key="name" :value="name" />
          </datalist>
        </label>

        <label class="drawer-field">
          <span>视觉模型（留空则不做 OCR）</span>
          <input v-model.trim="draft.visionModel" type="text" spellcheck="false" list="endpoint-models" />
        </label>

        <div class="drawer-test">
          <button type="button" class="settings-secondary" :disabled="testing" @click="runTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <span v-if="testResult" class="drawer-test-msg" :class="{ 'is-bad': !testResult.ok }">
            {{ testResult.message }}
          </span>
        </div>

        <p v-if="saveErrorMessage" class="settings-notice is-error">{{ saveErrorMessage }}</p>

        <footer class="drawer-foot">
          <button type="button" class="settings-primary" :disabled="!canSave || saving" @click="save">
            {{ saving ? '保存中…' : '保存端点' }}
          </button>
        </footer>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createEndpoint,
  deleteEndpoint,
  fetchEndpoints,
  fetchLearningSettings,
  setDefaultEndpoint,
  testEndpointConnection,
  testSavedEndpoint,
  updateEndpoint,
  updateLearningSettings,
} from '../services/settings.service';
import type { AiEndpoint, EndpointPreset, SystemEndpointStatus } from '../types/settings';
import { fetchSystemWordBooks } from '../services/system-word-book.service';
import type { SystemWordBook } from '../types/system-word-book';

const REVIEW_LIMIT_MIN = 1;
const REVIEW_LIMIT_MAX = 200;
const NEW_WORD_TARGET_MIN = 0;
const NEW_WORD_TARGET_MAX = 200;

const endpoints = ref<AiEndpoint[]>([]);
const presets = ref<EndpointPreset[]>([]);
const system = ref<SystemEndpointStatus>({
  canUse: false,
  available: false,
  label: null,
  model: null,
});
const isLoading = ref(true);
const loadErrorMessage = ref('');
const reviewErrorMessage = ref('');
const newWordErrorMessage = ref('');
const books = ref<SystemWordBook[]>([]);
const saveErrorMessage = ref('');
const savedFlash = ref(false);
const reviewLimitEnabled = ref(false);
const reviewLimit = ref(20);
const newWordTarget = ref(20);
const currentBookId = ref<number | null>(null);

const drawerOpen = ref(false);
const editingId = ref<number | null>(null);
const draftPresetId = ref('custom');
const testing = ref(false);
const saving = ref(false);
const busyId = ref<number | null>(null);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const statuses = reactive<Record<number, { tone: string; text: string }>>({});
const draft = reactive({ label: '', baseUrl: '', apiKey: '', model: '', visionModel: '' });

let flashTimer: ReturnType<typeof setTimeout> | undefined;

const currentPreset = computed(
  () => presets.value.find((preset) => preset.id === draftPresetId.value) ?? null,
);
const modelSuggestions = computed(() => {
  const preset = currentPreset.value;

  return preset ? [...preset.models, ...preset.visionModels] : [];
});
const canSave = computed(
  () =>
    Boolean(draft.label && draft.baseUrl && draft.model) &&
    (Boolean(editingId.value) || Boolean(draft.apiKey)),
);
const hasOwnEndpoint = computed(() => endpoints.value.some((item) => item.isDefault));

function statusOf(id: number) {
  return statuses[id] ?? { tone: 'idle', text: '未测试' };
}

/** 端点列表要区分「上次测过」和「没测过」，但结果不落库，刷新后就回到未测试。 */
function flashSaved() {
  savedFlash.value = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    savedFlash.value = false;
  }, 1600);
}

async function loadEndpoints() {
  const response = await fetchEndpoints();

  endpoints.value = response.data.endpoints;
  presets.value = response.data.presets;
  system.value = response.data.system;
}

async function loadReview() {
  const response = await fetchLearningSettings();

  reviewLimitEnabled.value = response.data.dailyReviewLimitEnabled;
  reviewLimit.value = response.data.dailyReviewLimit;
  newWordTarget.value = response.data.dailyNewWordTarget;
  currentBookId.value = response.data.currentSystemBookId;
}

async function loadBooks() {
  const response = await fetchSystemWordBooks();

  books.value = response.data;
}

onMounted(async () => {
  try {
    await Promise.all([loadEndpoints(), loadReview(), loadBooks()]);
  } catch (error) {
    loadErrorMessage.value = error instanceof Error ? error.message : '读取设置失败';
  } finally {
    isLoading.value = false;
  }
});

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

function openDrawer(item?: AiEndpoint) {
  drawerOpen.value = true;
  testResult.value = null;
  saveErrorMessage.value = '';
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

  draft.apiKey = '';
  applyPreset(presets.value[0] ?? null);
}

function closeDrawer() {
  drawerOpen.value = false;
  editingId.value = null;
}

async function runTest() {
  testing.value = true;
  testResult.value = null;

  try {
    // 编辑时如果没填新 Key，就只能让后端用它存的那份来测。
    const response = editingId.value && !draft.apiKey
      ? await testSavedEndpoint(editingId.value)
      : await testEndpointConnection({
        baseUrl: draft.baseUrl,
        model: draft.model,
        apiKey: draft.apiKey,
      });

    testResult.value = response.data;
  } catch (error) {
    testResult.value = { ok: false, message: error instanceof Error ? error.message : '测试失败' };
  } finally {
    testing.value = false;
  }
}

async function testSaved(item: AiEndpoint) {
  busyId.value = item.id;

  try {
    const response = await testSavedEndpoint(item.id);

    statuses[item.id] = response.data.ok
      ? { tone: 'ok', text: '可用' }
      : { tone: 'bad', text: '连接失败' };
  } catch (error) {
    statuses[item.id] = {
      tone: 'bad',
      text: error instanceof Error ? error.message : '测试失败',
    };
  } finally {
    busyId.value = null;
  }
}

async function save() {
  saving.value = true;
  saveErrorMessage.value = '';

  try {
    const payload = {
      label: draft.label,
      baseUrl: draft.baseUrl,
      model: draft.model,
      visionModel: draft.visionModel,
      apiKey: draft.apiKey,
    };

    if (editingId.value) {
      await updateEndpoint(editingId.value, payload);
    } else {
      await createEndpoint(payload);
    }

    await loadEndpoints();
    closeDrawer();
  } catch (error) {
    saveErrorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function makeDefault(item: AiEndpoint) {
  try {
    await setDefaultEndpoint(item.id);
    await loadEndpoints();
  } catch (error) {
    loadErrorMessage.value = error instanceof Error ? error.message : '设置默认端点失败';
  }
}

async function remove(item: AiEndpoint) {
  try {
    await deleteEndpoint(item.id);
    delete statuses[item.id];
    await loadEndpoints();
  } catch (error) {
    loadErrorMessage.value = error instanceof Error ? error.message : '删除端点失败';
  }
}

/** 复习节奏改动直接保存：它只有一个数值，加一个保存按钮反而多一步。 */
async function persistReview() {
  reviewErrorMessage.value = '';

  try {
    await updateLearningSettings({
      dailyReviewLimitEnabled: reviewLimitEnabled.value,
      dailyReviewLimit: reviewLimit.value,
    });
    flashSaved();
  } catch (error) {
    reviewErrorMessage.value = error instanceof Error ? error.message : '保存复习设置失败';
  }
}

function toggleReviewLimit() {
  reviewLimitEnabled.value = !reviewLimitEnabled.value;
  persistReview();
}

function saveReview() {
  persistReview();
}

/** 新词目标和当前词书同样是单值改动，改完直接存，不加保存按钮。 */
async function persistNewWordTarget() {
  newWordErrorMessage.value = '';

  try {
    await updateLearningSettings({ dailyNewWordTarget: newWordTarget.value });
    flashSaved();
  } catch (error) {
    newWordErrorMessage.value = error instanceof Error ? error.message : '保存新词目标失败';
  }
}

function saveNewWordTarget() {
  persistNewWordTarget();
}

async function persistCurrentBook() {
  newWordErrorMessage.value = '';

  try {
    await updateLearningSettings({ currentSystemBookId: currentBookId.value });
    flashSaved();
  } catch (error) {
    newWordErrorMessage.value = error instanceof Error ? error.message : '保存当前词书失败';
  }
}

function saveCurrentBook() {
  persistCurrentBook();
}
</script>

<style scoped>
.settings-page {
  --ink: #1d1a17;
  --soft: #6f665d;
  --line: rgba(42, 36, 31, 0.12);
  --rose: #e0445f;
  --green: #047857;

  width: min(100%, 860px);
  margin: 0 auto;
  padding: 30px 28px 90px;
  color: var(--ink);
}

.settings-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 26px;
}

.settings-head h2 {
  margin: 0 0 6px;
  font-size: 30px;
}

.settings-lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--soft);
}

.settings-saved {
  font-size: 13px;
  color: var(--green);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.settings-saved.is-on {
  opacity: 1;
}

.settings-block {
  margin-bottom: 34px;
}

.settings-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.settings-block-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft);
}

.settings-block-head .settings-block-title {
  margin: 0;
}

.settings-notice {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--soft);
}

.settings-notice.is-error {
  color: var(--rose);
}

.settings-notice.is-info {
  color: var(--green);
}

.settings-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--soft);
}

.endpoint-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
  margin-bottom: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.endpoint-card.is-default {
  border-color: rgba(4, 120, 87, 0.35);
  background: rgba(4, 120, 87, 0.04);
}

.endpoint-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.endpoint-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(42, 36, 31, 0.07);
  font-size: 11px;
  color: var(--soft);
}

.endpoint-tag.is-default {
  background: rgba(4, 120, 87, 0.14);
  color: var(--green);
}

.endpoint-url {
  margin: 0 0 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--soft);
  word-break: break-all;
}

.endpoint-meta {
  margin: 0;
  font-size: 12px;
  color: var(--soft);
}

.endpoint-side {
  display: grid;
  gap: 10px;
  justify-items: end;
  flex: none;
}

.endpoint-status {
  font-size: 12px;
  color: var(--soft);
}

.endpoint-status.is-ok {
  color: var(--green);
}

.endpoint-status.is-bad {
  color: var(--rose);
}

.endpoint-actions {
  display: flex;
  gap: 12px;
}

.settings-link {
  border: 0;
  padding: 0;
  background: none;
  font-size: 13px;
  color: var(--rose);
  cursor: pointer;
}

.settings-link.is-danger {
  color: var(--soft);
}

.settings-link:disabled {
  opacity: 0.5;
  cursor: default;
}

.settings-primary,
.settings-secondary {
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}

.settings-primary {
  border: 0;
  background: var(--rose);
  color: #fff;
}

.settings-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-secondary {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.review-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}

.review-main {
  display: grid;
  gap: 3px;
}

.review-main strong {
  font-size: 15px;
}

.review-main small {
  font-size: 13px;
  color: var(--soft);
}

.review-row.is-slider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  padding-top: 10px;
  border-top: 0;
}

.review-row.is-disabled {
  opacity: 0.45;
}

.review-row input[type='range'] {
  width: 100%;
  accent-color: var(--green);
}

.review-scale {
  font-size: 12px;
  color: var(--soft);
}

.settings-select {
  flex: none;
  max-width: 55%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  font-size: 14px;
  color: inherit;
}

.review-switch {
  flex: none;
  width: 52px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: rgba(42, 36, 31, 0.18);
  cursor: pointer;
  transition: background 0.2s ease;
}

.review-switch.is-on {
  background: var(--green);
}

.review-switch-thumb {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transform: translateX(3px);
  transition: transform 0.2s ease;
}

.review-switch.is-on .review-switch-thumb {
  transform: translateX(25px);
}

/* 抽屉 */
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  justify-content: flex-end;
  background: rgba(22, 18, 28, 0.35);
}

.drawer {
  width: min(100%, 470px);
  height: 100%;
  overflow-y: auto;
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 24px;
  background: #fffdfa;
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.2);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer-head h3 {
  margin: 0;
  font-size: 20px;
}

.drawer-label {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--soft);
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-card {
  display: grid;
  gap: 3px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.preset-card.is-active {
  border-color: var(--rose);
  background: rgba(224, 68, 95, 0.05);
}

.preset-card strong {
  font-size: 13px;
}

.preset-card small {
  font-size: 11px;
  color: var(--soft);
}

.drawer-field {
  display: grid;
  gap: 6px;
}

.drawer-field span {
  font-size: 12px;
  color: var(--soft);
}

.drawer-field input {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}

.drawer-test {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.drawer-test-msg {
  font-size: 12px;
  color: var(--green);
}

.drawer-test-msg.is-bad {
  color: var(--rose);
}

.drawer-foot {
  padding-top: 6px;
}

@media (max-width: 700px) {
  .endpoint-card {
    flex-direction: column;
  }

  .endpoint-side {
    justify-items: start;
  }
}
</style>
