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
            <button
              class="avatar-button soft-pill"
              type="button"
              aria-label="打开账号菜单"
              :aria-expanded="isProfileMenuOpen"
              aria-haspopup="menu"
              @click.stop="toggleProfileMenu"
              @keydown.esc="closeProfileMenu"
            >
              <UserAvatar :avatar-url="userStore.user?.avatarUrl" size="small" />
            </button>

            <div
              v-if="isProfileMenuOpen"
              class="profile-menu surface-card"
              role="menu"
              aria-label="账号菜单"
              @click.stop
              @keydown.esc="closeProfileMenu"
            >
              <div class="profile-summary">
                <UserAvatar :avatar-url="userStore.user?.avatarUrl" size="medium" />
                <div class="profile-copy">
                  <strong>{{ userStore.nickname }}</strong>
                  <p>{{ userStore.user?.email }}</p>
                  <span>{{ accessText }}</span>
                </div>
              </div>

              <div class="profile-menu-section">
                <RouterLink
                  to="/profile"
                  class="profile-menu-item"
                  role="menuitem"
                  @click="closeProfileMenu"
                >
                  <span class="menu-icon icon-profile" aria-hidden="true"></span>
                  <span>个人资料</span>
                </RouterLink>
                <RouterLink
                  to="/settings"
                  class="profile-menu-item"
                  role="menuitem"
                  @click="closeProfileMenu"
                >
                  <span class="menu-icon icon-settings" aria-hidden="true"></span>
                  <span>更多设置</span>
                </RouterLink>
                <RouterLink
                  to="/history"
                  class="profile-menu-item"
                  role="menuitem"
                  @click="closeProfileMenu"
                >
                  <span class="menu-icon icon-library" aria-hidden="true"></span>
                  <span>我的词库</span>
                </RouterLink>
              </div>

              <button
                class="profile-menu-item sign-out-item"
                type="button"
                role="menuitem"
                @click="handleLogout"
              >
                <span class="menu-icon icon-signout" aria-hidden="true"></span>
                <span>退出登录</span>
              </button>
            </div>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getMe, logout } from './services/auth.service'
import { useUserStore } from './stores/user'
import UserAvatar from './components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isDark = ref(false)
const isProfileMenuOpen = ref(false)
const brandTarget = computed(() => (userStore.isAuthenticated ? '/dashboard' : '/'))
const showNavigation = computed(
  () => userStore.isAuthenticated && route.name !== 'landing'
)
const accessText = computed(() => {
  const status = userStore.user?.accessStatus

  if (status === 'active') {
    return '账号可用'
  }

  if (status === 'suspended') {
    return '账号已暂停'
  }

  if (status === 'expired') {
    return '访问已过期'
  }

  return '账号信息'
})

const navigationItems = [
  { to: '/dashboard', label: '仪表盘', icon: 'dashboard' },
  { to: '/review', label: '复习舱', icon: 'review' },
  { to: '/history', label: '归档册', icon: 'history' },
  { to: '/settings', label: '更多', icon: 'more' },
]

/**
 * 菜单只作为账号入口，状态放在 App 顶层能避免跨路由后残留展开层。
 */
function toggleProfileMenu() {
  isProfileMenuOpen.value = !isProfileMenuOpen.value
}

/**
 * 路由跳转、退出和键盘关闭都走同一个收口，避免菜单遮住下一页。
 */
function closeProfileMenu() {
  isProfileMenuOpen.value = false
}

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
    closeProfileMenu()
    await logout()
  } catch (error) {
    console.warn('logout failed:', error)
  } finally {
    userStore.clearSession()
    await router.push('/')
  }
}

/**
 * 点击菜单外部时关闭，保持和常见账号菜单一致的操作预期。
 */
function handleDocumentClick() {
  closeProfileMenu()
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

  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
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
  position: relative;
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

.avatar-button {
  width: 48px;
  height: 48px;
  padding: 3px;
  border: 1px solid var(--sl-glass-border-strong);
  cursor: pointer;
}

.avatar-button:hover,
.avatar-button[aria-expanded="true"] {
  border-color: rgba(255, 90, 113, 0.42);
  box-shadow: 0 12px 28px rgba(255, 90, 113, 0.16);
  transform: translateY(-1px);
}

.avatar-button:focus-visible,
.profile-menu-item:focus-visible {
  outline: 3px solid rgba(255, 90, 113, 0.32);
  outline-offset: 3px;
}

.profile-menu {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 300;
  width: min(360px, calc(100vw - 24px));
  padding: 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 70px rgba(40, 22, 28, 0.16);
}

.dark-theme .profile-menu {
  background: rgba(30, 25, 38, 0.96);
}

.profile-summary {
  padding: 10px 8px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.profile-copy {
  min-width: 0;
}

.profile-copy strong {
  display: block;
  color: var(--sl-text-main);
  font-size: 20px;
  line-height: 1.2;
}

.profile-copy p {
  margin: 4px 0;
  overflow: hidden;
  color: var(--sl-text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-copy span {
  color: var(--sl-peach-500);
  font-size: 12px;
  font-weight: 800;
}

.profile-menu-section {
  padding: 10px 0;
  border-bottom: 1px solid var(--sl-glass-border);
}

.profile-menu-item {
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--sl-text-main);
  background: transparent;
  text-align: left;
  text-decoration: none;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.profile-menu-item:hover {
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
}

.menu-icon {
  width: 22px;
  height: 22px;
  position: relative;
  flex: 0 0 auto;
  color: var(--sl-text-soft);
}

.icon-settings::before {
  content: "";
  position: absolute;
  inset: 2px;
  border: 2px solid currentColor;
  border-radius: 50%;
}

.icon-settings::after {
  content: "";
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: currentColor;
}

.icon-profile::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 7px;
  width: 8px;
  height: 8px;
  border: 2px solid currentColor;
  border-radius: 50%;
}

.icon-profile::after {
  content: "";
  position: absolute;
  left: 4px;
  bottom: 2px;
  width: 14px;
  height: 9px;
  border: 2px solid currentColor;
  border-radius: 999px 999px 4px 4px;
}

.icon-library::before {
  content: "";
  position: absolute;
  inset: 3px 4px;
  border: 2px solid currentColor;
  border-radius: 3px;
}

.icon-library::after {
  content: "";
  position: absolute;
  left: 9px;
  bottom: 2px;
  width: 8px;
  height: 5px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}

.icon-signout::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 4px;
  width: 10px;
  height: 14px;
  border: 2px solid currentColor;
  border-right: none;
  border-radius: 3px 0 0 3px;
}

.icon-signout::after {
  content: "→";
  position: absolute;
  right: 0;
  top: -2px;
  color: currentColor;
  font-size: 21px;
  line-height: 22px;
}

.sign-out-item {
  margin-top: 10px;
  color: #b42318;
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

@media (max-width: 600px) {
  .shell-header {
    padding: 12px;
  }

  .header-content {
    grid-template-columns: auto 1fr auto;
    gap: 8px;
  }

  .nav-pill {
    gap: 2px;
    padding: 4px;
  }

  .nav-item {
    min-width: 34px;
    min-height: 34px;
    justify-content: center;
    padding: 6px 8px;
  }

  .utility-row {
    gap: 6px;
  }

  .utility-row [aria-label="Locale"] {
    display: none;
  }

  .avatar-button {
    width: 42px;
    height: 42px;
  }

  .profile-menu {
    position: fixed;
    top: 72px;
    right: 12px;
  }
}
</style>
