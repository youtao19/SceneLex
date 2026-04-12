<script setup lang="ts">
/**
 * 文件作用：
 * 项目首页，提供输入单词并展示生成结果的最小页面。
 */

import { ref } from 'vue'
import { generateWord } from './services/word.service'
import type { WordGenerateData } from './types/word'

/**
 * 用户输入的单词。
 */
const word = ref('')

/**
 * 接口返回结果。
 */
const result = ref<WordGenerateData | null>(null)

/**
 * 加载状态。
 * 用于按钮禁用、显示加载中。
 */
const loading = ref(false)

/**
 * 错误提示信息。
 */
const errorMessage = ref('')

/**
 * 点击生成按钮时触发。
 * 作用：
 * 1. 校验输入
 * 2. 调接口
 * 3. 展示结果
 */
async function handleGenerate() {
  /**
   * 前端基础校验：
   * 用户没输入内容时，直接提示，不发请求。
   */
  if (!word.value.trim()) {
    errorMessage.value = '请输入单词'
    result.value = null
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await generateWord(word.value.trim())
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
/* 页面整体布局 */
.page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 40px 20px;
  box-sizing: border-box;
}

/* 内容容器 */
.container {
  max-width: 760px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 16px;
  padding: 32px;
  box-sizing: border-box;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

/* 标题 */
.title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
}

/* 副标题 */
.subtitle {
  margin: 8px 0 24px;
  color: #666;
}

/* 输入区域 */
.input-box {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

/* 输入框 */
.word-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  font-size: 16px;
  outline: none;
}

/* 输入框聚焦 */
.word-input:focus {
  border-color: #3b82f6;
}

/* 按钮 */
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

/* 按钮禁用态 */
.generate-btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

/* 错误提示 */
.error-text {
  color: #dc2626;
  margin: 8px 0 0;
}

/* 结果卡片 */
.result-card {
  margin-top: 24px;
  padding: 24px;
  border-radius: 14px;
  background: #f8fafc;
}

/* 单词标题 */
.word-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
}

/* 分区 */
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