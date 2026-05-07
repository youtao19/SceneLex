<template>
  <div class="dashboard-page">
    <main class="dashboard-container">
      <article class="main-dashboard-card surface-card" :class="{ 'is-active': preview || lookupPreview || lookupMissingWord }">
        
        <!-- 搜索头部 -->
        <header class="card-search-header">
          <div class="search-input-group">
            <span class="search-icon">🔍</span>
            <input
              v-model="word"
              type="text"
              class="inline-input"
              placeholder="输入单词开始探索..."
              @keyup.enter="handleLookup"
            />
          </div>
          <button class="peach-button search-btn" :disabled="lookupLoading || previewLoading" @click="handleLookup">
            {{ lookupLoading ? 'Searching...' : '查询释义' }}
          </button>
        </header>

        <!-- 内容区域 -->
        <div class="card-content-area">
          <p v-if="errorMessage" class="dashboard-error" role="alert">
            {{ errorMessage }}
          </p>
          <transition name="expand-fade">
            <div v-if="lookupPreview && !preview" class="result-body">
              <div class="dictionary-preview">
                <header class="dictionary-head">
                  <div>
                    <h2>{{ lookupPreview.word }}</h2>
                    <p v-if="lookupPreview.phonetic">{{ lookupPreview.phonetic }}</p>
                  </div>
                  <span class="source-tag is-dictionary">来源：词库</span>
                </header>
                <div class="dictionary-meanings">
                  <article v-for="item in lookupPreview.meanings" :key="`${item.partOfSpeech}-${item.priority}`" class="dictionary-meaning">
                    <span>{{ item.partOfSpeech }}</span>
                    <strong>{{ item.meaning }}</strong>
                  </article>
                </div>
              </div>
              <footer class="card-action-footer">
                <div class="footer-info">
                  <span class="count-tag">已找到 {{ lookupPreview.meanings.length }} 个词库义项</span>
                </div>
                <div class="footer-actions">
                  <button
                    class="peach-button save-btn"
                    :disabled="previewLoading"
                    @click="handleGenerateScene"
                  >
                    {{ previewLoading ? 'Generating...' : '生成场景词卡' }}
                  </button>
                </div>
              </footer>
            </div>

            <div v-else-if="preview" class="result-body">
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
                    <span>{{ selectedBookSummary }}</span>
                  </div>
                  <div class="book-picker-actions">
                    <button
                      type="button"
                      class="book-toggle"
                      @click="showBookOptions = !showBookOptions"
                    >
                      {{ showBookOptions ? '收起' : '更改' }}
                    </button>
                    <RouterLink to="/word-books" class="book-manage-link">管理</RouterLink>
                  </div>
                </div>
                <div v-if="showBookOptions" class="book-options-wrap">
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
                </div>
              </section>

              <!-- 操作栏 -->
              <footer class="card-action-footer">
                <div class="footer-info">
                  <span class="source-tag" :class="sourceTagClass">{{ contentSourceText }}</span>
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
              <div class="zen-loading-placeholder" v-if="lookupLoading || previewLoading">
                <div class="loader-dot"></div>
                <p>{{ lookupLoading ? '正在查询词库释义...' : 'AI 正在构思场景...' }}</p>
              </div>
              <div v-else-if="lookupMissingWord" class="missing-placeholder">
                <p>词库里暂时没有这个单词。</p>
                <button class="peach-button save-btn" type="button" :disabled="previewLoading" @click="handleGenerateScene">
                  {{ previewLoading ? 'Generating...' : '直接生成场景词卡' }}
                </button>
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
import { addWord, generateWord, lookupWord } from '../services/word.service'
import type { WordBook } from '../types/word-book'
import type { WordGenerateData, WordLookupData } from '../types/word'

const word = ref('')
const preview = ref<WordGenerateData | null>(null)
const lookupPreview = ref<WordLookupData | null>(null)
const lookupMissingWord = ref('')
const wordBooks = ref<WordBook[]>([])
const selectedBookIds = ref<number[]>([])
const lookupLoading = ref(false)
const previewLoading = ref(false)
const bookLoading = ref(false)
const saveLoading = ref(false)
const showBookOptions = ref(false)
const errorMessage = ref('')

