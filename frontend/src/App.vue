<template>
  <div class="app-shell">
    <header class="shell-header">
      <div class="header-content">
        <!-- Logo Section -->
        <RouterLink :to="brandTarget" class="brand-link">
          <div class="brand-icon">
            <span class="brand-fruit"></span>
            <span class="fruit-crease"></span>
            <span class="brand-leaf"></span>
          </div>
          <div class="brand-copy">
            <p class="brand-kicker">Peach Link</p>
            <h1>SceneLex</h1>
          </div>
        </RouterLink>

        <!-- Navigation Pill -->
        <nav v-if="showNavigation" class="nav-pill soft-pill">
          <RouterLink
            v-for="item in navigationItems"
            :key="item.to"
            :to="item.to"
            class="nav-item"
          >
            <span class="nav-icon" :class="`icon-${item.icon}`"></span>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </RouterLink>
        </nav>

        <!-- Utility Row -->
        <div class="utility-row">
          <!-- Theme Toggle Button: 切换黑夜模式 -->
          <button 
            class="utility-circle soft-pill" 
            :aria-label="isDark ? 'Switch to Light' : 'Switch to Dark'"
            @click="toggleTheme"
          >
            {{ isDark ? '☼' : '☾' }}
          </button>
          
          <button class="utility-circle soft-pill" aria-label="Locale">CN</button>
          <template v-if="showNavigation">
            <span class="user-chip soft-pill">{{ userStore.nickname }}</span>
            <button
              class="utility-circle soft-pill profile-btn"
              aria-label="Logout"
              @click="handleLogout"
            >
              退出
            </button>
          </template>
          <RouterLink
            v-else
            to="/"
            class="utility-circle soft-pill auth-entry"
            aria-label="Login"
          >
            登录
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="shell-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getMe, logout } from './services/auth.service'
import { useUserStore } from './stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isDark = ref(false)
const brandTarget = computed(() => (userStore.isAuthenticated ? '/dashboard' : '/'))
const showNavigation = computed(
  () => userStore.isAuthenticated && route.name !== 'landing'
)

const navigationItems = [
  { to: '/dashboard', label: '仪表盘', icon: 'dashboard' },
  { to: '/review', label: '复习舱', icon: 'review' },
  { to: '/history', label: '归档册', icon: 'history' },
  { to: '/settings', label: '更多', icon: 'more' },
]

/**
 * 切换黑夜/白天模式
 */
function toggleTheme() {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark-theme')
    localStorage.setItem('sl-theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark-theme')
    localStorage.setItem('sl-theme', 'light')
  }
}

/**
 * 前端本地态一定要清掉，即使接口暂时不可达也不能让旧 token 继续污染请求。
 */
async function handleLogout() {
  try {
    await logout()
  } catch (error) {
    console.warn('logout failed:', error)
  } finally {
    userStore.clearSession()
    await router.push('/')
  }
}

onMounted(() => {
  // 初始化主题
  const savedTheme = localStorage.getItem('sl-theme')
  if (savedTheme === 'dark') {
    isDark.value = true
    document.documentElement.classList.add('dark-theme')
  }

  /**
   * 刷新后先校验一次本地 token，避免前端把过期登录态当成有效状态继续放行。
   */
  if (userStore.token) {
    void getMe()
      .then((response) => {
        userStore.setSession({
          token: userStore.token,
          user: response.data,
        })
      })
      .catch(async () => {
        userStore.clearSession()

        if (route.name !== 'landing') {
          await router.push('/')
        }
      })
  }
})
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.shell-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 16px 20px;
  background: var(--sl-glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--sl-glass-border);
  transition: all 0.4s ease;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 260px 1fr auto;
  align-items: center;
  gap: 24px;
}

/* Brand Section */
.brand-link {
  display: flex;
  align-items: center;
  gap: 16px;
  text-decoration: none;
}

.brand-icon {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}

.brand-fruit {
  position: absolute;
  inset: 2px;
  border-radius: 54% 46% 42% 58% / 55% 56% 44% 45%;
  background: linear-gradient(145deg, #f9c7c2 0%, #f09aa7 76%);
  box-shadow: inset -4px -4px 10px rgba(206, 116, 130, 0.2);
}

.fruit-crease {
  position: absolute;
  top: 11px;
  left: 20px;
  width: 2px;
  height: 18px;
  background: rgba(205, 102, 117, 0.3);
  border-radius: 999px;
}

.brand-leaf {
  position: absolute;
  top: -2px;
  left: 14px;
  width: 16px;
  height: 9px;
  background: linear-gradient(135deg, #a6c8a8, #7fa181);
  border-radius: 999px 999px 0 999px;
  transform: rotate(-24deg);
}

.brand-kicker {
  margin: 0;
  color: var(--sl-peach-500);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.brand-copy h1 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 22px;
  line-height: 1.1;
  font-family: var(--sl-display-font);
}

/* Nav Pill Section */
.nav-pill {
  justify-self: center;
  display: flex;
  padding: 6px;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  border-radius: 999px;
  color: var(--sl-text-soft);
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  transition: all 0.3s ease;
  position: relative;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--sl-peach-500);
}

.nav-item.router-link-exact-active {
  background: var(--sl-bg);
  color: var(--sl-peach-500);
  box-shadow: var(--sl-shadow);
}

.nav-badge {
  position: absolute;
  top: -4px;
  right: 6px;
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  font-weight: 800;
}

/* Utility Row */
.utility-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-chip {
  min-height: 40px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.header-toggle-wrap {
  transform: scale(0.8);
  transform-origin: right center;
  margin-right: 4px;
}

.utility-circle {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--sl-text-soft);
  cursor: pointer;
  transition: all 0.2s ease;
}

.utility-circle:hover {
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  transform: translateY(-1px);
}

.profile-btn {
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  width: auto;
  padding: 0 16px;
  border-radius: 999px;
}

.auth-entry {
  text-decoration: none;
  width: auto;
  padding: 0 16px;
  border-radius: 999px;
}

.shell-main {
  padding-top: 0;
}

/* Icons */
.nav-icon { font-size: 16px; }
.icon-dashboard::before { content: "⊞"; }
.icon-review::before { content: "↻"; }
.icon-history::before { content: "📋"; }
.icon-more::before { content: "⋯"; }

@media (max-width: 1300px) {
  .header-content { grid-template-columns: auto 1fr auto; }
  .brand-copy { display: none; }
}

@media (max-width: 1000px) {
  .header-toggle-wrap { display: none; }
}

@media (max-width: 800px) {
  .nav-label { display: none; }
  .utility-row { gap: 8px; }
}
</style>
