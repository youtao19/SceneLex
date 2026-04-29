<template>
  <div class="review-page">
    <header class="review-hero surface-card">
      <div>
        <p class="card-label">REVIEW BAY</p>
        <h2 class="section-title">复习舱</h2>
        <p class="hero-desc">{{ heroDescription }}</p>
      </div>
      <div class="hero-actions">
        <button class="peach-button-ghost sync-btn" type="button" @click="loadMockReviewData">
          载入测试词
        </button>
        <button class="peach-button-secondary sync-btn" :disabled="loading" @click="syncReviewData">
          {{ loading ? '同步中...' : '同步复习仓' }}
        </button>
      </div>
    </header>

    <section class="review-metrics" aria-label="复习概览">
      <article class="metric-card surface-card">
        <span class="metric-mark mark-due" aria-hidden="true">R</span>
        <div>
          <strong>{{ remainingCount }}</strong>
          <p>当前队列</p>
        </div>
      </article>
      <article class="metric-card surface-card">
        <span class="metric-mark mark-total" aria-hidden="true">Aa</span>
        <div>
          <strong>{{ archive?.summary.totalWords ?? 0 }}</strong>
          <p>词库单词</p>
        </div>
      </article>
      <article class="metric-card surface-card">
        <span class="metric-mark mark-done" aria-hidden="true">OK</span>
        <div>
          <strong>{{ archive?.summary.reviewedWords ?? 0 }}</strong>
          <p>已复习过</p>
        </div>
      </article>
    </section>

    <main class="review-layout">
      <section class="review-stage surface-card" aria-label="今日复习">
        <div class="stage-topline">
          <div>
            <p class="card-label">TODAY</p>
            <h3>今日队列</h3>
          </div>
          <span class="queue-pill">{{ queueStatus }}</span>
        </div>

        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
        </div>

        <transition name="card-flip" mode="out-in">
          <div v-if="loading && displayWords.length === 0" class="state-panel" key="loading">
            正在读取复习队列...
          </div>

          <div v-else-if="errorMessage" class="state-panel is-error" key="error">
            {{ errorMessage }}
          </div>

          <div v-else-if="displayWords.length === 0" class="state-panel" key="complete">
            <span class="state-mark">0</span>
            <h3>{{ emptyTitle }}</h3>
            <p>{{ emptyDescription }}</p>
            <RouterLink to="/" class="peach-button-secondary">添加新单词</RouterLink>
          </div>

          <div v-else class="review-table" key="table" role="table" aria-label="复习单词表格">
            <div class="table-row table-header" role="row">
              <span role="columnheader">单词</span>
              <span role="columnheader">意思</span>
              <span role="columnheader">操作</span>
            </div>

            <div
              v-for="item in displayWords"
              :key="item.id"
              class="table-row word-row"
              :class="{ 'is-revealed': isWordRevealed(item.id) }"
              role="row"
            >
              <div class="word-cell" role="cell">
                <strong>{{ item.word }}</strong>
                <span>{{ item.reviewCount }} 次复习</span>
              </div>

              <div class="meaning-cell" role="cell">
                <div v-if="isWordRevealed(item.id)" class="meaning-list">
                  <span
                    v-for="(meaning, index) in item.meanings"
                    :key="index"
                    class="meaning-pill"
                  >
                    {{ meaning.partOfSpeech }} {{ meaning.meaning }}
                  </span>
                </div>
                <span v-else class="hidden-meaning">先回忆，再选择记得或不记得</span>
              </div>

              <div class="action-cell" role="cell">
                <template v-if="!isWordRevealed(item.id)">
                  <button
                    class="remember-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'good')"
                  >
                    记得
                  </button>
                  <button
                    class="hard-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'hard')"
                  >
                    模糊
                  </button>
                  <button
                    class="forget-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'again')"
                  >
                    不记得
                  </button>
                </template>
                <template v-else>
                  <span class="review-result">{{ getReviewResultLabel(item.id) }}</span>
                  <button
                    class="detail-btn"
                    type="button"
                    @click="openDetailModal(item)"
                  >
                    查看详情
                  </button>
                </template>
              </div>
            </div>
          </div>
        </transition>
      </section>
    </main>

    <div
      v-if="selectedWord"
      class="modal-backdrop"
      aria-modal="true"
      role="dialog"
      @click="closeDetailModal"
    >
      <article class="word-detail-modal surface-card" @click.stop>
        <header class="modal-head">
          <div>
            <p class="card-label">WORD DETAIL</p>
            <h3>{{ selectedWord.word }}</h3>
          </div>
          <button class="modal-close" type="button" aria-label="关闭详情" @click="closeDetailModal">
            ×
          </button>
        </header>

        <div class="modal-scroll">
          <WordMeaningsPanel
            :word="selectedWord.word"
            :phonetic="selectedWord.phonetic"
            :meanings="selectedWord.meanings"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { fetchHistoryList } from '../services/history.service'
