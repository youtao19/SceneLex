<template>
  <section class="profile-page">
    <header class="profile-hero surface-card">
      <div class="hero-person">
        <label class="avatar-upload-wrapper" :class="{ 'is-clickable': !savingAvatar }" aria-label="修改头像">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden-input"
            :disabled="savingAvatar"
            @change="handleAvatarChange"
          />
          <UserAvatar :avatar-url="userStore.user?.avatarUrl" size="large" />
          <div v-if="savingAvatar" class="avatar-loading">
            <span class="loading-spinner"></span>
          </div>
        </label>
        <div>
          <p class="card-label">PROFILE</p>
          <h2 class="section-title">个人资料</h2>
          <p class="hero-desc">点击头像可更换图片。支持 JPG、PNG、WEBP，最大 2MB。</p>
        </div>
      </div>

      <div class="hero-chips" aria-label="账号状态">
        <span class="access-chip" :class="accessClass">{{ accessText }}</span>
        <span class="membership-chip" :class="membershipClass">{{ membershipText }}</span>
      </div>
    </header>

    <section class="profile-layout">
      <aside class="profile-summary surface-card" aria-label="账号概览">
        <div class="summary-head">
          <UserAvatar :avatar-url="userStore.user?.avatarUrl" size="medium" />
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
            <dt>会员状态</dt>
            <dd>{{ membershipText }}</dd>
          </div>
          <div>
            <dt>系统 API 权限</dt>
            <dd>{{ systemApiText }}</dd>
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
import { updateProfile, uploadAvatar } from '../services/auth.service'
import { useUserStore } from '../stores/user'
import UserAvatar from '../components/UserAvatar.vue'

const userStore = useUserStore()
const nickname = ref(userStore.nickname)
const nicknameError = ref('')
const saveMessage = ref('')
const saveError = ref('')
const saving = ref(false)
const savingAvatar = ref(false)

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
const membershipText = computed(() => {
  if (userStore.user?.role === 'admin') {
    return '管理员'
  }

  if (userStore.user?.isVip) {
    return 'VIP'
  }

  return '普通用户'
})
const membershipClass = computed(() => ({
  'is-admin': userStore.user?.role === 'admin',
  'is-vip': userStore.user?.isVip === true,
}))
const systemApiText = computed(() => {
  if (userStore.canUseSystemApi) {
    return '可使用系统 API'
  }

  return '仅使用个人 API'
})

watch(
  () => userStore.nickname,
  (value) => {
    nickname.value = value
  },
)

async function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  // 限制 2MB
  if (file.size > 2 * 1024 * 1024) {
    saveError.value = '图片超过 2MB 限制'
    return
  }

  try {
    savingAvatar.value = true
    saveError.value = ''
    const response = await uploadAvatar(file)
    userStore.setUser(response.data)
    saveMessage.value = '头像更新成功'
  } catch (err: any) {
    saveError.value = err.message || '头像上传失败'
  } finally {
    savingAvatar.value = false
    // 重置 input 以便同一个文件可以再次触发 change
    target.value = ''
  }
}

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

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.access-chip,
.membership-chip,
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

.membership-chip {
  color: #6b5c46;
  background: rgba(245, 238, 225, 0.82);
}

.membership-chip.is-vip,
.membership-chip.is-admin {
  color: #7c2d12;
  background: rgba(255, 237, 213, 0.9);
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

.avatar-upload-wrapper {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.avatar-upload-wrapper.is-clickable {
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.avatar-upload-wrapper.is-clickable:hover {
  transform: scale(1.05);
}

.hidden-input {
  display: none;
}

.avatar-loading {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  z-index: 10;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
