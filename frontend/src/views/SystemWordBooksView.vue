<template>
  <div class="system-books-page">
    <p v-if="errorMessage" class="books-error" role="alert">{{ errorMessage }}</p>

    <section class="study-hero" aria-label="词书学习概览">
      <div class="hero-main">
        <div>
          <p class="card-label">OFFICIAL BOOKS</p>
          <h2 class="section-title">词书中心</h2>
          <p class="hero-desc">从官方词书开始学新词；确认学过的词会进入你的个人词库和复习舱。</p>
        </div>

        <label class="book-select-field">
          <span>当前词书</span>
          <div class="book-select-shell">
            <select
              :value="selectedBookId ?? ''"
              :disabled="loadingBooks || books.length === 0"
              aria-label="选择系统词书"
              @change="handleBookSelectChange"
            >
              <option disabled value="">选择词书</option>
              <option v-for="book in books" :key="book.id" :value="book.id">
                {{ book.name }} · {{ book.learnedWords }}/{{ book.totalWords }} 已学
              </option>
            </select>
            <span class="select-arrow" aria-hidden="true">⌄</span>
          </div>
          <small v-if="selectedBook">{{ selectedBook.description }}</small>
          <small v-else>{{ loadingBooks ? '正在读取词书...' : '请选择一本词书开始学习' }}</small>
        </label>
      </div>

      <div v-if="detail" class="hero-metrics" aria-label="当前词书进度">
        <div>
          <strong>{{ detail.learnedWords }}</strong>
          <span>已学</span>
        </div>
        <div>
          <strong>{{ remainingWords }}</strong>
          <span>未学</span>
        </div>
        <div>
          <strong>{{ progressPercent }}</strong>
          <span>进度</span>
        </div>
      </div>
    </section>

    <main class="system-books-layout">
      <section class="study-panel surface-card" aria-label="开始学习">
        <div v-if="loadingDetail" class="state-block">正在读取学习进度...</div>
        <div v-else-if="!detail" class="state-block">选择一本词书开始学习。</div>
        <template v-else>
          <div class="study-head">
            <div>
              <p class="card-label">STUDY</p>
              <h3>{{ detail.name }}</h3>
              <p>下一批会优先展示未加入个人词库的单词。</p>
            </div>
            <button class="peach-button-ghost compact-btn" type="button" @click="loadDetail">
              刷新
            </button>
          </div>

          <div class="progress-block">
            <div class="progress-label">
              <span>{{ detail.learnedWords }} / {{ detail.totalWords }} 已进入个人词库</span>
              <strong>{{ progressPercent }}</strong>
            </div>
            <div class="progress-track" aria-label="学习进度">
              <span :style="{ width: progressPercent }"></span>
            </div>
          </div>

          <div v-if="detail.nextWords.length === 0" class="state-block">这本词书还没有可学习的单词。</div>
          <div v-else class="word-plan" aria-label="词书学习列表">
            <article v-for="item in detail.nextWords" :key="item.id" class="plan-row">
              <span class="word-order">#{{ item.orderIndex }}</span>
              <div class="word-main">
                <strong>{{ item.word }}</strong>
                <span>{{ item.unit || 'Unit 1' }} · {{ item.difficulty || 'core' }}</span>
              </div>
              <span class="status-pill" :class="{ 'is-learned': item.learned }">
                {{ item.learned ? '已加入' : '待学习' }}
              </span>
              <div class="word-action">
                <button
                  class="peach-button-secondary compact-btn"
                  type="button"
                  :disabled="item.learned || previewingWord === item.word"
                  @click="previewWord(item)"
                >
                  {{ item.learned ? '已加入' : previewingWord === item.word ? '生成中...' : '查看词卡' }}
                </button>
              </div>
              <p v-if="item.examMeanings.length > 0" class="exam-meanings">
                六级义项：{{ formatExamMeanings(item.examMeanings) }}
              </p>
            </article>
          </div>

          <div v-if="detail &amp;&amp; detail.totalWords &gt; 0" class="pagination-bar">
            <div class="page-size">
              <span>每页</span>
              <select :value="pageSize" @change="onPageSizeChange">
                <option :value="50">50</option>
                <option :value="100">100</option>
                <option :value="200">200</option>
              </select>
              <span>个</span>
            </div>
            <div class="page-nav">
              <button
                class="peach-button-ghost compact-btn"
                type="button"
                :disabled="page <= 1"
                @click="goPage(page - 1)"
              >
                上一页
              </button>
              <span class="page-info">第 {{ page }} / {{ totalPages }} 页</span>
              <button
                class="peach-button-ghost compact-btn"
                type="button"
                :disabled="page >= totalPages"
                @click="goPage(page + 1)"
              >
                下一页
              </button>
            </div>
          </div>

          <p v-if="successMessage" class="save-result">{{ successMessage }}</p>
        </template>
      </section>
    </main>

    <div
      v-if="showPreviewModal"
      class="preview-backdrop"
      aria-modal="true"
      role="dialog"
      @click="closePreview"
    >
      <article class="preview-modal surface-card" @click.stop>
        <header class="preview-modal-head">
          <div>
            <p class="card-label">WORD PREVIEW</p>
            <h3>{{ previewTitle }}</h3>
          </div>
          <button class="modal-close" type="button" aria-label="关闭词卡预览" @click="closePreview">
            ×
          </button>
        </header>

        <div v-if="previewingWord && !preview" class="modal-loading" role="status">
          正在生成 {{ previewingWord }} 的词卡...
        </div>
        <template v-else-if="preview">
          <div class="preview-modal-scroll">
            <WordMeaningsPanel
              :word="preview.word"
              :phonetic="preview.phonetic"
              :meanings="preview.meanings"
            />
          </div>
          <footer class="preview-actions">
            <button class="peach-button-ghost compact-btn" type="button" @click="closePreview">
              先不加入
            </button>
            <button
              class="peach-button compact-btn"
              type="button"
              :disabled="savingPreview"
              @click="savePreview"
            >
              {{ savingPreview ? '加入中...' : '加入个人词库' }}
            </button>
          </footer>
        </template>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchSystemWordBookDetail,
  fetchSystemWordBooks,
} from '../services/system-word-book.service'
import { addWord, generateWord } from '../services/word.service'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import type {
  SystemWordBook,
  SystemWordBookDetail,
  SystemWordBookItem,
} from '../types/system-word-book'
import type { WordGenerateData, WordRequiredMeaning } from '../types/word'

