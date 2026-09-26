import pg from 'pg';
import type { AppConfig } from '../config.js';

export function createPool(config: AppConfig) {
  return new pg.Pool({
    ...config.database,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

export type DbPool = pg.Pool;
