<template>
  <section class="profile-page">
    <header class="profile-hero surface-card">
      <div class="hero-person">
        <span class="profile-avatar avatar-large" aria-hidden="true">
          <span class="avatar-shadow"></span>
          <span class="avatar-highlight"></span>
        </span>
        <div>
          <p class="card-label">PROFILE</p>
          <h2 class="section-title">个人资料</h2>
          <p class="hero-desc">查看当前账号信息，并维护会显示在顶栏和学习记录里的昵称。</p>
        </div>
      </div>

      <span class="access-chip" :class="accessClass">{{ accessText }}</span>
    </header>

    <section class="profile-layout">
      <aside class="profile-summary surface-card" aria-label="账号概览">
        <div class="summary-head">
          <span class="profile-avatar avatar-medium" aria-hidden="true">
            <span class="avatar-shadow"></span>
            <span class="avatar-highlight"></span>
          </span>
          <div>
            <strong>{{ userStore.nickname }}</strong>
            <p>{{ userStore.user?.email }}</p>
          </div>
        </div>

        <dl class="meta-list">
          <div>
            <dt>账号状态</dt>
            <dd>{{ accessText }}</dd>
          </div>
          <div>
            <dt>访问有效期</dt>
            <dd>{{ formatDateTime(userStore.user?.accessExpiresAt) }}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{{ formatDateTime(userStore.user?.createdAt) }}</dd>
          </div>
          <div>
            <dt>最近更新</dt>
            <dd>{{ formatDateTime(userStore.user?.updatedAt) }}</dd>
          </div>
        </dl>
      </aside>

      <main class="profile-main">
        <form class="profile-form surface-card" @submit.prevent="handleSubmit">
          <div class="panel-head">
            <div>
              <p class="card-label">EDIT</p>
              <h3>基础资料</h3>
            </div>
            <span class="panel-chip">当前只开放昵称</span>
          </div>

          <div class="form-grid">
            <label class="field-block" for="profile-email">
              <span>邮箱</span>
              <input
                id="profile-email"
                :value="userStore.user?.email ?? ''"
                type="email"
                autocomplete="email"
                disabled
              />
              <small>邮箱用于登录，当前版本先不开放修改。</small>
            </label>

            <label class="field-block" for="profile-nickname">
              <span>昵称</span>
              <input
                id="profile-nickname"
                v-model="nickname"
                type="text"
                maxlength="24"
                autocomplete="nickname"
                aria-describedby="nickname-help nickname-error"
                :aria-invalid="Boolean(nicknameError)"
                @blur="validateNickname"
              />
              <small id="nickname-help">最多 24 个字符，会显示在右上角账号菜单。</small>
              <small v-if="nicknameError" id="nickname-error" class="field-error" role="alert">
                {{ nicknameError }}
              </small>
            </label>
          </div>

          <p v-if="saveMessage" class="save-message" role="status">{{ saveMessage }}</p>
          <p v-if="saveError" class="save-message is-error" role="alert">{{ saveError }}</p>

          <div class="form-actions">
            <button
              class="peach-button-ghost"
              type="button"
              :disabled="saving || !isDirty"
              @click="resetForm"
            >
              还原
            </button>
            <button
              class="peach-button"
              type="submit"
              :disabled="saving || !isDirty || Boolean(nicknameError)"
            >
              {{ saving ? '保存中...' : '保存资料' }}
            </button>
          </div>
        </form>

        <section class="profile-note surface-card" aria-label="资料说明">
          <p class="card-label">SECURITY</p>
          <h3>账号安全</h3>
          <p>
            密码、访问密钥和账号状态由后端统一管理。资料页只保存展示信息，避免误改登录凭据。
          </p>
        </section>
      </main>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { updateProfile } from '../services/auth.service'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const nickname = ref(userStore.nickname)
const nicknameError = ref('')
const saveMessage = ref('')
const saveError = ref('')
const saving = ref(false)

const isDirty = computed(() => nickname.value.trim() !== userStore.nickname)
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
const accessClass = computed(() => {
  const status = userStore.user?.accessStatus

  if (status === 'active') {
    return 'is-active'
  }

  if (status === 'suspended' || status === 'expired') {
    return 'is-blocked'
  }

  return ''
})

watch(
  () => userStore.nickname,
  (value) => {
    nickname.value = value
  },
)

