<template>
  <div
    v-if="word"
    class="modal-backdrop"
    aria-modal="true"
    role="dialog"
    @click="$emit('close')"
  >
    <article class="word-detail-modal surface-card" @click.stop>
      <header class="modal-head">
        <div>
          <p class="card-label">WORD DETAIL</p>
          <h3>{{ word.word }}</h3>
        </div>
        <button class="modal-close" type="button" aria-label="关闭详情" @click="$emit('close')">
          ×
        </button>
      </header>

      <div class="modal-scroll">
        <WordMeaningsPanel
          :word="word.word"
          :phonetic="word.phonetic"
          :core-feeling="word.coreFeeling"
          :meanings="word.meanings"
        />
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import WordMeaningsPanel from './WordMeaningsPanel.vue'
import type { StoredWord } from '../types/word'

defineProps<{
  word: StoredWord | null
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  padding: 32px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 13, 19, 0.36);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.word-detail-modal {
  width: min(820px, 100%);
  max-height: min(760px, calc(100vh - 64px));
  border-radius: var(--sl-radius-xl);
  background: #ffffff;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(17, 24, 39, 0.08);
  overflow: hidden;
}

.word-detail-modal:hover {
  background: #ffffff;
  transform: none;
}

.modal-head {
  padding: 22px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.modal-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 28px;
  font-family: var(--sl-display-font);
}

.modal-close {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: var(--sl-text-soft);
  background: var(--sl-glass-bg);
  font-size: 24px;
  line-height: 1;
}

.modal-scroll {
  max-height: calc(100vh - 190px);
  padding: 8px 28px 28px;
  overflow-y: auto;
}
</style>
