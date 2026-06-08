<template>
  <section class="admin-page">
    <header class="admin-topbar">
      <div class="title-block">
        <p class="eyebrow">ADMIN LEDGER</p>
        <h2 class="section-title">账号与授权</h2>
        <p>集中处理账号状态、使用时长、管理员角色、VIP 权限和访问密钥。</p>
      </div>
      <div class="topbar-actions">
        <span v-if="userStore.user" class="admin-account-chip">
          <span>{{ userStore.user.nickname }}</span>
          <strong>管理员</strong>
        </span>
        <button class="control-button" type="button" :disabled="isLoading" @click="loadAdminData">
          刷新
        </button>
      </div>
    </header>

    <section class="metric-strip" aria-label="账号授权概览">
      <article class="metric-card">
        <span>全部账号</span>
        <strong>{{ users.length }}</strong>
      </article>
      <article class="metric-card is-positive">
        <span>可用账号</span>
        <strong>{{ activeUserCount }}</strong>
      </article>
      <article class="metric-card is-warning">
        <span>即将到期</span>
        <strong>{{ expiringSoonCount }}</strong>
      </article>
      <article class="metric-card">
        <span>访问密钥</span>
        <strong>{{ accessKeys.length }}</strong>
      </article>
      <article class="metric-card is-cool">
        <span>平均剩余</span>
        <strong>{{ averageRemainingDays }} 天</strong>
      </article>
    </section>

    <p v-if="errorMessage" class="notice-box is-error" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="notice-box" role="status">{{ successMessage }}</p>

    <section class="admin-workbench" aria-labelledby="key-create-title">
      <div class="workbench-copy">
        <p class="eyebrow">ACCESS KEY</p>
        <h3 id="key-create-title">创建访问密钥</h3>
        <p>密钥明文只在创建后出现一次。有效天数会在新用户注册时写入账号到期时间。</p>
      </div>

      <div class="key-form">
        <label class="field-block">
          <span>有效天数</span>
          <span class="input-with-unit">
            <input v-model.number="keyDays" type="number" min="1" max="3650" step="1" />
            <em>天</em>
          </span>
        </label>
        <label class="field-block note-field">
          <span>备注（选填）</span>
          <input v-model.trim="keyNote" type="text" maxlength="120" placeholder="例如：给 yadi，30 天" />
        </label>
        <button class="primary-button" type="button" :disabled="isBusy" @click="createKey">
          创建访问密钥
        </button>
      </div>

      <div v-if="createdAccessKey" class="created-key" aria-label="新访问密钥">
        <span>新密钥</span>
        <strong>{{ createdAccessKey }}</strong>
        <button class="control-button is-compact" type="button" @click="copyCreatedKey">
          复制
        </button>
      </div>
    </section>

    <section class="ledger-panel" aria-labelledby="users-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">USERS</p>
          <h3 id="users-title">用户授权台账</h3>
        </div>
        <span class="state-pill">{{ users.length }} 个账号</span>
      </div>

      <div v-if="users.length === 0 && !isLoading" class="empty-box">暂无用户</div>
      <div v-else class="user-ledger" role="table" aria-label="用户授权台账">
        <div class="ledger-row ledger-header" role="row">
          <span role="columnheader">账号</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">权限</span>
          <span role="columnheader">到期</span>
          <span role="columnheader">续期与操作</span>
        </div>

        <div v-for="user in users" :key="user.id" class="ledger-row" role="row">
          <span class="identity-cell" role="cell">
            <span class="avatar-token" :class="avatarClass(user)">{{ avatarText(user) }}</span>
            <span>
              <strong>{{ user.nickname }}</strong>
              <small>{{ user.email }}</small>
            </span>
          </span>

          <span role="cell">
            <span class="status-chip" :class="`is-${user.accessStatus}`">
              {{ accessStatusText(user.accessStatus) }}
            </span>
          </span>

          <span class="permission-cell" role="cell">
            <span class="role-label">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span>
            <span class="vip-chip" :class="{ 'is-vip': user.isVip || user.role === 'admin' }">
              {{ vipStatusText(user) }}
            </span>
            <button
              v-if="user.id !== userStore.user?.id"
              class="text-action"
              type="button"
              :disabled="isBusy"
              @click="openRoleDialog(user)"
            >
              修改角色
            </button>
            <button
              v-if="user.role !== 'admin'"
              class="text-action"
              type="button"
              :disabled="isBusy"
              @click="toggleVip(user)"
            >
              {{ user.isVip ? '取消 VIP' : '设为 VIP' }}
            </button>
            <span v-else class="muted-text">系统 API</span>
          </span>

          <span class="expiry-cell" role="cell">
            <strong>{{ formatDate(user.accessExpiresAt) }}</strong>
            <small :class="{ 'is-expired': readRemainingDays(user.accessExpiresAt) < 0 }">
              {{ remainingDaysText(user.accessExpiresAt) }}
            </small>
          </span>

          <span v-if="user.id === userStore.user?.id" class="self-cell" role="cell">
            当前账号不在这里续期
          </span>
          <span v-else class="action-cell" role="cell">
            <span class="renew-controls" aria-label="续期天数">
              <button
                v-for="days in quickRenewDays"
                :key="days"
                class="duration-chip"
                :class="{ 'is-selected': renewDaysForUser(user.id) === days }"
                type="button"
                :disabled="isBusy"
                @click="setRenewDays(user.id, days)"
              >
                {{ days }} 天
              </button>
              <label class="custom-days">
                <span>自定义</span>
                <input
                  :value="renewDaysForUser(user.id)"
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  @input="updateRenewDays(user.id, $event)"
                />
              </label>
              <button class="primary-button is-small" type="button" :disabled="isBusy" @click="renewUser(user.id)">
                续期
              </button>
            </span>
            <span class="secondary-actions">
              <button class="control-button is-compact" type="button" :disabled="isBusy" @click="resumeUser(user.id)">
                恢复
              </button>
              <button class="control-button is-compact is-danger" type="button" :disabled="isBusy" @click="suspendUser(user.id)">
                停用
              </button>
            </span>
          </span>
        </div>
      </div>
    </section>

    <section class="ledger-panel" aria-labelledby="keys-title">
      <div class="panel-head">
        <div>
          <p class="eyebrow">KEYS</p>
          <h3 id="keys-title">密钥台账</h3>
        </div>
        <span class="state-pill">{{ revokedKeyCount }} 个已撤销</span>
      </div>

      <div v-if="accessKeys.length === 0 && !isLoading" class="empty-box">暂无密钥</div>
      <div v-else class="key-ledger" role="table" aria-label="密钥台账">
        <div class="key-row key-header" role="row">
          <span role="columnheader">ID</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">天数</span>
          <span role="columnheader">使用</span>
          <span role="columnheader">绑定账号</span>
          <span role="columnheader">备注</span>
          <span role="columnheader">创建时间</span>
          <span role="columnheader">操作</span>
        </div>
        <div v-for="accessKey in accessKeys" :key="accessKey.id" class="key-row" role="row">
          <span role="cell">#{{ accessKey.id }}</span>
          <span role="cell">
            <span class="status-chip" :class="`is-${accessKey.status}`">
              {{ keyStatusText(accessKey.status) }}
            </span>
          </span>
          <span role="cell">{{ accessKey.grantedDays }} 天</span>
          <span role="cell">{{ accessKey.usedCount }}/{{ accessKey.maxUses }}</span>
          <span role="cell">{{ accessKey.boundUserEmail || '未绑定' }}</span>
          <span role="cell">{{ accessKey.note || '无备注' }}</span>
          <span role="cell">{{ formatDate(accessKey.createdAt) }}</span>
          <span class="key-action-cell" role="cell">
            <button
              v-if="accessKey.status === 'active'"
              class="control-button is-compact is-danger"
              type="button"
              :disabled="isBusy || accessKey.usedCount > 0"
              @click="setKeyStatus(accessKey.id, 'revoked')"
            >
              撤销
            </button>
            <button
              v-else-if="accessKey.status === 'revoked'"
              class="control-button is-compact"
              type="button"
              :disabled="isBusy"
              @click="setKeyStatus(accessKey.id, 'active')"
            >
              恢复
            </button>
            <span v-else class="muted-text">已使用</span>
          </span>
        </div>
      </div>
    </section>

    <div
      v-if="roleChangeTarget"
      class="confirm-overlay"
      role="presentation"
      @click.self="closeRoleDialog"
    >
      <article class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
        <p class="eyebrow">CONFIRM</p>
        <h3 id="role-dialog-title">确认修改角色</h3>
        <p>
          将
          <strong>{{ roleChangeTarget.user.email }}</strong>
          设置为
          <strong>{{ roleChangeTarget.nextRole === 'admin' ? '管理员' : '普通用户' }}</strong>
          。
        </p>
        <div class="confirm-actions">
          <button class="control-button" type="button" :disabled="isBusy" @click="closeRoleDialog">
            取消
          </button>
          <button class="control-button is-danger" type="button" :disabled="isBusy" @click="confirmRoleChange">
            确认修改
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createAdminAccessKey,
  fetchAdminAccessKeys,
  fetchAdminUsers,
  updateAdminAccessKey,
  updateAdminUserAccess,
  updateAdminUserRole,
  updateAdminUserVip,
} from '../services/admin.service'
import { useUserStore } from '../stores/user'
import type { AdminAccessKey, AdminUser } from '../types/admin'

