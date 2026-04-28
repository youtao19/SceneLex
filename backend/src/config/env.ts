import dotenv from 'dotenv';

dotenv.config({
  path: '.env.dev.local',
});

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3003),
  aiProvider: process.env.AI_PROVIDER ?? 'ollama',
  databaseUrl: process.env.DATABASE_URL ?? '',
};
