<template>
  <div class="landing-page" :class="{ 'is-scrolled': isScrolled }" @wheel="handleWheel">
    <div class="landing-bg"></div>
    
    <div class="top-bar">
      <div class="utility-row">
        <!-- Optional utility buttons -->
      </div>
    </div>

    <!-- Initial Landing State -->
    <main class="landing-content" :class="{ 'fade-out': isScrolled }">
      <div class="hero-brand">
        <div class="brand-icon">
          <span class="brand-fruit"></span>
          <span class="fruit-crease"></span>
          <span class="brand-leaf"></span>
        </div>
        <div class="brand-text">
          <span class="kicker">Peach Link</span>
          <h1 class="title">SceneLex</h1>
        </div>
      </div>
      
      <p class="subtitle">探索英语世界的无限可能</p>
    </main>

    <!-- Scroll Prompt -->
    <div class="scroll-prompt" :class="{ 'fade-out': isScrolled }" @click="scrollToLogin">
      <span class="arrow-down"></span>
      <span class="prompt-text">向下滚动以登录</span>
    </div>

    <!-- Login/Register Card -->
    <div class="auth-container" :class="{ 'slide-in': isScrolled }">
      <article class="auth-card surface-card">
        <div class="auth-header">
          <div class="brand-icon small">
            <span class="brand-fruit"></span>
            <span class="fruit-crease"></span>
            <span class="brand-leaf"></span>
          </div>
          <h2 class="auth-title">{{ isRegistering ? '创建账户' : '登录账户' }}</h2>
          <p class="auth-subtitle">{{ isRegistering ? '助力冲浪，探索英语世界的无限可能' : '请输入您的凭据继续' }}</p>
        </div>

        <form class="auth-form" @submit.prevent="handleSubmit">
          <div class="form-group">
            <label>邮箱 <span class="required">*</span></label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
              <input
                v-model.trim="email"
                type="email"
                placeholder="请输入邮箱地址"
                required
              />
            </div>
          </div>

          <div class="form-group">
            <label>密码 <span class="required">*</span></label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                required
              />
              <button type="button" class="action-icon" @click="showPassword = !showPassword">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <template v-if="isRegistering">
            <div class="form-group">
              <label>确认密码 <span class="required">*</span></label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  v-model="confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  placeholder="请再次输入新密码"
                  required
                />
                <button
                  type="button"
                  class="action-icon"
                  @click="showConfirmPassword = !showConfirmPassword"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>访问密钥 <span class="required">*</span></label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
                </span>
                <input
                  v-model.trim="inviteCode"
                  type="text"
                  placeholder="请输入管理员发放的访问密钥"
                  required
                />
              </div>
            </div>

            <div class="form-options">
              <label class="checkbox-label">
                <input v-model="acceptedTerms" type="checkbox" required />
                <span class="checkbox-custom"></span>
                <span>我已阅读并同意 <a href="#" class="link">服务条款</a> <span class="required">*</span></span>
              </label>
            </div>
          </template>

          <template v-else>
            <div class="form-options">
              <label class="checkbox-label">
                <input v-model="rememberMe" type="checkbox" />
                <span class="checkbox-custom"></span>
                <span>记住我</span>
              </label>
              <a href="#" class="link">忘记密码？</a>
            </div>
          </template>

          <p v-if="submitError" class="form-feedback is-error">{{ submitError }}</p>
          <p v-else-if="submitSuccess" class="form-feedback is-success">{{ submitSuccess }}</p>

          <button type="submit" class="peach-button submit-btn" :disabled="isSubmitting">
            {{ isSubmitting ? '提交中...' : isRegistering ? '创建账户' : '登录' }} <span>→</span>
          </button>

          <div class="auth-switch">
            <span class="divider-text">{{ isRegistering ? '已有账户？' : '还没有账户？' }}</span>
            <button type="button" class="peach-button-ghost switch-btn" @click="toggleMode">
              {{ isRegistering ? '登录' : '创建账户' }}
            </button>
          </div>
        </form>
      </article>
    </div>

    <!-- Bottom Left Icon -->
    <div class="bottom-left-icon">
      <div class="chat-bubble">
        <div class="chat-inner"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login, register } from '../services/auth.service'
import { useUserStore } from '../stores/user'

const router = useRouter()
const userStore = useUserStore()
const isScrolled = ref(false)
const isRegistering = ref(false)
const isSubmitting = ref(false)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const inviteCode = ref('')
const acceptedTerms = ref(false)
const rememberMe = ref(true)
const submitError = ref('')
const submitSuccess = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)