import { getTodayWords, reviewWord } from '../services/word.service'
import type { HistoryArchive } from '../types/history'
import type { ReviewRating, StoredWord } from '../types/word'

const queue = ref<StoredWord[]>([])
const archive = ref<HistoryArchive | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const usingMockData = ref(false)
const revealedWordIds = ref<Set<number>>(new Set())
const submittingWordIds = ref<Set<number>>(new Set())
const reviewResults = ref<Record<number, ReviewRating>>({})
const selectedWord = ref<StoredWord | null>(null)

const displayWords = computed(() => queue.value)
const remainingCount = computed(() => displayWords.value.length)
const reviewedCount = computed(() => revealedWordIds.value.size)
const progress = computed(() => {
  if (displayWords.value.length === 0) return 0
  return (reviewedCount.value / displayWords.value.length) * 100
})
const queueStatus = computed(() => {
  if (displayWords.value.length === 0) return '暂无单词'

  return `${reviewedCount.value}/${displayWords.value.length}`
})
const heroDescription = computed(() => {
  if (usingMockData.value) {
    return '当前正在查看本地测试词，点击“记得/不记得”只会揭示释义，不会写入数据库。'
  }

  if (displayWords.value.length > 0) {
    return '今日队列会以表格展示所有单词，先回忆，再选择记得或不记得。'
  }

  if ((archive.value?.summary.totalWords ?? 0) > 0) {
    return '今天没有到期卡片，但你的单词已经在词库里。'
  }

  return '这里会展示到期复习卡片；保存单词后，它们会按复习日期进入队列。'
})
const emptyTitle = computed(() => {
  if ((archive.value?.summary.totalWords ?? 0) > 0) return '今天没有到期单词'

  return '还没有复习卡片'
})
const emptyDescription = computed(() => {
  if (usingMockData.value) {
    return '点击“载入测试词”可以重新查看表格和详情弹窗。'
  }

  if ((archive.value?.summary.totalWords ?? 0) > 0) {
    return '新保存的单词通常会安排到下一次复习日期，所以不会马上出现在今日队列。'
  }

  return '先在首页查询并保存单词，复习舱会自动读取你的队列。'
})

/**
 * 复习页需要同时读今日队列和词库概览，否则“今天无到期”会被误解成没有保存单词。
 */
async function loadQueue() {
  const [queueResponse, archiveResponse] = await Promise.all([
    getTodayWords(),
    fetchHistoryList(),
  ])

  queue.value = queueResponse.data
  archive.value = archiveResponse.data
  revealedWordIds.value = new Set()
  submittingWordIds.value = new Set()
  reviewResults.value = {}
  selectedWord.value = null
  usingMockData.value = false
}

/**
 * 测试词只服务于页面验收，使用负数 id 可以明确区分它们不是数据库记录。
 */
