<template>
  <section class="compact-meaning-panel">
    <!-- 头部：更小巧的布局 -->
    <header class="panel-header">
      <div class="word-info">
        <h2 class="display-word">{{ word }}</h2>
        <div class="summary-tags">
          <span v-for="item in meanings" :key="item.partOfSpeech" class="pos-tag">
            {{ item.partOfSpeech }}
          </span>
        </div>
      </div>
      <div class="mode-indicator">
        <span class="dot" :class="{ 'is-teaching': teachingMode }"></span>
        {{ teachingMode ? 'Teaching' : 'Standard' }}
      </div>
    </header>

    <!-- 列表：更紧凑的义项排版 -->
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

        <div class="example-area">
          <p class="example-text">“ {{ item.example }} ”</p>
          <p v-if="item.tip" class="tip-text">
            <strong>联想：</strong>{{ item.tip }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { WordMeaningItem } from '../types/word'

defineProps<{
  word: string
  meanings: WordMeaningItem[]
  teachingMode: boolean
}>()
</script>

<style scoped>
.compact-meaning-panel {
  padding: 12px 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.display-word {
  font-size: 32px; /* 从 48px 缩小 */
  font-weight: 800;
  color: var(--sl-text-main);
  margin: 0;
  font-family: var(--sl-display-font);
  line-height: 1;
}

.summary-tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.pos-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--sl-peach-400);
  text-transform: uppercase;
}

.mode-indicator {
  font-size: 12px;
  font-weight: 700;
  color: var(--sl-text-mute);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sl-text-mute);
  opacity: 0.5;
}

.dot.is-teaching {
  background: var(--sl-peach-500);
  opacity: 1;
  box-shadow: 0 0 8px var(--sl-peach-300);
}

/* 义项列表 */
.meanings-list {
  display: flex;
  flex-direction: column;
  gap: 20px; /* 间距从 32px 缩减 */
}

.meaning-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meaning-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.pos-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 28px;
  text-align: center;
}

.meaning-text {
  font-size: 17px; /* 从 20px 稍微缩小 */
  font-weight: 700;
  color: var(--sl-text-main);
  margin: 0;
}

.example-area {
  padding-left: 38px; /* 对齐到含义文字下方 */
}

.example-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--sl-text-soft);
  margin: 0;
  font-style: italic;
}

.tip-text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--sl-text-mute);
}

.tip-text strong {
  color: var(--sl-peach-400);
}
</style>
