import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { createPool } from './db/pool.js';
import { DashboardRepository } from './repositories/dashboard-repository.js';
import { SystemRepository } from './repositories/system-repository.js';
import { createApiRouter, errorHandler } from './routes.js';
import { CollectorService } from './services/collector-service.js';

const config = loadConfig();
const pool = createPool(config);

await bootstrapDatabase(pool, config.appSchema);

const dashboardRepository = new DashboardRepository(pool, config.wbDataSchema);
const systemRepository = new SystemRepository(pool, config.appSchema);
const collectorService = new CollectorService(
  systemRepository,
  dashboardRepository,
  config.collectorTickMs
);

if (config.collectorsEnabled) {
  collectorService.start();
}

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: config.corsOrigin ?? true
  })
);

app.use(
  '/api',
  createApiRouter({
    pool,
    dashboardRepository,
    systemRepository,
    collectorService
  })
);

if (existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir));
  app.use((request, response, next) => {
    if (request.path.startsWith('/api')) {
      next();
      return;
    }
    response.sendFile(join(config.webDistDir, 'index.html'));
  });
} else {
  app.get('/', (_request, response) => {
    const currentFile = fileURLToPath(import.meta.url);
    response.type('text').send(
      `SellerKG API is running. Web build was not found near ${dirname(currentFile)}.`
    );
  });
}

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`SellerKG listening on http://0.0.0.0:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      collectorService.stop();
      void pool.end().finally(() => process.exit(0));
    });
  });
}
