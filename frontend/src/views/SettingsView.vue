<template>
  <section class="settings-page">
    <header class="settings-hero">
      <div class="hero-copy">
        <p class="card-label">MODEL ROOM</p>
        <h2 class="section-title">更多</h2>
        <p>
          这里直接控制后端当前进程使用的模型。保存后，新词生成和阅读问答都会走选中的服务与模型名。
        </p>
      </div>

      <div class="hero-meter" aria-label="当前模型">
        <span class="meter-label">ACTIVE</span>
        <strong>{{ activeProviderName }}</strong>
        <small>{{ activeModelName }}</small>
      </div>
    </header>

    <section class="settings-board">
      <article class="model-panel surface-card" aria-labelledby="model-title">
        <div class="panel-head">
          <div>
            <p class="card-label">GENERATION</p>
            <h3 id="model-title">模型设置</h3>
          </div>
          <span class="state-pill" :class="{ 'is-dirty': hasChanges }">
            {{ hasChanges ? '未保存' : '已同步' }}
          </span>
        </div>

        <div v-if="isLoading" class="notice-box">正在读取后端模型配置...</div>
        <div v-else-if="errorMessage" class="notice-box is-error">{{ errorMessage }}</div>

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

          <div class="model-form">
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

            <div class="action-row">
              <button
                class="peach-button save-button"
                type="button"
                :disabled="!canSave"
                @click="saveSettings"
              >
                保存模型设置
              </button>
              <p v-if="successMessage" class="save-result">{{ successMessage }}</p>
            </div>
          </div>
        </template>
      </article>

      <aside class="diagnostic-panel surface-card" aria-label="运行诊断">
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
            <dd>后端运行态</dd>
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
import { fetchAiSettings, updateAiSettings } from '../services/settings.service';
import type { AiProvider, AiSettings } from '../types/settings';

const settings = ref<AiSettings | null>(null);
const selectedProvider = ref<AiProvider>('ollama');
const selectedModel = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const providerMeta: Record<AiProvider, { icon: string; tone: string; description: string; presets: string[] }> = {
  ollama: {
    icon: 'O',
    tone: '本地 Ollama',
    description: '适合日常本地生成，要求 Ollama 服务在本机启动。',
    presets: ['qwen3:4b', 'qwen3:8b', 'llama3.1:8b'],
  },
  omlx: {
    icon: 'X',
    tone: '本机 OpenAI 兼容',
    description: '适合切到 oMLX 桌面服务，密钥由后端从本机配置读取。',
    presets: ['qwen3:4b', 'Qwen3.5-9B-MLX-4bit', 'gemma-3-12b-it-qat'],
  },
  deepseek: {
    icon: 'D',
    tone: '云端 API',
    description: '适合需要更稳定云端输出时使用，后端必须配置 DEEPSEEK_API_KEY。',
    presets: ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  },
};

const selectedProviderConfig = computed(() => {
  return settings.value?.providers.find((provider) => provider.id === selectedProvider.value) ?? null;
});
const savedProviderConfig = computed(() => {
  return settings.value?.providers.find((provider) => provider.id === settings.value?.provider) ?? null;
});
const activeProviderName = computed(() => savedProviderConfig.value?.name ?? '未连接');
const activeModelName = computed(() => savedProviderConfig.value?.model ?? '等待配置');
const selectedProviderName = computed(() => selectedProviderConfig.value?.name ?? '未连接');
const activePresets = computed(() => providerMeta[selectedProvider.value].presets);
const activeProviderDescription = computed(() => providerMeta[selectedProvider.value].description);
const hasChanges = computed(() => {
  if (!settings.value) {
    return false;
  }

  return settings.value.provider !== selectedProvider.value || selectedProviderConfig.value?.model !== selectedModel.value;
});
const canSave = computed(() => {
  return Boolean(settings.value && selectedModel.value.trim() && hasChanges.value && !isSaving.value);
});
const keyStatus = computed(() => {
  if (selectedProvider.value === 'ollama') {
    return '不需要 API Key';
  }

  return selectedProviderConfig.value?.hasApiKey ? '已读取' : '未配置';
});

/**
 * 后端返回的是当前真实运行态，页面加载时用它初始化选择器。
 */
async function loadSettings() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await fetchAiSettings();
    settings.value = response.data;
    selectedProvider.value = response.data.provider;
    selectedModel.value = response.data.providers.find((provider) => provider.id === response.data.provider)?.model ?? '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取模型设置失败';
  } finally {
    isLoading.value = false;
  }
}

/**
 * 切换 provider 时同步带出该服务当前模型，避免保存到另一个服务的模型名。
 */
function chooseProvider(provider: AiProvider) {
  selectedProvider.value = provider;
  selectedModel.value = settings.value?.providers.find((item) => item.id === provider)?.model ?? '';
  successMessage.value = '';
}

/**
 * 保存后更新本页快照，后续生成请求会使用同一个后端运行态。
 */
async function saveSettings() {
  if (!canSave.value) {
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const response = await updateAiSettings({
      provider: selectedProvider.value,
      model: selectedModel.value.trim(),
    });
    settings.value = response.data;
    selectedProvider.value = response.data.provider;
    selectedModel.value = response.data.providers.find((provider) => provider.id === response.data.provider)?.model ?? '';
    successMessage.value = '已保存，下一次生成会使用这组模型设置。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存模型设置失败';
  } finally {
    isSaving.value = false;
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

.model-panel,
.diagnostic-panel {
  border-radius: 8px;
}

.model-panel {
  padding: 26px;
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

.field-block {
  display: grid;
  gap: 8px;
}

.field-block span {
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 900;
}

.field-block input {
  width: 100%;
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 8px;
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.42);
  font-size: 16px;
  font-weight: 800;
  outline: none;
}

.field-block input:focus {
  border-color: rgba(22, 101, 52, 0.34);
  box-shadow: 0 0 0 4px rgba(22, 101, 52, 0.1);
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

.save-button:disabled {
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

  .panel-head {
    flex-direction: column;
  }
}
</style>
