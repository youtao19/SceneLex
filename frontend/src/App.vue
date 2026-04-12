<script setup lang="ts">
import { ref } from 'vue'
import { generateWord } from './services/word.service'
import type { WordGenerateData } from './types/word'

const word = ref('')
const result = ref<WordGenerateData | null>(null)
const loading = ref(false)
const errorMessage = ref('')

async function handleGenerate() {
  const inputWord = word.value.trim()

  if (!inputWord) {
    errorMessage.value = '请输入单词'
    result.value = null
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await generateWord(inputWord)
    result.value = response.data
  } catch (error) {
    console.error(error)
    errorMessage.value = '生成失败，请稍后重试'
    result.value = null
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="container">
      <h1 class="title">SceneLex</h1>
      <p class="subtitle">把单词变成画面来记</p>

      <div class="input-box">
        <input
          v-model="word"
          class="word-input"
          type="text"
          placeholder="请输入一个单词，比如 heave"
          @keyup.enter="handleGenerate"
        />
        <button class="generate-btn" :disabled="loading" @click="handleGenerate">
          {{ loading ? '生成中...' : '生成' }}
        </button>
      </div>

      <p v-if="errorMessage" class="error-text">
        {{ errorMessage }}
      </p>

      <div v-if="result" class="result-card">
        <h2 class="word-title">{{ result.word }}</h2>

        <div class="section">
          <h3>例句</h3>
          <ul>
            <li v-for="example in result.examples" :key="example">
              {{ example }}
            </li>
          </ul>
        </div>

        <div class="section">
          <h3>记忆提示</h3>
          <ul>
            <li v-for="tip in result.tips" :key="tip">
              {{ tip }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 40px 20px;
  box-sizing: border-box;
}

.container {
  max-width: 760px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 16px;
  padding: 32px;
  box-sizing: border-box;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
}

.subtitle {
  margin: 8px 0 24px;
  color: #666;
}

.input-box {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.word-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  font-size: 16px;
  outline: none;
}

.word-input:focus {
  border-color: #3b82f6;
}

.generate-btn {
  height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

.generate-btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.error-text {
  color: #dc2626;
  margin: 8px 0 0;
}

.result-card {
  margin-top: 24px;
  padding: 24px;
  border-radius: 14px;
  background: #f8fafc;
}

.word-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
}

.section {
  margin-bottom: 20px;
}

.section h3 {
  margin-bottom: 10px;
}

.section ul {
  margin: 0;
  padding-left: 20px;
}

.section li {
  margin-bottom: 8px;
  line-height: 1.6;
}
</style>