// 日期在资料页只用于人工识别，不展示秒数能减少视觉噪音。
function formatDateTime(value?: string) {
  if (!value) {
    return '未记录'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * 前后端使用同一套昵称边界，前端先拦截能给用户更快反馈。
 */
function validateNickname() {
  const cleanName = nickname.value.trim().replace(/\s+/g, ' ')

  if (!cleanName) {
    nicknameError.value = '昵称不能为空。'
    return false
  }

  if (cleanName.length > 24) {
    nicknameError.value = '昵称最多 24 个字符。'
    return false
  }

  nickname.value = cleanName
  nicknameError.value = ''
  return true
}

function resetForm() {
  nickname.value = userStore.nickname
  nicknameError.value = ''
  saveError.value = ''
  saveMessage.value = ''
}

/**
 * 保存成功后同步 Pinia 和 localStorage，刷新页面时才能继续显示新昵称。
 */
async function handleSubmit() {
  saveMessage.value = ''
  saveError.value = ''

  if (!validateNickname()) {
    return
  }

  if (!isDirty.value) {
    return
  }

  saving.value = true

  try {
    const response = await updateProfile({ nickname: nickname.value })
    userStore.setUser(response.data)
    saveMessage.value = '个人资料已保存。'
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.profile-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-hero {
  padding: 28px 32px;
  border-radius: var(--sl-radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.hero-person {
  display: flex;
  align-items: center;
  gap: 18px;
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

.access-chip,
.panel-chip {
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

.access-chip.is-active {
  color: #047857;
  background: rgba(4, 120, 87, 0.1);
}

.access-chip.is-blocked {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}

.profile-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.profile-summary,
.profile-form,
.profile-note {
  border-radius: var(--sl-radius-lg);
}

.profile-summary {
  padding: 24px;
  position: sticky;
  top: 96px;
}

.summary-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.summary-head strong {
  display: block;
  color: var(--sl-text-main);
  font-size: 20px;
}

.summary-head p {
  max-width: 190px;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--sl-text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-list {
  margin: 0;
  display: grid;
}

.meta-list div {
  padding: 18px 0;
  border-bottom: 1px solid var(--sl-glass-border);
}

.meta-list div:last-child {
  border-bottom: none;
}

.meta-list dt {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 800;
}

.meta-list dd {
  margin: 6px 0 0;
  color: var(--sl-text-main);
  font-weight: 800;
}

.profile-main {
  display: grid;
  gap: 20px;
}

.profile-form,
.profile-note {
  padding: 26px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.panel-head h3,
.profile-note h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 24px;
  font-family: var(--sl-display-font);
}

.form-grid {
  padding-top: 22px;
  display: grid;
  gap: 18px;
}

.field-block {
  display: grid;
  gap: 8px;
}

.field-block span {
  color: var(--sl-text-main);
  font-weight: 900;
}

.field-block input {
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-radius: var(--sl-radius-md);
  border: 1px solid var(--sl-glass-border-strong);
  background: var(--sl-glass-bg);
  color: var(--sl-text-main);
  font-size: 16px;
}

.field-block input:focus {
  outline: 3px solid rgba(255, 90, 113, 0.28);
  border-color: var(--sl-peach-400);
}

.field-block input:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.field-block small {
  color: var(--sl-text-mute);
  line-height: 1.6;
}

.field-error,
.save-message.is-error {
  color: #b42318;
}

.save-message {
  margin: 18px 0 0;
  color: #047857;
  font-weight: 800;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.profile-note p:last-child {
  margin: 10px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.7;
}

.profile-avatar {
  position: relative;
  overflow: hidden;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 46% 38%, #f3d6ce 0 21%, transparent 22%),
    linear-gradient(135deg, #f8f7f5 0%, #ffffff 56%, #101014 57% 100%);
  border: 1px solid var(--sl-glass-border-strong);
  flex: 0 0 auto;
}

.avatar-large {
  width: 76px;
  height: 76px;
}

.avatar-medium {
  width: 58px;
  height: 58px;
}

.avatar-shadow {
  position: absolute;
  top: 18%;
  left: 26%;
  width: 55%;
  height: 36%;
  border-radius: 58% 46% 50% 42%;
  background: #1d1d22;
  transform: rotate(-20deg);
}

.avatar-highlight {
  position: absolute;
  right: 18%;
  bottom: 9%;
  width: 34%;
  height: 58%;
  border-radius: 999px 999px 0 0;
  background: #101014;
  transform: rotate(28deg);
}

@media (max-width: 980px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }

  .profile-summary {
    position: static;
  }
}

@media (max-width: 720px) {
  .profile-page {
    padding: 24px 12px 56px;
  }

  .profile-hero,
  .panel-head,
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .profile-hero,
  .profile-form,
  .profile-note {
    padding: 24px;
  }

  .hero-person {
    align-items: flex-start;
  }

  .form-actions button {
    width: 100%;
  }
}
</style>
