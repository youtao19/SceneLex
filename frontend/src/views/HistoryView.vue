<template>
  <div class="history-view">
    <!-- Hero Section -->
    <section class="hero-section surface-card">
      <div class="hero-content">
        <p class="card-label">归档记录</p>
        <h2 class="section-title">收纳每一次查询、保存与复习。</h2>
        <p class="hero-desc">追踪你的记忆轨迹，让知识的沉淀清晰可见。</p>
      </div>
      <div class="hero-status">
        <span class="status-chip">数据同步中</span>
      </div>
    </section>

    <!-- Summary Overview -->
    <section class="summary-grid">
      <div class="summary-card surface-card">
        <div class="summary-icon icon-primary">🔍</div>
        <div class="summary-info">
          <h4 class="summary-value">Lookup</h4>
          <p class="summary-label">近期查询轨迹</p>
        </div>
      </div>
      <div class="summary-card surface-card">
        <div class="summary-icon icon-secondary">💾</div>
        <div class="summary-info">
          <h4 class="summary-value">Saved</h4>
          <p class="summary-label">记忆库入库记录</p>
        </div>
      </div>
      <div class="summary-card surface-card">
        <div class="summary-icon icon-success">📈</div>
        <div class="summary-info">
          <h4 class="summary-value">Review</h4>
          <p class="summary-label">复习历史表现</p>
        </div>
      </div>
    </section>

    <!-- History Tables/Lists -->
    <section class="history-grid">
      <article class="history-panel surface-card">
        <div class="panel-header">
          <h3 class="panel-title">近期查询流</h3>
          <button class="ghost-btn">查看全部</button>
        </div>
        <div class="mock-list">
          <div v-for="i in 3" :key="i" class="mock-item">
            <div class="mock-item-main">
              <strong>ephemeral</strong>
              <span>2026/04/13 14:20</span>
            </div>
            <span class="badge-mini">已加入</span>
          </div>
        </div>
      </article>

      <article class="history-panel surface-card">
        <div class="panel-header">
          <h3 class="panel-title">入库动作日志</h3>
          <button class="ghost-btn">导出日志</button>
        </div>
        <div class="mock-list">
          <div v-for="i in 3" :key="i" class="mock-item">
            <div class="mock-item-main">
              <strong>记忆库更新</strong>
              <span>新增 1 个单词，包含 3 个义项</span>
            </div>
            <span class="badge-mini success">成功</span>
          </div>
        </div>
      </article>

      <article class="history-panel surface-card">
        <div class="panel-header">
          <h3 class="panel-title">复习时间线</h3>
          <button class="ghost-btn">分析</button>
        </div>
        <div class="timeline">
          <div v-for="i in 3" :key="i" class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <strong>Good 评分命中</strong>
              <p>巩固了 12 个单词，平均间隔提升至 8.4 天。</p>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 60px;
}

.hero-section {
  padding: 32px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.summary-card {
  padding: 24px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  align-items: center;
  gap: 20px;
}

.summary-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.icon-primary { background: #fee2e2; color: #ef4444; }
.icon-secondary { background: #fff7ed; color: #f97316; }
.icon-success { background: #ecfdf5; color: #10b981; }

.summary-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--sl-ink-900);
  margin: 0;
}

.summary-label {
  font-size: 13px;
  color: var(--sl-ink-500);
  margin: 2px 0 0;
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.history-panel {
  padding: 24px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sl-ink-900);
  margin: 0;
}

.ghost-btn {
  background: none;
  border: none;
  color: var(--sl-peach-500);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mock-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mock-item {
  padding: 16px;
  background: rgba(255, 90, 113, 0.03);
  border-radius: var(--sl-radius-md);
  border: 1px solid var(--sl-glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mock-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mock-item-main strong { font-size: 15px; color: var(--sl-ink-900); }
.mock-item-main span { font-size: 12px; color: var(--sl-ink-500); }

.badge-mini {
  font-size: 10px;
  padding: 4px 8px;
  background: var(--sl-peach-50);
  color: var(--sl-peach-600);
  border-radius: 999px;
  font-weight: 700;
}

.badge-mini.success {
  background: #ecfdf5;
  color: #10b981;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-item {
  display: flex;
  gap: 16px;
  position: relative;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sl-peach-500);
  margin-top: 6px;
  flex-shrink: 0;
}

.timeline-content strong { display: block; font-size: 14px; color: var(--sl-ink-900); margin-bottom: 4px; }
.timeline-content p { font-size: 12px; color: var(--sl-ink-500); margin: 0; line-height: 1.6; }

@media (max-width: 1200px) {
  .history-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .hero-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}
</style>
