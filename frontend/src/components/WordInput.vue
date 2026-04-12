<template>
  <section class="card">
    <label for="word">输入单词或短语</label>
    <div class="row">
      <input
        id="word"
        :value="modelValue"
        placeholder="例如: vivid"
        @input="onInput"
      />
      <button type="button" @click="$emit('submit')">开始生成</button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
}>();

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};
</script>

<style scoped>
.card {
  padding: 20px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
}

.row {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

input {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
}

button {
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: #0f766e;
  color: #ffffff;
  cursor: pointer;
}
</style>

