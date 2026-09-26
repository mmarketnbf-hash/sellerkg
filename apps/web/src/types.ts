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

export type DataSource = {
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

export type CollectorRun = {
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

export type SyncState = {
  accountName: string;
  apiType: string;
  status: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
};

export type Account = {
  id: string;
  accountCode: string;
  accountName: string;
  enabled: boolean;
};

export type FinanceWeeklyReport = {
  period: string;
  dateFrom: string;
  dateTo: string;
  reportId: string;
  vendorCode: string;
  salesKgs: number;
  payoutKgs: number;
  profitKgs: number;
};

export type CostPrice = {
  id: string;
  accountId: string;
  vendorCode: string;
  cost: number;
  validFrom: string | null;
  validTo: string | null;
  updatedAt: string | null;
};
