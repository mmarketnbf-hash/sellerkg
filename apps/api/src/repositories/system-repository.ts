import type { DbPool } from '../db/pool.js';
import { qualifiedName } from '../db/identifier.js';

export type DataSourceRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  scheduleSeconds: number;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
};

export type CollectorRunRow = {
  id: number;
  sourceId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  rowsRead: number;
  rowsWritten: number;
  message: string | null;
};

export type EventRow = {
  id: number;
  eventType: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export class SystemRepository {
  constructor(
    private readonly pool: DbPool,
    private readonly appSchema: string
  ) {}

  async getSources(): Promise<DataSourceRow[]> {
    const table = qualifiedName(this.appSchema, 'data_sources');
    const result = await this.pool.query<{
      id: string;
      name: string;
      kind: string;
      status: string;
      schedule_seconds: number;
      config: Record<string, unknown>;
      last_run_at: string | null;
      last_status: string | null;
      last_message: string | null;
    }>(`
      select
        id,
        name,
        kind,
        status,
        schedule_seconds,
        config,
        last_run_at::text,
        last_status,
        last_message
      from ${table}
      order by id
    `);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      scheduleSeconds: row.schedule_seconds,
      config: row.config,
      lastRunAt: row.last_run_at,
      lastStatus: row.last_status,
      lastMessage: row.last_message
    }));
  }

  async getSource(id: string): Promise<DataSourceRow | null> {
    const sources = await this.getSources();
    return sources.find((source) => source.id === id) ?? null;
  }

  async updateSourceConfig(
    id: string,
    patch: Partial<Pick<DataSourceRow, 'status' | 'scheduleSeconds' | 'config'>>
  ) {
    const table = qualifiedName(this.appSchema, 'data_sources');
    const current = await this.getSource(id);
    if (!current) {
      return null;
    }

    const nextStatus = patch.status ?? current.status;
    const nextScheduleSeconds = patch.scheduleSeconds ?? current.scheduleSeconds;
    const nextConfig = patch.config ?? current.config;

    const result = await this.pool.query(
      `
        update ${table}
        set status = $2,
            schedule_seconds = $3,
            config = $4::jsonb,
            updated_at = now()
        where id = $1
        returning id
      `,
      [id, nextStatus, nextScheduleSeconds, JSON.stringify(nextConfig)]
    );

    return result.rowCount === 1 ? this.getSource(id) : null;
  }

  async createRun(sourceId: string) {
    const table = qualifiedName(this.appSchema, 'collector_runs');
    const result = await this.pool.query<{ id: string }>(
      `
        insert into ${table} (source_id, status)
        values ($1, 'running')
        returning id
      `,
      [sourceId]
    );
    return Number(result.rows[0].id);
  }

  async finishRun(
    runId: number,
    sourceId: string,
    status: 'success' | 'error',
    rowsRead: number,
    rowsWritten: number,
    message: string
  ) {
    const runs = qualifiedName(this.appSchema, 'collector_runs');
    const sources = qualifiedName(this.appSchema, 'data_sources');

    await this.pool.query(
      `
        update ${runs}
        set finished_at = now(),
            status = $2,
            rows_read = $3,
            rows_written = $4,
            message = $5
        where id = $1
      `,
      [runId, status, rowsRead, rowsWritten, message]
    );

    await this.pool.query(
      `
        update ${sources}
        set last_run_at = now(),
            last_status = $2,
            last_message = $3,
            updated_at = now()
        where id = $1
      `,
      [sourceId, status, message]
    );
  }

  async addEvent(event: {
    eventType: string;
    severity?: 'info' | 'warning' | 'error';
    entityType?: string;
    entityId?: string;
    message: string;
    payload?: Record<string, unknown>;
  }) {
    const table = qualifiedName(this.appSchema, 'events');
    await this.pool.query(
      `
        insert into ${table} (event_type, severity, entity_type, entity_id, message, payload)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        event.eventType,
        event.severity ?? 'info',
        event.entityType ?? null,
        event.entityId ?? null,
        event.message,
        JSON.stringify(event.payload ?? {})
      ]
    );
  }

  async saveSnapshot(snapshot: {
    sourceId: string;
    sourceUrl?: string;
    statusCode?: number;
    payloadHash?: string;
    payload: Record<string, unknown>;
  }) {
    const table = qualifiedName(this.appSchema, 'external_snapshots');
    await this.pool.query(
      `
        insert into ${table} (source_id, source_url, status_code, payload_hash, payload)
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        snapshot.sourceId,
        snapshot.sourceUrl ?? null,
        snapshot.statusCode ?? null,
        snapshot.payloadHash ?? null,
        JSON.stringify(snapshot.payload)
      ]
    );
  }

  async getRuns(limit: number): Promise<CollectorRunRow[]> {
    const table = qualifiedName(this.appSchema, 'collector_runs');
    const result = await this.pool.query<{
      id: string;
      source_id: string;
      started_at: string;
      finished_at: string | null;
      status: string;
      rows_read: number;
      rows_written: number;
      message: string | null;
    }>(
      `
        select
          id,
          source_id,
          started_at::text,
          finished_at::text,
          status,
          rows_read,
          rows_written,
          message
        from ${table}
        order by started_at desc
        limit $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      sourceId: row.source_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      rowsRead: row.rows_read,
      rowsWritten: row.rows_written,
      message: row.message
    }));
  }

  async getEvents(limit: number): Promise<EventRow[]> {
    const table = qualifiedName(this.appSchema, 'events');
    const result = await this.pool.query<{
      id: string;
      event_type: string;
      severity: string;
      entity_type: string | null;
      entity_id: string | null;
      message: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        select
          id,
          event_type,
          severity,
          entity_type,
          entity_id,
          message,
          payload,
          created_at::text
        from ${table}
        order by created_at desc
        limit $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      eventType: row.event_type,
      severity: row.severity,
      entityType: row.entity_type,
      entityId: row.entity_id,
      message: row.message,
      payload: row.payload,
      createdAt: row.created_at
    }));
  }
}
