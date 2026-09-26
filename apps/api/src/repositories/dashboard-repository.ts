import type { DbPool } from '../db/pool.js';
import { qualifiedName, regclassName } from '../db/identifier.js';

export type Overview = {
  accounts: number;
  orders30d: number;
  orderAmount30d: number;
  cancellations30d: number;
  sales30d: number;
  salesAmount30d: number;
  productsSold30d: number;
  payoutAmount: number;
  logisticsCost: number;
  storageCost: number;
  lastSaleAt: string | null;
  sync: {
    totalWorkers: number;
    healthyWorkers: number;
    errorWorkers: number;
    lastSuccessAt: string | null;
  };
};

export type ProductRow = {
  nmId: number | null;
  title: string;
  brand: string;
  vendorCode: string;
  quantity: number;
  revenue: number;
  payout: number;
  lastSeenAt: string | null;
};

export type SyncStateRow = {
  accountName: string;
  apiType: string;
  status: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
};

export type AccountRow = {
  id: string;
  accountCode: string;
  accountName: string;
  enabled: boolean;
};

export type FinanceWeeklyReportRow = {
  period: string;
  dateFrom: string;
  dateTo: string;
  reportId: string;
  vendorCode: string;
  salesKgs: number;
  payoutKgs: number;
  profitKgs: number;
};

export type CostPriceRow = {
  id: string;
  accountId: string;
  vendorCode: string;
  cost: number;
  validFrom: string | null;
  validTo: string | null;
  updatedAt: string | null;
};

type CountRow = { count: string };

export class DashboardRepository {
  constructor(
    private readonly pool: DbPool,
    private readonly wbDataSchema: string
  ) {}

  async getOverview(): Promise<Overview> {
    const [
      accounts,
      orders,
      sales,
      finance,
      sync
    ] = await Promise.all([
      this.getAccountCount(),
      this.getOrderSummary(),
      this.getSalesSummary(),
      this.getFinanceSummary(),
      this.getSyncSummary()
    ]);

    return {
      accounts,
      orders30d: orders.orders30d,
      orderAmount30d: orders.orderAmount30d,
      cancellations30d: orders.cancellations30d,
      sales30d: sales.sales30d,
      salesAmount30d: sales.salesAmount30d,
      productsSold30d: sales.productsSold30d,
      payoutAmount: finance.payoutAmount,
      logisticsCost: finance.logisticsCost,
      storageCost: finance.storageCost,
      lastSaleAt: sales.lastSaleAt,
      sync
    };
  }

  async getAccounts(): Promise<AccountRow[]> {
    if (!(await this.tableExists('wb_accounts'))) {
      return [];
    }

    const table = qualifiedName(this.wbDataSchema, 'wb_accounts');
    const result = await this.pool.query<{
      id: string;
      account_code: string;
      account_name: string;
      enabled: boolean;
    }>(`
      select id, account_code, account_name, enabled
      from ${table}
      order by enabled desc, account_name, id
    `);

    return result.rows.map((row) => ({
      id: row.id,
      accountCode: row.account_code,
      accountName: row.account_name,
      enabled: row.enabled
    }));
  }

