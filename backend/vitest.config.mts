import { defineConfig } from 'vitest/config';

// backend 是 CommonJS 包，配置文件必须用 .mts 才能静态 import ESM 的 vitest/config。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
