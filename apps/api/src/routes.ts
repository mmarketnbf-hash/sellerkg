import express from 'express';
import { z } from 'zod';
import type { DbPool } from './db/pool.js';
import type { CollectorService } from './services/collector-service.js';
import type { DashboardRepository } from './repositories/dashboard-repository.js';
import type { SystemRepository } from './repositories/system-repository.js';

const updateSourceSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  scheduleSeconds: z.number().int().min(60).max(86_400).optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

const accountIdSchema = z.string().regex(/^\d+$/);
const updateCostSchema = z.object({
  cost: z.number().finite().min(0)
});

export function createApiRouter(options: {
  pool: DbPool;
  dashboardRepository: DashboardRepository;
  systemRepository: SystemRepository;
  collectorService: CollectorService;
}) {
  const router = express.Router();

  router.get('/health', async (_request, response) => {
    const startedAt = Date.now();
    try {
      await options.pool.query('select 1');
      response.json({
        ok: true,
        database: 'ok',
        latencyMs: Date.now() - startedAt
      });
    } catch (error) {
      response.status(503).json({
        ok: false,
        database: 'error',
        error: getErrorMessage(error)
      });
    }
  });

  router.get('/overview', async (_request, response, next) => {
    try {
      response.json(await options.dashboardRepository.getOverview());
    } catch (error) {
      next(error);
    }
  });

  router.get('/accounts', async (_request, response, next) => {
    try {
      response.json(await options.dashboardRepository.getAccounts());
    } catch (error) {
      next(error);
    }
  });

  router.get('/finance-weekly-reports', async (request, response, next) => {
    try {
      const accountId = accountIdSchema.parse(String(request.query.accountId ?? ''));
      const scope = String(request.query.scope ?? 'recent');
      response.json(
        await options.dashboardRepository.getFinanceWeeklyReports({
          accountId,
          recentOnly: scope !== 'all'
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/cost-prices', async (request, response, next) => {
    try {
      const accountId = accountIdSchema.parse(String(request.query.accountId ?? ''));
      response.json(await options.dashboardRepository.getCostPrices(accountId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/cost-prices/:id', async (request, response, next) => {
    try {
      const id = accountIdSchema.parse(request.params.id);
      const payload = updateCostSchema.parse(request.body);
      const updated = await options.dashboardRepository.updateCostPrice(id, payload.cost);
      if (!updated) {
        response.status(404).json({ error: 'Cost price row not found.' });
        return;
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.get('/products', async (request, response, next) => {
    try {
      const limit = Math.min(Number(request.query.limit ?? 50), 200);
      response.json(await options.dashboardRepository.getProducts(limit));
    } catch (error) {
      next(error);
    }
  });

  router.get('/sync-states', async (_request, response, next) => {
    try {
      response.json(await options.dashboardRepository.getSyncStates());
    } catch (error) {
      next(error);
    }
  });

  router.get('/sources', async (_request, response, next) => {
    try {
      response.json(await options.systemRepository.getSources());
    } catch (error) {
      next(error);
    }
  });

  router.patch('/sources/:id', async (request, response, next) => {
    try {
      const payload = updateSourceSchema.parse(request.body);
      const source = await options.systemRepository.updateSourceConfig(request.params.id, payload);
      if (!source) {
        response.status(404).json({ error: 'Data source not found.' });
        return;
      }
      response.json(source);
    } catch (error) {
      next(error);
    }
  });

  router.post('/sources/:id/run', async (request, response, next) => {
    try {
      response.json(await options.collectorService.runSource(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/runs', async (request, response, next) => {
    try {
      const limit = Math.min(Number(request.query.limit ?? 50), 200);
      response.json(await options.systemRepository.getRuns(limit));
    } catch (error) {
      next(error);
    }
  });

  router.get('/events', async (request, response, next) => {
    try {
      const limit = Math.min(Number(request.query.limit ?? 50), 200);
      response.json(await options.systemRepository.getEvents(limit));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function errorHandler(
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction
) {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'Invalid request payload.', details: error.issues });
    return;
  }

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  response.status(statusCode).json({ error: getErrorMessage(error) });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
