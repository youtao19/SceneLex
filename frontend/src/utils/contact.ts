/**
 * "没有访问密钥？点击联系管理员" 里的收件地址。
 *
 * 走构建期变量而不是写死在源码里：交付给别人时该换的是自己的邮箱，
 * 不该让人去改 .vue 文件。Vite 只把 VITE_ 前缀的变量注入前端产物。
 *
 * 没配时不退化成任何兜底邮箱——一个收不到信的 mailto: 比不显示联系方式更糟，
 * 用户会以为申请已经发出去了。
 */
const CONTACT_SUBJECT = '申请开通 SceneLex 访问密钥';
const CONTACT_BODY = '你好，我想申请开通 SceneLex 访问密钥，请协助处理。谢谢。';

/**
 * 单独抽成纯函数是为了能直接测（模块级常量在 import 时就算好了，
 * 测试里再 stub import.meta.env 已经太晚）。
 */
export function buildContactMailto(email: string) {
  const trimmed = email.trim();

  if (!trimmed) {
    return '';
  }

  return `mailto:${trimmed}?subject=${encodeURIComponent(CONTACT_SUBJECT)}&body=${encodeURIComponent(CONTACT_BODY)}`;
}

export const contactMailto = buildContactMailto(import.meta.env.VITE_CONTACT_EMAIL ?? '');
