<template>
  <section class="admin-page">
    <header class="admin-hero">
      <div>
        <p class="card-label">ADMIN</p>
        <h2 class="section-title">用户与密钥</h2>
        <p>管理账号可用状态、管理员角色和注册访问密钥。</p>
      </div>
      <button class="peach-button" type="button" :disabled="isLoading" @click="loadAdminData">
        刷新
      </button>
    </header>

    <p v-if="errorMessage" class="notice-box is-error" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="notice-box" role="status">{{ successMessage }}</p>

    <section class="admin-grid">
      <article class="admin-panel surface-card" aria-labelledby="users-title">
        <div class="panel-head">
          <div>
            <p class="card-label">USERS</p>
            <h3 id="users-title">用户管理</h3>
          </div>
          <span class="state-pill">{{ users.length }} 个账号</span>
        </div>

        <div v-if="users.length === 0 && !isLoading" class="empty-box">暂无用户</div>
        <div v-else class="admin-table user-table" role="table" aria-label="用户管理">
          <div class="table-row table-header" role="row">
            <span role="columnheader">账号</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">角色</span>
            <span role="columnheader">VIP</span>
            <span role="columnheader">到期</span>
            <span role="columnheader">操作</span>
          </div>
          <div v-for="user in users" :key="user.id" class="table-row" role="row">
            <span class="identity-cell" role="cell">
              <strong>{{ user.nickname }}</strong>
              <small>{{ user.email }}</small>
            </span>
            <span role="cell">
              <span class="status-chip" :class="`is-${user.accessStatus}`">
                {{ accessStatusText(user.accessStatus) }}
              </span>
            </span>
            <span role="cell">
              <span class="role-cell">
                <span class="role-label">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span>
                <button
                  v-if="user.id !== userStore.user?.id"
                  class="small-action"
                  type="button"
                  :disabled="isBusy"
                  @click="openRoleDialog(user)"
                >
                  修改角色
                </button>
                <span v-else class="muted-text">当前账号</span>
              </span>
            </span>
            <span role="cell">
              <span class="role-cell">
                <span class="vip-chip" :class="{ 'is-vip': user.isVip || user.role === 'admin' }">
                  {{ vipStatusText(user) }}
                </span>
                <button
                  v-if="user.role !== 'admin'"
                  class="small-action"
                  type="button"
                  :disabled="isBusy"
                  @click="toggleVip(user)"
                >
                  {{ user.isVip ? '取消 VIP' : '设为 VIP' }}
                </button>
                <span v-else class="muted-text">系统 API</span>
              </span>
            </span>
            <span role="cell">{{ formatDate(user.accessExpiresAt) }}</span>
            <span class="action-cell" role="cell">
              <button class="small-action" type="button" :disabled="isBusy" @click="resumeUser(user.id)">
                恢复
              </button>
              <button
                class="small-action is-danger"
                type="button"
                :disabled="isBusy || user.id === userStore.user?.id"
                @click="suspendUser(user.id)"
              >
                停用
              </button>
              <button class="small-action" type="button" :disabled="isBusy" @click="renewUser(user.id)">
                续期 {{ renewDays }} 天
              </button>
            </span>
          </div>
        </div>
      </article>

      <aside class="admin-panel surface-card" aria-labelledby="key-create-title">
        <div class="panel-head">
          <div>
            <p class="card-label">ACCESS</p>
            <h3 id="key-create-title">创建密钥</h3>
          </div>
        </div>

        <label class="field-block">
          <span>有效天数</span>
          <input v-model.number="keyDays" type="number" min="1" max="3650" step="1" />
        </label>
        <label class="field-block">
          <span>备注</span>
          <input v-model.trim="keyNote" type="text" maxlength="120" placeholder="给自己看的备注" />
        </label>
        <button class="peach-button key-button" type="button" :disabled="isBusy" @click="createKey">
          创建访问密钥
        </button>

        <div v-if="createdAccessKey" class="created-key" aria-label="新访问密钥">
          <span>新密钥</span>
          <strong>{{ createdAccessKey }}</strong>
          <button class="small-action copy-action" type="button" @click="copyCreatedKey">
            复制密钥
          </button>
        </div>
        <p class="key-help">
          密钥明文只在创建后显示一次；列表里的旧密钥只保存校验摘要，无法反查原文。
        </p>
      </aside>
    </section>

    <section class="admin-panel surface-card" aria-labelledby="keys-title">
      <div class="panel-head">
        <div>
          <p class="card-label">KEYS</p>
          <h3 id="keys-title">密钥管理</h3>
        </div>
        <span class="state-pill">{{ accessKeys.length }} 个密钥</span>
      </div>

      <div v-if="accessKeys.length === 0 && !isLoading" class="empty-box">暂无密钥</div>
      <div v-else class="admin-table key-table" role="table" aria-label="密钥管理">
        <div class="table-row table-header" role="row">
          <span role="columnheader">ID</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">天数</span>
          <span role="columnheader">使用</span>
          <span role="columnheader">绑定账号</span>
          <span role="columnheader">备注</span>
          <span role="columnheader">创建时间</span>
          <span role="columnheader">操作</span>
        </div>
        <div v-for="accessKey in accessKeys" :key="accessKey.id" class="table-row" role="row">
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
          <span class="action-cell" role="cell">
            <button
              v-if="accessKey.status === 'active'"
              class="small-action is-danger"
              type="button"
              :disabled="isBusy || accessKey.usedCount > 0"
              @click="setKeyStatus(accessKey.id, 'revoked')"
            >
              撤销
            </button>
            <button
              v-else-if="accessKey.status === 'revoked'"
              class="small-action"
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
      <article class="confirm-dialog surface-card" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
        <p class="card-label">CONFIRM</p>
        <h3 id="role-dialog-title">确认修改角色</h3>
        <p>
          将
          <strong>{{ roleChangeTarget.user.email }}</strong>
          设置为
          <strong>{{ roleChangeTarget.nextRole === 'admin' ? '管理员' : '普通用户' }}</strong>
          。
        </p>
        <div class="confirm-actions">
          <button class="small-action" type="button" :disabled="isBusy" @click="closeRoleDialog">
            取消
          </button>
          <button class="small-action is-danger" type="button" :disabled="isBusy" @click="confirmRoleChange">
            确认修改
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
const renewDays = ref(30)
const keyNote = ref('')
const createdAccessKey = ref('')
const roleChangeTarget = ref<{
  user: AdminUser
  nextRole: 'user' | 'admin'
} | null>(null)

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
 * 给用户续期固定天数，先保留最常用的 30 天快捷操作。
 */
