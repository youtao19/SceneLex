<template>
  <div class="word-books-page">
    <p v-if="errorMessage" class="books-error" role="alert">{{ errorMessage }}</p>

    <main class="books-layout">
      <section class="books-overview-card surface-card" aria-label="单词本总览">
        <div class="books-top-row">
          <div class="books-title-block">
            <header class="books-module-head">
              <p class="card-label">WORD BOOKS</p>
              <h2 class="section-title">单词本</h2>
              <p class="hero-desc">按主题整理单词；复习进度仍然跟随主词库统一计算。</p>
            </header>

            <form class="create-form" @submit.prevent="handleCreate">
              <input
                v-model="newBookName"
                type="text"
                maxlength="40"
                placeholder="新单词本名称"
                aria-label="新单词本名称"
              />
              <button class="peach-button" type="submit" :disabled="creating">
                {{ creating ? '创建中...' : '创建' }}
              </button>
            </form>
          </div>

          <div class="books-list" aria-label="单词本列表">
            <div class="panel-head">
              <div>
                <p class="card-label">BOOKS</p>
                <h3>全部单词本</h3>
              </div>
              <button class="peach-button-ghost compact-btn" type="button" @click="loadBooks">
                刷新
              </button>
            </div>

            <div v-if="loadingBooks" class="book-list-state">正在读取单词本...</div>
            <div v-else-if="wordBooks.length === 0" class="book-list-state">暂无单词本。</div>
            <label v-else class="book-select-field">
              <span>当前单词本</span>
              <div class="book-select-shell">
                <select
                  :value="selectedBookId ?? ''"
                  aria-label="选择单词本"
                  @change="handleBookSelectChange"
                >
                  <option
                    v-for="book in wordBooks"
                    :key="book.id"
                    :value="book.id"
                  >
                    {{ book.name }} · {{ book.isDefault ? '默认单词本' : '自定义单词本' }} · {{ book.wordCount }} 个单词
                  </option>
                </select>
                <span class="select-arrow" aria-hidden="true">⌄</span>
              </div>
            </label>
            <div v-if="selectedBook" class="book-select-summary">
              <strong>{{ selectedBook.name }}</strong>
              <span>{{ selectedBook.isDefault ? '默认单词本' : '自定义单词本' }} · {{ selectedBook.wordCount }} 个单词</span>
            </div>
          </div>
        </div>
      </section>

      <section class="book-detail surface-card" aria-label="单词本详情">
        <div v-if="selectedBook" class="detail-head">
          <div class="rename-row">
            <input
              v-model="editingName"
              type="text"
              maxlength="40"
              aria-label="单词本名称"
              :disabled="selectedBook.isDefault"
            />
            <button
              class="peach-button-secondary compact-btn"
              type="button"
              :disabled="selectedBook.isDefault || renaming"
              @click="handleRename"
            >
              {{ renaming ? '保存中...' : '重命名' }}
            </button>
            <button
              class="danger-btn compact-btn"
              type="button"
              :disabled="selectedBook.isDefault || deleting"
              @click="handleDelete"
            >
              {{ deleting ? '删除中...' : '删除' }}
            </button>
          </div>
          <label class="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索本内单词或释义"
              aria-label="搜索本内单词或释义"
            />
          </label>
        </div>

        <div v-if="loadingDetail" class="state-block">正在读取本内单词...</div>
        <div v-else-if="!selectedBook" class="state-block">选择一个单词本查看内容。</div>
        <div v-else-if="filteredWords.length === 0" class="state-block">
          {{ keyword.trim() ? '没有匹配的单词。' : '这个单词本还没有单词。' }}
        </div>
        <div v-else class="word-table" role="table" aria-label="单词本内单词">
          <div class="table-row table-header" role="row">
            <span role="columnheader">单词</span>
            <span role="columnheader">主要释义</span>
            <span role="columnheader">复习</span>
            <span role="columnheader">操作</span>
          </div>
          <div v-for="item in filteredWords" :key="item.id" class="table-row" role="row">
            <span role="cell">
              <button class="word-name detail-word-link" type="button" @click="openDetailModal(item)">
                {{ item.word }}
              </button>
            </span>
            <span class="meaning-cell" role="cell">{{ item.primaryMeaning }}</span>
            <span role="cell">{{ item.reviewCount }} 次</span>
            <span class="book-action-cell" role="cell">
              <button
                class="detail-word-btn"
                type="button"
                @click="openDetailModal(item)"
              >
                查看详情
              </button>
              <button
                class="remove-word-btn"
                type="button"
                :disabled="removingWordId === item.id"
                @click="handleRemoveWord(item.id)"
              >
                {{ removingWordId === item.id ? '移除中...' : '移出本' }}
              </button>
            </span>
          </div>
        </div>
      </section>
    </main>

    <WordDetailModal :word="selectedWord" @close="closeDetailModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createWordBook,
  deleteWordBook,
  fetchWordBookDetail,
  fetchWordBooks,
  removeWordFromBook,
  renameWordBook,
} from '../services/word-book.service'
import WordDetailModal from '../components/WordDetailModal.vue'
import type { WordBook, WordBookDetail } from '../types/word-book'
import type { StoredWord } from '../types/word'