function buildMockReviewWords(): StoredWord[] {
  const today = new Date().toISOString()

  return [
    {
      id: -1,
      word: 'resilient',
      phonetic: '/rɪˈzɪliənt/',
      primaryMeaning: '有韧性的；能恢复的',
      meanings: [
        {
          partOfSpeech: 'adj.',
          meaning: '有韧性的；能从困难中恢复的',
          example: 'a resilient student after repeated setbacks',
          tip: 're- 像“重新”，silent 不是真的沉默；重点记“受挫后重新站起来”。',
        },
        {
          partOfSpeech: 'adj.',
          meaning: '材料有弹性的',
          example: 'resilient rubber returns to shape',
          tip: '把它想成被按下又弹回来的材料。',
        },
      ],
      ease: 2.5,
      interval: 1,
      nextReview: today,
      reviewCount: 0,
      createdAt: today,
      updatedAt: today,
    },
    {
      id: -2,
      word: 'elaborate',
      phonetic: '/ɪˈlæbərət/',
      primaryMeaning: '详细说明；复杂精致的',
      meanings: [
        {
          partOfSpeech: 'v.',
          meaning: '详细说明',
          example: 'elaborate on the main idea',
          tip: '考试里常见 elaborate on，后面接要展开解释的观点。',
        },
        {
          partOfSpeech: 'adj.',
          meaning: '复杂精致的',
          example: 'an elaborate plan with many steps',
          tip: '看到很多细节、很多步骤，就联想到 elaborate。',
        },
      ],
      ease: 2.2,
      interval: 2,
      nextReview: today,
      reviewCount: 1,
      createdAt: today,
      updatedAt: today,
    },
    {
      id: -3,
      word: 'subtle',
      phonetic: '/ˈsʌtəl/',
      primaryMeaning: '微妙的；不易察觉的',
      meanings: [
        {
          partOfSpeech: 'adj.',
          meaning: '微妙的；不明显的',
          example: 'a subtle change in tone',
          tip: 'subtle 常形容变化很小，但会影响理解。',
        },
      ],
      ease: 2.8,
      interval: 3,
      nextReview: today,
      reviewCount: 2,
      createdAt: today,
      updatedAt: today,
    },
  ]
}

/**
 * 本地 mock 直接复用真实 StoredWord 结构，这样能验证当前页面真实渲染路径。
 */
function loadMockReviewData() {
  const words = buildMockReviewWords()

  queue.value = words
  archive.value = {
    summary: {
      totalWords: words.length,
      dueToday: words.length,
      reviewedWords: words.filter((word) => word.reviewCount > 0).length,
    },
    dueWords: words,
    recentWords: words,
    words,
  }
  revealedWordIds.value = new Set()
  submittingWordIds.value = new Set()
  reviewResults.value = {}
  selectedWord.value = null
  errorMessage.value = ''
  usingMockData.value = true
}

/**
 * 手动同步和首次进入共用一条链路，避免两个入口出现不同的错误状态。
 */
