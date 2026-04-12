<template>
  <article class="card">
    <h3>{{ title }}</h3>
    <p>{{ content }}</p>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  content: string;
}>();
</script>

<style scoped>
.card {
  padding: 20px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #dde7f0;
}
</style>

