/**
 * 原型用的假数据（端点模型）。不连后端、不落库 —— 只回答「端点配置该怎么交互」。
 *
 * 关键约束（来自已确定的设计）：
 * 1. 只走 OpenAI-compatible 的 /v1/chat/completions，所以端点 = baseUrl + key + model。
 * 2. 一个用户可以配多个端点，其中一个为默认。
 * 3. 视觉 OCR 要用同一个端点，但模型可以不同，所以 visionModel 单独一个字段。
 * 4. 没有服务器兜底，所以「一个端点都没有」是必须设计的空状态。
 */
export interface PrototypeEndpoint {
  id: number;
  label: string;
  baseUrl: string;
  model: string;
  /** 空字符串表示这个端点不做视觉 OCR。 */
  visionModel: string;
  /** 只展示掩码，原型里不存真 Key。 */
  keyPreview: string;
  isDefault: boolean;
}

export interface EndpointPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  visionModels: string[];
  /** 预设由管理员维护，允许指向内网地址；用户手填的 URL 必须过 SSRF 校验。 */
  trusted: boolean;
  hint: string;
}

export const ENDPOINT_PRESETS: EndpointPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    visionModels: [],
    trusted: true,
    hint: '便宜、稳定，不支持图片',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.6', 'kimi-thinking-preview'],
    visionModels: ['kimi-k2.6-vision'],
    trusted: true,
    hint: '支持视觉，可兼做 OCR',
  },
  {
    id: 'ollama',
    name: 'Ollama（本机）',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen3.5:4b', 'gemma4:e4b'],
    visionModels: ['qwen3-vl:8b'],
    trusted: true,
    hint: '本地免费，需要自己先拉起服务',
  },
];

/** 初始状态：已经配了一个默认端点，另外有一个没测通的。 */
export function buildPrototypeEndpoints(): PrototypeEndpoint[] {
  return [
    {
      id: 1,
      label: '我的 DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      visionModel: '',
      keyPreview: 'sk-••••••••7f2a',
      isDefault: true,
    },
    {
      id: 2,
      label: 'Kimi 备用',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      visionModel: 'kimi-k2.6-vision',
      keyPreview: 'sk-••••••••1c93',
      isDefault: false,
    },
  ];
}

export const REVIEW_LIMIT_MIN = 1;
export const REVIEW_LIMIT_MAX = 200;

/**
 * 假的「测试连接」。真实实现要打 /v1/models，并且必须先过 SSRF 校验。
 */
export function fakeTestConnection(baseUrl: string): Promise<{ ok: boolean; message: string; models: string[] }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!/^https?:\/\//.test(baseUrl)) {
        resolve({ ok: false, message: '地址要以 http:// 或 https:// 开头', models: [] });
        return;
      }

      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        resolve({ ok: false, message: '连不上：本机 11434 端口没有服务在监听', models: [] });
        return;
      }

      resolve({
        ok: true,
        message: '连接成功，返回 12 个模型',
        models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-reasoner'],
      });
    }, 700);
  });
}