const userStore = useUserStore()
const users = ref<AdminUser[]>([])
const accessKeys = ref<AdminAccessKey[]>([])
const isLoading = ref(false)
const isBusy = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const keyDays = ref(30)
const keyNote = ref('')
const createdAccessKey = ref('')
const quickRenewDays = [7, 30, 90]
const renewDaysByUser = ref<Record<number, number>>({})
const roleChangeTarget = ref<{
  user: AdminUser
  nextRole: 'user' | 'admin'
} | null>(null)

const activeUserCount = computed(() => users.value.filter((user) => user.accessStatus === 'active').length)

const expiringSoonCount = computed(() => (
  users.value.filter((user) => {
    const days = readRemainingDays(user.accessExpiresAt)
    return user.accessStatus === 'active' && days >= 0 && days <= 7
  }).length
))

const revokedKeyCount = computed(() => accessKeys.value.filter((accessKey) => accessKey.status === 'revoked').length)

const averageRemainingDays = computed(() => {
  const activeUsers = users.value.filter((user) => user.accessStatus === 'active')

  if (activeUsers.length === 0) {
    return 0
  }

  const totalDays = activeUsers.reduce((total, user) => total + Math.max(readRemainingDays(user.accessExpiresAt), 0), 0)
  return Math.round(totalDays / activeUsers.length)
})