  async getFinanceWeeklyReports(options: {
    accountId: string;
    recentOnly: boolean;
  }): Promise<FinanceWeeklyReportRow[]> {
    if (!(await this.tableExists('wb_finance_sales_report_weekly_enriched'))) {
      return [];
    }

    const table = qualifiedName(this.wbDataSchema, 'wb_finance_sales_report_weekly_enriched');
    const periodFilter = options.recentOnly
      ? `
        and (date_from, date_to) in (
          select date_from, date_to
          from (
            select distinct date_from, date_to
            from ${table}
            where account_id = $1
            order by date_from desc, date_to desc
            limit 3
          ) recent_periods
        )
      `
      : '';

    const result = await this.pool.query<{
      period: string;
      date_from: string;
      date_to: string;
      report_id: string;
      vendor_code: string;
      sales_kgs: string | null;
      payout_kgs: string | null;
      profit_kgs: string | null;
    }>(
      `
        select
          to_char(date_from::date, 'DD.MM.YYYY') || ' - ' || to_char(date_to::date, 'DD.MM.YYYY') as period,
          date_from::text,
          date_to::text,
          report_id::text,
          coalesce(nullif(trim(vendor_code), ''), 'Прочие расходы') as vendor_code,
          coalesce(sum(for_pay), 0) as sales_kgs,
          coalesce(sum(total_to_pay), 0) as payout_kgs,
          coalesce(sum(profit), 0) as profit_kgs
        from ${table}
        where account_id = $1
        ${periodFilter}
        group by date_from, date_to, report_id, coalesce(nullif(trim(vendor_code), ''), 'Прочие расходы')
        order by date_from desc, date_to desc, report_id desc, vendor_code
      `,
      [options.accountId]
    );

    return result.rows.map((row) => ({
      period: row.period,
      dateFrom: row.date_from,
      dateTo: row.date_to,
      reportId: row.report_id,
      vendorCode: row.vendor_code,
      salesKgs: Number(row.sales_kgs ?? 0),
      payoutKgs: Number(row.payout_kgs ?? 0),
      profitKgs: Number(row.profit_kgs ?? 0)
    }));
  }

