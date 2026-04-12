<template>
  <label class="toggle">
    <input :checked="modelValue" type="checkbox" @change="handleChange" />
    <span>教学模式</span>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
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
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #334155;
}

input {
  width: 16px;
  height: 16px;
}
</style>