/**
 * 后端返回 ISO 时间，管理页只需要稳定展示日期和分钟。
 */
function formatDate(value: string | null) {
  if (!value) {
    return '-'
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
 * 授权剩余天数用于管理决策，向上取整能避免当天到期被显示成 0 天。
 */
function readRemainingDays(value: string | null) {
  if (!value) {
    return 0
  }

  const expiresAt = new Date(value).getTime()

  if (Number.isNaN(expiresAt)) {
    return 0
  }

  return Math.ceil((expiresAt - Date.now()) / 86_400_000)
}

/**
 * 状态文案集中处理，表格和后续筛选不会各写一套。
 */
function accessStatusText(status: AdminUser['accessStatus']) {
  if (status === 'active') {
    return '可用'
  }

  if (status === 'suspended') {
    return '停用'
  }

  return '过期'
}

/**
 * 剩余天数和过期状态放在到期时间下方，管理员不用心算日期差。
 */
function remainingDaysText(value: string | null) {
  const days = readRemainingDays(value)

  if (days > 0) {
    return `剩余 ${days} 天`
  }

  if (days === 0) {
    return '今天到期'
  }

  return `已过期 ${Math.abs(days)} 天`
}

/**
 * 管理员天然可用系统 API，VIP 文案单独说明能减少和角色混淆。
 */
function vipStatusText(user: AdminUser) {
  if (user.role === 'admin') {
    return '管理员'
  }

  return user.isVip ? 'VIP' : '非 VIP'
}

/**
 * 密钥状态和用户状态不是同一组枚举，单独映射能避免误用。
 */
function keyStatusText(status: AdminAccessKey['status']) {
  if (status === 'active') {
    return '可用'
  }

  if (status === 'used') {
    return '已使用'
  }

  return '已撤销'
}

/**
 * 头像只取账号文本的前两个字符，避免引入新的图片资产和加载失败状态。
 */
function avatarText(user: AdminUser) {
  const source = user.nickname || user.email
  return source.slice(0, 2).toUpperCase()
}

/**
 * 头像颜色固定按 id 分桶，刷新列表后不会跳色。
 */
function avatarClass(user: AdminUser) {
  return `is-tone-${user.id % 4}`
}

/**
 * 每个用户保留自己的续期输入，管理员批量处理时不容易串值。
 */
function renewDaysForUser(userId: number) {
  return renewDaysByUser.value[userId] ?? 30
}

function setRenewDays(userId: number, days: number) {
  renewDaysByUser.value = {
    ...renewDaysByUser.value,
    [userId]: days,
  }
}

function updateRenewDays(userId: number, event: Event) {
  const input = event.target as HTMLInputElement
  setRenewDays(userId, Number(input.value))
}

/**
 * 前端先做轻校验，后端仍是最终授权规则。
 */
function readRenewDays(userId: number) {
  const days = renewDaysForUser(userId)

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('续期天数必须是大于 0 的整数')
  }

  return days
}

/**
 * 每次管理操作后都刷新列表，避免页面保留过期授权状态。
 */
async function loadAdminData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [usersResponse, keysResponse] = await Promise.all([
      fetchAdminUsers(),
      fetchAdminAccessKeys(),
    ])
    users.value = usersResponse.data
    accessKeys.value = keysResponse.data
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取管理数据失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 包一层通用执行器，保证按钮忙碌态和错误提示不会散落在每个操作里。
 */
async function runAdminAction(action: () => Promise<void>) {
  isBusy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await action()
    await loadAdminData()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    isBusy.value = false
  }
}

