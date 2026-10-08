<template>
  <!--
    原型：模型端点配置 + 复习节奏。
    问题：「用户要自己填 URL + Key + 模型，还能配多个、能测试连接 —— 这个交互该怎么做？」
    三个结构不同的方案，用 ?variant=A|B|C 切换，底部浮动条或左右方向键切换。
    假数据、不连后端、不落库。验证完就删。
  -->
  <section class="proto-page">
    <aside class="proto-note">
      <p class="proto-note-title">原型 · 端点配置</p>
      <p>三个方案都实现了同一套能力，只是入口不同：</p>
      <ul>
        <li>预设（DeepSeek / Kimi / Ollama）+ 自定义</li>
        <li>一个用户可以配多个端点，其中一个为默认</li>
        <li>测试连接（原型里是假的，会故意让 Ollama 失败）</li>
        <li>视觉模型单独一个字段，留空就不做 OCR</li>
        <li>没有服务器兜底，所以「一个都没有」是要设计的空状态</li>
      </ul>
      <p>
        <strong>C 刻意从空列表开始</strong>，因为它的重点就是首次配置的流程；A 和 B 带两个已有端点。
      </p>
      <p class="proto-note-hint">按 ← → 或底部箭头切换方案。</p>
    </aside>

    <div class="proto-stage">
      <SettingsVariantA v-if="variant === 'A'" />
      <SettingsVariantB v-else-if="variant === 'B'" />
      <SettingsVariantC v-else :initial="[]" />
    </div>

    <PrototypeSwitcher :variants="VARIANTS" :current="variant" @change="setVariant" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PrototypeSwitcher, { type PrototypeVariant } from '../components/prototype/PrototypeSwitcher.vue';
import SettingsVariantA from '../components/prototype/SettingsVariantA.vue';
import SettingsVariantB from '../components/prototype/SettingsVariantB.vue';
import SettingsVariantC from '../components/prototype/SettingsVariantC.vue';

const VARIANTS: PrototypeVariant[] = [
  { key: 'A', name: '卡片列表 + 抽屉编辑' },
  { key: 'B', name: '表格 + 行内编辑' },
  { key: 'C', name: '向导式 · 一步一问' },
];

const route = useRoute();
const router = useRouter();

const variant = computed(() => {
  const raw = Array.isArray(route.query.variant) ? route.query.variant[0] : route.query.variant;
  const key = (raw ?? 'A').toUpperCase();

  return VARIANTS.some((item) => item.key === key) ? key : 'A';
});

/** 写回 URL，方便刷新和分享同一个方案。 */
function setVariant(key: string) {
  router.replace({ query: { ...route.query, variant: key } });
}
</script>

<style scoped>
.proto-page {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 32px;
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 28px 28px 90px;
}

.proto-note {
  align-self: start;
  position: sticky;
  top: 24px;
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 16px;
  background: rgba(22, 18, 28, 0.05);
  font-size: 13px;
  line-height: 1.7;
  color: #6f665d;
}

.proto-note p {
  margin: 0;
}

.proto-note-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #16121c;
}

.proto-note ul {
  margin: 0;
  padding-left: 18px;
}

.proto-note-hint {
  padding-top: 6px;
  border-top: 1px solid rgba(42, 36, 31, 0.1);
  color: #16121c;
}

.proto-stage {
  min-width: 0;
}

@media (max-width: 900px) {
  .proto-page {
    grid-template-columns: minmax(0, 1fr);
  }

  .proto-note {
    position: static;
  }
}
</style>