const wordBooks = ref<WordBook[]>([])
const detail = ref<WordBookDetail | null>(null)
const selectedBookId = ref<number | null>(null)
const newBookName = ref('')
const editingName = ref('')
const keyword = ref('')
const errorMessage = ref('')
const loadingBooks = ref(false)
const loadingDetail = ref(false)
const creating = ref(false)
const renaming = ref(false)
const deleting = ref(false)
const removingWordId = ref<number | null>(null)
const selectedWord = ref<StoredWord | null>(null)

const selectedBook = computed(() => detail.value)
const filteredWords = computed(() => {
  const words = detail.value?.words ?? []
  const query = keyword.value.trim().toLowerCase()

  if (!query) {
    return words
  }

  return words.filter((item) => {
    const text = `${item.word} ${item.primaryMeaning}`.toLowerCase()
    return text.includes(query)
  })
})

async function loadBooks() {
  loadingBooks.value = true
  errorMessage.value = ''

  try {
    const response = await fetchWordBooks()
    wordBooks.value = response.data

    if (!selectedBookId.value && response.data.length > 0) {
      selectedBookId.value = response.data[0].id
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = '单词本读取失败，请稍后重试。'
  } finally {
    loadingBooks.value = false
  }
}

async function loadDetail() {
  if (!selectedBookId.value) {
    detail.value = null
    return
  }

  loadingDetail.value = true
  errorMessage.value = ''

  try {
    const response = await fetchWordBookDetail(selectedBookId.value)
    detail.value = response.data
    editingName.value = response.data.name
  } catch (error) {
    console.error(error)
    errorMessage.value = '单词本详情读取失败，请稍后重试。'
  } finally {
    loadingDetail.value = false
  }
}

async function selectBook(bookId: number) {
  selectedBookId.value = bookId
  keyword.value = ''
  selectedWord.value = null
  await loadDetail()
}

async function handleBookSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const bookId = Number(target.value)

  if (!bookId) return
  await selectBook(bookId)
}

async function refreshCurrentBook() {
  await loadBooks()
  await loadDetail()
}

async function handleCreate() {
  const name = newBookName.value.trim()

  if (!name) return

  creating.value = true
  errorMessage.value = ''

  try {
    const response = await createWordBook(name)
    newBookName.value = ''
    selectedBookId.value = response.data.id
    await refreshCurrentBook()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '单词本创建失败。'
  } finally {
    creating.value = false
  }
}

async function handleRename() {
  if (!selectedBookId.value) return

  const name = editingName.value.trim()

  if (!name) return

  renaming.value = true
  errorMessage.value = ''

  try {
    await renameWordBook(selectedBookId.value, name)
    await refreshCurrentBook()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '单词本重命名失败。'
  } finally {
    renaming.value = false
  }
}

async function handleDelete() {
  if (!selectedBookId.value || selectedBook.value?.isDefault) return

  const confirmed = window.confirm('删除单词本只会删除分组，不会删除单词。确定删除吗？')

  if (!confirmed) return

  deleting.value = true
  errorMessage.value = ''

  try {
    await deleteWordBook(selectedBookId.value)
    selectedBookId.value = null
    detail.value = null
    await loadBooks()
    await loadDetail()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '单词本删除失败。'
  } finally {
    deleting.value = false
  }
}

async function handleRemoveWord(wordId: number) {
  if (!selectedBookId.value) return

  removingWordId.value = wordId
  errorMessage.value = ''

  try {
    await removeWordFromBook(selectedBookId.value, wordId)
    await refreshCurrentBook()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '单词移除失败。'
  } finally {
    removingWordId.value = null
  }
}

function openDetailModal(word: StoredWord) {
  selectedWord.value = word
}

function closeDetailModal() {
  selectedWord.value = null
}

