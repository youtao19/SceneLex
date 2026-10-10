<template>
  <section class="terms-page">
    <header class="terms-hero surface-card">
      <p class="card-label">TERMS &amp; PRIVACY</p>
      <h1>服务条款与隐私说明</h1>
      <p class="hero-desc">
        这份说明写的是 SceneLex 实际怎么处理你的数据，而不是一份法律模板。
        最后更新：{{ LAST_UPDATED }}。
      </p>
    </header>

    <article class="terms-body surface-card">
      <section>
        <h2>1. 这是什么服务</h2>
        <p>
          SceneLex 是一个英语学习工具：查词、生成词卡、按间隔重复复习、拍照识读文章。
          它由个人维护、供小范围使用，不是商业产品，也不承诺可用性——服务可能随时调整或停止。
        </p>
      </section>

      <section>
        <h2>2. 你的数据存在哪里</h2>
        <p>
          账号、单词卡、词书、阅读文章、学习设置等全部存在服务提供者自己的服务器上，
          不经过任何第三方分析、广告或统计服务。
        </p>
        <ul>
          <li>密码：只存哈希与盐，服务器无法还原出你的密码。</li>
          <li>模型 API Key：加密后存储，接口从不返回明文。</li>
          <li>会话：登录后下发一个 HttpOnly Cookie，没有别的跟踪 Cookie。</li>
          <li>头像与拍照原图：见下面第 4 节。</li>
        </ul>
      </section>

      <section class="highlight">
        <h2>3. 你的内容会发送给第三方模型</h2>
        <p>
          <strong>这是这份说明里最需要你看清楚的一段。</strong>
          生成词卡、翻译句子、阅读助手、以及拍照识读，都依赖大语言模型。
          模型端点是<strong>你自己在「设置」页配置的</strong>：填一个 base URL、一个 API Key、
          一个模型名。服务器只是代你转发请求，<strong>不提供任何内置的兜底模型</strong>。
        </p>
        <ul>
          <li>
            你查的词、输入的文章、向助手提的问题，会连同提示词一起发送到
            <strong>你所配置的那个端点</strong>。
          </li>
          <li>
            使用拍照识读时，<strong>你上传的图片会以 base64 形式发送给该端点的视觉模型</strong>，
            用于识别其中的文字。这是 OCR 功能本身的工作方式，不是额外的上传。
          </li>
          <li>
            这些内容一旦发出，就适用<strong>该服务商自己的隐私政策与数据留存规则</strong>，
            不由 SceneLex 控制。选择端点前请先确认你接受对方的条款。
          </li>
          <li>
            系统端点（管理员配置、供 VIP 使用）由管理员选定服务商，规则同上；
            需要知道具体是哪一家时请联系管理员。
          </li>
        </ul>
      </section>

      <section>
        <h2>4. 文件保留多久</h2>
        <ul>
          <li><strong>拍照识读的原图</strong>：上传后 24 小时内自动删除；保存文章或取消识别会立即删除。</li>
          <li><strong>头像</strong>：保存在服务器或对象存储上，直到你更换头像或注销账号。</li>
          <li><strong>阅读文章与词卡</strong>：一直保留，直到你自己删除或注销账号。</li>
          <li><strong>模型端点配置</strong>：保留到你自己删除。</li>
        </ul>
      </section>

      <section>
        <h2>5. 你可以随时做的事</h2>
        <ul>
          <li><strong>导出全部数据</strong>：在「个人资料」页一键下载 JSON（不含密码与 API Key）。</li>
          <li><strong>修改密码</strong>：同样在「个人资料」页；改完其他设备会退出登录。</li>
          <li>
            <strong>删除账号</strong>：在「个人资料」页注销，账号与全部业务数据会被删除，且无法恢复。
            如果你有管理员权限，需要先交出管理员身份——否则没人能再签发访问密钥。
          </li>
        </ul>
      </section>

      <section>
        <h2>6. 使用约定</h2>
        <ul>
          <li>访问密钥由管理员发放，仅供本人使用，请勿转借。</li>
          <li>不要上传他人的隐私内容、违法内容，或你无权处理的图片与文章。</li>
          <li>
            模型调用有并发与频率限制，用超了会被暂时拒绝，这是为了让所有人还能用得上。
          </li>
        </ul>
      </section>

      <section>
        <h2>7. 需要联系管理员时</h2>
        <p v-if="contactMailto">
          条款、数据、账号相关的任何问题，发邮件到
          <a :href="contactMailto" class="link">联系管理员</a>。
        </p>
        <p v-else>
          本部署没有配置联系邮箱。请通过你拿到访问密钥的那个渠道联系服务提供者。
        </p>
      </section>

      <div class="terms-actions">
        <RouterLink class="peach-button-ghost" :to="{ name: 'landing' }">返回首页</RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { contactMailto } from '../utils/contact'

/**
 * 手写更新日期而不是取构建时间：构建时间会随每次发版变化，读起来像是
 * "条款天天在改"。这一行只在内容真的变了时才该动。
 */
const LAST_UPDATED = '2026-10-10'
</script>

<style scoped>
.terms-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 20px 80px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.terms-hero,
.terms-body {
  border-radius: var(--sl-radius-lg);
}

.terms-hero {
  padding: 32px;
}

.terms-hero h1 {
  margin: 8px 0 0;
  font-family: var(--sl-display-font);
}

.hero-desc {
  margin: 12px 0 0;
  color: var(--sl-text-soft);
  line-height: 1.8;
}

.terms-body {
  padding: 32px;
}

.terms-body section + section {
  margin-top: 28px;
  padding-top: 28px;
  border-top: 1px solid var(--sl-glass-border);
}

.terms-body h2 {
  margin: 0 0 12px;
  color: var(--sl-text-main);
  font-size: 20px;
  font-family: var(--sl-display-font);
}

.terms-body p,
.terms-body li {
  color: var(--sl-text-soft);
  line-height: 1.9;
}

.terms-body p {
  margin: 0;
}

.terms-body ul {
  margin: 12px 0 0;
  padding-left: 22px;
  display: grid;
  gap: 8px;
}

.terms-body strong {
  color: var(--sl-text-main);
}

/* 第 3 节是唯一会让人意外的一条：内容确实会离开这台服务器。 */
.highlight {
  padding: 24px;
  border-radius: var(--sl-radius-md);
  background: rgba(255, 237, 213, 0.5);
  border: 1px solid rgba(124, 45, 18, 0.18);
}

.highlight h2 {
  color: #7c2d12;
}

.terms-actions {
  margin-top: 32px;
  display: flex;
  justify-content: flex-start;
}

@media (max-width: 720px) {
  .terms-page {
    padding: 24px 12px 56px;
  }

  .terms-hero,
  .terms-body {
    padding: 24px;
  }
}
</style>
