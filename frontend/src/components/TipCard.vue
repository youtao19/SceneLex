<template>
  <aside class="tip-card">
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<style scoped>
.tip-card {
  padding: 16px 18px;
  border-radius: 14px;
  background: #ecfeff;
  border: 1px solid #a5f3fc;
}
</style>

