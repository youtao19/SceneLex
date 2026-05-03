<template>
  <section class="settings-page">
    <header class="settings-hero surface-card">
      <div>
        <p class="card-label">MORE</p>
        <h2 class="section-title">更多</h2>
        <p class="hero-desc">
          把模型、学习习惯、账号数据和系统状态收在一个地方，后续新增设置项时不再打散到各个页面。
        </p>
      </div>

      <div class="hero-status" aria-label="设置概览">
        <span>本地模型</span>
        <span>学习节奏</span>
        <span>数据安全</span>
      </div>
    </header>

    <section class="settings-layout">
      <aside class="settings-nav surface-card" aria-label="设置分区">
        <a href="#model" class="nav-row">
          <span class="nav-mark">M</span>
          <span>模型生成</span>
        </a>
        <a href="#habit" class="nav-row">
          <span class="nav-mark">H</span>
          <span>学习偏好</span>
        </a>
        <a href="#account" class="nav-row">
          <span class="nav-mark">A</span>
          <span>账号数据</span>
        </a>
        <a href="#system" class="nav-row">
          <span class="nav-mark">S</span>
          <span>系统状态</span>
        </a>
      </aside>

      <div class="settings-stack">
        <article id="model" class="settings-panel surface-card">
          <div class="panel-head">
            <div>
              <p class="card-label">MODEL</p>
              <h3>模型生成</h3>
            </div>
            <span class="panel-chip">可接入切换</span>
          </div>

          <div class="setting-list">
            <div class="setting-row">
              <div>
                <h4>生成服务</h4>
                <p>预留 Ollama、oMLX 与 DeepSeek 的切换入口，保持和后端 `AI_PROVIDER` 一致。</p>
              </div>
              <div class="choice-group" aria-label="模型服务">
                <span class="choice-pill is-active">Ollama</span>
                <span class="choice-pill">oMLX</span>
                <span class="choice-pill">DeepSeek</span>
              </div>
            </div>

            <div class="setting-row">
              <div>
                <h4>Prompt 模板</h4>
                <p>以后放词义、例句和场景提示词的编辑入口。</p>
              </div>
              <span class="ghost-action">待接入</span>
            </div>
          </div>
        </article>

        <article id="habit" class="settings-panel surface-card">
          <div class="panel-head">
            <div>
              <p class="card-label">HABIT</p>
              <h3>学习偏好</h3>
            </div>
            <span class="panel-chip">默认值</span>
          </div>

          <div class="setting-list">
            <div class="setting-row">
              <div>
                <h4>教学模式</h4>
                <p>控制新词生成时偏解释、偏例句，还是偏场景记忆。</p>
              </div>
              <span class="value-text">场景优先</span>
            </div>

            <div class="setting-row">
              <div>
                <h4>每日目标</h4>
                <p>后续给仪表盘和复习舱提供统一的目标数字。</p>
              </div>
              <span class="value-text">20 词</span>
            </div>
          </div>
        </article>

        <article id="account" class="settings-panel surface-card">
          <div class="panel-head">
            <div>
              <p class="card-label">ACCOUNT</p>
              <h3>账号数据</h3>
            </div>
            <span class="panel-chip">需谨慎操作</span>
          </div>

          <div class="setting-list">
            <div class="setting-row">
              <div>
                <h4>词库导出</h4>
                <p>给以后备份、迁移和比赛演示准备一个明确入口。</p>
              </div>
              <span class="ghost-action">待接入</span>
            </div>

            <div class="setting-row">
              <div>
                <h4>本地缓存</h4>
                <p>后续显示登录态、主题和草稿等浏览器本地数据。</p>
              </div>
              <span class="value-text">浏览器保存</span>
            </div>
          </div>
        </article>

        <article id="system" class="settings-panel surface-card">
          <div class="panel-head">
            <div>
              <p class="card-label">SYSTEM</p>
              <h3>系统状态</h3>
            </div>
            <span class="panel-chip">诊断入口</span>
          </div>

          <div class="status-grid">
            <div class="status-card">
              <span class="status-dot is-ready"></span>
              <strong>前端</strong>
              <p>Vite 页面与主题已加载</p>
            </div>
            <div class="status-card">
              <span class="status-dot"></span>
              <strong>后端 API</strong>
              <p>后续展示 `/api` 连通状态</p>
            </div>
            <div class="status-card">
              <span class="status-dot"></span>
              <strong>模型服务</strong>
              <p>后续展示 provider 与响应耗时</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.settings-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-hero {
  padding: 28px 32px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.section-title {
  margin: 0;
}

.hero-desc {
  max-width: 620px;
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.hero-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.hero-status span,
.panel-chip,
.choice-pill,
.ghost-action,
.value-text {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: var(--sl-text-soft);
  background: var(--sl-glass-bg);
  border: 1px solid var(--sl-glass-border-strong);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.settings-nav {
  position: sticky;
  top: 96px;
  padding: 12px;
  border-radius: var(--sl-radius-lg);
  display: grid;
  gap: 8px;
}

.nav-row {
  min-height: 48px;
  padding: 8px 12px;
  border-radius: var(--sl-radius-md);
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--sl-text-soft);
  text-decoration: none;
  font-weight: 800;
}

.nav-row:hover,
.nav-row:focus-visible {
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
}

.nav-row:focus-visible {
  outline: 3px solid rgba(255, 90, 113, 0.3);
  outline-offset: 2px;
}

.nav-mark {
  width: 32px;
  height: 32px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
  font-size: 13px;
  font-weight: 900;
}

.settings-stack {
  display: grid;
  gap: 20px;
}

.settings-panel {
  padding: 26px;
  border-radius: var(--sl-radius-lg);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.panel-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 24px;
  font-family: var(--sl-display-font);
}

.setting-list {
  display: grid;
}

.setting-row {
  min-height: 96px;
  padding: 20px 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  border-bottom: 1px solid var(--sl-glass-border);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row h4 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 17px;
}

.setting-row p {
  max-width: 620px;
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.choice-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.choice-pill.is-active,
.value-text {
  color: var(--sl-peach-500);
  background: var(--sl-peach-50);
  border-color: var(--sl-peach-100);
}

.ghost-action {
  color: var(--sl-text-mute);
}

.status-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.status-card {
  min-height: 128px;
  padding: 18px;
  border-radius: var(--sl-radius-md);
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid var(--sl-glass-border);
}

.status-dot {
  width: 10px;
  height: 10px;
  margin-bottom: 16px;
  border-radius: 50%;
  display: block;
  background: var(--sl-text-mute);
}

.status-dot.is-ready {
  background: #047857;
}

.status-card strong {
  color: var(--sl-text-main);
}

.status-card p {
  margin: 8px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.6;
}

@media (max-width: 980px) {
  .settings-layout,
  .status-grid {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    position: static;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .nav-row {
    justify-content: center;
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 24px 12px 56px;
  }

  .settings-hero,
  .panel-head,
  .setting-row {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .settings-hero,
  .settings-panel {
    padding: 24px;
  }

  .hero-status,
  .choice-group {
    justify-content: flex-start;
  }

  .settings-nav {
    grid-template-columns: 1fr 1fr;
  }

  .nav-row {
    justify-content: flex-start;
  }
}
</style>