onMounted(async () => {
  await loadBooks()
  await loadDetail()
})
</script>

<style scoped>
.word-books-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero-desc {
  max-width: 560px;
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.create-form {
  display: flex;
  gap: 12px;
  margin-top: 22px;
}

.create-form input,
.rename-row input,
.search-box input,
.book-select-field select {
  width: 100%;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: var(--sl-glass-bg);
  min-height: 48px;
  padding: 0 18px;
  outline: none;
  font-weight: 700;
}

.create-form input {
  border-color: rgba(255, 90, 113, 0.42);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 90, 113, 0.08);
}

.create-form .peach-button {
  min-width: 104px;
  white-space: nowrap;
}

.books-error {
  margin: 0;
  padding: 14px 18px;
  border-radius: var(--sl-radius-md);
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
  font-weight: 700;
}

.books-layout {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.books-overview-card,
.book-detail {
  border-radius: var(--sl-radius-lg);
  padding: 22px;
}

.books-top-row {
  display: grid;
  grid-template-columns: minmax(280px, 0.82fr) minmax(360px, 1.18fr);
  gap: 24px;
  align-items: start;
}

.books-module-head {
  max-width: 520px;
}

.books-list {
  min-width: 0;
}

.panel-head,
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.panel-head h3 {
  margin: 0;
}

.compact-btn {
  min-height: 42px;
  padding: 0 18px;
}

.book-list-state {
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-text-soft);
  font-weight: 700;
  text-align: center;
}

.book-select-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.book-select-field span {
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 800;
}

.book-select-shell {
  position: relative;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(255, 90, 113, 0.26);
  box-shadow: 0 16px 34px rgba(255, 90, 113, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.dark-theme .book-select-shell {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 90, 113, 0.32);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
}

.book-select-field select {
  appearance: none;
  color: var(--sl-text-main);
  min-height: 62px;
  border: none;
  border-radius: 22px;
  background: transparent;
  cursor: pointer;
  padding: 0 58px 0 18px;
  font-size: 16px;
  font-weight: 900;
}

.book-select-field select:focus-visible {
  outline: 3px solid rgba(255, 90, 113, 0.2);
  outline-offset: 3px;
}

.select-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--sl-peach-500);
  box-shadow: 0 12px 22px rgba(255, 90, 113, 0.24);
  font-size: 20px;
  line-height: 1;
  pointer-events: none;
  transform: translateY(-50%);
}

.book-select-summary {
  margin-top: 12px;
  min-height: 58px;
  padding: 12px 14px;
  border-radius: var(--sl-radius-md);
  background: var(--sl-peach-50);
  border: 1px solid var(--sl-peach-100);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.book-select-summary span {
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.rename-row {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto;
  gap: 10px;
}

.danger-btn,
.remove-word-btn,
.detail-word-btn {
  border: 1px solid rgba(180, 35, 24, 0.18);
  background: rgba(180, 35, 24, 0.08);
  color: #b42318;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.danger-btn:disabled,
.remove-word-btn:disabled,
.detail-word-btn:disabled,
.peach-button:disabled,
.peach-button-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-box {
  min-width: 260px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-block {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-text-soft);
  font-weight: 700;
  text-align: center;
}

.word-table {
  border: 1px solid var(--sl-glass-border);
  border-radius: var(--sl-radius-md);
  overflow: hidden;
}

.table-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(180px, 2fr) 100px minmax(170px, auto);
  gap: 12px;
  align-items: center;
  min-height: 58px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.table-row:last-child {
  border-bottom: none;
}

.table-header {
  min-height: 44px;
  color: var(--sl-text-soft);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.word-name {
  color: var(--sl-text-main);
  font-size: 16px;
  font-weight: 900;
}

.detail-word-link {
  border: none;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.detail-word-link:hover {
  color: var(--sl-peach-500);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.meaning-cell {
  color: var(--sl-text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-action-cell {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-word-btn,
.remove-word-btn {
  min-height: 36px;
  padding: 0 12px;
}

.detail-word-btn {
  border-color: var(--sl-glass-border-strong);
  background: var(--sl-glass-bg);
  color: var(--sl-text-soft);
}

@media (max-width: 900px) {
  .books-top-row {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .detail-head {
    flex-direction: column;
    align-items: stretch;
  }

  .create-form {
    flex-direction: column;
  }

  .rename-row {
    grid-template-columns: 1fr;
  }

  .search-box {
    min-width: 0;
  }

  .table-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .table-header {
    display: none;
  }
}
</style>
