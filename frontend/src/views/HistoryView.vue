<template>
  <div class="archive-page">
    <header class="archive-hero surface-card">
      <div>
        <p class="card-label">ARCHIVE</p>
        <h2 class="section-title">归档册</h2>
        <p class="hero-desc">查看已经进入系统的单词，以及最近自动或手动保存的词卡。</p>
      </div>
      <button class="peach-button-secondary sync-btn" :disabled="loading" @click="loadArchive">
        {{ loading ? '同步中...' : '同步词库' }}
      </button>
    </header>

    <section class="summary-grid" aria-label="词库概览">
      <button
        class="summary-card surface-card"
        :class="{ 'is-selected': activeFilter === 'all' }"
        type="button"
        @click="setFilter('all')"
      >
        <span class="metric-mark mark-total" aria-hidden="true">Aa</span>
        <div>
          <strong>{{ archive?.summary.totalWords ?? 0 }}</strong>
          <p>系统已有单词</p>
        </div>
      </button>
      <button
        class="summary-card surface-card"
        :class="{ 'is-selected': activeFilter === 'due' }"
        type="button"
        @click="setFilter('due')"
      >
        <span class="metric-mark mark-review" aria-hidden="true">R</span>
        <div>
          <strong>{{ archive?.summary.dueToday ?? 0 }}</strong>
          <p>今日待复习</p>
        </div>
      </button>
      <article class="summary-card surface-card">
        <span class="metric-mark mark-done" aria-hidden="true">OK</span>
        <div>
          <strong>{{ archive?.summary.reviewedWords ?? 0 }}</strong>
          <p>已经复习过</p>
        </div>
      </article>
    </section>

    <section class="archive-layout">
      <article class="recent-panel surface-card">
        <div class="panel-head">
          <div>
            <p class="card-label">RECENT</p>
            <h3>最近添加</h3>
          </div>
          <span class="panel-count">{{ recentWords.length }} 个</span>
        </div>

        <div v-if="loading" class="state-block">正在读取词库...</div>
        <div v-else-if="errorMessage" class="state-block is-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="recentWords.length === 0" class="state-block">
          还没有保存过单词。
        </div>
        <div v-else class="recent-list">
          <article v-for="item in recentWords" :key="item.id" class="recent-card">
            <div class="word-topline">
              <h4>{{ item.word }}</h4>
              <span>{{ formatDate(item.createdAt) }}</span>
            </div>
            <p>{{ item.primaryMeaning }}</p>
            <div class="word-meta">
              <span>{{ item.meanings.length }} 个义项</span>
              <span>下次 {{ formatDate(item.nextReview) }}</span>
            </div>
            <button class="detail-word-btn" type="button" @click="openDetailModal(item)">
              查看详情
            </button>
          </article>
        </div>
      </article>

      <article class="library-panel surface-card">
        <div class="panel-head library-head">
          <div>
            <p class="card-label">LIBRARY</p>
            <h3>{{ libraryTitle }}</h3>
          </div>
          <label class="search-box">
            <span class="search-glyph" aria-hidden="true"></span>
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索单词或释义"
              aria-label="搜索单词或释义"
            />
          </label>
        </div>

        <div v-if="loading" class="state-block">正在整理归档...</div>
        <div v-else-if="errorMessage" class="state-block is-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="filteredWords.length === 0" class="state-block">
          {{ emptyText }}
        </div>
        <div v-else class="word-table" role="table" aria-label="全部单词">
          <div class="table-row table-header" role="row">
            <span role="columnheader">单词</span>
            <span role="columnheader">主要释义</span>
            <span role="columnheader">复习</span>
            <span role="columnheader">添加时间</span>
            <span role="columnheader">操作</span>
          </div>
          <div v-for="item in filteredWords" :key="item.id" class="table-row" role="row">
            <span class="word-name" role="cell">{{ item.word }}</span>
            <span class="meaning-cell" role="cell">{{ item.primaryMeaning }}</span>
            <span role="cell">{{ item.reviewCount }} 次</span>
            <span role="cell">{{ formatDate(item.createdAt) }}</span>
            <span role="cell">
              <button class="detail-word-btn" type="button" @click="openDetailModal(item)">
                查看详情
              </button>
            </span>
          </div>
        </div>
      </article>
    </section>

    <WordDetailModal :word="selectedWord" @close="closeDetailModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WordDetailModal from '../components/WordDetailModal.vue'
import { fetchHistoryList } from '../services/history.service'
import type { HistoryArchive } from '../types/history'
import type { StoredWord } from '../types/word'

const archive = ref<HistoryArchive | null>(null)
const keyword = ref('')
const loading = ref(false)
const errorMessage = ref('')
const activeFilter = ref<'all' | 'due'>('all')
const selectedWord = ref<StoredWord | null>(null)

