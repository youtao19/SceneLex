<template>
  <div class="dashboard-page">
    <main class="dashboard-container">
      <article class="main-dashboard-card surface-card" :class="{ 'is-active': preview }">
        
        <!-- 搜索头部 -->
        <header class="card-search-header">
          <div class="search-input-group">
            <span class="search-icon">🔍</span>
            <input
              v-model="word"
              type="text"
              class="inline-input"
              placeholder="输入单词开始探索..."
              @keyup.enter="handlePreview"
            />
          </div>
          <button class="peach-button search-btn" :disabled="previewLoading" @click="handlePreview">
            {{ previewLoading ? 'Searching...' : '查询词卡' }}
          </button>
        </header>

        <!-- 内容区域 -->
        <div class="card-content-area">
          <transition name="expand-fade">
            <div v-if="preview" class="result-body">
              <div class="result-scroll-pane">
                <WordMeaningsPanel
                  :word="preview.word"
                  :meanings="preview.meanings"
                  :teaching-mode="wordStore.teachingMode"
                />
              </div>

              <!-- 操作栏 -->
              <footer class="card-action-footer">
                <div class="footer-info">
                  <span class="count-tag">已准备 {{ preview.meanings.length }} 个义项</span>
                </div>
                <div class="footer-actions">
                  <button class="peach-button-secondary save-btn" :disabled="saveLoading" @click="handleAddWord">
                    {{ saveLoading ? 'Saving...' : '确认加入' }}
                  </button>
                </div>
              </footer>
            </div>

            <!-- 极简占位：移除原来开关所在的 meta-row -->
            <div v-else class="empty-placeholder">
              <div class="zen-loading-placeholder" v-if="previewLoading">
                <div class="loader-dot"></div>
                <p>AI 正在构思场景...</p>
              </div>
            </div>
          </transition>
        </div>
      </article>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { addWord, generateWord } from '../services/word.service'
import { useWordStore } from '../stores/word'
import type { WordGenerateData } from '../types/word'

const wordStore = useWordStore()
const word = ref('')
const preview = ref<WordGenerateData | null>(null)
const previewLoading = ref(false)
const saveLoading = ref(false)

async function handlePreview() {
  if (!word.value.trim()) return
  previewLoading.value = true
  try {
    const response = await generateWord(word.value.trim())
    preview.value = response.data
  } catch (error) {
    console.error(error)
  } finally {
    previewLoading.value = false
  }
}

async function handleAddWord() {
  if (!preview.value) return
  saveLoading.value = true
  try {
    await addWord(preview.value.word, preview.value.meanings)
    preview.value = null
    word.value = ''
  } catch (error) {
    console.error(error)
  } finally {
    saveLoading.value = false
  }
}
</script>

<style scoped>
.dashboard-page {
  min-height: calc(100vh - 120px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 60px 20px;
}

.dashboard-container {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
}

.main-dashboard-card {
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  border-radius: var(--sl-radius-xl);
  overflow: hidden;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--sl-glass-bg);
  box-shadow: 0 30px 60px rgba(255, 90, 113, 0.12);
}

.main-dashboard-card:not(.is-active) {
  margin-top: 10vh; /* 初始位置稍微下移一点点，视觉更稳 */
  max-width: 680px;
}

.card-search-header {
  padding: 24px 32px;
  display: flex;
  align-items: center;
  gap: 20px;
  border-bottom: 1px solid var(--sl-glass-border);
  background: var(--sl-glass-bg); /* 修改为使用主题变量 */
}

.search-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
}

.search-icon {
  font-size: 20px;
  opacity: 0.4;
}

.inline-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 22px;
  font-weight: 700;
  color: var(--sl-text-main);
  outline: none;
}

.inline-input::placeholder {
  color: var(--sl-text-main);
  opacity: 0.6; /* 增加透明度，让黑色提示符清晰可见 */
}

.search-btn {
  min-width: 130px;
  height: 52px;
  font-size: 16px;
}

.result-scroll-pane {
  padding: 0 32px;
  max-height: 60vh;
  overflow-y: auto;
}

.card-action-footer {
  padding: 24px 32px;
  background: rgba(255, 255, 255, 0.5);
  border-top: 1px solid var(--sl-glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.count-tag {
  font-size: 13px;
  font-weight: 700;
  color: var(--sl-ink-500);
}

.save-btn {
  min-width: 180px;
  height: 50px;
}

.empty-placeholder {
  padding: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.zen-loading-placeholder {
  text-align: center;
  color: var(--sl-ink-300);
}

.loader-dot {
  width: 8px;
  height: 8px;
  background: var(--sl-peach-400);
  border-radius: 50%;
  margin: 0 auto 12px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
}

.expand-fade-enter-active {
  transition: all 0.5s ease 0.1s;
}

@media (max-width: 768px) {
  .dashboard-page { padding: 10px; align-items: flex-start; padding-top: 20px; }
  .card-search-header { flex-direction: column; align-items: stretch; gap: 16px; padding: 20px; }
  .inline-input { font-size: 18px; }
  .card-action-footer { flex-direction: column; gap: 16px; text-align: center; }
}
</style>
