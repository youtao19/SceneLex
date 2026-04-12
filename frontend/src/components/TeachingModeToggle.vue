<template>
  <label class="toggle-container soft-pill" :class="{ 'is-active': modelValue }">
    <input
      type="checkbox"
      :checked="modelValue"
      class="hidden-input"
      @change="handleChange"
    />
    <div class="toggle-switch">
      <div class="switch-thumb"></div>
    </div>
    <div class="toggle-info">
      <span class="info-title">教学模式</span>
      <span class="info-desc">{{ modelValue ? '内容全面展开' : '保持紧凑视图' }}</span>
    </div>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
}
</script>

<style scoped>
.toggle-container {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px; /* 稍微压缩一下，更适合导航栏 */
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
  background: var(--sl-peach-50);
}

.toggle-container:hover {
  background: var(--sl-peach-100);
}

.hidden-input {
  display: none;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--sl-text-mute);
  opacity: 0.3;
  border-radius: 999px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.is-active .toggle-switch {
  background: var(--sl-peach-500);
  opacity: 1;
}

.is-active .switch-thumb {
  transform: translateX(20px);
}

.toggle-info {
  display: flex;
  flex-direction: column;
}

.info-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--sl-text-main);
}

.info-desc {
  font-size: 11px;
  color: var(--sl-text-soft);
}
</style>
