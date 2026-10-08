<template>
  <div class="proto-switcher" role="group" aria-label="原型方案切换">
    <button type="button" class="proto-nav" aria-label="上一个方案" @click="step(-1)">←</button>
    <span class="proto-label">
      <strong>{{ current }}</strong>
      <small>{{ currentName }}</small>
    </span>
    <button type="button" class="proto-nav" aria-label="下一个方案" @click="step(1)">→</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

export interface PrototypeVariant {
  key: string;
  name: string;
}

const props = defineProps<{
  variants: PrototypeVariant[];
  current: string;
}>();

const emit = defineEmits<{ change: [key: string] }>();

const currentName = computed(
  () => props.variants.find((item) => item.key === props.current)?.name ?? '',
);

function step(offset: number) {
  const index = props.variants.findIndex((item) => item.key === props.current);
  const next = (index + offset + props.variants.length) % props.variants.length;

  emit('change', props.variants[next].key);
}

/**
 * 输入框里按左右键是在移动光标，不能拿来切方案。
 */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

function onKeydown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) {
    return;
  }

  if (event.key === 'ArrowLeft') {
    step(-1);
  }

  if (event.key === 'ArrowRight') {
    step(1);
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
/* 刻意做得和页面本身不一样，避免被当成设计的一部分。 */
.proto-switcher {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  background: #16121c;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.proto-nav {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.proto-nav:hover {
  background: rgba(255, 255, 255, 0.24);
}

.proto-label {
  display: grid;
  gap: 1px;
  min-width: 190px;
  padding: 0 12px;
  text-align: center;
  color: #fff;
  line-height: 1.25;
}

.proto-label strong {
  font-size: 14px;
}

.proto-label small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
}
</style>
