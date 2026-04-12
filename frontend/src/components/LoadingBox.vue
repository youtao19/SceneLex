<template>
  <div class="loading-box">
    <span class="dot" />
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string;
  }>(),
  {
    message: '处理中...',
  },
);
</script>

<style scoped>
.loading-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border-radius: 14px;
  background: #ffffff;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #14b8a6;
  animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }

  50% {
    transform: scale(1.4);
    opacity: 1;
  }
}
</style>