const dueWords = computed(() => archive.value?.dueWords ?? [])
const recentWords = computed(() => archive.value?.recentWords ?? [])
const libraryTitle = computed(() => (activeFilter.value === 'due' ? '今日待复习' : '全部单词'))
const emptyText = computed(() => {
  if (activeFilter.value === 'due') {
    return keyword.value.trim() ? '待复习单词中没有匹配结果。' : '今天没有需要复习的单词。'
  }

  return '没有匹配的单词。'
})
const filteredWords = computed(() => {
  const words = activeFilter.value === 'due' ? dueWords.value : archive.value?.words ?? []
  const query = keyword.value.trim().toLowerCase()

  if (!query) {
    return words
  }

  const result: StoredWord[] = []

  for (const item of words) {
    const searchableText = `${item.word} ${item.primaryMeaning}`.toLowerCase()

    if (searchableText.includes(query)) {
      result.push(item)
    }
  }

  return result
})

function setFilter(filter: 'all' | 'due') {
  activeFilter.value = filter
  selectedWord.value = null
}

// 归档页只需要短日期，避免表格在移动端被完整时间挤宽。
function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

// 手动同步和首次进入复用同一条请求链，保证错误状态表现一致。
async function loadArchive() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetchHistoryList()
    archive.value = response.data
  } catch (error) {
    console.error(error)
    errorMessage.value = '归档数据读取失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openDetailModal(word: StoredWord) {
  selectedWord.value = word
}

function closeDetailModal() {
  selectedWord.value = null
}

onMounted(loadArchive)
</script>

<style scoped>
.archive-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.archive-hero {
  padding: 28px 32px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.section-title {
  margin: 0;
}

.hero-desc {
  max-width: 560px;
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.sync-btn {
  min-width: 132px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.summary-card {
  min-height: 104px;
  padding: 22px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: left;
}

button.summary-card {
  cursor: pointer;
}

button.summary-card:focus-visible {
  outline: 3px solid rgba(255, 90, 113, 0.3);
  outline-offset: 3px;
}

.summary-card.is-selected {
  border-color: rgba(255, 90, 113, 0.32);
  box-shadow: 0 16px 42px rgba(255, 90, 113, 0.16);
}

.metric-mark {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 900;
}

.mark-total {
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
}

.mark-review {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
}

.mark-done {
  color: #047857;
  background: rgba(4, 120, 87, 0.1);
}

.summary-card strong {
  display: block;
  color: var(--sl-text-main);
  font-size: 28px;
  line-height: 1;
}

.summary-card p {
  margin: 6px 0 0;
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.archive-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.55fr);
  gap: 24px;
  align-items: start;
}

.recent-panel,
.library-panel {
  padding: 24px;
  border-radius: var(--sl-radius-lg);
}

.library-panel {
  grid-column: 2;
  grid-row: 1;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.panel-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 20px;
}

.panel-count {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
  font-size: 12px;
  font-weight: 800;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recent-card {
  padding: 16px;
  border-radius: var(--sl-radius-md);
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid var(--sl-glass-border);
}

.word-topline,
.word-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.word-topline h4 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 18px;
}

.word-topline span,
.word-meta {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 700;
}

.recent-card p {
  margin: 8px 0 14px;
  color: var(--sl-text-soft);
  line-height: 1.6;
}

.detail-word-btn {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: var(--sl-glass-bg);
  color: var(--sl-text-soft);
  font-weight: 800;
  cursor: pointer;
}

.library-head {
  align-items: flex-start;
}

.search-box {
  width: min(320px, 100%);
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--sl-glass-bg);
  border: 1px solid var(--sl-glass-border-strong);
}

.search-glyph {
  width: 14px;
  height: 14px;
  border: 2px solid var(--sl-text-mute);
  border-radius: 50%;
  position: relative;
  flex: 0 0 auto;
}

.search-glyph::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 2px;
  right: -6px;
  bottom: -3px;
  border-radius: 999px;
  background: var(--sl-text-mute);
  transform: rotate(45deg);
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--sl-text-main);
  font-size: 15px;
}

.word-table {
  display: flex;
  flex-direction: column;
  border-radius: var(--sl-radius-md);
  overflow: hidden;
  border: 1px solid var(--sl-glass-border);
}

.table-row {
  min-height: 58px;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: minmax(110px, 0.9fr) minmax(180px, 1.5fr) 82px 82px 96px;
  gap: 16px;
  align-items: center;
  color: var(--sl-text-soft);
  font-size: 14px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.table-row:last-child {
  border-bottom: none;
}

.table-header {
  min-height: 44px;
  color: var(--sl-text-mute);
  background: rgba(255, 90, 113, 0.05);
  font-size: 12px;
  font-weight: 800;
}

.word-name {
  color: var(--sl-text-main);
  font-size: 16px;
  font-weight: 800;
}

.meaning-cell {
  line-height: 1.6;
}

.state-block {
  min-height: 160px;
  border-radius: var(--sl-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  color: var(--sl-text-soft);
  background: rgba(255, 255, 255, 0.32);
  border: 1px dashed var(--sl-glass-border-strong);
}

.state-block.is-error {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

@media (max-width: 980px) {
  .archive-layout,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .library-panel {
    grid-column: auto;
    grid-row: auto;
  }

  .library-head {
    flex-direction: column;
  }

  .search-box {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .archive-page {
    padding: 24px 12px 56px;
  }

  .archive-hero {
    flex-direction: column;
    align-items: stretch;
    padding: 24px;
  }

  .sync-btn {
    width: 100%;
  }

  .table-header {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
