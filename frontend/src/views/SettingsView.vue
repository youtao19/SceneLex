<template>
  <section class="page">
    <section class="surface-card intro-card">
      <div>
        <p class="section-kicker">Settings Deck</p>
        <h3>配置页先整理成三块，让后续功能有固定落点。</h3>
        <p>
          现在还没有完整设置项，但先把接口、模型与学习偏好拆开，后面加内容时不用再推翻整页结构。
        </p>
      </div>
      <span class="status-chip">Config Shell</span>
    </section>

    <section class="settings-grid">
      <article class="surface-card setting-card">
        <p class="card-label">API</p>
        <h4>接口地址与环境</h4>
        <p>后续可以放 API Base URL、鉴权方式和联通状态。</p>
      </article>

      <article class="surface-card setting-card">
        <p class="card-label">Model</p>
        <h4>模型策略与 Prompt</h4>
        <p>后续可以放 provider、temperature 和词义生成模板。</p>
      </article>

      <article class="surface-card setting-card">
        <p class="card-label">Habit</p>
        <h4>学习偏好与展示</h4>
        <p>后续可以放教学模式默认值、每日目标和复习提醒。</p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 20px;
}

.intro-card,
.setting-card {
  padding: 28px;
  border-radius: var(--sl-radius-xl);
}

.intro-card {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
}

.intro-card h3,
.setting-card h4 {
  margin: 0;
  color: var(--sl-ink-900);
  font-size: clamp(24px, 2.3vw, 34px);
  line-height: 1.16;
  font-family: var(--sl-display-font);
}

.intro-card p,
.setting-card p {
  margin: 12px 0 0;
  color: var(--sl-ink-700);
  line-height: 1.8;
}

.settings-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.setting-card {
  min-height: 220px;
}

.card-label {
  margin: 0;
  color: var(--sl-peach-600);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 700;
}

@media (max-width: 960px) {
  .intro-card,
  .settings-grid {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
