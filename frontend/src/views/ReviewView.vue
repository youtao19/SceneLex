<template>
  <section class="page">
    <div class="review-head">
      <div>
        <p class="eyebrow">今日任务</p>
        <h2>按单词逐张复习</h2>
        <p class="review-copy">
          先在脑中回忆，再点“显示答案”。评分只更新复习计划，不改动单词内容。
        </p>
      </div>
      <TeachingModeToggle
        :model-value="wordStore.teachingMode"
        @update:model-value="wordStore.setTeachingMode"
      />
    </div>

    <section class="status-card">
      <div>
        <strong>剩余 {{ remainingCount }} 张</strong>
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </div>
      <button class="ghost-btn" :disabled="loading" @click="loadQueue">
        {{ loading ? '刷新中...' : '刷新队列' }}
      </button>
    </section>

    <section v-if="loading && !currentWord" class="empty-card">
      <p>正在加载今日任务...</p>
    </section>

    <section v-else-if="!currentWord" class="empty-card">
      <h3>今日已完成</h3>
      <p>没有到期单词了，明天再来继续推进。</p>
    </section>

    <section v-else class="review-card">
      <div class="memory-side">
        <p class="eyebrow">先回忆</p>
        <h1>{{ currentWord.word }}</h1>
        <p class="primary-meaning">
          {{ answerRevealed ? currentWord.primaryMeaning : '先回忆它的核心义项和场景。' }}
        </p>
      </div>

      <div class="answer-side">
        <button
          v-if="!answerRevealed"
          class="primary-btn"
          @click="answerRevealed = true"
        >
          显示答案
        </button>

        <template v-else>
          <WordMeaningsPanel
            :word="currentWord.word"
            :meanings="currentWord.meanings"
            :teaching-mode="wordStore.teachingMode"
          />

          <div class="rating-row">
            <button class="danger-btn" @click="handleReview('again')">不会</button>
            <button class="warn-btn" @click="handleReview('hard')">模糊</button>
            <button class="success-btn" @click="handleReview('good')">会</button>
          </div>
        </template>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TeachingModeToggle from '../components/TeachingModeToggle.vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { getTodayWords, reviewWord } from '../services/word.service'
import { useWordStore } from '../stores/word'
import type { ReviewRating, StoredWord } from '../types/word'

const wordStore = useWordStore()
const queue = ref<StoredWord[]>([])
const loading = ref(false)
const answerRevealed = ref(false)
const errorMessage = ref('')

const currentWord = computed(() => queue.value[0] ?? null)
const remainingCount = computed(() => queue.value.length)

/**
 * 每次进入复习页都重新拉取到期队列，避免拿到过期的本地缓存。
 */
async function loadQueue() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await getTodayWords()
    queue.value = response.data
    answerRevealed.value = false
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载复习队列失败'
    queue.value = []
  } finally {
    loading.value = false
  }
}

/**
 * 评分成功后直接移除当前卡，保证用户看到的是更新后的剩余队列。
 */
async function handleReview(rating: ReviewRating) {
  if (!currentWord.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    await reviewWord(currentWord.value.id, rating)
    queue.value = queue.value.slice(1)
    answerRevealed.value = false
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '提交评分失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadQueue()
})
</script>

<style scoped>
.page {
  display: grid;
  gap: 18px;
}

.review-head,
.status-card,
.review-card,
.empty-card {
  padding: 24px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
}

.review-head,
.status-card {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1,
h2,
h3 {
  margin: 0;
  color: #0f172a;
}

.review-copy,
.empty-card p,
.primary-meaning {
  margin: 8px 0 0;
  color: #475569;
  line-height: 1.7;
}

.review-card {
  display: grid;
  gap: 20px;
}

.memory-side {
  padding: 28px;
  border-radius: 20px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}

.answer-side {
  display: grid;
  gap: 16px;
}

.rating-row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.primary-btn,
.ghost-btn,
.danger-btn,
.warn-btn,
.success-btn {
  height: 48px;
  border: none;
  border-radius: 14px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #1d4ed8;
  color: #ffffff;
}

.ghost-btn {
  padding: 0 16px;
  background: #eff6ff;
  color: #1d4ed8;
}

.danger-btn {
  background: #fee2e2;
  color: #b91c1c;
}

.warn-btn {
  background: #fef3c7;
  color: #b45309;
}

.success-btn {
  background: #dcfce7;
  color: #15803d;
}

.ghost-btn:disabled,
.danger-btn:disabled,
.warn-btn:disabled,
.success-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.error-text {
  margin: 8px 0 0;
  color: #dc2626;
}

@media (max-width: 720px) {
  .review-head,
  .status-card {
    flex-direction: column;
    align-items: stretch;
  }

  .rating-row {
    grid-template-columns: 1fr;
  }
}
</style>
