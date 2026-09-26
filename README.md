# SellerKG

SellerKG is a web subsystem for seller operations on Wildberries. It is designed to run on a VPS in a separate container, connect to an existing PostgreSQL database, read already collected WB data, and maintain its own service schema.

## What Is Included

- React + TypeScript web interface.
- Node.js + Express API.
- PostgreSQL read adapter for existing WB data schema, default `wb_prod`.
- Dedicated service schema, default `sellerkg`.
- Source registry, collector runs, events, and external HTTP JSON snapshots.
- Single-container Docker build that serves both API and web UI.

## Database Model

SellerKG does not write into the existing WB data schema. It reads from `WB_DATA_SCHEMA` and creates its own tables in `APP_SCHEMA`:

- `data_sources`
- `collector_runs`
- `events`
- `external_snapshots`

If the existing `wb_prod` schema contains tables from `load_WB_api`, SellerKG immediately reads:

- `wb_accounts`
- `wb_orders`
- `wb_sales`
- `wb_sync_state`
- `wb_finance_weekly_summary`
- `wb_finance_weekly_summary_by_sku`

Missing tables are treated as empty data instead of a hard failure.

## Local Start

```bash
npm install
cp .env.example .env
npm run build
npm run start
```

Open `http://localhost:4050`.

For separate frontend/backend development:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`, API on `http://localhost:4050`.

## VPS Container

1. Copy `deploy/env.production.example` to `.env`.
2. Fill `DATABASE_URL`, `APP_SCHEMA`, and `WB_DATA_SCHEMA`.
3. Build and run:

```bash
docker compose up -d --build
```

The container listens on `4050`.

## First Data Sources

The bootstrap creates two sources:

- `wb_existing_db`: snapshots the existing WB tables into SellerKG service history.
- `http_market_probe`: a configurable HTTP/JSON source for public internet endpoints.

Configure `http_market_probe` through the `sellerkg.data_sources.config` JSON field:

```json
{
  "url": "https://example.com/data.json"
}
```

Then run it from the web UI or `POST /api/sources/http_market_probe/run`.

## API

- `GET /api/health`
- `GET /api/overview`
- `GET /api/products`
- `GET /api/sync-states`
- `GET /api/sources`
- `PATCH /api/sources/:id`
- `POST /api/sources/:id/run`
- `GET /api/runs`
- `GET /api/events`
