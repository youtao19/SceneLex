<template>
  <section class="page">
    <div class="intro-card">
      <div>
        <p class="eyebrow">添加单词</p>
        <h2>先预览，再加入记忆库</h2>
        <p class="intro-text">
          当前仍使用现有 prompt 生成考研常考核心义项。确认内容合适后，再手动加入复习队列。
        </p>
      </div>
      <TeachingModeToggle
        :model-value="wordStore.teachingMode"
        @update:model-value="wordStore.setTeachingMode"
      />
    </div>

    <section class="input-card">
      <label class="field-label" for="word-input">输入单词</label>
      <div class="input-row">
        <input
          id="word-input"
          v-model="word"
          class="word-input"
          placeholder="例如：heave"
          @keyup.enter="handlePreview"
        />
        <button class="primary-btn" :disabled="previewLoading" @click="handlePreview">
          {{ previewLoading ? '生成中...' : '预览内容' }}
        </button>
      </div>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <p v-if="successMessage" class="success-text">{{ successMessage }}</p>
    </section>

    <WordMeaningsPanel
      v-if="preview"
      :word="preview.word"
      :meanings="preview.meanings"
      :teaching-mode="wordStore.teachingMode"
    />

    <section v-if="preview" class="action-card">
      <div>
        <h3>确认加入今日记忆库</h3>
        <p>当前保存的是你已经看到的这份预览结果，不会再次调用模型。</p>
      </div>
      <button class="primary-btn" :disabled="saveLoading" @click="handleAddWord">
        {{ saveLoading ? '保存中...' : '加入记忆库' }}
      </button>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TeachingModeToggle from '../components/TeachingModeToggle.vue'
import WordMeaningsPanel from '../components/WordMeaningsPanel.vue'
import { addWord, generateWord } from '../services/word.service'
import { useWordStore } from '../stores/word'
import type { WordGenerateData } from '../types/word'

const wordStore = useWordStore()
const word = ref('')
const preview = ref<WordGenerateData | null>(null)
const previewLoading = ref(false)
const saveLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

/**
 * 预览阶段只调生成接口，让用户先确认这份义项是否值得进入复习库。
 */
async function handlePreview() {
  const inputWord = word.value.trim()

  if (!inputWord) {
    errorMessage.value = '请输入单词'
    successMessage.value = ''
    preview.value = null
    return
  }

  previewLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await generateWord(inputWord)
    preview.value = response.data
    wordStore.setWord(response.data.word)
    wordStore.setMeanings(response.data.meanings)
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '预览失败，请稍后重试'
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

/**
 * 保存时直接提交当前预览过的 meanings，避免再次生成造成内容漂移。
 */
async function handleAddWord() {
  if (!preview.value) {
    return
  }

  saveLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await addWord(preview.value.word, preview.value.meanings)
    successMessage.value = response.message
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '保存失败，请稍后重试'
  } finally {
    saveLoading.value = false
  }
}
</script>

<style scoped>
.page {
  display: grid;
  gap: 18px;
}

.intro-card,
.input-card,
.action-card {
  padding: 24px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
}

.intro-card,
.action-card {
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

h2,
h3 {
  margin: 0;
  color: #0f172a;
}

.intro-text,
.action-card p {
  margin: 8px 0 0;
  color: #475569;
  line-height: 1.7;
}

.field-label {
  display: block;
  margin-bottom: 10px;
  font-weight: 700;
  color: #334155;
}

.input-row {
  display: flex;
  gap: 12px;
}

.word-input {
  flex: 1;
  height: 48px;
  padding: 0 14px;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  font-size: 16px;
}

.primary-btn {
  height: 48px;
  padding: 0 18px;
  border: none;
  border-radius: 14px;
  background: #1d4ed8;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:disabled {
  cursor: not-allowed;
  background: #93c5fd;
}

.error-text {
  margin: 12px 0 0;
  color: #dc2626;
}

.success-text {
  margin: 12px 0 0;
  color: #0f766e;
}

@media (max-width: 720px) {
  .intro-card,
  .action-card,
  .input-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
