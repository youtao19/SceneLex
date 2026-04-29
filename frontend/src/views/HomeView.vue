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
          <p v-if="errorMessage" class="dashboard-error" role="alert">
            {{ errorMessage }}
          </p>
          <transition name="expand-fade">
            <div v-if="preview" class="result-body">
              <div class="result-scroll-pane">
                <WordMeaningsPanel
                  :word="preview.word"
                  :phonetic="preview.phonetic"
                  :meanings="preview.meanings"
                />
              </div>

              <section class="book-picker" aria-label="保存到单词本">
                <div class="book-picker-head">
                  <div>
                    <p class="book-picker-title">保存到单词本</p>
                    <span>{{ selectedBookIds.length }} 个已选择</span>
                  </div>
                  <RouterLink to="/word-books" class="book-manage-link">管理</RouterLink>
                </div>
                <div v-if="bookLoading" class="book-state">正在读取单词本...</div>
                <div v-else-if="wordBooks.length === 0" class="book-state">暂无单词本，将保存到默认单词本。</div>
                <div v-else class="book-options">
                  <label v-for="book in wordBooks" :key="book.id" class="book-option">
                    <input
                      v-model="selectedBookIds"
                      type="checkbox"
                      :value="book.id"
                    />
                    <span>
                      <strong>{{ book.name }}</strong>
                      <small>{{ book.wordCount }} 个单词</small>
                    </span>
                  </label>
                </div>
              </section>

              <!-- 操作栏 -->
              <footer class="card-action-footer">
                <div class="footer-info">
                  <span class="count-tag">{{ previewStatusText }}</span>
                </div>
                <div class="footer-actions">
                  <button
                    class="peach-button-secondary save-btn"
                    :disabled="previewLoading || saveLoading"
                    @click="handleRegenerate"
                  >
                    {{ previewLoading ? 'Regenerating...' : '重新生成' }}
                  </button>
                  <button
                    class="peach-button save-btn"
                    :disabled="saveLoading"
                    @click="handleAddWord"
                  >
                    {{ saveLoading ? 'Saving...' : saveButtonText }}
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
import { computed, onMounted, ref } from 'vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { fetchWordBooks } from '../services/word-book.service'
import { addWord, generateWord } from '../services/word.service'
import type { WordBook } from '../types/word-book'
import type { WordGenerateData } from '../types/word'

const word = ref('')
const preview = ref<WordGenerateData | null>(null)
const wordBooks = ref<WordBook[]>([])
const selectedBookIds = ref<number[]>([])
const previewLoading = ref(false)
const bookLoading = ref(false)
const saveLoading = ref(false)
const errorMessage = ref('')

const showManualSave = computed(() => preview.value?.saved === false)
const saveButtonText = computed(() => (showManualSave.value ? '确认保存' : '保存到单词本'))
const previewStatusText = computed(() => {
  if (!preview.value) return ''

  const countText = `已准备 ${preview.value.meanings.length} 个义项`

  if (preview.value.source === 'database') {
    return `${countText} · 来自数据库`
  }

  if (preview.value.saved) {
    return `${countText} · 已自动保存`
  }

  return `${countText} · 待确认保存`
})

function selectDefaultBook() {
  const defaultBook = wordBooks.value.find((book) => book.isDefault)

  selectedBookIds.value = defaultBook ? [defaultBook.id] : []
}

async function loadWordBooks() {
  bookLoading.value = true

  try {
    const response = await fetchWordBooks()
    wordBooks.value = response.data
    selectDefaultBook()
  } catch (error) {
    console.error(error)
    errorMessage.value = '单词本读取失败，将保存到默认单词本。'
  } finally {
    bookLoading.value = false
  }
}

async function handlePreview() {
  if (!word.value.trim()) return
  previewLoading.value = true
  errorMessage.value = ''
  try {
    const response = await generateWord(word.value.trim())
    preview.value = response.data
    if (wordBooks.value.length === 0) {
      await loadWordBooks()
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '词卡生成失败，请稍后重试。'
  } finally {
    previewLoading.value = false
  }
}

async function handleAddWord() {
  if (!preview.value) return
  saveLoading.value = true
  errorMessage.value = ''
  try {
    await addWord(
      preview.value.word,
      preview.value.phonetic,
      preview.value.meanings,
      selectedBookIds.value
    )
    preview.value = null
    word.value = ''
    await loadWordBooks()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '词卡保存失败，请稍后重试。'
  } finally {
    saveLoading.value = false
  }
}

// 重新生成可能产生不稳定内容，所以先让用户确认，再覆盖数据库里的词卡。
async function handleRegenerate() {
  const targetWord = preview.value?.word || word.value

  if (!targetWord.trim()) return
  previewLoading.value = true
  errorMessage.value = ''
  try {
    const response = await generateWord(targetWord.trim(), true)
    preview.value = response.data
    word.value = response.data.word
    selectDefaultBook()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '词卡重新生成失败，请稍后重试。'
  } finally {
    previewLoading.value = false
  }
}

onMounted(loadWordBooks)
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

.dashboard-error {
  margin: 0;
  padding: 14px 32px;
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
  border-bottom: 1px solid rgba(180, 35, 24, 0.14);
  font-size: 14px;
  font-weight: 700;
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

.book-picker {
  margin: 0 32px 24px;
  padding: 18px;
  border: 1px solid var(--sl-glass-border);
  border-radius: var(--sl-radius-md);
  background: rgba(255, 255, 255, 0.42);
}

.book-picker-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.book-picker-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

.book-picker-head span,
.book-option small {
  color: var(--sl-text-soft);
  font-size: 12px;
}

.book-manage-link {
  color: var(--sl-peach-500);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.book-state {
  color: var(--sl-text-soft);
  font-size: 13px;
}

.book-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.book-option {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: var(--sl-glass-bg);
  cursor: pointer;
}

.book-option input {
  width: 16px;
  height: 16px;
  accent-color: var(--sl-peach-500);
}

.book-option span {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
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

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
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
  .book-picker { margin: 0 20px 20px; }
}
</style>
