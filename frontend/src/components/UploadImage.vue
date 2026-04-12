<template>
  <section class="upload-box">
    <label for="image">上传图片识别单词</label>
    <input id="image" type="file" accept="image/*" @change="onChange" />
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  selected: [file: File];
}>();

const onChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    emit('selected', file);
  }
};
</script>

<style scoped>
.upload-box {
  padding: 20px;
  border: 1px dashed #94a3b8;
  border-radius: 16px;
  background: #f8fafc;
}
</style>

