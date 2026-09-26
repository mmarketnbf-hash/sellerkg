import { createHash } from 'node:crypto';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';
import type { DataSourceRow, SystemRepository } from '../repositories/system-repository.js';

type CollectorRunResult = {
  status: 'success' | 'error';
  rowsRead: number;
  rowsWritten: number;
  message: string;
};

export class CollectorService {
  private timer: NodeJS.Timeout | null = null;
  private runningSources = new Set<string>();

  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly dashboardRepository: DashboardRepository,
    private readonly tickMs: number
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runDueSources();
    }, this.tickMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSource(sourceId: string): Promise<CollectorRunResult> {
    const source = await this.systemRepository.getSource(sourceId);
    if (!source) {
      throw Object.assign(new Error('Data source not found.'), { statusCode: 404 });
    }

    if (this.runningSources.has(sourceId)) {
      throw Object.assign(new Error('Data source is already running.'), { statusCode: 409 });
    }

    this.runningSources.add(sourceId);
    const runId = await this.systemRepository.createRun(sourceId);

    try {
      const result = await this.executeSource(source);
      await this.systemRepository.finishRun(
        runId,
        sourceId,
        result.status,
        result.rowsRead,
        result.rowsWritten,
        result.message
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.systemRepository.finishRun(runId, sourceId, 'error', 0, 0, message);
      await this.systemRepository.addEvent({
        eventType: 'collector_error',
        severity: 'error',
        entityType: 'data_source',
        entityId: sourceId,
        message,
        payload: { sourceKind: source.kind }
      });
      return { status: 'error', rowsRead: 0, rowsWritten: 0, message };
    } finally {
      this.runningSources.delete(sourceId);
    }
  }

  private async runDueSources() {
    const sources = await this.systemRepository.getSources();
    const now = Date.now();

    for (const source of sources) {
      if (source.status !== 'active' || this.runningSources.has(source.id)) {
        continue;
      }

      const lastRunAt = source.lastRunAt ? Date.parse(source.lastRunAt) : 0;
      if (now - lastRunAt >= source.scheduleSeconds * 1000) {
        void this.runSource(source.id);
      }
    }
  }

  private async executeSource(source: DataSourceRow): Promise<CollectorRunResult> {
    if (source.kind === 'existing_db_snapshot') {
      return this.snapshotExistingDb(source);
    }

    if (source.kind === 'http_json') {
      return this.fetchHttpJson(source);
    }

    throw new Error(`Unsupported data source kind: ${source.kind}`);
  }

  private async snapshotExistingDb(source: DataSourceRow): Promise<CollectorRunResult> {
    const overview = await this.dashboardRepository.getOverview();
    const products = await this.dashboardRepository.getProducts(10);
    const rowsRead = overview.orders30d + overview.sales30d + products.length;

    await this.systemRepository.saveSnapshot({
      sourceId: source.id,
      payloadHash: hashPayload({ overview, products }),
      payload: {
        overview,
        products,
        capturedAt: new Date().toISOString()
      }
    });

    await this.systemRepository.addEvent({
      eventType: 'existing_db_snapshot',
      entityType: 'data_source',
      entityId: source.id,
      message: 'Снимок существующей WB-схемы обновлен.',
      payload: {
        orders30d: overview.orders30d,
        sales30d: overview.sales30d,
        products: products.length
      }
    });

    return {
      status: 'success',
      rowsRead,
      rowsWritten: 1,
      message: `Снимок обновлен: ${products.length} товарных строк.`
    };
  }

  private async fetchHttpJson(source: DataSourceRow): Promise<CollectorRunResult> {
    const url = typeof source.config.url === 'string' ? source.config.url.trim() : '';
    if (!url) {
      return {
        status: 'success',
        rowsRead: 0,
        rowsWritten: 0,
        message: 'URL не задан. Источник готов к настройке.'
      };
    }

    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only http and https URLs are supported.');
    }

    const response = await fetchWithTimeout(parsedUrl, 15_000);
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    const payload = contentType.includes('application/json')
      ? safeParseJson(text)
      : { text: text.slice(0, 8_000), truncated: text.length > 8_000 };

    await this.systemRepository.saveSnapshot({
      sourceId: source.id,
      sourceUrl: parsedUrl.toString(),
      statusCode: response.status,
      payloadHash: hashPayload(payload),
      payload: {
        contentType,
        ok: response.ok,
        status: response.status,
        payload
      }
    });

    return {
      status: response.ok ? 'success' : 'error',
      rowsRead: 1,
      rowsWritten: 1,
      message: `HTTP ${response.status} ${parsedUrl.hostname}`
    };
  }
}

function safeParseJson(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : { value: parsed };
}

function hashPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function fetchWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SellerKG/0.1 (+https://local.sellerkg)'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}
