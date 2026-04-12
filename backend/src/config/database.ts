import { env } from './env';

export function getDatabaseConfig() {
  return {
    url: env.databaseUrl,
  };
}