/**
 * 停用用户。
 */
async function suspendUser(userId: number) {
  await runAdminAction(async () => {
    await updateAdminUserAccess(userId, 'suspend')
    successMessage.value = '用户已停用'
  })
}

/**
 * 恢复用户。
 */
async function resumeUser(userId: number) {
  await runAdminAction(async () => {
    await updateAdminUserAccess(userId, 'resume')
    successMessage.value = '用户已恢复'
  })
}

/**
 * 给用户续期指定天数，支持快捷天数和自定义天数。
 */
async function renewUser(userId: number) {
  const days = readRenewDays(userId)

  await runAdminAction(async () => {
    await updateAdminUserAccess(userId, 'renew', days)
    successMessage.value = `用户已续期 ${days} 天`
  })
}

/**
 * 打开角色修改确认层，高风险操作不能在表格里单击即生效。
 */
function openRoleDialog(user: AdminUser) {
  roleChangeTarget.value = {
    user,
    nextRole: user.role === 'admin' ? 'user' : 'admin',
  }
}

/**
 * 关闭角色修改确认层。
 */
function closeRoleDialog() {
  roleChangeTarget.value = null
}

/**
 * 确认后才真正切换管理员角色。
 */
async function confirmRoleChange() {
  const target = roleChangeTarget.value

  if (!target) {
    return
  }

  await runAdminAction(async () => {
    await updateAdminUserRole(target.user.id, target.nextRole)
    successMessage.value = '用户角色已更新'
  })
  closeRoleDialog()
}

/**
 * VIP 只控制系统 API 使用权，不影响登录有效期和管理员权限。
 */
async function toggleVip(user: AdminUser) {
  await runAdminAction(async () => {
    await updateAdminUserVip(user.id, !user.isVip)
    successMessage.value = user.isVip ? '已取消 VIP' : '已设为 VIP'
  })
}

/**
 * 创建访问密钥，明文只展示一次。
 */
