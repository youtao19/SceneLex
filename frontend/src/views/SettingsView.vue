<template>
  <section class="settings-page">
    <header class="settings-hero">
      <div class="hero-copy">
        <p class="card-label">{{ canManageModelSettings ? 'MODEL ROOM' : 'REVIEW ROOM' }}</p>
        <h2 class="section-title">更多</h2>
        <p v-if="canManageModelSettings">
          这里查看后端当前使用的模型。Cloudflare 部署通过环境变量控制，新词生成和阅读问答都会走当前配置。
        </p>
        <p v-else>
          这里配置你自己的模型 API Key 和复习推送节奏。模型服务和模型名由管理员统一选择。
        </p>
      </div>

      <div v-if="canManageModelSettings" class="hero-meter" aria-label="当前模型">
        <span class="meter-label">ACTIVE</span>
        <strong>{{ activeProviderName }}</strong>
        <small>{{ activeModelName }}</small>
      </div>
    </header>

    <section class="settings-board" :class="{ 'is-learning-only': !canManageModelSettings }">
      <div class="settings-stack">
        <article v-if="canManageModelSettings" class="model-panel surface-card" aria-labelledby="model-title">
          <div class="panel-head">
            <div>
              <p class="card-label">GENERATION</p>
              <h3 id="model-title">模型设置</h3>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasModelChanges }">
              {{ modelSettingsReadOnly ? '环境变量' : (hasModelChanges ? '未保存' : '已同步') }}
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
                :disabled="modelSettingsReadOnly"
                @click="chooseProvider(provider.id)"
              >
                <span class="provider-icon">{{ providerMeta[provider.id].icon }}</span>
                <span>
                  <strong>{{ provider.name }}</strong>
                  <small>{{ providerMeta[provider.id].tone }}</small>
                </span>
              </button>
            </div>

            <div class="model-form">
              <label class="field-block">
                <span>模型名称</span>
                <input
                  v-model.trim="selectedModel"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="modelSettingsReadOnly"
                  :placeholder="selectedProviderConfig?.model || '输入模型名'"
                />
              </label>

              <div class="preset-row" aria-label="常用模型">
                <button
                  v-for="preset in activePresets"
                  :key="preset"
                  class="preset-chip"
                  type="button"
                  :disabled="modelSettingsReadOnly"
                  @click="selectedModel = preset"
                >
                  {{ preset }}
                </button>
              </div>

              <div class="action-row">
                <button
                  class="peach-button save-button"
                  type="button"
                  :disabled="!canSaveModel"
                  @click="saveModelSettings"
                >
                  {{ modelSettingsReadOnly ? '在环境变量中修改' : '保存模型设置' }}
                </button>
                <p v-if="modelSuccessMessage" class="save-result">{{ modelSuccessMessage }}</p>
              </div>
            </div>
          </template>
        </article>

        <article class="model-panel surface-card" aria-labelledby="api-key-title">
          <div class="panel-head">
            <div>
              <p class="card-label">API KEY</p>
              <h3 id="api-key-title">个人模型密钥</h3>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasApiKeyChanges }">
              {{ hasApiKeyChanges ? '未保存' : '已同步' }}
            </span>
          </div>

          <div v-if="apiKeyErrorMessage" class="notice-box is-error">{{ apiKeyErrorMessage }}</div>
          <div v-if="hasApiKeyChanges" class="notice-box">
            保存时会先测试这个 API Key，测试通过后才会写入。
          </div>
          <div v-if="apiKeySettings?.activeProvider === 'ollama'" class="notice-box">
            当前系统使用 Ollama，本地服务不需要 API Key。管理员切到 Kimi 或 DeepSeek 后会优先使用你保存的密钥。
          </div>

          <div class="api-key-form">
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
                class="peach-button save-button"
                type="button"
                :disabled="!canSaveApiKey"
                @click="saveApiKeySettings"
              >
                {{ isSavingApiKey ? '正在测试...' : '保存个人密钥' }}
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="!selectedApiKeyConfig?.hasUserApiKey || isSavingApiKey"
                @click="clearApiKeySettings"
              >
                清除
              </button>
              <p v-if="apiKeySuccessMessage" class="save-result">{{ apiKeySuccessMessage }}</p>
            </div>
          </div>
        </article>

        <article class="model-panel surface-card" aria-labelledby="learning-title">
          <div class="panel-head">
            <div>
              <p class="card-label">REVIEW</p>
              <h3 id="learning-title">复习推送</h3>
            </div>
            <span class="state-pill" :class="{ 'is-dirty': hasLearningChanges }">
              {{ hasLearningChanges ? '未保存' : '已同步' }}
            </span>
          </div>

          <div v-if="learningErrorMessage" class="notice-box is-error">{{ learningErrorMessage }}</div>

          <div class="learning-form">
            <button
              class="switch-row"
              type="button"
              :aria-pressed="dailyReviewLimitEnabled"
              @click="toggleDailyReviewLimit"
            >
              <span>
                <strong>启用每日数量限制</strong>
                <small>{{ dailyReviewLimitEnabled ? '复习舱会按下方数量推送到期词' : '关闭时恢复默认：展示所有到期词' }}</small>
              </span>
              <span class="switch-track" :class="{ 'is-on': dailyReviewLimitEnabled }">
                <span class="switch-thumb"></span>
              </span>
            </button>

            <label class="field-block">
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

            <div class="review-limit-preview">
              <strong>{{ dailyReviewLimitEnabled ? normalizedDailyReviewLimit : 'ALL' }}</strong>
              <span>{{ dailyReviewLimitEnabled ? '个到期单词 / 天' : '所有到期单词' }}</span>
            </div>

            <div class="action-row">
              <button
                class="peach-button save-button"
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

      <aside v-if="canManageModelSettings" class="diagnostic-panel surface-card" aria-label="运行诊断">
        <p class="card-label">RUNTIME</p>
        <h3>运行诊断</h3>

        <dl v-if="selectedProviderConfig" class="diagnostic-list">
          <div>
            <dt>服务地址</dt>
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
          <div>
            <dt>配置来源</dt>
            <dd>{{ settings?.source ?? '后端运行态' }}</dd>
          </div>
        </dl>

        <div class="runtime-note">
          <strong>{{ selectedProviderName }}</strong>
          <p>{{ activeProviderDescription }}</p>
        </div>
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
const modelSettingsReadOnly = computed(() => settings.value?.readOnly === true);
const hasApiKeyChanges = computed(() => {
  return Boolean(apiKeyInput.value.trim());
});
const hasLearningChanges = computed(() => {
  return dailyReviewLimitEnabled.value !== savedDailyReviewLimitEnabled.value
    || normalizedDailyReviewLimit.value !== savedDailyReviewLimit.value;
});
const canSaveModel = computed(() => {
  return Boolean(
    settings.value
      && !modelSettingsReadOnly.value
      && selectedModel.value.trim()
      && hasModelChanges.value
      && !isSaving.value,
  );
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
        modelErrorMessage.value = error instanceof Error ? error.message : '读取模型设置失败';
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
    modelErrorMessage.value = error instanceof Error ? error.message : '保存模型设置失败';
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

  await saveApiKey(apiKeyInput.value.trim(), '测试通过，已保存。下一次生成会优先使用你的密钥。');
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
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: grid;
  gap: 22px;
}

.settings-hero {
  min-height: 210px;
  padding: 34px;
  border: 1px solid rgba(30, 30, 30, 0.08);
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  align-items: end;
  gap: 28px;
  color: #1c1a17;
  background:
    linear-gradient(135deg, rgba(255, 246, 232, 0.96), rgba(234, 248, 239, 0.92)),
    repeating-linear-gradient(90deg, rgba(20, 20, 20, 0.06) 0 1px, transparent 1px 34px);
  box-shadow: 0 18px 45px rgba(56, 42, 25, 0.11);
  overflow: hidden;
}

.hero-copy p {
  max-width: 680px;
  margin: 10px 0 0;
  color: #5d554b;
  line-height: 1.8;
}

.hero-meter {
  min-height: 146px;
  padding: 18px;
  border: 1px solid rgba(28, 26, 23, 0.16);
  border-radius: 8px;
  display: grid;
  align-content: space-between;
  background: rgba(255, 255, 255, 0.52);
}

.meter-label {
  color: #9a5224;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.hero-meter strong {
  font-family: var(--sl-display-font);
  font-size: 34px;
  line-height: 1;
}

.hero-meter small {
  color: #4d6653;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.settings-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

.settings-board.is-learning-only {
  grid-template-columns: minmax(0, 720px);
  justify-content: center;
}

.model-panel,
.diagnostic-panel {
  border-radius: 8px;
}

.model-panel {
  padding: 26px;
}

.settings-stack {
  display: grid;
  gap: 20px;
}

.diagnostic-panel {
  position: sticky;
  top: 96px;
  padding: 24px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.panel-head h3,
.diagnostic-panel h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-family: var(--sl-display-font);
  font-size: 25px;
}

.state-pill {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: #047857;
  background: rgba(220, 252, 231, 0.72);
  border: 1px solid rgba(4, 120, 87, 0.18);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.state-pill.is-dirty {
  color: #9a3412;
  background: rgba(255, 237, 213, 0.78);
  border-color: rgba(154, 52, 18, 0.18);
}

.notice-box {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 8px;
  color: var(--sl-text-soft);
  background: rgba(255, 255, 255, 0.36);
  border: 1px solid var(--sl-glass-border);
  font-weight: 800;
}

.notice-box.is-error {
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.72);
  border-color: rgba(185, 28, 28, 0.18);
}

.provider-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.provider-grid.is-compact {
  margin-top: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-tile {
  min-height: 108px;
  padding: 16px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 8px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  text-align: left;
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.28);
  cursor: pointer;
}

.provider-tile:hover,
.provider-tile:focus-visible {
  border-color: rgba(22, 101, 52, 0.28);
  background: rgba(236, 253, 245, 0.46);
}

.provider-tile:focus-visible,
.save-button:focus-visible,
.ghost-button:focus-visible,
.preset-chip:focus-visible {
  outline: 3px solid rgba(22, 101, 52, 0.22);
  outline-offset: 2px;
}

.provider-tile.is-active {
  border-color: rgba(22, 101, 52, 0.42);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.8), rgba(255, 247, 237, 0.64));
  box-shadow: 0 14px 32px rgba(22, 101, 52, 0.12);
}