function handleWheel(e: WheelEvent) {
  if (e.deltaY > 0 && !isScrolled.value) {
    isScrolled.value = true
  } else if (e.deltaY < 0 && isScrolled.value) {
    // Optional: allow scrolling back up to the hero section
    // isScrolled.value = false 
  }
}

function scrollToLogin() {
  isScrolled.value = true
}

function resetFeedback() {
  submitError.value = ''
  submitSuccess.value = ''
}

function toggleMode() {
  isRegistering.value = !isRegistering.value
  password.value = ''
  confirmPassword.value = ''
  inviteCode.value = ''
  acceptedTerms.value = false
  resetFeedback()
}

/**
 * 注册和登录都落到同一个提交入口，这样按钮态、错误态和跳转逻辑不会分叉。
 */
async function handleSubmit() {
  resetFeedback()

  if (!email.value) {
    submitError.value = '请输入邮箱地址'
    return
  }

  if (password.value.length < 8) {
    submitError.value = '密码至少需要 8 位'
    return
  }

  if (isRegistering.value) {
    if (password.value !== confirmPassword.value) {
      submitError.value = '两次输入的密码不一致'
      return
    }

    if (!acceptedTerms.value) {
      submitError.value = '请先同意服务条款'
      return
    }

    if (!inviteCode.value) {
      submitError.value = '请输入访问密钥'
      return
    }
  }

  isSubmitting.value = true

  try {
    const response = isRegistering.value
      ? await register({
          email: email.value,
          password: password.value,
          inviteCode: inviteCode.value,
        })
      : await login({
          email: email.value,
          password: password.value,
        })

    userStore.setSession(response.data)
    submitSuccess.value = response.message
    await router.push('/dashboard')
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '提交失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.landing-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  background-color: var(--sl-bg);
  overflow: hidden;
}

.landing-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: 
    radial-gradient(circle at 15% 30%, rgba(255, 180, 190, 0.45) 0%, transparent 50%),
    radial-gradient(circle at 85% 60%, rgba(210, 180, 255, 0.4) 0%, transparent 55%),
    radial-gradient(circle at 30% 85%, rgba(180, 240, 230, 0.4) 0%, transparent 45%),
    radial-gradient(circle at 75% 20%, rgba(255, 220, 200, 0.3) 0%, transparent 40%);
  filter: blur(40px);
  animation: gradientShift 15s ease infinite alternate;
}

@keyframes gradientShift {
  0% { transform: scale(1) translate(0, 0); }
  50% { transform: scale(1.05) translate(2%, 2%); }
  100% { transform: scale(1) translate(-2%, -2%); }
}

/* 初始内容（未滚动时） */
.landing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.landing-content.fade-out {
  opacity: 0;
  transform: translateY(-100px);
  pointer-events: none;
}

/* 品牌 Logo 样式 */
.hero-brand {
  display: flex;
  align-items: center;
  gap: 20px;
}

.brand-icon {
  position: relative;
  width: 60px;
  height: 60px;
}

.brand-icon.small {
  width: 48px;
  height: 48px;
  margin: 0 auto;
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
  top: 14px;
  left: 28px;
  width: 3px;
  height: 24px;
  background: rgba(205, 102, 117, 0.3);
  border-radius: 999px;
}

.brand-icon.small .fruit-crease {
  top: 11px;
  left: 22px;
  width: 2px;
  height: 18px;
}

.brand-leaf {
  position: absolute;
  top: -4px;
  left: 20px;
  width: 22px;
  height: 14px;
  background: linear-gradient(135deg, #a6c8a8, #7fa181);
  border-radius: 999px 999px 0 999px;
  transform: rotate(-24deg);
}

.brand-icon.small .brand-leaf {
  top: -3px;
  left: 16px;
  width: 17px;
  height: 11px;
}

.brand-text {
  display: flex;
  align-items: center;
  gap: 12px;
}

.kicker {
  font-size: 32px;
  font-weight: 900;
  color: var(--sl-peach-500);
  margin: 0;
  line-height: 1;
  letter-spacing: -1px;
}

.title {
  font-size: 32px;
  font-weight: 800;
  color: #a48bb9;
  margin: 0;
  line-height: 1;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 18px;
  font-weight: 600;
  color: var(--sl-text-soft);
  margin-top: 12px;
  letter-spacing: 0.05em;
}

/* 向下滚动提示 */
.scroll-prompt {
  position: absolute;
  bottom: 80px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: fit-content;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--sl-text-mute);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}

