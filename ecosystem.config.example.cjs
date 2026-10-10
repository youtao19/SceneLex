/**
 * PM2 配置模板。
 *
 *   cp ecosystem.config.example.cjs ecosystem.config.cjs
 *   # 填入真实值
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * 真正的 ecosystem.config.cjs 含数据库密码和模型 Key，已在 .gitignore 里；
 * 这个模板本身不含任何密钥，是要提交的，改动时不要顺手把真值写进来。
 *
 * 路径全部从 __dirname 推导，所以仓库放在哪个目录都能起，不必是 /root/SceneLex。
 */

const path = require('node:path');

const repoRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'scenelex',
      script: path.join(repoRoot, 'backend/dist/server.js'),
      cwd: repoRoot,

      // 必须是 fork + 单实例。限流器和模型并发队列都建在进程内存里，
      // 多开实例它们互不可见，实际配额会翻倍，用户端看到的是限流失效。
      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      max_memory_restart: '512M',

      // 后端启动时先跑数据库迁移，迁移失败会直接退出。
      // 留出重启间隔，否则配置错误时会以每秒一次的频率刷满日志。
      restart_delay: 5000,
      // 迁移卡在等 advisory lock 上时不要被当成启动超时杀掉。
      kill_timeout: 10000,

      env: {
        // 必须是 production。development 下 env.ts 会去读 backend/.env.dev.local，
        // 生产机上没有这个文件，而且会连带把启动迁移的分支逻辑带偏。
        NODE_ENV: 'production',
        // 全部写成字符串：PM2 只接受字符串值，写数字会在启动时收到一条
        // "not a string" 警告，而且 .env 文件里本来也都是字符串。
        PORT: '3003',

        // ---- 必填 ----
        // 生产环境不加载任何 .env 文件（那是开发期的便利），
        // 所有配置只能从进程环境进来，也就是这个 env 块。
        DATABASE_URL: 'postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME',

        // 用户模型端点的密钥加密口令，随便一串够长的随机值。
        // 上线后不要改：改一次，所有用户已保存的 API Key 都解不开，只能重填。
        USER_API_KEY_SECRET: 'change-me-to-a-long-random-string',

        // ---- 可选：按需打开 ----
        // 默认开启启动迁移，线上不要设成 false（那会让未部署的迁移永远不执行）。
        // MIGRATE_ON_STARTUP: 'false',

        // Ollama 预设的默认地址。只是设置页里预填的表单值，不是服务端兜底端点。
        // OLLAMA_OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',

        // 词卡预热脚本没有用户身份，只能从这里取一组凭证。三项都留空则回退到 DEEPSEEK_*。
        // PREWARM_BASE_URL: 'https://api.deepseek.com/v1',
        // PREWARM_MODEL: 'deepseek-chat',
        // PREWARM_API_KEY: '',

        // OCR。默认方法 tesseract 依赖宿主机上的 tesseract 二进制（见 README Requirements）；
        // 用 PaddleOCR 微服务时配 OCR_SERVICE_URL。
        // OCR_SERVICE_URL: 'http://127.0.0.1:8001/ocr',
        // OCR_TIMEOUT: '180000',            // 视觉模型
        // TESSERACT_OCR_TIMEOUT: '30000',
        // PADDLE_OCR_TIMEOUT: '60000',

        // 模型流量控制。同样是进程内存实现，重启即清零。
        // MODEL_GLOBAL_CONCURRENCY: '3',
        // MODEL_USER_CONCURRENCY: '1',
        // MODEL_RATE_LIMIT_MAX: '10',
        // MODEL_QUEUE_TIMEOUT_MS: '30000',

        // 头像存 Cloudflare R2。三个变量要么都填，要么都留空——
        // 只填一部分时后端会拒绝上传，而不是悄悄写回本地磁盘。
        // 全空则存到 backend/uploads/avatars。
        // R2_AVATAR_PUBLIC_BASE_URL: 'https://avatars.example.com',
        // R2_AVATAR_UPLOAD_URL: 'https://avatar-upload.example.com',
        // R2_AVATAR_UPLOAD_TOKEN: '',
      },

      // 迁移日志（启动时那几行 [migrate]）走 stdout，也就是 out_file。
      time: true,
      out_file: path.join(repoRoot, 'logs/pm2-out.log'),
      error_file: path.join(repoRoot, 'logs/pm2-error.log'),
    },
  ],
};
