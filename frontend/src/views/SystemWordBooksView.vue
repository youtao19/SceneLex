<template>
  <div class="system-books-page">
    <p v-if="errorMessage" class="books-error" role="alert">{{ errorMessage }}</p>

    <main class="system-books-layout">
      <section class="system-books-panel surface-card" aria-label="系统词书">
        <header class="module-head">
          <p class="card-label">OFFICIAL BOOKS</p>
          <h2 class="section-title">词书中心</h2>
          <p class="hero-desc">选择官方词书开始学习；学过的词会进入你的个人词库和复习舱。</p>
        </header>

        <div v-if="loadingBooks" class="state-block">正在读取词书...</div>
        <div v-else class="book-grid">
          <button
            v-for="book in books"
            :key="book.id"
            class="book-card"
            :class="{ 'is-active': selectedBookId === book.id }"
            type="button"
            @click="selectBook(book.id)"
          >
            <span class="book-name">{{ book.name }}</span>
            <span class="book-desc">{{ book.description }}</span>
            <span class="book-progress">{{ book.learnedWords }} / {{ book.totalWords }} 已学</span>
          </button>
        </div>
      </section>

      <section class="study-panel surface-card" aria-label="开始学习">
        <div v-if="loadingDetail" class="state-block">正在读取学习进度...</div>
        <div v-else-if="!detail" class="state-block">选择一本词书开始学习。</div>
        <template v-else>
          <div class="study-head">
            <div>
              <p class="card-label">STUDY</p>
              <h3>{{ detail.name }}</h3>
              <p>{{ detail.learnedWords }} / {{ detail.totalWords }} 已进入个人词库</p>
            </div>
            <button class="peach-button-ghost compact-btn" type="button" @click="loadDetail">
              刷新
            </button>
          </div>

          <div class="progress-track" aria-label="学习进度">
            <span :style="{ width: progressPercent }"></span>
          </div>

          <div v-if="detail.nextWords.length === 0" class="state-block">这本词书还没有可学习的单词。</div>
          <div v-else class="word-plan" role="table" aria-label="词书学习列表">
            <div class="plan-row plan-header" role="row">
              <span role="columnheader">顺序</span>
              <span role="columnheader">单词</span>
              <span role="columnheader">状态</span>
              <span role="columnheader">操作</span>
            </div>
            <div v-for="item in detail.nextWords" :key="item.id" class="plan-row" role="row">
              <span role="cell">#{{ item.orderIndex }}</span>
              <strong role="cell">{{ item.word }}</strong>
              <span role="cell">{{ item.learned ? '已学习' : '未学习' }}</span>
              <span role="cell">
                <button
                  class="peach-button-secondary compact-btn"
                  type="button"
                  :disabled="item.learned || previewingWord === item.word"
                  @click="previewWord(item.word)"
                >
                  {{ item.learned ? '已加入' : previewingWord === item.word ? '生成中...' : '查看词卡' }}
                </button>
              </span>
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
              :core-feeling="preview.coreFeeling"
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
} from '../types/system-word-book'
import type { WordGenerateData } from '../types/word'

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

const showPreviewModal = computed(() => Boolean(previewingWord.value || preview.value))
const previewTitle = computed(() => preview.value?.word ?? previewingWord.value)

const progressPercent = computed(() => {
  if (!detail.value || detail.value.totalWords === 0) {
    return '0%'
  }

  return `${Math.round((detail.value.learnedWords / detail.value.totalWords) * 100)}%`
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
      await selectBook(response.data[0].id)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '系统词书读取失败，请稍后重试。'
  } finally {
    loadingBooks.value = false
  }
}

/**
 * 详情只取下一批词，避免词书很大时一次性压到前端。
 */
async function loadDetail() {
  if (!selectedBookId.value) {
    detail.value = null
    return
  }

  loadingDetail.value = true
  errorMessage.value = ''

  try {
    const response = await fetchSystemWordBookDetail(selectedBookId.value)
    detail.value = response.data
  } catch (error) {
    console.error(error)
    errorMessage.value = '词书详情读取失败，请稍后重试。'
  } finally {
    loadingDetail.value = false
  }
}

/**
 * 切换词书时清空预览，避免用户把上一本词书的词误加入。
 */
async function selectBook(bookId: number) {
  selectedBookId.value = bookId
  successMessage.value = ''
  preview.value = null
  await loadDetail()
}

/**
 * 先用强制生成模式展示词卡，不写入用户 words，避免“点一下就保存”。
 */
async function previewWord(word: string) {
  const requestId = previewRequestId.value + 1
  previewRequestId.value = requestId
  preview.value = null
  previewingWord.value = word
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await generateWord(word, true)
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
      currentPreview.coreFeeling,
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
  gap: 18px;
}

.books-error,
.save-result {
  margin: 0;
  color: #b45309;
  font-size: 14px;
}

.system-books-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(420px, 1.1fr);
  gap: 18px;
}

.system-books-panel,
.study-panel {
  padding: 24px;
}

.module-head,
.study-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.module-head {
  flex-direction: column;
  margin-bottom: 18px;
}

.study-head {
  align-items: flex-start;
  margin-bottom: 16px;
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

.book-grid {
  display: grid;
  gap: 12px;
}

.book-card {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(31, 41, 55, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.book-card.is-active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.book-name {
  font-size: 18px;
  font-weight: 800;
}

.book-desc,
.book-progress,
.state-block {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(31, 41, 55, 0.1);
  margin-bottom: 18px;
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}

.word-plan {
  display: grid;
  border: 1px solid rgba(31, 41, 55, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.plan-row {
  display: grid;
  grid-template-columns: 72px minmax(120px, 1fr) 88px 96px;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-top: 1px solid rgba(31, 41, 55, 0.08);
}

.plan-row:first-child {
  border-top: 0;
}

.plan-header {
  background: rgba(31, 41, 55, 0.04);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
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

@media (max-width: 900px) {
  .system-books-layout {
    grid-template-columns: 1fr;
  }

  .plan-row {
    grid-template-columns: 56px minmax(96px, 1fr) 72px 86px;
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
}
</style>