.scroll-prompt:hover {
  color: var(--sl-peach-500);
}

.scroll-prompt.fade-out {
  opacity: 0;
  transform: translateY(40px);
  pointer-events: none;
}

.arrow-down {
  width: 16px;
  height: 16px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  animation: bounce 2s infinite;
}

.prompt-text {
  font-size: 14px;
  font-weight: 600;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% { transform: translateY(0) rotate(45deg); }
  40% { transform: translateY(-10px) rotate(45deg); }
  60% { transform: translateY(-5px) rotate(45deg); }
}

/* 登录/注册卡片容器 */
.auth-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, 50px); /* 初始偏下 */
  opacity: 0;
  pointer-events: none;
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
  max-width: 440px;
  padding: 20px;
}

.auth-container.slide-in {
  opacity: 1;
  transform: translate(-50%, -50%); /* 移动到正中 */
  pointer-events: auto;
}

.auth-card {
  padding: 40px;
  border-radius: var(--sl-radius-xl);
  background: var(--sl-glass-bg);
  box-shadow: var(--sl-shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.auth-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--sl-text-main);
  margin: 0;
}

.auth-subtitle {
  font-size: 14px;
  color: var(--sl-text-mute);
  margin: 0;
}

/* 表单样式 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 700;
  color: var(--sl-text-main);
}

.required {
  color: var(--sl-peach-500);
}

.optional {
  color: var(--sl-text-mute);
  font-weight: 400;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-text-mute);
}

.input-wrapper input {
  width: 100%;
  height: 48px;
  padding: 0 44px;
  border-radius: 12px;
  border: 1px solid var(--sl-glass-border);
  background: rgba(255, 255, 255, 0.4);
  color: var(--sl-text-main);
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.dark-theme .input-wrapper input {
  background: rgba(0, 0, 0, 0.2);
}

.input-wrapper input:focus {
  outline: none;
  border-color: var(--sl-peach-400);
  background: var(--sl-glass-bg);
  box-shadow: 0 0 0 3px var(--sl-peach-50);
}

.action-icon {
  position: absolute;
  right: 16px;
  background: none;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-text-mute);
  cursor: pointer;
  padding: 0;
  transition: color 0.2s ease;
}

.action-icon:hover {
  color: var(--sl-text-main);
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--sl-text-soft);
}

.checkbox-label input {
  display: none;
}

.checkbox-custom {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--sl-text-mute);
  display: inline-block;
  position: relative;
  transition: all 0.2s ease;
}

.checkbox-label input:checked + .checkbox-custom {
  background: var(--sl-peach-500);
  border-color: var(--sl-peach-500);
}

.checkbox-label input:checked + .checkbox-custom::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.link {
  color: var(--sl-peach-500);
  text-decoration: none;
  font-weight: 600;
}

.link:hover {
  text-decoration: underline;
}

.form-feedback {
  margin: -4px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}

.form-feedback.is-error {
  background: rgba(255, 90, 113, 0.12);
  color: #b4233c;
}

.form-feedback.is-success {
  background: rgba(43, 171, 117, 0.12);
  color: #16794c;
}

.submit-btn {
  margin-top: 8px;
  height: 52px;
  width: 100%;
  border-radius: 12px;
  font-size: 16px;
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.auth-switch {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.divider-text {
  font-size: 12px;
  color: var(--sl-text-mute);
  position: relative;
  width: 100%;
  text-align: center;
}

.divider-text::before,
.divider-text::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 35%;
  height: 1px;
  background: var(--sl-glass-border);
}

.divider-text::before { left: 0; }
.divider-text::after { right: 0; }

.switch-btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--sl-glass-border-strong);
}

/* 左下角悬浮按钮 */
.bottom-left-icon {
  position: absolute;
  bottom: 40px;
  left: 40px;
}

.chat-bubble {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #7ec4c5, #4ca0a5);
  border-radius: 50% 50% 50% 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 24px rgba(76, 160, 165, 0.3);
  cursor: pointer;
  transition: transform 0.3s ease;
}

.chat-bubble:hover {
  transform: translateY(-4px) scale(1.05);
}

.chat-inner {
  width: 24px;
  height: 16px;
  background: white;
  border-radius: 4px;
  position: relative;
}

.chat-inner::after {
  content: "";
  position: absolute;
  bottom: -4px;
  left: 4px;
  border-width: 4px 4px 0 0;
  border-style: solid;
  border-color: white transparent transparent transparent;
}
</style>