async function createKey() {
  await runAdminAction(async () => {
    const response = await createAdminAccessKey({
      grantedDays: keyDays.value,
      note: keyNote.value,
    })
    createdAccessKey.value = response.data.accessKey
    successMessage.value = '访问密钥已创建'
  })
}

/**
 * 浏览器剪贴板失败时仍保留页面上的明文，管理员可以手动选中。
 */
async function copyCreatedKey() {
  if (!createdAccessKey.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(createdAccessKey.value)
    successMessage.value = '密钥已复制'
  } catch {
    errorMessage.value = '复制失败，请手动选中新密钥'
  }
}

/**
 * 修改未使用密钥状态。
 */
async function setKeyStatus(accessKeyId: number, status: 'active' | 'revoked') {
  await runAdminAction(async () => {
    await updateAdminAccessKey(accessKeyId, status)
    successMessage.value = status === 'active' ? '密钥已恢复' : '密钥已撤销'
  })
}

onMounted(loadAdminData)
</script>

<style scoped>
.admin-page {
  width: min(100%, 1540px);
  margin: 0 auto;
  padding: 28px 28px 72px;
  display: grid;
  gap: 18px;
  --admin-ink: #1d1a17;
  --admin-soft: #6f665d;
  --admin-line: rgba(42, 36, 31, 0.12);
  --admin-paper: rgba(255, 253, 250, 0.88);
  --admin-warm: #fff8f2;
  --admin-peach: #ff4f6d;
  --admin-green: #047857;
  --admin-amber: #b45309;
  --admin-blue: #2563eb;
}

.admin-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.title-block {
  display: grid;
  gap: 6px;
}

.title-block p {
  margin: 0;
  color: var(--admin-soft);
}

.section-title {
  margin: 0;
  color: var(--admin-ink);
  font-family: var(--sl-display-font);
  font-size: 34px;
  line-height: 1.05;
}

.eyebrow {
  margin: 0;
  color: #b95035;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-account-chip {
  min-height: 38px;
  padding: 0 8px 0 14px;
  border: 1px solid var(--admin-line);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--admin-ink);
  background: rgba(255, 255, 255, 0.72);
  font-weight: 900;
}

.admin-account-chip strong {
  padding: 5px 9px;
  border-radius: 999px;
  color: #be123c;
  background: #ffe4ea;
  font-size: 12px;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 16px 42px rgba(58, 42, 33, 0.07);
}

.metric-card {
  min-height: 86px;
  padding: 16px 18px;
  border-right: 1px solid var(--admin-line);
  display: grid;
  align-content: center;
  gap: 7px;
}

.metric-card:last-child {
  border-right: 0;
}

.metric-card span {
  color: var(--admin-soft);
  font-size: 12px;
  font-weight: 900;
}

.metric-card strong {
  color: var(--admin-ink);
  font-size: 28px;
  line-height: 1;
}

.metric-card.is-positive {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.72), rgba(255, 255, 255, 0.32));
}

.metric-card.is-warning {
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.8), rgba(255, 255, 255, 0.32));
}

.metric-card.is-cool {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.8), rgba(255, 255, 255, 0.32));
}

.notice-box,
.empty-box {
  padding: 14px 16px;
  border: 1px solid rgba(4, 120, 87, 0.16);
  border-radius: 8px;
  color: #30553a;
  background: rgba(236, 253, 245, 0.78);
}

.notice-box.is-error {
  color: #9f1239;
  background: rgba(255, 241, 242, 0.82);
  border-color: rgba(190, 18, 60, 0.18);
}

.admin-workbench,
.ledger-panel {
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  background: var(--admin-paper);
  box-shadow: 0 16px 42px rgba(58, 42, 33, 0.07);
}

.admin-workbench {
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(520px, 1.4fr);
  gap: 18px;
  align-items: end;
}

.workbench-copy {
  display: grid;
  gap: 6px;
}

.workbench-copy h3,
.panel-head h3,
.confirm-dialog h3 {
  margin: 0;
  color: var(--admin-ink);
  font-family: var(--sl-display-font);
  font-size: 22px;
}

.workbench-copy p:not(.eyebrow),
.panel-head p {
  margin: 0;
  color: var(--admin-soft);
}

