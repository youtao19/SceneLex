<template>
  <div class="review-zen">
    <header class="review-header">
      <div class="progress-bar-wrap">
        <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
      </div>
      <div class="header-meta">
        <span class="count">剩余 {{ remainingCount }} 张</span>
        <button class="minimal-btn" @click="loadQueue">同步队列</button>
      </div>
    </header>

    <main class="review-focus">
      <transition name="card-flip" mode="out-in">
        <!-- Empty/Complete State -->
        <div v-if="!currentWord" class="zen-state surface-card" key="complete">
          <span class="zen-icon">✨</span>
          <h2 class="zen-title">已完成</h2>
          <p>此刻没有更多的单词需要复习了。</p>
          <RouterLink to="/" class="peach-button-secondary">回到首页</RouterLink>
        </div>

        <!-- Active Word Card -->
        <div v-else class="recall-card-wrap" :key="currentWord.word">
          <div class="recall-card surface-card" :class="{ 'is-revealed': answerRevealed }">
            <div class="card-face front">
              <p class="card-label">RECALL</p>
              <h2 class="target-word">{{ currentWord.word }}</h2>
              <p class="recall-prompt">在脑海中检索这个词的含义...</p>
              <button class="peach-button reveal-btn" @click="answerRevealed = true">揭晓答案</button>
            </div>

            <div v-if="answerRevealed" class="card-face back">
              <WordMeaningsPanel
                :word="currentWord.word"
                :meanings="currentWord.meanings"
                :teaching-mode="wordStore.teachingMode"
              />
              
              <div class="rating-bar">
                <button class="rate-opt rate-red" @click="handleReview('again')">忘记</button>
                <button class="rate-opt rate-orange" @click="handleReview('hard')">模糊</button>
                <button class="rate-opt rate-green" @click="handleReview('good')">记得</button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </main>

    <!-- Footer: 移除 TeachingModeToggle，因为已经在顶部全局导航栏中了 -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { getTodayWords, reviewWord } from '../services/word.service'
import { useWordStore } from '../stores/word'
import type { ReviewRating, StoredWord } from '../types/word'

const wordStore = useWordStore()
const queue = ref<StoredWord[]>([])
const loading = ref(false)
const answerRevealed = ref(false)
const totalAtStart = ref(0)

const currentWord = computed(() => queue.value[0] ?? null)
const remainingCount = computed(() => queue.value.length)
const progress = computed(() => {
  if (totalAtStart.value === 0) return 0
  return ((totalAtStart.value - queue.value.length) / totalAtStart.value) * 100
})

async function loadQueue() {
  loading.value = true
  try {
    const response = await getTodayWords()
    queue.value = response.data
    totalAtStart.value = queue.value.length
    answerRevealed.value = false
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function handleReview(rating: ReviewRating) {
  if (!currentWord.value) return
  try {
    await reviewWord(currentWord.value.id, rating)
    queue.value = queue.value.slice(1)
    answerRevealed.value = false
  } catch (error) {
    console.error(error)
  }
}

onMounted(loadQueue)
</script>

<style scoped>
.review-zen {
  max-width: 900px;
  margin: 0 auto;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 40px 20px;
}

.review-header {
  margin-bottom: 60px;
}

.progress-bar-wrap {
  height: 4px;
  background: var(--sl-peach-100);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-bar {
  height: 100%;
  background: var(--sl-peach-500);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.header-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--sl-ink-500);
  font-weight: 700;
}

.minimal-btn {
  background: none;
  border: none;
  color: var(--sl-peach-500);
  cursor: pointer;
  padding: 0;
}

.review-focus {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recall-card-wrap {
  width: 100%;
}

.recall-card {
  padding: 48px;
  border-radius: var(--sl-radius-xl);
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.front {
  text-align: center;
}

.target-word {
  font-size: 64px;
  font-weight: 900;
  color: var(--sl-ink-900);
  margin: 20px 0;
  font-family: var(--sl-display-font);
}

.recall-prompt {
  font-size: 16px;
  color: var(--sl-ink-500);
  margin-bottom: 40px;
}

.rating-bar {
  margin-top: 40px;
  padding-top: 32px;
  border-top: 1px solid var(--sl-glass-border);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.rate-opt {
  height: 52px;
  border-radius: 12px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rate-red { background: #fee2e2; color: #ef4444; }
.rate-orange { background: #fff7ed; color: #f97316; }
.rate-green { background: #ecfdf5; color: #10b981; }

.rate-opt:hover {
  transform: translateY(-2px);
  filter: brightness(0.95);
}

.zen-state {
  text-align: center;
  padding: 80px 40px;
}

.zen-icon { font-size: 48px; }
.zen-title { margin: 20px 0 10px; }

@media (max-width: 600px) {
  .recall-card { padding: 24px; }
  .target-word { font-size: 48px; }
}
</style>
