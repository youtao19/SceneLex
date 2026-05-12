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
              :class="reviewRowClass(item.id)"
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
                    :class="reviewToneClass(item.id)"
                  >
                    {{ meaning.partOfSpeech }} {{ meaning.meaning }}
                  </span>
                </div>
                <span v-else class="hidden-meaning">先回忆，再选择记得或不记得</span>
              </div>

              <div class="action-cell" role="cell">
                <template v-if="!isWordRevealed(item.id) || !hasReviewResult(item.id)">
                  <button
                    class="forget-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'again')"
                  >
                    不记得
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
                    class="remember-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'good')"
                  >
                    记得
                  </button>
                  <button
                    class="easy-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="handleReviewChoice(item, 'easy')"
                  >
                    很轻松
                  </button>
                </template>
                <template v-else>
                  <span class="review-result" :class="reviewToneClass(item.id)">
                    {{ getReviewResultLabel(item.id) }}
                  </span>
                  <button
                    class="undo-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="undoReviewChoice(item.id)"
                  >
                    撤销
                  </button>
                  <button
                    class="detail-btn"
                    type="button"
                    @click="openDetailModal(item)"
                  >
                    查看详情
                  </button>
                  <button
                    class="next-btn"
                    type="button"
                    :disabled="isWordSubmitting(item.id)"
                    @click="dismissReviewedWord(item.id)"
                  >
                    下一词
                  </button>
                </template>
              </div>
            </div>
          </div>
        </transition>
      </section>
    </main>

    <WordDetailModal :word="selectedWord" @close="closeDetailModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WordDetailModal from '../components/WordDetailModal.vue'
import { fetchHistoryList } from '../services/history.service'
import { getTodayWords, reviewWord, rollbackReviewWord } from '../services/word.service'
import type { HistoryArchive } from '../types/history'
import type { ReviewRating, ReviewRollbackPayload, StoredWord } from '../types/word'

const queue = ref<StoredWord[]>([])
const archive = ref<HistoryArchive | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const usingMockData = ref(false)
const revealedWordIds = ref<Set<number>>(new Set())
const submittingWordIds = ref<Set<number>>(new Set())
const submittedWordIds = ref<Set<number>>(new Set())
const reviewResults = ref<Record<number, ReviewRating>>({})
const rollbackSnapshots = ref<Record<number, ReviewRollbackPayload>>({})
const selectedWord = ref<StoredWord | null>(null)
const totalReviewCount = ref(0)
const completedReviewCount = ref(0)