.key-form {
  display: grid;
  grid-template-columns: 140px minmax(180px, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.field-block {
  display: grid;
  gap: 7px;
  color: var(--admin-soft);
  font-size: 13px;
  font-weight: 900;
}

.field-block input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  color: var(--admin-ink);
  background: #fff;
  font: inherit;
  font-weight: 800;
}

.input-with-unit {
  position: relative;
  display: block;
}

.input-with-unit input {
  padding-right: 40px;
}

.input-with-unit em {
  position: absolute;
  top: 50%;
  right: 12px;
  color: var(--admin-soft);
  font-style: normal;
  transform: translateY(-50%);
}

.created-key {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid rgba(4, 120, 87, 0.16);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #14532d;
  background: rgba(236, 253, 245, 0.8);
}

.created-key strong {
  overflow-wrap: anywhere;
}

.panel-head {
  min-height: 66px;
  padding: 18px;
  border-bottom: 1px solid var(--admin-line);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.state-pill {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(4, 120, 87, 0.18);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: var(--admin-green);
  background: rgba(220, 252, 231, 0.72);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.user-ledger,
.key-ledger {
  overflow-x: auto;
}

.ledger-row,
.key-row {
  min-width: 0;
  padding: 14px 18px;
  border-bottom: 1px solid var(--admin-line);
  display: grid;
  align-items: center;
  gap: 14px;
}

.ledger-row {
  grid-template-columns:
    minmax(180px, 1.15fr)
    70px
    minmax(160px, 1fr)
    170px
    minmax(390px, 1.55fr);
}

.key-row {
  grid-template-columns: 68px 98px 86px 80px minmax(160px, 1fr) minmax(150px, 1fr) 150px 86px;
}

.ledger-row:last-child,
.key-row:last-child {
  border-bottom: 0;
}

.ledger-header,
.key-header {
  min-height: 42px;
  padding-top: 11px;
  padding-bottom: 11px;
  color: #7b7066;
  background: rgba(250, 247, 243, 0.78);
  font-size: 12px;
  font-weight: 900;
}

.identity-cell {
  min-width: 0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.identity-cell strong,
.identity-cell small,
.expiry-cell strong,
.expiry-cell small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-cell small,
.muted-text,
.self-cell {
  color: var(--admin-soft);
}

.avatar-token {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #be123c;
  background: #ffe4ea;
  font-size: 12px;
  font-weight: 900;
}

.avatar-token.is-tone-1 { color: #047857; background: #d1fae5; }
.avatar-token.is-tone-2 { color: #2563eb; background: #dbeafe; }
.avatar-token.is-tone-3 { color: #c2410c; background: #ffedd5; }

.permission-cell,
.action-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.action-cell {
  justify-content: space-between;
}

.role-label {
  color: var(--admin-ink);
  font-weight: 900;
}

.vip-chip,
.status-chip {
  min-height: 27px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.vip-chip {
  color: #6b5c46;
  background: rgba(245, 238, 225, 0.88);
}

.vip-chip.is-vip {
  color: #c2410c;
  background: rgba(255, 237, 213, 0.92);
}

.status-chip.is-active {
  color: var(--admin-green);
  background: rgba(220, 252, 231, 0.78);
}

.status-chip.is-suspended,
.status-chip.is-revoked {
  color: #9f1239;
  background: rgba(255, 241, 242, 0.86);
}

.status-chip.is-expired,
.status-chip.is-used {
  color: var(--admin-amber);
  background: rgba(254, 243, 199, 0.82);
}

.expiry-cell {
  display: grid;
  gap: 3px;
}

.expiry-cell small {
  color: var(--admin-green);
  font-weight: 900;
}

.expiry-cell small.is-expired {
  color: var(--admin-amber);
}

.renew-controls,
.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.control-button,
.duration-chip,
.text-action,
.primary-button {
  min-height: 34px;
  border-radius: 8px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.control-button,
.duration-chip {
  padding: 0 11px;
  border: 1px solid var(--admin-line);
  color: var(--admin-ink);
  background: rgba(255, 255, 255, 0.86);
}

.control-button.is-compact {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.control-button.is-danger {
  color: #be123c;
  border-color: rgba(244, 63, 94, 0.26);
}

.duration-chip {
  min-height: 30px;
  padding: 0 9px;
  font-size: 12px;
}

.duration-chip.is-selected {
  color: #be123c;
  background: rgba(255, 228, 233, 0.86);
  border-color: rgba(244, 63, 94, 0.28);
}

.text-action {
  min-height: 27px;
  padding: 0;
  border: 0;
  color: #9f3b48;
  background: transparent;
  font-size: 12px;
}

.primary-button {
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid transparent;
  color: #fff;
  background: #f44760;
  box-shadow: 0 12px 26px rgba(244, 71, 96, 0.22);
}

.primary-button.is-small {
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.control-button:hover:not(:disabled),
.duration-chip:hover:not(:disabled),
.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(58, 42, 33, 0.1);
}

.custom-days {
  height: 30px;
  padding-left: 9px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  background: #fff;
}

.custom-days span {
  color: var(--admin-soft);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.custom-days input {
  width: 56px;
  height: 100%;
  padding: 0 7px;
  border: 0;
  color: var(--admin-ink);
  background: transparent;
  font: inherit;
  font-weight: 900;
}

.control-button:disabled,
.duration-chip:disabled,
.text-action:disabled,
.primary-button:disabled {
  opacity: 0.52;
  cursor: not-allowed;
  transform: none;
}

.key-action-cell {
  display: flex;
  align-items: center;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  padding: 24px;
  display: grid;
  place-items: center;
  background: rgba(20, 16, 18, 0.28);
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  width: min(440px, 100%);
  padding: 24px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 70px rgba(20, 16, 18, 0.22);
}

.confirm-dialog p:not(.eyebrow) {
  margin: 16px 0 0;
  color: var(--admin-soft);
  line-height: 1.8;
}

.confirm-actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 1280px) {
  .metric-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-card {
    border-bottom: 1px solid var(--admin-line);
  }

  .admin-workbench,
  .key-form {
    grid-template-columns: 1fr;
  }

  .note-field {
    min-width: 0;
  }
}

@media (max-width: 980px) {
  .ledger-row,
  .key-row {
    grid-template-columns: 1fr;
  }

  .ledger-header,
  .key-header {
    display: none;
  }

  .ledger-row > span,
  .key-row > span {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .ledger-row > span::before,
  .key-row > span::before {
    color: #7b7066;
    font-size: 12px;
    font-weight: 900;
  }

  .ledger-row > span:nth-child(1)::before { content: "账号"; }
  .ledger-row > span:nth-child(2)::before { content: "状态"; }
  .ledger-row > span:nth-child(3)::before { content: "权限"; }
  .ledger-row > span:nth-child(4)::before { content: "到期"; }
  .ledger-row > span:nth-child(5)::before { content: "操作"; }

  .key-row > span:nth-child(1)::before { content: "ID"; }
  .key-row > span:nth-child(2)::before { content: "状态"; }
  .key-row > span:nth-child(3)::before { content: "天数"; }
  .key-row > span:nth-child(4)::before { content: "使用"; }
  .key-row > span:nth-child(5)::before { content: "绑定"; }
  .key-row > span:nth-child(6)::before { content: "备注"; }
  .key-row > span:nth-child(7)::before { content: "创建"; }
  .key-row > span:nth-child(8)::before { content: "操作"; }
}

@media (max-width: 720px) {
  .admin-page {
    padding: 18px 10px 34px;
  }

  .admin-topbar,
  .topbar-actions,
  .panel-head {
    align-items: stretch;
    flex-direction: column;
  }

  .metric-strip {
    grid-template-columns: 1fr;
  }

  .metric-card {
    border-right: 0;
  }

  .ledger-row,
  .key-row {
    padding: 14px;
  }

  .ledger-row > span,
  .key-row > span {
    grid-template-columns: 80px minmax(0, 1fr);
  }

  .identity-cell {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .action-cell {
    align-items: flex-start;
    flex-direction: column;
  }

  .confirm-overlay {
    align-items: end;
    padding: 12px;
  }
}
</style>