.provider-icon {
  width: 42px;
  height: 42px;
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
  color: var(--sl-text-soft);
  font-weight: 700;
}

.model-form {
  margin-top: 24px;
  display: grid;
  gap: 16px;
}

.api-key-form {
  margin-top: 22px;
  display: grid;
  gap: 16px;
}

.learning-form {
  margin-top: 22px;
  display: grid;
  gap: 16px;
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
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.62);
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
  color: var(--sl-text-soft);
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
  gap: 10px;
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
  min-height: 62px;
  padding: 0 18px;
  border: 2px solid rgba(23, 74, 47, 0.28);
  border-radius: 8px;
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.86);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 12px 24px rgba(23, 74, 47, 0.08);
  font-size: 17px;
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
  box-shadow:
    0 0 0 4px rgba(22, 101, 52, 0.16),
    0 18px 34px rgba(23, 74, 47, 0.14);
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

.review-limit-preview {
  min-height: 76px;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #174a2f;
  background: rgba(217, 249, 157, 0.34);
  border: 1px solid rgba(22, 101, 52, 0.14);
}

.review-limit-preview strong {
  font-family: var(--sl-display-font);
  font-size: 42px;
  line-height: 1;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  color: var(--sl-text-soft);
  background: rgba(255, 255, 255, 0.3);
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

.save-button {
  border-radius: 8px;
}

.ghost-button {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid rgba(23, 74, 47, 0.22);
  border-radius: 8px;
  color: #174a2f;
  background: rgba(255, 255, 255, 0.54);
  font-weight: 900;
  cursor: pointer;
}

.ghost-button:hover {
  border-color: rgba(23, 74, 47, 0.38);
  background: rgba(236, 253, 245, 0.7);
}

.save-button:disabled,
.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.save-result {
  margin: 0;
  color: #047857;
  font-weight: 800;
}

.diagnostic-list {
  margin: 20px 0 0;
  display: grid;
  gap: 12px;
}

.diagnostic-list div {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.diagnostic-list dt {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 900;
}

.diagnostic-list dd {
  margin: 6px 0 0;
  color: var(--sl-text-main);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.runtime-note {
  margin-top: 18px;
  padding: 16px;
  border-radius: 8px;
  color: #174a2f;
  background: rgba(217, 249, 157, 0.34);
  border: 1px solid rgba(22, 101, 52, 0.14);
}

.runtime-note p {
  margin: 8px 0 0;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .settings-hero,
  .settings-board {
    grid-template-columns: 1fr;
  }

  .diagnostic-panel {
    position: static;
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 24px 12px 56px;
  }

  .settings-hero,
  .model-panel,
  .diagnostic-panel {
    padding: 22px;
  }

  .provider-grid {
    grid-template-columns: 1fr;
  }

  .provider-grid.is-compact {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
  }
}
</style>
