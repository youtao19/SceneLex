<template>
  <section class="settings-page">
    <header class="settings-topbar">
      <div>
        <p class="eyebrow">{{ canManageModelSettings ? 'CONTROL DECK' : 'PERSONAL SETTINGS' }}</p>
        <h2 class="section-title">更多</h2>
        <p>
          {{ canManageModelSettings
            ? '把模型运行态、个人密钥和复习节奏拆开管理，减少误改。'
            : '管理你的个人模型密钥和复习推送节奏。' }}
        </p>
      </div>
      <div class="status-board" aria-label="当前配置状态">
        <article v-if="canManageModelSettings">
          <span>当前模型</span>
          <strong>{{ activeProviderName }}</strong>
          <small>{{ activeModelName }}</small>
        </article>
        <article>
          <span>个人密钥</span>
          <strong>{{ selectedApiKeyProviderName }}</strong>
          <small>{{ selectedApiKeyConfig ? describeApiKeyStatus(selectedApiKeyConfig) : '读取中' }}</small>
        </article>
        <article>
          <span>复习推送</span>
          <strong>{{ dailyReviewLimitEnabled ? normalizedDailyReviewLimit : 'ALL' }}</strong>
          <small>{{ dailyReviewLimitEnabled ? '每日数量限制' : '展示所有到期词' }}</small>
        </article>
      </div>
    </header>

    <section class="settings-layout" :class="{ 'is-personal-only': !canManageModelSettings }">
      <div class="settings-main">
        <article v-if="canManageModelSettings" class="settings-panel is-model" aria-labelledby="model-title">
          <div class="panel-head">
            <div>
              <p class="eyebrow">GENERATION</p>
              <h3 id="model-title">后端模型运行态</h3>
              <p>保存后，新词生成和阅读问答都会切到这组 provider 与模型名。</p>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasModelChanges }">
              {{ hasModelChanges ? '未保存' : '已同步' }}
            </span>
          </div>

          <div v-if="isLoading" class="notice-box">正在读取后端模型配置...</div>
          <div v-else-if="modelErrorMessage" class="notice-box is-error">{{ modelErrorMessage }}</div>

          <template v-if="settings">
            <div class="provider-grid" aria-label="模型服务">
              <button
                v-for="provider in settings.providers"
                :key="provider.id"
                class="provider-tile"
                :class="{ 'is-active': selectedProvider === provider.id }"
                type="button"
                @click="chooseProvider(provider.id)"
              >
                <span class="provider-icon">{{ providerMeta[provider.id].icon }}</span>
                <span>
                  <strong>{{ provider.name }}</strong>
                  <small>{{ providerMeta[provider.id].tone }}</small>
                </span>
              </button>
            </div>

            <div class="inline-form">
              <label class="field-block">
                <span>模型名称</span>
                <input
                  v-model.trim="selectedModel"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="selectedProviderConfig?.model || '输入模型名'"
                />
              </label>
              <div class="preset-row" aria-label="常用模型">
                <button
                  v-for="preset in activePresets"
                  :key="preset"
                  class="preset-chip"
                  type="button"
                  @click="selectedModel = preset"
                >
                  {{ preset }}
                </button>
              </div>
              <button
                class="primary-action"
                type="button"
                :disabled="!canSaveModel"
                @click="saveModelSettings"
              >
                保存模型设置
              </button>
            </div>
            <p v-if="modelSuccessMessage" class="save-result">{{ modelSuccessMessage }}</p>
          </template>
        </article>

        <article class="settings-panel" aria-labelledby="api-key-title">
          <div class="panel-head">
            <div>
              <p class="eyebrow">API KEY</p>
              <h3 id="api-key-title">个人模型密钥</h3>
              <p>个人 Key 只服务当前账号；保存前会先测试，成功后才写入。</p>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasApiKeyChanges }">
              {{ hasApiKeyChanges ? '未保存' : '已同步' }}
            </span>
          </div>

          <div v-if="apiKeyErrorMessage" class="notice-box is-error">{{ apiKeyErrorMessage }}</div>
          <div v-if="hasApiKeyChanges" class="notice-box">保存时会先测试这个 API Key， 测试通过后才会写入。</div>
          <div v-if="apiKeySettings?.activeProvider === 'ollama'" class="notice-box">
            当前系统使用 Ollama，本地服务不需要 API Key。管理员切到 Kimi 或 DeepSeek 后会优先使用你保存的密钥。
          </div>

          <div class="api-key-grid">
            <div class="provider-grid is-compact" aria-label="API Key 服务">
              <button
                v-for="provider in apiKeySettings?.providers ?? []"
                :key="provider.id"
                class="provider-tile"
                :class="{ 'is-active': selectedApiKeyProvider === provider.id }"
                type="button"
                @click="chooseApiKeyProvider(provider.id)"
              >
                <span class="provider-icon">{{ providerMeta[provider.id].icon }}</span>
                <span>
                  <strong>{{ provider.name }}</strong>
                  <small>{{ describeApiKeyStatus(provider) }}</small>
                </span>
              </button>
            </div>

            <div class="secret-form">
              <label class="field-block">
                <span>{{ selectedApiKeyProviderName }} API Key</span>
                <input
                  v-model.trim="apiKeyInput"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="粘贴你的 API Key；留空保存会清除"
                />
              </label>
              <div class="action-row">
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canSaveApiKey"
                  @click="saveApiKeySettings"
                >
                  {{ isSavingApiKey ? '正在测试...' : '保存个人密钥' }}
                </button>
                <button
                  class="secondary-action"
                  type="button"
                  :disabled="!selectedApiKeyConfig?.hasUserApiKey || isSavingApiKey"
                  @click="clearApiKeySettings"
                >
                  清除
                </button>
              </div>
              <p v-if="apiKeySuccessMessage" class="save-result">{{ apiKeySuccessMessage }}</p>
            </div>
          </div>
        </article>

        <article class="settings-panel" aria-labelledby="learning-title">
          <div class="panel-head">
            <div>
              <p class="eyebrow">REVIEW</p>
              <h3 id="learning-title">复习推送节奏</h3>
              <p>只控制复习舱每天展示多少到期词，不会删除或跳过词库数据。</p>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasLearningChanges }">
              {{ hasLearningChanges ? '未保存' : '已同步' }}
            </span>
          </div>

          <div v-if="learningErrorMessage" class="notice-box is-error">{{ learningErrorMessage }}</div>

          <div class="review-console">
            <button
              class="switch-row"
              type="button"
              :aria-pressed="dailyReviewLimitEnabled"
              @click="toggleDailyReviewLimit"
            >
              <span>
                <strong>每日数量限制</strong>
                <small>{{ dailyReviewLimitEnabled ? '按设定数量推送到期词' : '关闭后展 示所有到期词' }}</small>
              </span>
              <span class="switch-track" :class="{ 'is-on': dailyReviewLimitEnabled }">
                <span class="switch-thumb"></span>
              </span>
            </button>

            <label class="field-block review-count-field">
              <span>每天推送数量</span>
              <input
                v-model.number="dailyReviewLimit"
                :disabled="!dailyReviewLimitEnabled"
                type="number"
                min="1"
                max="200"
                step="1"
              />
            </label>

            <div class="review-meter">
              <strong>{{ dailyReviewLimitEnabled ? normalizedDailyReviewLimit : 'ALL' }}</strong>
              <span>{{ dailyReviewLimitEnabled ? '个到期单词 / 天' : '所有到期单词' }}</span>
              <input
                v-model.number="dailyReviewLimit"
                class="review-slider"
                :disabled="!dailyReviewLimitEnabled"
                type="range"
                min="1"
                max="100"
                step="1"
                aria-label="每天推送数量"
              />
            </div>

            <div class="action-row">
              <button
                class="primary-action"
                type="button"
                :disabled="!canSaveLearning"
                @click="saveLearningSettings"
              >
                保存复习设置
              </button>
              <p v-if="learningSuccessMessage" class="save-result">{{ learningSuccessMessage }}</p>
            </div>
          </div>
        </article>
      </div>

      <aside v-if="canManageModelSettings" class="runtime-panel" aria-label="运行诊断">
        <p class="eyebrow">RUNTIME</p>
        <h3>运行诊断</h3>
        <p>{{ activeProviderDescription }}</p>

        <dl v-if="selectedProviderConfig" class="diagnostic-list">
          <div>
            <dt>服务</dt>
            <dd>{{ selectedProviderName }}</dd>
          </div>
          <div>
            <dt>地址</dt>
            <dd>{{ selectedProviderConfig.baseURL }}</dd>
          </div>
          <div>
            <dt>超时</dt>
            <dd>{{ selectedProviderConfig.timeout }} ms</dd>
          </div>
          <div>
            <dt>密钥</dt>
            <dd>{{ keyStatus }}</dd>
          </div>
        </dl>
      </aside>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  fetchAiSettings,
  fetchLearningSettings,
  fetchUserApiKeySettings,
  updateAiSettings,
  updateLearningSettings,
  updateUserApiKeySettings,
} from '../services/settings.service';
import { useUserStore } from '../stores/user';
import type {
  AiProvider,
  AiSettings,
  UserApiKeyProvider,
  UserApiKeyProviderSettings,
  UserApiKeySettings,
} from '../types/settings';