const showManualSave = computed(() => preview.value?.saved === false)
const saveButtonText = computed(() => (showManualSave.value ? '确认保存' : '保存到单词本'))
const contentSourceText = computed(() => {
  if (!preview.value) return ''

  return preview.value.contentSource === 'dictionary' ? '来源：词典' : '来源：Agent'
})
const sourceTagClass = computed(() => ({
  'is-dictionary': preview.value?.contentSource === 'dictionary',
  'is-agent': preview.value?.contentSource === 'agent',
}))
const previewStatusText = computed(() => {
  if (!preview.value) return ''

  const countText = `已准备 ${preview.value.meanings.length} 个义项`

  if (preview.value.source === 'database') {
    return `${countText} · 来自数据库`
  }

  if (preview.value.source === 'system-cache') {
    return `${countText} · 来自系统缓存`
  }

  if (preview.value.saved) {
    return `${countText} · 已自动保存`
  }

  return `${countText} · 待确认保存`
})
const selectedBookSummary = computed(() => {
  if (bookLoading.value) return '正在读取单词本...'
  if (wordBooks.value.length === 0) return '默认单词本'
  if (selectedBookIds.value.length === 0) return '未选择单词本'

  const selectedNames: string[] = []

  for (const book of wordBooks.value) {
    if (selectedBookIds.value.includes(book.id)) {
      selectedNames.push(book.name)
    }
  }

  return selectedNames.length > 0 ? selectedNames.join('、') : '未选择单词本'
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

/**
 * 查询只读词库释义，避免搜索动作直接触发模型生成。
 */
async function handleLookup() {
  if (!word.value.trim()) return
  lookupLoading.value = true
  errorMessage.value = ''
  preview.value = null
  lookupPreview.value = null
  lookupMissingWord.value = ''
  showBookOptions.value = false
  try {
    const response = await lookupWord(word.value.trim())
    lookupPreview.value = response.data
    word.value = response.data.word
  } catch (error) {
    console.error(error)
    lookupMissingWord.value = word.value.trim()
    errorMessage.value = error instanceof Error && error.message
      ? `${error.message}，可以直接生成场景词卡。`
      : '词库查询失败，可以直接生成场景词卡。'
  } finally {
    lookupLoading.value = false
  }
}

/**
 * 只有用户明确需要场景时才调用模型生成完整词卡。
 */
async function handleGenerateScene(forceRegenerate = false) {
  const targetWord = lookupPreview.value?.word || preview.value?.word || lookupMissingWord.value || word.value

  if (!targetWord.trim()) return
  previewLoading.value = true
  errorMessage.value = ''
  preview.value = null
  showBookOptions.value = false
  try {
    const response = await generateWord(targetWord.trim(), forceRegenerate)
    preview.value = response.data
    lookupPreview.value = null
    lookupMissingWord.value = ''
    word.value = response.data.word
    selectDefaultBook()
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
  const currentPreview = preview.value
  const currentBookIds = [...selectedBookIds.value]

  try {
    await addWord(
      currentPreview.word,
      currentPreview.phonetic,
      currentPreview.meanings,
      selectedBookIds.value
    )
    preview.value = {
      ...currentPreview,
      saved: true,
      source: 'database',
    }
    word.value = currentPreview.word
    await loadWordBooks()
    selectedBookIds.value = currentBookIds.filter((bookId) =>
      wordBooks.value.some((book) => book.id === bookId),
    )
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
  await handleGenerateScene(true)
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

.dictionary-preview {
  padding: 28px 32px 8px;
}

.dictionary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.dictionary-head h2 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 36px;
  line-height: 1.1;
}

.dictionary-head p {
  margin: 6px 0 0;
  color: var(--sl-text-soft);
  font-size: 15px;
  font-weight: 700;
}

.dictionary-meanings {
  display: grid;
  gap: 10px;
}

.dictionary-meaning {
  display: grid;
  grid-template-columns: minmax(42px, auto) 1fr;
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--sl-glass-border);
  border-radius: var(--sl-radius-md);
  background: rgba(255, 255, 255, 0.34);
}

.dictionary-meaning span {
  color: var(--sl-peach-500);
  font-size: 12px;
  font-weight: 900;
}

.dictionary-meaning strong {
  color: var(--sl-text-main);
  font-size: 15px;
  line-height: 1.5;
}

.book-picker {
  margin: 0 32px 24px;
  padding: 14px 16px;
  border: 1px solid var(--sl-glass-border);
  border-radius: var(--sl-radius-md);
  background: rgba(255, 255, 255, 0.28);
}

.book-picker-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
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

.book-picker-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.book-toggle {
  border: none;
  background: transparent;
  color: var(--sl-peach-500);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  padding: 0;
}

.book-manage-link {
  color: var(--sl-peach-500);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.book-options-wrap {
  margin-top: 14px;
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

.footer-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.source-tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.source-tag.is-dictionary {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.24);
}

.source-tag.is-agent {
  color: var(--sl-peach-600);
  background: var(--sl-peach-50);
  border: 1px solid var(--sl-peach-100);
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

.missing-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--sl-text-soft);
  font-size: 15px;
  font-weight: 700;
  text-align: center;
}

.missing-placeholder p {
  margin: 0;
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
  .dictionary-preview { padding: 22px 20px 8px; }
  .dictionary-head { flex-direction: column; }
  .dictionary-meaning { grid-template-columns: 1fr; gap: 4px; }
}
</style>