async function renewUser(userId: number) {
  await runAdminAction(async () => {
    await updateAdminUserAccess(userId, 'renew', renewDays.value)
    successMessage.value = '用户已续期'
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
  max-width: 1520px;
  margin: 0 auto;
  padding: 40px 20px 72px;
  display: grid;
  gap: 20px;
}

.admin-hero {
  min-height: 190px;
  padding: 32px;
  border: 1px solid rgba(30, 30, 30, 0.08);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  background:
    linear-gradient(135deg, rgba(241, 250, 245, 0.96), rgba(255, 246, 232, 0.92)),
    repeating-linear-gradient(90deg, rgba(20, 20, 20, 0.06) 0 1px, transparent 1px 34px);
  box-shadow: 0 18px 45px rgba(56, 42, 25, 0.11);
}

.admin-hero p {
  margin: 10px 0 0;
  color: #5d554b;
  line-height: 1.8;
}

.admin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
}

.admin-panel {
  min-width: 0;
  padding: 24px;
  border-radius: 8px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.panel-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-family: var(--sl-display-font);
  font-size: 25px;
}

.state-pill {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  color: #047857;
  background: rgba(220, 252, 231, 0.72);
  border: 1px solid rgba(4, 120, 87, 0.18);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.notice-box,
.empty-box {
  padding: 14px 16px;
  border-radius: 8px;
  color: #30553a;
  background: rgba(236, 253, 245, 0.78);
  border: 1px solid rgba(4, 120, 87, 0.16);
}

.notice-box.is-error {
  color: #9f1239;
  background: rgba(255, 241, 242, 0.82);
  border-color: rgba(190, 18, 60, 0.18);
}

.admin-table {
  margin-top: 18px;
  display: grid;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.table-row {
  min-width: 980px;
  min-height: 58px;
  padding: 12px;
  border: 1px solid rgba(30, 30, 30, 0.07);
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) 90px 110px 130px 140px minmax(240px, 1.2fr);
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.54);
}

.key-table .table-row {
  min-width: 900px;
  grid-template-columns: 70px 90px 80px 80px minmax(150px, 1fr) minmax(130px, 1fr) 140px 90px;
}

.table-header {
  min-height: 42px;
  color: #7a6c5e;
  background: transparent;
  border-style: dashed;
  font-size: 12px;
  font-weight: 900;
}

.identity-cell {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.identity-cell small,
.muted-text {
  color: #7a6c5e;
}

.role-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.role-label {
  color: #2f352f;
  font-weight: 900;
}

.vip-chip {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b5c46;
  background: rgba(245, 238, 225, 0.82);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.vip-chip.is-vip {
  color: #7c2d12;
  background: rgba(255, 237, 213, 0.88);
}

.status-chip {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.status-chip.is-active {
  color: #047857;
  background: rgba(220, 252, 231, 0.72);
}

.status-chip.is-suspended,
.status-chip.is-revoked {
  color: #9f1239;
  background: rgba(255, 241, 242, 0.82);
}

.status-chip.is-expired,
.status-chip.is-used {
  color: #92400e;
  background: rgba(254, 243, 199, 0.78);
}

.action-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.small-action {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(30, 30, 30, 0.12);
  border-radius: 8px;
  color: #2f352f;
  background: rgba(255, 255, 255, 0.72);
  font-weight: 800;
  cursor: pointer;
}

.small-action.is-danger {
  color: #9f1239;
}

.small-action:disabled,
.peach-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.field-block {
  margin-top: 18px;
  display: grid;
  gap: 8px;
  color: #5d554b;
  font-weight: 800;
}

.field-block input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(30, 30, 30, 0.12);
  border-radius: 8px;
  color: var(--sl-text-main);
  background: rgba(255, 255, 255, 0.72);
  font: inherit;
}

.key-button {
  width: 100%;
  margin-top: 18px;
}

.created-key {
  margin-top: 18px;
  padding: 14px;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  color: #30553a;
  background: rgba(236, 253, 245, 0.78);
  border: 1px solid rgba(4, 120, 87, 0.16);
}

.created-key strong {
  overflow-wrap: anywhere;
  font-size: 18px;
}

.copy-action {
  justify-self: start;
}

.key-help {
  margin: 12px 0 0;
  color: #7a6c5e;
  font-size: 13px;
  line-height: 1.7;
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
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.confirm-dialog h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-family: var(--sl-display-font);
  font-size: 25px;
}

.confirm-dialog p {
  margin: 16px 0 0;
  color: #5d554b;
  line-height: 1.8;
}

.confirm-actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 1120px) {
  .admin-grid {
    grid-template-columns: 1fr;
  }

  .table-row,
  .key-table .table-row {
    min-width: 0;
    grid-template-columns: 1fr;
  }

  .table-header {
    display: none;
  }
}

@media (max-width: 720px) {
  .admin-page {
    padding: 18px 10px 34px;
    gap: 14px;
  }

  .admin-hero {
    align-items: stretch;
    flex-direction: column;
    min-height: auto;
    padding: 22px;
    gap: 18px;
  }

  .admin-panel {
    padding: 18px;
  }

  .panel-head {
    flex-direction: column;
  }

  .table-row,
  .key-table .table-row {
    min-height: 0;
    padding: 14px;
    gap: 12px;
  }

  .table-row:not(.table-header) > span {
    min-width: 0;
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .table-row:not(.table-header) > span::before {
    color: #7a6c5e;
    font-size: 12px;
    font-weight: 900;
  }

  .user-table .table-row:not(.table-header) > span:nth-child(1)::before { content: "账号"; }
  .user-table .table-row:not(.table-header) > span:nth-child(2)::before { content: "状态"; }
  .user-table .table-row:not(.table-header) > span:nth-child(3)::before { content: "角色"; }
  .user-table .table-row:not(.table-header) > span:nth-child(4)::before { content: "VIP"; }
  .user-table .table-row:not(.table-header) > span:nth-child(5)::before { content: "到期"; }
  .user-table .table-row:not(.table-header) > span:nth-child(6)::before { content: "操作"; }

  .key-table .table-row:not(.table-header) > span:nth-child(1)::before { content: "ID"; }
  .key-table .table-row:not(.table-header) > span:nth-child(2)::before { content: "状态"; }
  .key-table .table-row:not(.table-header) > span:nth-child(3)::before { content: "天数"; }
  .key-table .table-row:not(.table-header) > span:nth-child(4)::before { content: "使用"; }
  .key-table .table-row:not(.table-header) > span:nth-child(5)::before { content: "绑定"; }
  .key-table .table-row:not(.table-header) > span:nth-child(6)::before { content: "备注"; }
  .key-table .table-row:not(.table-header) > span:nth-child(7)::before { content: "创建"; }
  .key-table .table-row:not(.table-header) > span:nth-child(8)::before { content: "操作"; }

  .identity-cell {
    gap: 2px;
  }

  .identity-cell small,
  .key-table .table-row:not(.table-header) > span {
    overflow-wrap: anywhere;
  }

  .role-cell,
  .action-cell {
    justify-content: flex-start;
  }

  .confirm-overlay {
    align-items: end;
    padding: 12px;
  }

  .confirm-dialog {
    width: 100%;
  }
}
</style>