async function syncReviewData() {
  loading.value = true
  errorMessage.value = ''

  try {
    await loadQueue()
  } catch (error) {
    console.error(error)
    errorMessage.value = '复习仓读取失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function isWordRevealed(wordId: number) {
  return revealedWordIds.value.has(wordId)
}

function isWordSubmitting(wordId: number) {
  return submittingWordIds.value.has(wordId)
}

function getReviewResultLabel(wordId: number) {
  const result = reviewResults.value[wordId]

  if (result === 'again') return '已标记不记得'
  if (result === 'hard') return '已标记模糊'
  if (result === 'good') return '已标记记得'

  return '已显示意思'
}

/**
 * 选择后先揭示释义，再提交真实复习评分；这样网络慢时也能立即看到答案。
 */
async function handleReviewChoice(word: StoredWord, rating: ReviewRating) {
  if (isWordRevealed(word.id)) return

  revealedWordIds.value = new Set([...revealedWordIds.value, word.id])
  reviewResults.value = {
    ...reviewResults.value,
    [word.id]: rating,
  }

  if (usingMockData.value) return

  submittingWordIds.value = new Set([...submittingWordIds.value, word.id])
  errorMessage.value = ''

  try {
    await reviewWord(word.id, rating)
  } catch (error) {
    console.error(error)
    errorMessage.value = '复习记录更新失败，请同步后再试。'
  } finally {
    const nextSubmittingIds = new Set(submittingWordIds.value)
    nextSubmittingIds.delete(word.id)
    submittingWordIds.value = nextSubmittingIds
  }
}

function openDetailModal(word: StoredWord) {
  selectedWord.value = word
}

function closeDetailModal() {
  selectedWord.value = null
}

onMounted(syncReviewData)
</script>

<style scoped>
.review-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.review-hero {
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
  max-width: 620px;
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.sync-btn {
  min-width: 132px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.review-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.metric-card {
  min-height: 104px;
  padding: 22px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  align-items: center;
  gap: 16px;
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

.mark-due {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
}

.mark-total {
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
}

.mark-done {
  color: #047857;
  background: rgba(4, 120, 87, 0.1);
}

.metric-card strong {
  display: block;
  color: var(--sl-text-main);
  font-size: 28px;
  line-height: 1;
}

.metric-card p {
  margin: 6px 0 0;
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.review-layout {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
}

.review-stage {
  border-radius: var(--sl-radius-lg);
  padding: 24px;
}

.stage-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.stage-topline h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 20px;
}

.queue-pill {
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

.progress-bar-wrap {
  height: 6px;
  background: var(--sl-peach-100);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 20px;
}

.progress-bar {
  height: 100%;
  background: var(--sl-peach-500);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.state-panel {
  min-height: 440px;
  border-radius: var(--sl-radius-md);
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--sl-text-soft);
  background: rgba(255, 255, 255, 0.34);
  border: 1px dashed var(--sl-glass-border-strong);
}

.state-panel.is-error {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

.state-mark {
  width: 64px;
  height: 64px;
  margin-bottom: 18px;
  border-radius: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
  font-size: 28px;
  font-weight: 900;
}

.state-panel h3 {
  margin: 0 0 10px;
  color: var(--sl-text-main);
  font-size: 24px;
}

.review-table {
  border-radius: var(--sl-radius-md);
  overflow: hidden;
  border: 1px solid var(--sl-glass-border);
}

.table-row {
  min-height: 68px;
  padding: 14px 18px;
  display: grid;
  grid-template-columns: minmax(150px, 0.85fr) minmax(320px, 1.8fr) 190px;
  gap: 18px;
  align-items: center;
  border-bottom: 1px solid var(--sl-glass-border);
}

.table-row:last-child {
  border-bottom: none;
}

.table-header {
  min-height: 44px;
  background: rgba(255, 90, 113, 0.05);
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 900;
}

.word-row {
  background: rgba(255, 255, 255, 0.24);
}

.word-row.is-revealed {
  background: rgba(236, 253, 245, 0.42);
}

.word-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.word-cell strong {
  color: var(--sl-text-main);
  font-size: 18px;
}

.word-cell span {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 700;
}

.meaning-cell {
  color: var(--sl-text-soft);
  line-height: 1.6;
}

.meaning-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meaning-pill {
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.46);
  border: 1px solid var(--sl-glass-border);
  font-size: 13px;
  font-weight: 700;
}

.hidden-meaning {
  color: var(--sl-text-mute);
}

.action-cell {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.forget-btn,
.hard-btn,
.remember-btn,
.detail-btn,
.modal-close {
  border: none;
  cursor: pointer;
  font-weight: 800;
}

.forget-btn,
.hard-btn,
.remember-btn,
.detail-btn {
  min-width: 68px;
  min-height: 40px;
  border-radius: 999px;
}

.forget-btn {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

.remember-btn {
  color: #047857;
  background: rgba(4, 120, 87, 0.1);
}

.hard-btn {
  color: #c2410c;
  background: rgba(249, 115, 22, 0.1);
}

.forget-btn:disabled,
.hard-btn:disabled,
.remember-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.detail-btn {
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
}

.review-result {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 800;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  padding: 32px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 13, 19, 0.36);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.word-detail-modal {
  width: min(820px, 100%);
  max-height: min(760px, calc(100vh - 64px));
  border-radius: var(--sl-radius-xl);
  overflow: hidden;
}

.modal-head {
  padding: 22px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.modal-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 28px;
  font-family: var(--sl-display-font);
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

.modal-scroll {
  max-height: calc(100vh - 190px);
  padding: 8px 28px 28px;
  overflow-y: auto;
}

@media (max-width: 980px) {
  .review-layout,
  .review-metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .review-page {
    padding: 24px 12px 56px;
  }

  .review-hero {
    flex-direction: column;
    align-items: stretch;
    padding: 24px;
  }

  .sync-btn {
    width: 100%;
  }

  .hero-actions {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .review-stage {
    padding: 18px;
  }

  .state-panel {
    min-height: 360px;
  }

  .table-header {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 16px;
  }

  .action-cell {
    justify-content: flex-start;
  }

  .forget-btn,
  .hard-btn,
  .remember-btn,
  .detail-btn {
    width: 100%;
  }

  .modal-backdrop {
    padding: 14px;
  }

  .modal-head,
  .modal-scroll {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>
