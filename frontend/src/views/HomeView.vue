<template>
  <section class="page">
    <WordInput v-model="word" @submit="submitWord" />
    <div class="grid">
      <ExampleCard
        title="联想场景"
        content="在这里展示基于单词生成的画面化场景描述。"
      />
      <TipCard
        title="记忆提示"
        description="把单词放进一句可视化的短句里，记忆效率会更高。"
      />
    </div>
    <UploadImage @selected="handleImage" />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ExampleCard from '../components/ExampleCard.vue';
import TipCard from '../components/TipCard.vue';
import UploadImage from '../components/UploadImage.vue';
import WordInput from '../components/WordInput.vue';

const word = ref('');

const submitWord = () => {
  console.log('submit word:', word.value);
};

const handleImage = (file: File) => {
  console.log('selected image:', file.name);
};
</script>

<style scoped>
.page {
  display: grid;
  gap: 20px;
}

.grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
</style>

