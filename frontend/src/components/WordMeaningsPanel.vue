<template>
  <section class="meaning-panel">
    <!-- 头部 -->
    <header class="panel-header">
      <div class="word-info">
        <h2 class="display-word">{{ word }}</h2>
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
    </header>

    <!-- 义项列表 -->
    <div class="meanings-list">
      <article
        v-for="(item, index) in meanings"
        :key="index"
        class="meaning-item"
      >
        <div class="meaning-header">
          <span class="pos-label">{{ item.partOfSpeech }}</span>
          <h3 class="meaning-text">{{ item.meaning }}</h3>
        </div>

        <!-- 场景例句与联想卡片结构 -->
        <div class="teaching-content">
          <div class="teaching-block example-block">
            <div class="block-icon">💬</div>
            <div class="block-body">
              <span class="block-title">场景例句</span>
              <p class="block-text">“{{ item.example }}”</p>
            </div>
          </div>
          
          <div v-if="item.tip" class="teaching-block tip-block">
            <div class="block-icon">💡</div>
            <div class="block-body">
              <span class="block-title">联想记忆</span>
              <p class="block-text">{{ item.tip }}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { speakEnglishText } from '../utils/speech'
import type { WordMeaningItem } from '../types/word'

const props = defineProps<{
  word: string
  meanings: WordMeaningItem[]
}>()

/**
 * 朗读只依赖当前词面，避免例句或释义混入时打断背词节奏。
 */
function handleSpeakWord() {
  speakEnglishText(props.word)
}
</script>

<style scoped>
.meaning-panel {
  padding: 12px 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
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
  align-items: center;
  gap: 10px;
  min-width: 0;
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

/* 列表容器 */
.meanings-list {
  display: flex;
  flex-direction: column;
  gap: 16px; /* 大幅缩减义项之间的间距 */
}

.meaning-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meaning-header {
  display: flex;
  align-items: baseline;
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
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid transparent;
}

.example-block {
  background: rgba(128, 128, 128, 0.04);
  border-color: rgba(128, 128, 128, 0.08);
}

.tip-block {
  background: var(--sl-peach-50);
  border-color: var(--sl-peach-100);
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

@media (min-width: 768px) {
  .teaching-content {
    grid-template-columns: 1fr 1fr; /* 在大屏幕上，例句和联想并排显示 */
    align-items: stretch;
  }
}
</style>