const displayWords = computed(() => queue.value)
const remainingCount = computed(() => displayWords.value.length)
const progress = computed(() => {
  if (totalReviewCount.value === 0) return 0

  return (completedReviewCount.value / totalReviewCount.value) * 100
})
const queueStatus = computed(() => {
  if (totalReviewCount.value === 0) return '暂无单词'

  return `${completedReviewCount.value}/${totalReviewCount.value}`
})
const hasCompletedCurrentQueue = computed(() => {
  return totalReviewCount.value > 0 && completedReviewCount.value === totalReviewCount.value
})
const heroDescription = computed(() => {
  if (usingMockData.value) {
    return '当前正在查看本地测试词，点击“记得/不记得”只会揭示释义，不会写入数据库。'
  }

  if (displayWords.value.length > 0) {
    return '今日队列会以表格展示所有单词，先回忆，再选择记得或不记得。'
  }

  if (hasCompletedCurrentQueue.value) {
    return '今日复习已完成，队列已经清空。'
  }

  if ((archive.value?.summary.totalWords ?? 0) > 0) {
    return '今天没有到期卡片，但你的单词已经在词库里。'
  }

  return '这里会展示到期复习卡片；保存单词后，它们会按复习日期进入队列。'
})
const emptyTitle = computed(() => {
  if (hasCompletedCurrentQueue.value) return '今日复习完成'

  if ((archive.value?.summary.totalWords ?? 0) > 0) return '今天没有到期单词'

  return '还没有复习卡片'
})
const emptyDescription = computed(() => {
  if (usingMockData.value) {
    return '点击“载入测试词”可以重新查看表格和详情弹窗。'
  }

  if (hasCompletedCurrentQueue.value) {
    return '已提交的单词会按新的复习日期进入下一次队列。'
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
  submittedWordIds.value = new Set()
  reviewResults.value = {}
  rollbackSnapshots.value = {}
  selectedWord.value = null
  totalReviewCount.value = queueResponse.data.length
  completedReviewCount.value = 0
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
  submittedWordIds.value = new Set()
  reviewResults.value = {}
  rollbackSnapshots.value = {}
  selectedWord.value = null
  totalReviewCount.value = words.length
  completedReviewCount.value = 0
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

function hasReviewResult(wordId: number) {
  return Boolean(reviewResults.value[wordId])
}

function isWordSubmitting(wordId: number) {
  return submittingWordIds.value.has(wordId)
}

function isWordSubmitted(wordId: number) {
  return submittedWordIds.value.has(wordId)
}

function reviewToneClass(wordId: number) {
  const result = reviewResults.value[wordId]

  if (!result) return ''

  return `is-${result}`
}

function reviewRowClass(wordId: number) {
  return {
    'is-revealed': isWordRevealed(wordId),
    [reviewToneClass(wordId)]: Boolean(reviewToneClass(wordId)),
  }
}

function getReviewResultLabel(wordId: number) {
  const result = reviewResults.value[wordId]

  if (result === 'again') return '已标记不记得'
  if (result === 'hard') return '已标记模糊'
  if (result === 'good') return '已标记记得'
  if (result === 'easy') return '已标记很轻松'

  return '已显示意思'
}

function markReviewCompleted() {
  completedReviewCount.value += 1
}

function unmarkReviewCompleted() {
  completedReviewCount.value = Math.max(0, completedReviewCount.value - 1)
}

function dismissReviewedWord(wordId: number) {
  if (!queue.value.some((item) => item.id === wordId)) return

  queue.value = queue.value.filter((item) => item.id !== wordId)

  const nextRevealedIds = new Set(revealedWordIds.value)
  nextRevealedIds.delete(wordId)
  revealedWordIds.value = nextRevealedIds

  const nextReviewResults = { ...reviewResults.value }
  delete nextReviewResults[wordId]
  reviewResults.value = nextReviewResults

  const nextRollbackSnapshots = { ...rollbackSnapshots.value }
  delete nextRollbackSnapshots[wordId]
  rollbackSnapshots.value = nextRollbackSnapshots

  const nextSubmittedIds = new Set(submittedWordIds.value)
  nextSubmittedIds.delete(wordId)
  submittedWordIds.value = nextSubmittedIds

  if (selectedWord.value?.id === wordId) {
    selectedWord.value = null
  }
}

/**
 * 撤销会恢复后端排期，答案继续显示，方便用户看着释义重新选择。
 */
async function undoReviewChoice(wordId: number) {
  if (isWordSubmitting(wordId)) return

  if (usingMockData.value) {
    clearSubmittedReview(wordId)
    return
  }

  const rollbackSnapshot = rollbackSnapshots.value[wordId]

  if (!rollbackSnapshot) return

  submittingWordIds.value = new Set([...submittingWordIds.value, wordId])
  errorMessage.value = ''

  try {
    const response = await rollbackReviewWord(rollbackSnapshot)
    updateQueueWord(response.data)
    clearSubmittedReview(wordId)
  } catch (error) {
    console.error(error)
    errorMessage.value = '撤销失败，请稍后再试或同步复习舱。'
  } finally {
    const nextSubmittingIds = new Set(submittingWordIds.value)
    nextSubmittingIds.delete(wordId)
    submittingWordIds.value = nextSubmittingIds
  }
}

function clearSubmittedReview(wordId: number) {
  const nextReviewResults = { ...reviewResults.value }
  delete nextReviewResults[wordId]
  reviewResults.value = nextReviewResults

  const nextRollbackSnapshots = { ...rollbackSnapshots.value }
  delete nextRollbackSnapshots[wordId]
  rollbackSnapshots.value = nextRollbackSnapshots

  if (isWordSubmitted(wordId)) {
    const nextSubmittedIds = new Set(submittedWordIds.value)
    nextSubmittedIds.delete(wordId)
    submittedWordIds.value = nextSubmittedIds
    unmarkReviewCompleted()
  }
}

/**
 * 评分立即写入后端，同时保留回滚快照，给用户看完答案后撤销或改选的机会。
 */
async function handleReviewChoice(word: StoredWord, rating: ReviewRating) {
  if (isWordSubmitting(word.id) || hasReviewResult(word.id)) return

  revealedWordIds.value = new Set([...revealedWordIds.value, word.id])
  reviewResults.value = {
    ...reviewResults.value,
    [word.id]: rating,
  }

  if (usingMockData.value) {
    submittedWordIds.value = new Set([...submittedWordIds.value, word.id])
    markReviewCompleted()
    return
  }

  rollbackSnapshots.value = {
    ...rollbackSnapshots.value,
    [word.id]: buildRollbackSnapshot(word),
  }
  submittingWordIds.value = new Set([...submittingWordIds.value, word.id])
  errorMessage.value = ''

  try {
    const response = await reviewWord(word.id, rating)
    updateQueueWord(response.data)
    submittedWordIds.value = new Set([...submittedWordIds.value, word.id])
    markReviewCompleted()
  } catch (error) {
    console.error(error)
    clearPendingReviewChoice(word.id)
    errorMessage.value = '复习记录更新失败，请重新评分或同步后再试。'
  } finally {
    const nextSubmittingIds = new Set(submittingWordIds.value)
    nextSubmittingIds.delete(word.id)
    submittingWordIds.value = nextSubmittingIds
  }
}

function buildRollbackSnapshot(word: StoredWord): ReviewRollbackPayload {
  return {
    wordId: word.id,
    ease: word.ease,
    interval: word.interval,
    nextReview: word.nextReview,
    reviewCount: word.reviewCount,
  }
}

function updateQueueWord(updatedWord: StoredWord) {
  queue.value = queue.value.map((item) => (
    item.id === updatedWord.id ? updatedWord : item
  ))
}

function clearPendingReviewChoice(wordId: number) {
  const nextReviewResults = { ...reviewResults.value }
  delete nextReviewResults[wordId]
  reviewResults.value = nextReviewResults

  const nextRollbackSnapshots = { ...rollbackSnapshots.value }
  delete nextRollbackSnapshots[wordId]
  rollbackSnapshots.value = nextRollbackSnapshots
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

.word-row.is-again {
  background: rgba(254, 242, 242, 0.7);
}

.word-row.is-hard {
  background: rgba(255, 247, 237, 0.72);
}

.word-row.is-good {
  background: rgba(236, 253, 245, 0.7);
}

.word-row.is-easy {
  background: rgba(239, 246, 255, 0.72);
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

.meaning-pill.is-again {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
  border-color: rgba(180, 35, 24, 0.18);
}

.meaning-pill.is-hard {
  color: #c2410c;
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.2);
}

.meaning-pill.is-good {
  color: #047857;
  background: rgba(4, 120, 87, 0.1);
  border-color: rgba(4, 120, 87, 0.2);
}

.meaning-pill.is-easy {
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.1);
  border-color: rgba(37, 99, 235, 0.2);
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
.easy-btn,
.remember-btn,
.undo-btn,
.detail-btn,
.next-btn,
.modal-close {
  border: none;
  cursor: pointer;
  font-weight: 800;
}

.forget-btn,
.hard-btn,
.easy-btn,
.remember-btn,
.undo-btn,
.detail-btn,
.next-btn {
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

.easy-btn {
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.1);
}

.next-btn {
  color: #4f46e5;
  background: rgba(79, 70, 229, 0.1);
}

.undo-btn {
  color: #475569;
  background: rgba(71, 85, 105, 0.1);
}

.forget-btn:disabled,
.hard-btn:disabled,
.easy-btn:disabled,
.remember-btn:disabled,
.undo-btn:disabled,
.next-btn:disabled {
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

.review-result.is-again {
  color: #b42318;
}

.review-result.is-hard {
  color: #c2410c;
}

.review-result.is-good {
  color: #047857;
}

.review-result.is-easy {
  color: #1d4ed8;
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
  .easy-btn,
  .remember-btn,
  .undo-btn,
  .next-btn,
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
