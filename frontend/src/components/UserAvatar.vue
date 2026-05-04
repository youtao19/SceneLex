<script setup lang="ts">
interface Props {
  avatarUrl?: string | null
  size?: 'small' | 'medium' | 'large'
}

withDefaults(defineProps<Props>(), {
  avatarUrl: null,
  size: 'small'
})

function getFullAvatarUrl(path: string) {
  if (!path) return ''
  if (path.startsWith('http')) {
    return path
  }
  // 使用相对路径：
  // - 开发模式：vite proxy 把 /uploads 转发到后端
  // - 生产模式：后端直接 serve 静态资源，同源
  return path
}
</script>

<template>
  <span class="profile-avatar" :class="[`avatar-${size}`]" aria-hidden="true">
    <img
      v-if="avatarUrl"
      :src="getFullAvatarUrl(avatarUrl)"
      alt="用户头像"
      class="avatar-img"
    />
    <template v-else>
      <span class="avatar-shadow"></span>
      <span class="avatar-highlight"></span>
    </template>
  </span>
</template>

<style scoped>
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

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 默认 small */
.avatar-small {
  width: 40px;
  height: 40px;
}

.avatar-small .avatar-shadow {
  top: 7px;
  left: 10px;
  width: 24px;
  height: 17px;
}

.avatar-small .avatar-highlight {
  right: 7px;
  bottom: 3px;
  width: 15px;
  height: 24px;
}

.avatar-medium {
  width: 58px;
  height: 58px;
}

.avatar-medium .avatar-shadow {
  top: 9px;
  left: 16px;
  width: 31px;
  height: 21px;
}

.avatar-medium .avatar-highlight {
  right: 10px;
  bottom: 5px;
  width: 21px;
  height: 34px;
}

.avatar-large {
  width: 76px;
  height: 76px;
}

.avatar-large .avatar-shadow {
  top: 18%;
  left: 26%;
  width: 55%;
  height: 36%;
}

.avatar-large .avatar-highlight {
  right: 18%;
  bottom: 9%;
  width: 34%;
  height: 58%;
}

.avatar-shadow {
  position: absolute;
  border-radius: 58% 46% 50% 42%;
  background: #1d1d22;
  transform: rotate(-20deg);
}

.avatar-highlight {
  position: absolute;
  border-radius: 999px 999px 0 0;
  background: #101014;
  transform: rotate(28deg);
}

@media (max-width: 600px) {
  .avatar-small {
    width: 34px;
    height: 34px;
  }
}
</style>
