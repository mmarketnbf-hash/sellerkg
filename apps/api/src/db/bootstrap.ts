import type { DbPool } from './pool.js';
import { qualifiedName, quoteIdentifier } from './identifier.js';

export async function bootstrapDatabase(pool: DbPool, appSchema: string) {
  const schema = quoteIdentifier(appSchema);
  const dataSources = qualifiedName(appSchema, 'data_sources');
  const runs = qualifiedName(appSchema, 'collector_runs');
  const events = qualifiedName(appSchema, 'events');
  const snapshots = qualifiedName(appSchema, 'external_snapshots');

  await pool.query(`create schema if not exists ${schema}`);

  await pool.query(`
    create table if not exists ${dataSources} (
      id text primary key,
      name text not null,
      kind text not null,
      status text not null default 'active',
      schedule_seconds integer not null default 3600 check (schedule_seconds > 0),
      config jsonb not null default '{}'::jsonb,
      last_run_at timestamptz null,
      last_status text null,
      last_message text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists ${runs} (
      id bigserial primary key,
      source_id text not null references ${dataSources}(id) on delete cascade,
      started_at timestamptz not null default now(),
      finished_at timestamptz null,
      status text not null,
      rows_read integer not null default 0,
      rows_written integer not null default 0,
      message text null
    )
  `);

  await pool.query(`
    create table if not exists ${events} (
      id bigserial primary key,
      event_type text not null,
      severity text not null default 'info',
      entity_type text null,
      entity_id text null,
      message text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists ${snapshots} (
      id bigserial primary key,
      source_id text not null references ${dataSources}(id) on delete cascade,
      source_url text null,
      status_code integer null,
      payload_hash text null,
      payload jsonb not null,
      collected_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists data_sources_status_idx on ${dataSources} (status, last_run_at);
    create index if not exists collector_runs_source_started_idx on ${runs} (source_id, started_at desc);
    create index if not exists events_created_idx on ${events} (created_at desc);
    create index if not exists external_snapshots_source_collected_idx on ${snapshots} (source_id, collected_at desc);
  `);

  await pool.query(
    `
      insert into ${dataSources} (id, name, kind, schedule_seconds, config)
      values
        ('wb_existing_db', 'WB: уже загруженные таблицы', 'existing_db_snapshot', 900, '{}'::jsonb),
        ('http_market_probe', 'Интернет-источник: HTTP JSON', 'http_json', 3600, '{"url":""}'::jsonb)
      on conflict (id) do nothing
    `
  );
}
