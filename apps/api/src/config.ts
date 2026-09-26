import { config as loadDotEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const initialCwd = process.cwd();
const moduleDir = dirname(fileURLToPath(import.meta.url));

for (const path of [
  resolve(initialCwd, '.env'),
  resolve(initialCwd, '../..', '.env'),
  resolve(moduleDir, '../../..', '.env')
]) {
  loadDotEnv({ path });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4050),
  DATABASE_URL: z.string().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  APP_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default('sellerkg'),
  WB_DATA_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default('wb_prod'),
  COLLECTORS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  COLLECTOR_TICK_MS: z.coerce.number().int().min(10_000).default(60_000),
  CORS_ORIGIN: z.string().optional(),
  WEB_DIST_DIR: z.string().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const env = envSchema.parse(process.env);

  const splitDatabaseConfig = {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD
  };

  if (!env.DATABASE_URL) {
    for (const [key, value] of Object.entries(splitDatabaseConfig)) {
      if (value === undefined || value === '') {
        throw new Error(
          `DATABASE_URL is not set, so ${key} must be provided through split DATABASE_* variables.`
        );
      }
    }
  }

  const cwd = process.cwd();
  const rootDir = /[/\\]apps[/\\]api$/.test(cwd) ? resolve(cwd, '../..') : cwd;
  const defaultWebDist = resolve(rootDir, 'apps/web/dist');

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    appSchema: env.APP_SCHEMA,
    wbDataSchema: env.WB_DATA_SCHEMA,
    collectorsEnabled: env.COLLECTORS_ENABLED ?? false,
    collectorTickMs: env.COLLECTOR_TICK_MS,
    corsOrigin: env.CORS_ORIGIN?.trim() || undefined,
    webDistDir: env.WEB_DIST_DIR ? resolve(env.WEB_DIST_DIR) : defaultWebDist,
    database:
      env.DATABASE_URL !== undefined && env.DATABASE_URL !== ''
        ? { connectionString: env.DATABASE_URL }
        : splitDatabaseConfig
  };
}
