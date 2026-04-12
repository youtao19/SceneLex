export const aiConfig = {
  // 本地 Ollama 服务地址。
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
  // 本地实际安装的模型名。
  model: process.env.OLLAMA_MODEL ?? 'qwen3:4b',
  // 首次加载模型可能会慢一点，超时放宽一些。
  timeout: Number(process.env.OLLAMA_TIMEOUT ?? 60_000)
}