const userStore = useUserStore();
const settings = ref<AiSettings | null>(null);
const apiKeySettings = ref<UserApiKeySettings | null>(null);
const selectedProvider = ref<AiProvider>('ollama');
const selectedModel = ref('');
const selectedApiKeyProvider = ref<UserApiKeyProvider>('deepseek');
const apiKeyInput = ref('');
const savedDailyReviewLimitEnabled = ref(false);
const dailyReviewLimitEnabled = ref(false);
const savedDailyReviewLimit = ref(20);
const dailyReviewLimit = ref(20);
const isLoading = ref(false);
const isSaving = ref(false);
const isSavingApiKey = ref(false);
const isSavingLearning = ref(false);
const modelErrorMessage = ref('');
const apiKeyErrorMessage = ref('');
const learningErrorMessage = ref('');
const modelSuccessMessage = ref('');
const apiKeySuccessMessage = ref('');
const learningSuccessMessage = ref('');
const canManageModelSettings = computed(() => userStore.isAdmin);

const providerMeta: Record<AiProvider, { icon: string; tone: string; description: string; presets: string[] }> = {
  ollama: {
    icon: 'O',
    tone: '本地 Ollama',
    description: '适合日常本地生成，要求 Ollama 服务在本机启动。',
    presets: ['qwen3.5:4b', 'gemma4:e4b'],
  },
  kimi: {
    icon: 'K',
    tone: 'Kimi 云端 API',
    description: '适合使用 Kimi 远程模型，后端可用 KIMI_API_KEY 或用户个人密钥。',
    presets: ['kimi-k2.6', 'kimi-thinking-preview'],
  },
  deepseek: {
    icon: 'D',
    tone: '云端 API',
    description: '适合需要更稳定云端输出时使用，后端必须配置 DEEPSEEK_API_KEY。',
    presets: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
};

const selectedProviderConfig = computed(() => {
  return settings.value?.providers.find((provider) => provider.id === selectedProvider.value) ?? null;
});
const selectedApiKeyConfig = computed(() => {
  return apiKeySettings.value?.providers.find((provider) => provider.id === selectedApiKeyProvider.value) ?? null;
});
const savedProviderConfig = computed(() => {
  return settings.value?.providers.find((provider) => provider.id === settings.value?.provider) ?? null;
});
const activeProviderName = computed(() => savedProviderConfig.value?.name ?? '未连接');
const activeModelName = computed(() => savedProviderConfig.value?.model ?? '等待配置');
const selectedProviderName = computed(() => selectedProviderConfig.value?.name ?? '未连接');
const selectedApiKeyProviderName = computed(() => selectedApiKeyConfig.value?.name ?? 'DeepSeek');
const activePresets = computed(() => providerMeta[selectedProvider.value].presets);
const activeProviderDescription = computed(() => providerMeta[selectedProvider.value].description);
const normalizedDailyReviewLimit = computed(() => {
  const limit = Number(dailyReviewLimit.value);

  if (!Number.isInteger(limit)) {
    return 20;
  }

  return Math.min(200, Math.max(1, limit));
});
const hasModelChanges = computed(() => {
  if (!settings.value) {
    return false;
  }

  return settings.value.provider !== selectedProvider.value || selectedProviderConfig.value?.model !== selectedModel.value;
});
const hasApiKeyChanges = computed(() => {
  return Boolean(apiKeyInput.value.trim());
});
const hasLearningChanges = computed(() => {
  return dailyReviewLimitEnabled.value !== savedDailyReviewLimitEnabled.value
    || normalizedDailyReviewLimit.value !== savedDailyReviewLimit.value;
});
const canSaveModel = computed(() => {
  return Boolean(settings.value && selectedModel.value.trim() && hasModelChanges.value && !isSaving.value);
});
const canSaveApiKey = computed(() => {
  return Boolean(apiKeySettings.value && hasApiKeyChanges.value && !isSavingApiKey.value);
});
const canSaveLearning = computed(() => {
  return Boolean(hasLearningChanges.value && !isSavingLearning.value);
});
const keyStatus = computed(() => {
  if (selectedProvider.value === 'ollama') {
    return '不需要 API Key';
  }

  return selectedProviderConfig.value?.hasApiKey ? '已读取' : '未配置';
});

/**
 * 状态文案只说明使用顺序，避免暗示前端知道密钥明文。
 */
function describeApiKeyStatus(provider: UserApiKeyProviderSettings) {
  if (provider.hasUserApiKey) {
    return '已保存你的 Key';
  }

  if (provider.hasServerApiKey) {
    return '会使用服务器兜底 Key';
  }

  return '未配置';
}

/**
 * 普通用户不请求模型配置，避免只靠前端隐藏敏感运行态。
 */
async function loadSettings() {
  isLoading.value = canManageModelSettings.value;
  modelErrorMessage.value = '';
  apiKeyErrorMessage.value = '';
  learningErrorMessage.value = '';

  const modelRequest = canManageModelSettings.value
    ? fetchAiSettings()
      .then((modelResponse) => {
        settings.value = modelResponse.data;
        selectedProvider.value = modelResponse.data.provider;
        selectedModel.value = modelResponse.data.providers.find((provider) => provider.id === modelResponse.data.provider)?.model ?? '';
      })
      .catch((error) => {
        modelErrorMessage.value = error instanceof Error ? error.message : '读取模型设 置失败';
      })
      .finally(() => {
        isLoading.value = false;
      })
    : Promise.resolve();

  const apiKeyRequest = fetchUserApiKeySettings()
    .then((response) => {
      apiKeySettings.value = response.data;
      const activeCloudProvider = response.data.providers.find((provider) => provider.id === response.data.activeProvider);
      selectedApiKeyProvider.value = activeCloudProvider?.id ?? 'deepseek';
      apiKeyInput.value = '';
    })
    .catch((error) => {
      apiKeyErrorMessage.value = error instanceof Error ? error.message : '读取个人密钥设置失败';
    });

  const learningRequest = fetchLearningSettings()
    .then((learningResponse) => {
      savedDailyReviewLimitEnabled.value = learningResponse.data.dailyReviewLimitEnabled;
      dailyReviewLimitEnabled.value = learningResponse.data.dailyReviewLimitEnabled;
      savedDailyReviewLimit.value = learningResponse.data.dailyReviewLimit;
      dailyReviewLimit.value = learningResponse.data.dailyReviewLimit;
    })
    .catch((error) => {
      learningErrorMessage.value = error instanceof Error ? error.message : '读取复习设置失败';
    });

  await Promise.all([modelRequest, apiKeyRequest, learningRequest]);
}

/**
 * 切换 provider 时同步带出该服务当前模型，避免保存到另一个服务的模型名。
 */
function chooseProvider(provider: AiProvider) {
  selectedProvider.value = provider;
  selectedModel.value = settings.value?.providers.find((item) => item.id === provider)?.model ?? '';
  modelSuccessMessage.value = '';
}

/**
 * 切换密钥 provider 时不回显旧密钥，避免浏览器缓存里留下明文。
 */
function chooseApiKeyProvider(provider: UserApiKeyProvider) {
  selectedApiKeyProvider.value = provider;
  apiKeyInput.value = '';
  apiKeySuccessMessage.value = '';
}

/**
 * 开关只控制数量限制是否生效，用户填过的数量会保留，方便再次开启。
 */
function toggleDailyReviewLimit() {
  dailyReviewLimitEnabled.value = !dailyReviewLimitEnabled.value;
  learningSuccessMessage.value = '';
}

/**
 * 保存后更新本页快照，后续生成请求会使用同一个后端运行态。
 */
async function saveModelSettings() {
  if (!canSaveModel.value) {
    return;
  }

  isSaving.value = true;
  modelErrorMessage.value = '';
  modelSuccessMessage.value = '';

  try {
    const response = await updateAiSettings({
      provider: selectedProvider.value,
      model: selectedModel.value.trim(),
    });
    settings.value = response.data;
    selectedProvider.value = response.data.provider;
    selectedModel.value = response.data.providers.find((provider) => provider.id === response.data.provider)?.model ?? '';
    modelSuccessMessage.value = '已保存，下一次生成会使用这组模型设置。';
  } catch (error) {
    modelErrorMessage.value = error instanceof Error ? error.message : '保存模型设置失 败';
  } finally {
    isSaving.value = false;
  }
}

/**
 * 保存和清除走同一个接口，避免两套状态更新逻辑分叉。
 */
async function saveApiKey(apiKey: string, successMessage: string) {
  isSavingApiKey.value = true;
  apiKeyErrorMessage.value = '';
  apiKeySuccessMessage.value = '';

  try {
    const response = await updateUserApiKeySettings({
      provider: selectedApiKeyProvider.value,
      apiKey,
    });
    apiKeySettings.value = response.data;
    apiKeyInput.value = '';
    apiKeySuccessMessage.value = successMessage;
  } catch (error) {
    apiKeyErrorMessage.value = error instanceof Error ? error.message : '保存个人密钥失败';
  } finally {
    isSavingApiKey.value = false;
  }
}

async function saveApiKeySettings() {
  if (!canSaveApiKey.value) {
    return;
  }

  await saveApiKey(apiKeyInput.value.trim(), '测试通过，已保存。下一次生成会优先使用你 的密钥。');
}

async function clearApiKeySettings() {
  if (!selectedApiKeyConfig.value?.hasUserApiKey || isSavingApiKey.value) {
    return;
  }

  await saveApiKey('', '已清除，后续会改用服务器兜底密钥或提示未配置。');
}

/**
 * 保存后只限制每天队列数量，超过数量的到期词会留到下一次同步继续出现。
 */
async function saveLearningSettings() {
  if (!canSaveLearning.value) {
    return;
  }

  isSavingLearning.value = true;
  learningErrorMessage.value = '';
  learningSuccessMessage.value = '';

  try {
    const response = await updateLearningSettings({
      dailyReviewLimitEnabled: dailyReviewLimitEnabled.value,
      dailyReviewLimit: normalizedDailyReviewLimit.value,
    });
    savedDailyReviewLimitEnabled.value = response.data.dailyReviewLimitEnabled;
    dailyReviewLimitEnabled.value = response.data.dailyReviewLimitEnabled;
    savedDailyReviewLimit.value = response.data.dailyReviewLimit;
    dailyReviewLimit.value = response.data.dailyReviewLimit;
    learningSuccessMessage.value = dailyReviewLimitEnabled.value
      ? '已保存，下一次同步复习舱会按这个数量推送。'
      : '已保存，下一次同步复习舱会展示所有到期词。';
  } catch (error) {
    learningErrorMessage.value = error instanceof Error ? error.message : '保存复习设置失败';
  } finally {
    isSavingLearning.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped>
.settings-page {
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 34px 28px 72px;
  display: grid;
  gap: 18px;
  --settings-ink: #1d1a17;
  --settings-soft: #6f665d;
  --settings-line: rgba(42, 36, 31, 0.12);
  --settings-paper: rgba(255, 253, 250, 0.88);
  --settings-panel: rgba(255, 255, 255, 0.74);
  --settings-green: #047857;
  --settings-amber: #b45309;
  --settings-rose: #e0445f;
}

.settings-topbar {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(420px, 1fr);
  gap: 18px;
  align-items: end;
}

.settings-topbar > div:first-child {
  display: grid;
  gap: 7px;
}

.settings-topbar p {
  margin: 0;
  color: var(--settings-soft);
  line-height: 1.7;
}

.section-title {
  margin: 0;
  color: var(--settings-ink);
  font-family: var(--sl-display-font);
  font-size: 34px;
  line-height: 1.05;
}

.eyebrow {
  margin: 0;
  color: #b95035;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.status-board {
  border: 1px solid var(--settings-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  background: var(--settings-panel);
  box-shadow: 0 16px 42px rgba(58, 42, 33, 0.07);
}

.status-board article {
  min-height: 96px;
  padding: 16px;
  border-right: 1px solid var(--settings-line);
  display: grid;
  align-content: center;
  gap: 6px;
}

.status-board article:last-child {
  border-right: 0;
}

.status-board span,
.status-board small {
  color: var(--settings-soft);
  font-weight: 900;
}

.status-board span {
  font-size: 12px;
}

.status-board strong {
  color: var(--settings-ink);
  font-size: 22px;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 18px;
  align-items: start;
}

.settings-layout.is-personal-only {
  grid-template-columns: minmax(0, 900px);
}

.settings-main {
  display: grid;
  gap: 18px;
}

.settings-panel,
.runtime-panel {
  border: 1px solid var(--settings-line);
  border-radius: 8px;
  background: var(--settings-paper);
  box-shadow: 0 16px 42px rgba(58, 42, 33, 0.07);
}

.settings-panel {
  overflow: hidden;
}

.runtime-panel {
  position: sticky;
  top: 96px;
  padding: 20px;
  display: grid;
  gap: 12px;
}

.runtime-panel h3 {
  margin: 0;
  color: var(--settings-ink);
  font-family: var(--sl-display-font);
  font-size: 22px;
}

.runtime-panel p {
  margin: 0;
  color: var(--settings-soft);
  line-height: 1.7;
}

.panel-head {
  padding: 18px;
  border-bottom: 1px solid var(--settings-line);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.panel-head > div {
  display: grid;
  gap: 5px;
}

.panel-head h3 {
  margin: 0;
  color: var(--settings-ink);
  font-family: var(--sl-display-font);
  font-size: 22px;
}

.panel-head p:not(.eyebrow) {
  margin: 0;
  color: var(--settings-soft);
  line-height: 1.65;
}

.state-pill {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: var(--settings-green);
  background: rgba(220, 252, 231, 0.72);
  border: 1px solid rgba(4, 120, 87, 0.18);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.state-pill.is-dirty {
  color: var(--settings-amber);
  background: rgba(255, 237, 213, 0.78);
  border-color: rgba(154, 52, 18, 0.18);
}

.notice-box {
  margin: 14px 18px 0;
  padding: 14px 16px;
  border-radius: 8px;
  color: var(--settings-soft);
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid var(--settings-line);
  font-weight: 800;
}

.notice-box.is-error {
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.72);
  border-color: rgba(185, 28, 28, 0.18);
}

.provider-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.provider-grid.is-compact {
  padding: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-tile {
  min-height: 94px;
  padding: 14px;
  border: 1px solid var(--settings-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  text-align: left;
  color: var(--settings-ink);
  background: rgba(255, 255, 255, 0.64);
  cursor: pointer;
}

.provider-tile:hover,
.provider-tile:focus-visible {
  border-color: rgba(22, 101, 52, 0.28);
  background: rgba(236, 253, 245, 0.46);
}

.provider-tile:focus-visible,
.primary-action:focus-visible,
.secondary-action:focus-visible,
.preset-chip:focus-visible {
  outline: 3px solid rgba(22, 101, 52, 0.22);
  outline-offset: 2px;
}

.provider-tile.is-active {
  border-color: rgba(22, 101, 52, 0.42);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.82), rgba(255, 247, 237, 0.7));
  box-shadow: 0 14px 32px rgba(22, 101, 52, 0.12);
}

.provider-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #174a2f;
  background: #d9f99d;
  font-weight: 900;
}

.provider-tile strong,
.provider-tile small {
  display: block;
}

.provider-tile small {
  margin-top: 5px;
  color: var(--settings-soft);
  font-weight: 700;
}

.inline-form {
  padding: 0 18px 18px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 1fr) auto;
  gap: 16px;
  align-items: end;
}

.api-key-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(260px, 0.78fr) minmax(280px, 1fr);
  gap: 18px;
  align-items: start;
}

.secret-form {
  display: grid;
  gap: 14px;
}

.switch-row {
  width: 100%;
  min-height: 74px;
  padding: 14px 16px;
  border: 2px solid rgba(23, 74, 47, 0.18);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  text-align: left;
  color: var(--settings-ink);
  background: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}

.switch-row:hover,
.switch-row:focus-visible {
  border-color: rgba(23, 74, 47, 0.38);
  background: rgba(255, 255, 255, 0.88);
}

.switch-row:focus-visible {
  outline: 3px solid rgba(22, 101, 52, 0.18);
  outline-offset: 2px;
}

.switch-row strong,
.switch-row small {
  display: block;
}

.switch-row small {
  margin-top: 5px;
  color: var(--settings-soft);
  font-weight: 800;
}

.switch-track {
  width: 58px;
  height: 34px;
  padding: 3px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  background: rgba(120, 113, 108, 0.32);
  transition: background 0.2s ease;
}

.switch-track.is-on {
  background: #166534;
}

.switch-thumb {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 6px 16px rgba(28, 25, 23, 0.22);
  transform: translateX(0);
  transition: transform 0.2s ease;
}

.switch-track.is-on .switch-thumb {
  transform: translateX(24px);
}

.field-block {
  display: grid;
  gap: 8px;
}

.field-block span {
  color: #174a2f;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-block input {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border: 1px solid var(--settings-line);
  border-radius: 8px;
  color: var(--settings-ink);
  background: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 900;
  outline: none;
}

.field-block input:hover {
  border-color: rgba(23, 74, 47, 0.42);
  background: rgba(255, 255, 255, 0.94);
}

.field-block input:focus {
  border-color: #166534;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(22, 101, 52, 0.16);
}

.field-block input:disabled,
.review-slider:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.review-slider {
  width: 100%;
  height: 28px;
  accent-color: #166534;
  cursor: pointer;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--settings-line);
  border-radius: 999px;
  color: var(--settings-soft);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.preset-chip:hover {
  color: #166534;
  border-color: rgba(22, 101, 52, 0.28);
  background: rgba(236, 253, 245, 0.56);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.primary-action,
.secondary-action {
  min-height: 42px;
  padding: 0 18px;
  border-radius: 8px;
  font-weight: 900;
  cursor: pointer;
}

.primary-action {
  border: 1px solid transparent;
  color: #fff;
  background: #f44760;
  box-shadow: 0 12px 26px rgba(244, 71, 96, 0.22);
}

.secondary-action {
  border: 1px solid rgba(23, 74, 47, 0.22);
  color: #174a2f;
  background: rgba(255, 255, 255, 0.72);
}

.primary-action:hover:not(:disabled),
.secondary-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary-action:disabled,
.secondary-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.save-result {
  margin: 0;
  color: var(--settings-green);
  font-weight: 800;
}

.review-console {
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px minmax(240px, 1fr);
  gap: 16px;
  align-items: center;
}

.review-console .action-row {
  grid-column: 1 / -1;
}

.review-meter {
  min-height: 92px;
  padding: 14px;
  border: 1px solid rgba(22, 101, 52, 0.14);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  color: #174a2f;
  background: rgba(217, 249, 157, 0.28);
}

.review-meter strong {
  font-family: var(--sl-display-font);
  font-size: 38px;
  line-height: 1;
}

.review-meter span {
  font-weight: 900;
}

.diagnostic-list {
  margin: 0;
  display: grid;
  gap: 0;
}

.diagnostic-list div {
  padding: 12px 0;
  border-bottom: 1px solid var(--settings-line);
}

.diagnostic-list dt {
  color: var(--settings-soft);
  font-size: 12px;
  font-weight: 900;
}

.diagnostic-list dd {
  margin: 6px 0 0;
  color: var(--settings-ink);
  font-weight: 800;
  overflow-wrap: anywhere;
}

@media (max-width: 1180px) {
  .settings-topbar,
  .settings-layout,
  .inline-form,
  .api-key-grid,
  .review-console {
    grid-template-columns: 1fr;
  }

  .runtime-panel {
    position: static;
  }
}

@media (max-width: 860px) {
  .status-board {
    grid-template-columns: 1fr;
  }

  .status-board article {
    border-right: 0;
    border-bottom: 1px solid var(--settings-line);
  }

  .status-board article:last-child {
    border-bottom: 0;
  }

  .provider-grid,
  .provider-grid.is-compact {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 18px 10px 40px;
  }

  .panel-head {
    flex-direction: column;
  }

  .settings-panel,
  .runtime-panel,
  .settings-topbar,
  .status-board {
    border-radius: 8px;
  }
}
</style>
