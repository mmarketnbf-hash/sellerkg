# VPS Deploy

## Requirements

- Docker and Docker Compose.
- Network access from the container to PostgreSQL.
- PostgreSQL user with read access to `WB_DATA_SCHEMA` and create/write access to `APP_SCHEMA`.

## Environment

Use `.env` in the project root:

```env
NODE_ENV=production
PORT=4050
DATABASE_URL=postgresql://sellerkg_user:password@postgres-host:5432/existing_db
APP_SCHEMA=sellerkg
WB_DATA_SCHEMA=wb_prod
COLLECTORS_ENABLED=true
COLLECTOR_TICK_MS=60000
```

## Run

```bash
docker compose up -d --build
docker logs -f sellerkg
```

Open:

```text
http://SERVER_IP:4050
```

## Database Grants

Example grants for a dedicated app user:

```sql
grant usage on schema wb_prod to sellerkg_user;
grant select on all tables in schema wb_prod to sellerkg_user;
grant select on all sequences in schema wb_prod to sellerkg_user;

create schema if not exists sellerkg authorization sellerkg_user;
grant usage, create on schema sellerkg to sellerkg_user;
```

For future tables in the existing WB schema, grant default privileges from the owner role that creates those tables.
