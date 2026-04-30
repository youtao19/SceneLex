<template>
  <section class="meaning-panel">
    <!-- 头部 -->
    <header class="panel-header">
      <div class="word-info">
        <div class="word-title">
          <h2 class="display-word">{{ word }}</h2>
          <p v-if="phonetic" class="phonetic-text">{{ phonetic }}</p>
        </div>
        <button
          class="speak-button"
          type="button"
          aria-label="朗读单词"
          title="朗读单词"
          @click="handleSpeakWord"
        >
          🔊
        </button>
      </div>
      <div v-if="coreFeeling" class="core-feeling">
        <span>核心感觉</span>
        <p>{{ coreFeeling }}</p>
      </div>
    </header>

    <!-- 场景列表 -->
    <div class="meanings-list">
      <article
        v-for="(item, index) in meanings"
        :key="index"
        class="meaning-item"
      >
        <div class="meaning-header">
          <span class="pos-label">{{ item.partOfSpeech }}</span>
          <div>
            <h3 class="meaning-text">{{ item.meaning }}</h3>
          </div>
        </div>

        <!-- 场景例句与联想卡片结构 -->
        <div class="teaching-content">
          <div class="teaching-block example-block">
            <div class="block-icon">💬</div>
            <div class="block-body">
              <span class="block-title">场景短语</span>
              <ul class="example-list">
                <li v-for="example in displayExamples(item)" :key="example">
                  {{ example }}
                </li>
              </ul>
            </div>
          </div>
          
          <div v-if="memoryHint(item)" class="teaching-block tip-block">
            <div class="block-icon">💡</div>
            <div class="block-body">
              <span class="block-title">联想</span>
              <p class="block-text">{{ memoryHint(item) }}</p>
            </div>
          </div>
        </div>

        <p v-if="item.explanation" class="scene-explanation">
          <span>解释：</span>{{ item.explanation }}
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { speakEnglishText } from '../utils/speech'
import type { WordMeaningItem } from '../types/word'

const props = defineProps<{
  word: string
  phonetic?: string
  coreFeeling?: string
  meanings: WordMeaningItem[]
}>()

/**
 * 朗读只依赖当前词面，避免例句或释义混入时打断背词节奏。
 */
function handleSpeakWord() {
  speakEnglishText(props.word)
}

function displayExamples(item: WordMeaningItem) {
  if (item.examples?.length > 0) {
    return item.examples
  }

  return [item.example]
}

/**
 * 优先展示更短的联想词，避免场景标题和解释重复同一个画面。
 */
function memoryHint(item: WordMeaningItem) {
  return item.tip || item.sceneTitle
}
</script>

<style scoped>
.meaning-panel {
  padding: 12px 0;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: space-between;
  align-items: stretch;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.display-word {
  font-size: 36px;
  font-weight: 800;
  color: var(--sl-text-main);
  margin: 0;
  font-family: var(--sl-display-font);
  line-height: 1.1;
}

.word-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.word-title {
  min-width: 0;
}

.phonetic-text {
  margin: 5px 0 0;
  color: var(--sl-text-soft);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.speak-button {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--sl-glass-border);
  border-radius: 999px;
  background: var(--sl-glass-bg);
  color: var(--sl-text-main);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.speak-button:hover {
  border-color: var(--sl-peach-200);
  background: var(--sl-peach-50);
}

.core-feeling {
  padding: 12px 14px;
  border-left: 3px solid var(--sl-peach-500);
  border-radius: 10px;
  background: rgba(255, 90, 113, 0.06);
}

.core-feeling span {
  display: block;
  margin-bottom: 4px;
  color: var(--sl-peach-500);
  font-size: 11px;
  font-weight: 800;
}

.core-feeling p {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 15px;
  line-height: 1.45;
  font-weight: 700;
}

/* 列表容器 */
.meanings-list {
  display: flex;
  flex-direction: column;
  gap: 16px; /* 大幅缩减义项之间的间距 */
}

.meaning-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meaning-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pos-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--sl-peach-500);
  text-transform: uppercase;
  min-width: 18px;
}

.meaning-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--sl-text-main);
  margin: 0;
  line-height: 1.3;
}

.meaning-subtitle {
  margin: 3px 0 0;
  color: var(--sl-text-soft);
  font-size: 12px;
  line-height: 1.3;
}

/* 卡片样式 */
.teaching-content {
  margin-top: 4px;
  padding-left: 24px;
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

.teaching-block {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.example-block {
  background: rgba(128, 128, 128, 0.04);
  border-color: rgba(128, 128, 128, 0.08);
}

.tip-block {
  background: rgba(255, 90, 113, 0.05);
  border-color: rgba(255, 90, 113, 0.12);
}

.block-icon {
  font-size: 14px;
  margin-top: 1px;
  opacity: 0.9;
}

.block-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.block-title {
  font-size: 10px;
  font-weight: 800;
  color: var(--sl-text-mute);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tip-block .block-title {
  color: var(--sl-peach-500);
}

.block-text {
  font-size: 14px;
  line-height: 1.4;
  color: var(--sl-text-main);
  margin: 0;
}

.example-list {
  margin: 0;
  padding-left: 18px;
  color: var(--sl-text-main);
  font-size: 14px;
  line-height: 1.5;
}

.scene-explanation {
  margin: 0;
  padding-left: 24px;
  color: var(--sl-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.scene-explanation span {
  color: var(--sl-text-mute);
  font-weight: 800;
}

@media (min-width: 768px) {
  .teaching-content {
    grid-template-columns: 1fr 1fr; /* 在大屏幕上，例句和联想并排显示 */
    align-items: stretch;
  }
}
</style>