  async getCostPrices(accountId: string): Promise<CostPriceRow[]> {
    if (!(await this.tableExists('dic_cost_price'))) {
      return [];
    }

    const table = qualifiedName(this.wbDataSchema, 'dic_cost_price');
    const result = await this.pool.query<{
      id: string;
      account_id: string;
      vendor_code: string;
      cost: string | null;
      valid_from: string | null;
      valid_to: string | null;
      updated_at: string | null;
    }>(
      `
        select
          id::text,
          account_id::text,
          vendor_code,
          cost,
          valid_from::text,
          valid_to::text,
          updated_at::text
        from ${table}
        where account_id = $1
        order by vendor_code
      `,
      [accountId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      vendorCode: row.vendor_code,
      cost: Number(row.cost ?? 0),
      validFrom: row.valid_from,
      validTo: row.valid_to,
      updatedAt: row.updated_at
    }));
  }

  async updateCostPrice(id: string, cost: number): Promise<CostPriceRow | null> {
    if (!(await this.tableExists('dic_cost_price'))) {
      return null;
    }

    const table = qualifiedName(this.wbDataSchema, 'dic_cost_price');
    const result = await this.pool.query<{
      id: string;
      account_id: string;
      vendor_code: string;
      cost: string | null;
      valid_from: string | null;
      valid_to: string | null;
      updated_at: string | null;
    }>(
      `
        update ${table}
        set cost = $2,
            updated_at = now()
        where id = $1
        returning
          id::text,
          account_id::text,
          vendor_code,
          cost,
          valid_from::text,
          valid_to::text,
          updated_at::text
      `,
      [id, cost]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      accountId: row.account_id,
      vendorCode: row.vendor_code,
      cost: Number(row.cost ?? 0),
      validFrom: row.valid_from,
      validTo: row.valid_to,
      updatedAt: row.updated_at
    };
  }

  async getProducts(limit: number): Promise<ProductRow[]> {
    if (await this.tableExists('wb_finance_weekly_summary_by_sku')) {
      const table = qualifiedName(this.wbDataSchema, 'wb_finance_weekly_summary_by_sku');
      const result = await this.pool.query<{
        nm_id: string | null;
        title: string | null;
        brand_name: string | null;
        vendor_code: string | null;
        quantity: string | null;
        revenue: string | null;
        payout: string | null;
        last_seen_at: string | null;
      }>(
        `
          select
            nullif(nm_id, 0) as nm_id,
            max(nullif(title, 'N/A')) as title,
            max(nullif(brand_name, 'N/A')) as brand_name,
            max(nullif(vendor_code, 'N/A')) as vendor_code,
            coalesce(sum(quantity), 0) as quantity,
            coalesce(sum(sale_amount), 0) as revenue,
            coalesce(sum(total_to_pay), 0) as payout,
            max(report_created_date)::text as last_seen_at
          from ${table}
          group by nm_id, sku
          order by coalesce(sum(sale_amount), 0) desc
          limit $1
        `,
        [limit]
      );
      return result.rows.map(mapProductRow);
    }

    if (!(await this.tableExists('wb_sales'))) {
      return [];
    }

    const table = qualifiedName(this.wbDataSchema, 'wb_sales');
    const result = await this.pool.query<{
      nm_id: string | null;
      title: string | null;
      brand_name: string | null;
      vendor_code: string | null;
      quantity: string | null;
      revenue: string | null;
      payout: string | null;
      last_seen_at: string | null;
    }>(
      `
        select
          nm_id,
          max(nullif(subject, '')) as title,
          max(nullif(brand, '')) as brand_name,
          max(nullif(supplier_article, '')) as vendor_code,
          count(*) as quantity,
          coalesce(sum(finished_price), 0) as revenue,
          coalesce(sum(for_pay), 0) as payout,
          max(sale_date)::text as last_seen_at
        from ${table}
        where sale_date >= now() - interval '90 days'
        group by nm_id
        order by coalesce(sum(for_pay), 0) desc
        limit $1
      `,
      [limit]
    );

    return result.rows.map(mapProductRow);
  }

  async getSyncStates(limit = 50): Promise<SyncStateRow[]> {
    const hasAccounts = await this.tableExists('wb_accounts');
    const hasWorkers = await this.tableExists('wb_sync_workers');
    const hasState = await this.tableExists('wb_sync_state');
    if (!hasAccounts || !hasWorkers || !hasState) {
      return [];
    }

    const accounts = qualifiedName(this.wbDataSchema, 'wb_accounts');
    const workers = qualifiedName(this.wbDataSchema, 'wb_sync_workers');
    const state = qualifiedName(this.wbDataSchema, 'wb_sync_state');
    const result = await this.pool.query<{
      account_name: string;
      api_type: string;
      status: string | null;
      last_success_at: string | null;
      last_error_message: string | null;
    }>(
      `
        select
          a.account_name,
          w.api_type,
          s.status,
          s.last_success_at::text,
          s.last_error_message
        from ${workers} w
        join ${accounts} a on a.id = w.account_id
        left join ${state} s on s.account_id = w.account_id and s.api_type = w.api_type
        order by coalesce(s.last_success_at, s.last_started_at) desc nulls last, a.account_name, w.api_type
        limit $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      accountName: row.account_name,
      apiType: row.api_type,
      status: row.status,
      lastSuccessAt: row.last_success_at,
      lastErrorMessage: row.last_error_message
    }));
  }

  async tableExists(tableName: string) {
    const result = await this.pool.query<{ exists: string | null }>(
      'select to_regclass($1) as exists',
      [regclassName(this.wbDataSchema, tableName)]
    );
    return result.rows[0]?.exists !== null;
  }

  private async getAccountCount() {
    if (!(await this.tableExists('wb_accounts'))) {
      return 0;
    }
    const table = qualifiedName(this.wbDataSchema, 'wb_accounts');
    const result = await this.pool.query<CountRow>(`select count(*) from ${table} where enabled is true`);
    return Number(result.rows[0]?.count ?? 0);
  }

  private async getOrderSummary() {
    if (!(await this.tableExists('wb_orders'))) {
      return { orders30d: 0, orderAmount30d: 0, cancellations30d: 0 };
    }
    const table = qualifiedName(this.wbDataSchema, 'wb_orders');
    const result = await this.pool.query<{
      orders_30d: string;
      order_amount_30d: string | null;
      cancellations_30d: string;
    }>(`
      select
        count(*) as orders_30d,
        coalesce(sum(price_with_disc), 0) as order_amount_30d,
        count(*) filter (where is_cancel is true) as cancellations_30d
      from ${table}
      where order_date >= now() - interval '30 days'
    `);

    const row = result.rows[0];
    return {
      orders30d: Number(row?.orders_30d ?? 0),
      orderAmount30d: Number(row?.order_amount_30d ?? 0),
      cancellations30d: Number(row?.cancellations_30d ?? 0)
    };
  }

  private async getSalesSummary() {
    if (!(await this.tableExists('wb_sales'))) {
      return { sales30d: 0, salesAmount30d: 0, productsSold30d: 0, lastSaleAt: null };
    }
    const table = qualifiedName(this.wbDataSchema, 'wb_sales');
    const result = await this.pool.query<{
      sales_30d: string;
      sales_amount_30d: string | null;
      products_sold_30d: string;
      last_sale_at: string | null;
    }>(`
      select
        count(*) as sales_30d,
        coalesce(sum(for_pay), 0) as sales_amount_30d,
        count(distinct nm_id) filter (where nm_id is not null) as products_sold_30d,
        max(sale_date)::text as last_sale_at
      from ${table}
      where sale_date >= now() - interval '30 days'
    `);

    const row = result.rows[0];
    return {
      sales30d: Number(row?.sales_30d ?? 0),
      salesAmount30d: Number(row?.sales_amount_30d ?? 0),
      productsSold30d: Number(row?.products_sold_30d ?? 0),
      lastSaleAt: row?.last_sale_at ?? null
    };
  }

  private async getFinanceSummary() {
    if (!(await this.tableExists('wb_finance_weekly_summary'))) {
      return { payoutAmount: 0, logisticsCost: 0, storageCost: 0 };
    }
    const table = qualifiedName(this.wbDataSchema, 'wb_finance_weekly_summary');
    const result = await this.pool.query<{
      payout_amount: string | null;
      logistics_cost: string | null;
      storage_cost: string | null;
    }>(`
      select
        coalesce(sum(total_to_pay), 0) as payout_amount,
        coalesce(sum(logistics_cost), 0) as logistics_cost,
        coalesce(sum(storage_cost), 0) as storage_cost
      from ${table}
      where week_start >= current_date - interval '90 days'
    `);

    const row = result.rows[0];
    return {
      payoutAmount: Number(row?.payout_amount ?? 0),
      logisticsCost: Number(row?.logistics_cost ?? 0),
      storageCost: Number(row?.storage_cost ?? 0)
    };
  }

  private async getSyncSummary() {
    if (!(await this.tableExists('wb_sync_state'))) {
      return { totalWorkers: 0, healthyWorkers: 0, errorWorkers: 0, lastSuccessAt: null };
    }
    const table = qualifiedName(this.wbDataSchema, 'wb_sync_state');
    const result = await this.pool.query<{
      total_workers: string;
      healthy_workers: string;
      error_workers: string;
      last_success_at: string | null;
    }>(`
      select
        count(*) as total_workers,
        count(*) filter (where status in ('idle', 'running') and last_error_message is null) as healthy_workers,
        count(*) filter (where status = 'error' or last_error_message is not null) as error_workers,
        max(last_success_at)::text as last_success_at
      from ${table}
    `);

    const row = result.rows[0];
    return {
      totalWorkers: Number(row?.total_workers ?? 0),
      healthyWorkers: Number(row?.healthy_workers ?? 0),
      errorWorkers: Number(row?.error_workers ?? 0),
      lastSuccessAt: row?.last_success_at ?? null
    };
  }
}

function mapProductRow(row: {
  nm_id: string | null;
  title: string | null;
  brand_name: string | null;
  vendor_code: string | null;
  quantity: string | null;
  revenue: string | null;
  payout: string | null;
  last_seen_at: string | null;
}): ProductRow {
  return {
    nmId: row.nm_id === null ? null : Number(row.nm_id),
    title: row.title ?? 'Без названия',
    brand: row.brand_name ?? 'N/A',
    vendorCode: row.vendor_code ?? 'N/A',
    quantity: Number(row.quantity ?? 0),
    revenue: Number(row.revenue ?? 0),
    payout: Number(row.payout ?? 0),
    lastSeenAt: row.last_seen_at
  };
}
