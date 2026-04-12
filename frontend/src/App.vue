<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <h1 class="brand">SceneLex</h1>
        <p class="tagline">从查词变成真正的每日背词流程</p>
      </div>
      <nav class="nav">
        <RouterLink to="/" class="nav-link">添加单词</RouterLink>
        <RouterLink to="/review" class="nav-link">今日复习</RouterLink>
      </nav>
    </header>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 28%),
    linear-gradient(180deg, #eef4ff 0%, #f8fafc 55%, #ffffff 100%);
  padding: 32px 20px 48px;
  box-sizing: border-box;
}

.topbar {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
  padding-bottom: 20px;
}

.brand {
  margin: 0;
  font-size: 34px;
}

.tagline {
  margin: 8px 0 0;
  color: #475569;
}

.nav {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.nav-link {
  padding: 10px 16px;
  border-radius: 999px;
  color: #1e293b;
  text-decoration: none;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  font-weight: 600;
}

.nav-link.router-link-exact-active {
  background: #1d4ed8;
  color: #ffffff;
  border-color: #1d4ed8;
}

.main {
  max-width: 960px;
  margin: 0 auto;
}

@media (max-width: 720px) {
  .topbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