const books = ref<SystemWordBook[]>([])
const detail = ref<SystemWordBookDetail | null>(null)
const selectedBookId = ref<number | null>(null)
const loadingBooks = ref(false)
const loadingDetail = ref(false)
const previewingWord = ref('')
const savingPreview = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const preview = ref<WordGenerateData | null>(null)
const previewRequestId = ref(0)
const DEFAULT_SYSTEM_BOOK_CODE = 'cet6'
const page = ref(1)
const pageSize = ref(100)

const showPreviewModal = computed(() => Boolean(previewingWord.value || preview.value))
const previewTitle = computed(() => preview.value?.word ?? previewingWord.value)
const selectedBook = computed(() => {
  return books.value.find((book) => book.id === selectedBookId.value) ?? null
})
const remainingWords = computed(() => {
  if (!detail.value) {
    return 0
  }

  return Math.max(detail.value.totalWords - detail.value.learnedWords, 0)
})

const progressPercent = computed(() => {
  if (!detail.value || detail.value.totalWords === 0) {
    return '0%'
  }

  return `${Math.round((detail.value.learnedWords / detail.value.totalWords) * 100)}%`
})

const totalPages = computed(() => {
  if (!detail.value || detail.value.totalWords === 0) {
    return 1
  }
  return Math.ceil(detail.value.totalWords / pageSize.value)
})

/**
 * 列表需要带用户已学数量，才能让系统词书显示个人学习进度。
 */
