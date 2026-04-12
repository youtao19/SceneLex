<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">{{ teachingMode ? '教学模式' : '标准模式' }}</p>
        <h2 class="word">{{ word }}</h2>
      </div>
      <div v-if="teachingMode" class="summary">
        <span
          v-for="item in meanings"
          :key="`${item.partOfSpeech}-${item.meaning}`"
          class="summary-chip"
        >
          {{ item.partOfSpeech }} {{ item.meaning }}
        </span>
      </div>
    </div>

    <div class="meaning-list">
      <article
        v-for="item in meanings"
        :key="`${item.partOfSpeech}-${item.meaning}-${item.example}`"
        class="meaning-card"
        :class="{ teaching: teachingMode }"
      >
        <div class="meaning-row">
          <span class="part-of-speech">{{ item.partOfSpeech }}</span>
          <span class="meaning">{{ item.meaning }}</span>
        </div>

        <template v-if="teachingMode">
          <div class="teaching-grid">
            <div>
              <p class="block-label">例子</p>
              <p class="body-text">{{ item.example }}</p>
            </div>
            <div>
              <p class="block-label">联想</p>
              <p class="body-text">{{ item.tip }}</p>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="body-text">{{ item.example }}</p>
          <p class="hint-text">
            <span class="hint-prefix">联想：</span>{{ item.tip }}
          </p>
        </template>
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
.panel {
  padding: 24px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid #d9e3f1;
  box-shadow: 0 18px 45px rgba(37, 99, 235, 0.08);
}

.panel-head {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.word {
  margin: 0;
  font-size: 30px;
  color: #0f172a;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}

.meaning-list {
  display: grid;
  gap: 14px;
}

.meaning-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid #dbe4f0;
  background: #f8fbff;
}

.meaning-card.teaching {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.meaning-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.part-of-speech {
  min-width: 2.4em;
  font-weight: 700;
  color: #2563eb;
}

.meaning {
  font-weight: 700;
  color: #0f172a;
}

.teaching-grid {
  margin-top: 14px;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.block-label {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
}

.body-text {
  margin: 12px 0 0;
  line-height: 1.7;
  color: #0f172a;
}

.hint-text {
  margin: 10px 0 0;
  line-height: 1.7;
  color: #475569;
}

.hint-prefix {
  font-weight: 700;
}
</style>