async function loadBooks() {
  loadingBooks.value = true
  errorMessage.value = ''

  try {
    const response = await fetchSystemWordBooks()
    books.value = response.data

    if (!selectedBookId.value && response.data.length > 0) {
      const defaultBook = response.data.find((book) => book.code === DEFAULT_SYSTEM_BOOK_CODE)
      await selectBook((defaultBook ?? response.data[0]).id)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '系统词书读取失败，请稍后重试。'
  } finally {
    loadingBooks.value = false
  }
}

/**
 * 详情分页加载，避免词书很大时一次性压到前端。
 */
async function loadDetail() {
  if (!selectedBookId.value) {
    detail.value = null
    return
  }

  loadingDetail.value = true
  errorMessage.value = ''

  try {
    const offset = (page.value - 1) * pageSize.value
    const response = await fetchSystemWordBookDetail(selectedBookId.value, pageSize.value, offset)
    detail.value = response.data
  } catch (error) {
    console.error(error)
    errorMessage.value = '词书详情读取失败，请稍后重试。'
  } finally {
    loadingDetail.value = false
  }
}

async function goPage(newPage: number) {
  if (!detail.value || newPage < 1 || newPage > totalPages.value) return
  page.value = newPage
  await loadDetail()
}

async function changePageSize(newSize: number) {
  pageSize.value = newSize
  page.value = 1
  await loadDetail()
}

async function onPageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const newSize = Number(target.value)
  if (!Number.isNaN(newSize) && newSize > 0) {
    await changePageSize(newSize)
  }
}

/**
 * 切换词书时清空预览并重置分页，避免用户把上一本词书的词误加入。
 */
async function selectBook(bookId: number) {
  selectedBookId.value = bookId
  successMessage.value = ''
  preview.value = null
  page.value = 1
  await loadDetail()
}

async function handleBookSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const bookId = Number(target.value)

  if (!Number.isInteger(bookId) || bookId <= 0) {
    return
  }

  await selectBook(bookId)
}

/**
 * 先用强制生成模式展示词卡，不写入用户 words，避免“点一下就保存”。
 */
function formatExamMeanings(meanings: WordRequiredMeaning[]) {
  return meanings
    .map((item) => `${item.partOfSpeech} ${item.meaning}`)
    .join('；')
}

async function previewWord(item: SystemWordBookItem) {
  const requestId = previewRequestId.value + 1
  previewRequestId.value = requestId
  preview.value = null
  previewingWord.value = item.word
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await generateWord(item.word, true, item.examMeanings)
    if (previewRequestId.value !== requestId) {
      return
    }
    preview.value = response.data
  } catch (error) {
    console.error(error)
    errorMessage.value = '词卡生成失败，请稍后再试。'
  } finally {
    if (previewRequestId.value === requestId) {
      previewingWord.value = ''
    }
  }
}

/**
 * 关闭时递增请求序号，避免慢请求返回后重新打开已经关掉的弹窗。
 */
function closePreview() {
  previewRequestId.value += 1
  preview.value = null
  previewingWord.value = ''
}

/**
 * 用户确认理解后才保存，个人 SRS 仍然只由 words 表负责。
 */
async function savePreview() {
  if (!preview.value) {
    return
  }

  savingPreview.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const currentPreview = preview.value
    const response = await addWord(
      currentPreview.word,
      currentPreview.phonetic,
      currentPreview.meanings,
    )
    successMessage.value = `${response.data.word} 已加入个人词库`
    closePreview()
    await loadBooks()
    await loadDetail()
  } catch (error) {
    console.error(error)
    errorMessage.value = '加入个人词库失败，请稍后再试。'
  } finally {
    savingPreview.value = false
  }
}

onMounted(loadBooks)
</script>

<style scoped>
.system-books-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.books-error,
.save-result {
  margin: 0;
  color: #b45309;
  font-size: 14px;
}

.study-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 28px;
  border: 1px solid rgba(31, 41, 55, 0.08);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.72)),
    radial-gradient(circle at 92% 18%, rgba(37, 99, 235, 0.14), transparent 34%);
}

.hero-main {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(260px, 360px);
  align-items: end;
  gap: 24px;
  flex: 1 1 auto;
  min-width: 0;
}

.study-hero .section-title,
.study-hero .hero-desc {
  margin: 0;
}

.study-hero .hero-desc {
  max-width: 620px;
  margin-top: 8px;
  color: var(--text-muted);
}

.book-select-field {
  display: grid;
  gap: 7px;
}

.book-select-field > span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.book-select-field small {
  min-height: 20px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.book-select-shell {
  position: relative;
}

.book-select-shell select {
  width: 100%;
  min-height: 44px;
  padding: 0 38px 0 14px;
  border: 1px solid rgba(31, 41, 55, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--sl-text-main);
  font: inherit;
  font-weight: 800;
  appearance: none;
}

.book-select-shell select:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.select-arrow {
  position: absolute;
  top: 50%;
  right: 14px;
  color: var(--text-muted);
  pointer-events: none;
  transform: translateY(-50%);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(82px, 1fr));
  min-width: min(360px, 100%);
  overflow: hidden;
  border: 1px solid rgba(31, 41, 55, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
}

.hero-metrics div {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border-left: 1px solid rgba(31, 41, 55, 0.08);
}

.hero-metrics div:first-child {
  border-left: 0;
}

.hero-metrics strong {
  color: var(--sl-text-main);
  font-size: 22px;
  line-height: 1;
}

.hero-metrics span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.system-books-layout {
  display: block;
}

.study-panel {
  min-height: 520px;
  padding: 24px;
  border-radius: 8px;
}

.study-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.study-head h3,
.study-head p {
  margin: 0;
}

.study-head h3 {
  font-size: 24px;
}

.study-head p {
  margin-top: 6px;
  color: var(--text-muted);
}

.state-block {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.progress-block {
  margin: 18px 0;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(31, 41, 55, 0.1);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}

.word-plan {
  display: grid;
  gap: 8px;
}

.plan-row {
  display: grid;
  grid-template-columns: 64px minmax(160px, 1fr) 92px 108px;
  gap: 14px;
  align-items: center;
  min-height: 68px;
  padding: 12px 14px;
  border: 1px solid rgba(31, 41, 55, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
}

.exam-meanings {
  grid-column: 2 / -1;
  margin: -4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.word-order {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 800;
}

.word-main {
  display: grid;
  gap: 3px;
}

.word-main strong {
  color: var(--sl-text-main);
  font-size: 20px;
}

.word-main span {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.status-pill {
  justify-self: start;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.09);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.status-pill.is-learned {
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.word-action {
  display: flex;
  justify-content: flex-end;
}

.compact-btn {
  min-height: 34px;
  padding: 0 12px;
}

.preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 18px;
  background: rgba(15, 13, 19, 0.36);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.preview-modal {
  width: min(820px, 100%);
  max-height: min(760px, calc(100vh - 64px));
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: var(--sl-radius-xl);
  background: #ffffff;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.preview-modal:hover {
  background: #ffffff;
  transform: none;
}

.preview-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 28px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.preview-modal-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-family: var(--sl-display-font);
  font-size: 28px;
}

.modal-close {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: var(--sl-text-soft);
  background: var(--sl-glass-bg);
  font-size: 24px;
  line-height: 1;
}

.modal-loading {
  padding: 42px 28px;
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 800;
}

.preview-modal-scroll {
  max-height: calc(100vh - 270px);
  padding: 8px 28px 18px;
  overflow-y: auto;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 28px 22px;
  border-top: 1px solid var(--sl-glass-border);
}

.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(31, 41, 55, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
}

.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.page-size select {
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid rgba(31, 41, 55, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.86);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-info {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .study-hero {
    flex-direction: column;
  }

  .hero-main {
    grid-template-columns: 1fr;
  }

  .plan-row {
    grid-template-columns: 52px minmax(96px, 1fr);
  }

  .status-pill,
  .word-action,
  .exam-meanings {
    grid-column: 2;
  }

  .word-action {
    justify-content: flex-start;
  }

  .preview-modal-head,
  .preview-actions {
    padding-left: 20px;
    padding-right: 20px;
  }

  .preview-modal-scroll {
    padding-left: 20px;
    padding-right: 20px;
  }

  .pagination-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .page-nav {
    justify-content: center;
  }
}
</style>
