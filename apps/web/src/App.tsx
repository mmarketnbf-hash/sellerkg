import {
  Activity,
  AlertTriangle,
  Database,
  Download,
  Edit3,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  Table2
} from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  fetchAccounts,
  fetchCostPrices,
  fetchEvents,
  fetchFinanceWeeklyReports,
  fetchRuns,
  fetchSources,
  fetchSyncStates,
  runSource,
  updateCostPrice,
  updateSource
} from './api';
import type {
  Account,
  CollectorRun,
  CostPrice,
  DataSource,
  EventRow,
  FinanceWeeklyReport,
  SyncState
} from './types';

type View = 'dashboard' | 'reports' | 'costs' | 'sources' | 'runs';

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [recentReports, setRecentReports] = useState<FinanceWeeklyReport[]>([]);
  const [allReports, setAllReports] = useState<FinanceWeeklyReport[]>([]);
  const [costPrices, setCostPrices] = useState<CostPrice[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [runs, setRuns] = useState<CollectorRun[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const filteredCosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return costPrices;
    }
    return costPrices.filter((row) => row.vendorCode.toLowerCase().includes(normalized));
  }, [costPrices, query]);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }
    window.localStorage.setItem('sellerkg.accountId', selectedAccountId);
    void loadAccountData(selectedAccountId, view);
  }, [selectedAccountId, view]);

  async function loadInitialData() {
    setLoading(true);
    setError(null);
    try {
      const [nextAccounts, nextSources, nextRuns, nextEvents, nextSyncStates] = await Promise.all([
        fetchAccounts(),
        fetchSources(),
        fetchRuns(),
        fetchEvents(),
        fetchSyncStates()
      ]);

      setAccounts(nextAccounts);
      setSources(nextSources);
      setRuns(nextRuns);
      setEvents(nextEvents);
      setSyncStates(nextSyncStates);

      const savedAccountId = window.localStorage.getItem('sellerkg.accountId');
      const preferredAccount =
        nextAccounts.find((account) => account.id === savedAccountId) ??
        nextAccounts.find((account) => account.enabled) ??
        nextAccounts[0] ??
        null;

      setSelectedAccountId(preferredAccount?.id ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function loadAccountData(accountId: string, nextView = view) {
    setLoading(true);
    setError(null);
    try {
      const recent = await fetchFinanceWeeklyReports(accountId, 'recent');
      setRecentReports(recent);

      if (nextView === 'reports') {
        setAllReports(await fetchFinanceWeeklyReports(accountId, 'all'));
      }

      if (nextView === 'costs') {
        const costs = await fetchCostPrices(accountId);
        setCostPrices(costs);
        setCostDrafts(Object.fromEntries(costs.map((row) => [row.id, String(row.cost)])));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentView() {
    const [nextSources, nextRuns, nextEvents, nextSyncStates] = await Promise.all([
      fetchSources(),
      fetchRuns(),
      fetchEvents(),
      fetchSyncStates()
    ]);

    setSources(nextSources);
    setRuns(nextRuns);
    setEvents(nextEvents);
    setSyncStates(nextSyncStates);

    if (selectedAccountId) {
      await loadAccountData(selectedAccountId, view);
    }
  }

  async function handleRunSource(sourceId: string) {
    setActionId(sourceId);
    setError(null);
    try {
      await runSource(sourceId);
      await refreshCurrentView();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setActionId(null);
    }
  }

  async function handleToggleSource(source: DataSource) {
    setActionId(source.id);
    setError(null);
    try {
      await updateSource(source.id, {
        status: source.status === 'active' ? 'paused' : 'active'
      });
      await refreshCurrentView();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setActionId(null);
    }
  }

  async function saveCost(row: CostPrice) {
    const draft = costDrafts[row.id] ?? '0';
    const nextCost = Number(draft.replace(',', '.'));

    if (!Number.isFinite(nextCost) || nextCost < 0) {
      setError('Себестоимость должна быть неотрицательным числом.');
      return;
    }

    setActionId(`cost:${row.id}`);
    setError(null);
    try {
      const updated = await updateCostPrice(row.id, nextCost);
      setCostPrices((current) => current.map((item) => (item.id === row.id ? updated : item)));
      setCostDrafts((current) => ({ ...current, [row.id]: String(updated.cost) }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setActionId(null);
    }
  }

  function openReports() {
    setView('reports');
  }

  function openCosts() {
    setView('costs');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setView('dashboard')}>
          <Database size={22} aria-hidden />
          <span>
            <strong>SellerKG</strong>
            <small>WB control</small>
          </span>
        </button>

        <nav className="nav-list" aria-label="Разделы">
          <NavButton active={view === 'dashboard'} icon={<Activity size={18} />} label="Сводка" onClick={() => setView('dashboard')} />
          <NavButton active={view === 'reports'} icon={<Table2 size={18} />} label="Все отчеты" onClick={() => setView('reports')} />
          <NavButton active={view === 'costs'} icon={<Edit3 size={18} />} label="Себестоимость" onClick={() => setView('costs')} />
          <NavButton active={view === 'sources'} icon={<Settings size={18} />} label="Источники" onClick={() => setView('sources')} />
          <NavButton active={view === 'runs'} icon={<Table2 size={18} />} label="Журнал" onClick={() => setView('runs')} />
        </nav>
      </aside>

      <main className="workspace">
        <header className="workspace-head">
          <div>
            <p className="eyebrow">WB seller subsystem</p>
            <h1>{getViewTitle(view)}</h1>
          </div>

          <div className="head-actions">
            <label className="account-select">
              <span>Магазин</span>
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                disabled={loading || !accounts.length}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </label>

            <button className="icon-button text-button" type="button" onClick={() => void refreshCurrentView()} disabled={loading}>
              <RefreshCw size={18} aria-hidden />
              <span>{loading ? 'Обновление' : 'Обновить'}</span>
            </button>
          </div>
        </header>

        {error ? (
          <div className="notice error-notice">
            <AlertTriangle size={18} aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {view === 'dashboard' ? (
          <DashboardView
            reports={recentReports}
            account={selectedAccount}
            onOpenReports={openReports}
            onOpenCosts={openCosts}
          />
        ) : null}

        {view === 'reports' ? (
          <ReportsView
            reports={allReports}
            account={selectedAccount}
            onExport={() => exportReportsToExcel(allReports, selectedAccount?.accountName ?? 'store')}
          />
        ) : null}

        {view === 'costs' ? (
          <CostsView
            rows={filteredCosts}
            query={query}
            setQuery={setQuery}
            drafts={costDrafts}
            setDrafts={setCostDrafts}
            actionId={actionId}
            onSave={saveCost}
          />
        ) : null}

        {view === 'sources' ? (
          <SourcesView
            sources={sources}
            actionId={actionId}
            onRun={handleRunSource}
            onToggle={handleToggleSource}
          />
        ) : null}

        {view === 'runs' ? <RunsView runs={runs} events={events} syncStates={syncStates} /> : null}
      </main>
    </div>
  );
}

function NavButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${props.active ? 'active' : ''}`} type="button" onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function DashboardView(props: {
  reports: FinanceWeeklyReport[];
  account: Account | null;
  onOpenReports: () => void;
  onOpenCosts: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head finance-head">
        <div>
          <h2>{props.account ? `Финансовые отчеты: ${props.account.accountName}` : 'Финансовые отчеты'}</h2>
          <p>Последние три недели по дате отчета.</p>
        </div>
        <div className="panel-actions">
          <button className="icon-button text-button" type="button" onClick={props.onOpenReports}>
            <Table2 size={18} aria-hidden />
            <span>Все отчеты</span>
          </button>
          <button className="icon-button text-button" type="button" onClick={props.onOpenCosts}>
            <Edit3 size={18} aria-hidden />
            <span>Задать себестоимость</span>
          </button>
        </div>
      </div>

      <FinanceReportTable reports={props.reports} />
    </section>
  );
}

function ReportsView(props: {
  reports: FinanceWeeklyReport[];
  account: Account | null;
  onExport: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head finance-head">
        <div>
          <h2>{props.account ? `Все отчеты: ${props.account.accountName}` : 'Все отчеты'}</h2>
          <p>Все доступные строки из недельного обогащенного финансового отчета.</p>
        </div>
        <button className="icon-button text-button" type="button" onClick={props.onExport} disabled={!props.reports.length}>
          <Download size={18} aria-hidden />
          <span>Выгрузить в Excel</span>
        </button>
      </div>
      <FinanceReportTable reports={props.reports} />
    </section>
  );
}

function FinanceReportTable(props: { reports: FinanceWeeklyReport[] }) {
  const groups = groupReportsByReport(props.reports);

  return (
    <div className="table-wrap">
      <table className="finance-table">
        <thead>
          <tr>
            <th>Период</th>
            <th>Номер отчета</th>
            <th>Артикул продавца</th>
            <th>Продажи, KGS</th>
            <th>На РС, KGS</th>
            <th>Прибыль, KGS</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <FinanceSummaryRow period={group.period} reportId={group.reportId} total={group.total} />
              {group.reports.map((report) => (
                <tr key={`${report.dateFrom}:${report.dateTo}:${report.reportId}:${report.vendorCode}`}>
                  <td>{report.period}</td>
                  <td>{report.reportId}</td>
                  <td className="title-cell">{report.vendorCode}</td>
                  <td>{formatKgs(report.salesKgs)}</td>
                  <td>{formatKgs(report.payoutKgs)}</td>
                  <td className={report.profitKgs < 0 ? 'metric-negative' : 'metric-positive'}>
                    {formatKgs(report.profitKgs)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          {!props.reports.length ? <EmptyRow colSpan={6} label="Нет данных" /> : null}
        </tbody>
      </table>
    </div>
  );
}

function FinanceSummaryRow(props: {
  period: string;
  reportId: string;
  total: { salesKgs: number; payoutKgs: number; profitKgs: number };
}) {
  return (
    <tr className="summary-row">
      <td>{props.period}</td>
      <td>{props.reportId}</td>
      <td className="title-cell">Итого</td>
      <td>{formatKgs(props.total.salesKgs)}</td>
      <td>{formatKgs(props.total.payoutKgs)}</td>
      <td className={props.total.profitKgs < 0 ? 'metric-negative' : 'metric-positive'}>
        {formatKgs(props.total.profitKgs)}
      </td>
    </tr>
  );
}

function CostsView(props: {
  rows: CostPrice[];
  query: string;
  setQuery: (query: string) => void;
  drafts: Record<string, string>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  actionId: string | null;
  onSave: (row: CostPrice) => Promise<void>;
}) {
  return (
    <section className="panel">
      <div className="panel-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden />
          <input
            value={props.query}
            onChange={(event) => props.setQuery(event.target.value)}
            placeholder="Артикул продавца"
          />
        </label>
      </div>

      <div className="table-wrap">
        <table className="cost-table">
          <thead>
            <tr>
              <th>Артикул продавца</th>
              <th>Себестоимость, KGS</th>
              <th>Действует с</th>
              <th>Действует до</th>
              <th>Обновлено</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.id}>
                <td className="title-cell">{row.vendorCode}</td>
                <td>
                  <input
                    className="number-input"
                    value={props.drafts[row.id] ?? String(row.cost)}
                    onChange={(event) =>
                      props.setDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                  />
                </td>
                <td>{formatDate(row.validFrom)}</td>
                <td>{formatDate(row.validTo)}</td>
                <td>{formatDate(row.updatedAt)}</td>
                <td>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void props.onSave(row)}
                    disabled={props.actionId === `cost:${row.id}`}
                    title="Сохранить"
                  >
                    <Save size={18} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
            {!props.rows.length ? <EmptyRow colSpan={6} label="Нет данных" /> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourcesView(props: {
  sources: DataSource[];
  actionId: string | null;
  onRun: (sourceId: string) => Promise<void>;
  onToggle: (source: DataSource) => Promise<void>;
}) {
  return (
    <section className="source-grid">
      {props.sources.map((source) => (
        <article className="source-card" key={source.id}>
          <div className="source-card-head">
            <div>
              <h2>{source.name}</h2>
              <span>{source.kind}</span>
            </div>
            <StatusBadge value={source.status} />
          </div>
          <dl className="definition-grid">
            <dt>Интервал</dt>
            <dd>{Math.round(source.scheduleSeconds / 60)} мин</dd>
            <dt>Последний запуск</dt>
            <dd>{formatDate(source.lastRunAt)}</dd>
            <dt>Результат</dt>
            <dd>{source.lastMessage ?? 'N/A'}</dd>
          </dl>
          <div className="card-actions">
            <button className="icon-button" type="button" onClick={() => void props.onRun(source.id)} disabled={props.actionId === source.id} title="Запустить">
              <Play size={18} aria-hidden />
            </button>
            <button className="icon-button text-button" type="button" onClick={() => void props.onToggle(source)} disabled={props.actionId === source.id}>
              <span>{source.status === 'active' ? 'Пауза' : 'Активировать'}</span>
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function RunsView(props: { runs: CollectorRun[]; events: EventRow[]; syncStates: SyncState[] }) {
  return (
    <div className="screen-grid">
      <Panel title="Состояние загрузчиков">
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>Аккаунт</th>
                <th>API</th>
                <th>Статус</th>
                <th>Успех</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {props.syncStates.map((state) => (
                <tr key={`${state.accountName}:${state.apiType}`}>
                  <td>{state.accountName}</td>
                  <td>{state.apiType}</td>
                  <td><StatusBadge value={state.status ?? 'unknown'} /></td>
                  <td>{formatDate(state.lastSuccessAt)}</td>
                  <td>{state.lastErrorMessage ?? 'N/A'}</td>
                </tr>
              ))}
              {!props.syncStates.length ? <EmptyRow colSpan={5} label="Нет данных" /> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Запуски">
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Источник</th>
                <th>Старт</th>
                <th>Финиш</th>
                <th>Статус</th>
                <th>Строки</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {props.runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.id}</td>
                  <td>{run.sourceId}</td>
                  <td>{formatDate(run.startedAt)}</td>
                  <td>{formatDate(run.finishedAt)}</td>
                  <td><StatusBadge value={run.status} /></td>
                  <td>{run.rowsRead}/{run.rowsWritten}</td>
                  <td>{run.message ?? 'N/A'}</td>
                </tr>
              ))}
              {!props.runs.length ? <EmptyRow colSpan={7} label="Запусков нет" /> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="События">
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Тип</th>
                <th>Уровень</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {props.events.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.createdAt)}</td>
                  <td>{event.eventType}</td>
                  <td><StatusBadge value={event.severity} /></td>
                  <td>{event.message}</td>
                </tr>
              ))}
              {!props.events.length ? <EmptyRow colSpan={4} label="Событий нет" /> : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function StatusBadge(props: { value: string }) {
  const tone = ['success', 'active', 'idle', 'running', 'info'].includes(props.value)
    ? 'ok'
    : ['error', 'warning', 'paused'].includes(props.value)
      ? 'warn'
      : '';
  return <span className={`status-badge ${tone}`}>{props.value}</span>;
}

function EmptyRow(props: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="empty-cell" colSpan={props.colSpan}>{props.label}</td>
    </tr>
  );
}

function getViewTitle(view: View) {
  if (view === 'reports') {
    return 'Все отчеты';
  }
  if (view === 'costs') {
    return 'Себестоимость';
  }
  if (view === 'sources') {
    return 'Источники данных';
  }
  if (view === 'runs') {
    return 'Журнал';
  }
  return 'Сводка продавца';
}

function formatKgs(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'N/A';
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function groupReportsByReport(reports: FinanceWeeklyReport[]) {
  const groups = new Map<
    string,
    {
      key: string;
      period: string;
      dateFrom: string;
      dateTo: string;
      reportId: string;
      reports: FinanceWeeklyReport[];
      total: { salesKgs: number; payoutKgs: number; profitKgs: number };
    }
  >();

  for (const report of reports) {
    const key = `${report.dateFrom}:${report.dateTo}:${report.reportId}`;
    const group =
      groups.get(key) ??
      {
        key,
        period: report.period,
        dateFrom: report.dateFrom,
        dateTo: report.dateTo,
        reportId: report.reportId,
        reports: [],
        total: { salesKgs: 0, payoutKgs: 0, profitKgs: 0 }
      };

    group.reports.push(report);
    group.total.salesKgs += report.salesKgs;
    group.total.payoutKgs += report.payoutKgs;
    group.total.profitKgs += report.profitKgs;
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

function exportReportsToExcel(reports: FinanceWeeklyReport[], accountName: string) {
  const header = ['Период', 'Номер отчета', 'Артикул продавца', 'Продажи, KGS', 'На РС, KGS', 'Прибыль, KGS'];
  const groups = groupReportsByReport(reports);
  const rows = groups.flatMap((group) => [
    [
      group.period,
      group.reportId,
      'Итого',
      String(group.total.salesKgs),
      String(group.total.payoutKgs),
      String(group.total.profitKgs),
      'summary'
    ],
    ...group.reports.map((report) => [
      report.period,
      report.reportId,
      report.vendorCode,
      String(report.salesKgs),
      String(report.payoutKgs),
      String(report.profitKgs),
      ''
    ])
  ]);

  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>
          <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows
              .map((row) => {
                const isSummary = row[6] === 'summary';
                const cells = row.slice(0, 6);
                return `<tr${isSummary ? ' style="font-weight:700"' : ''}>${cells
                  .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                  .join('')}</tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sellerkg-${accountName}-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default App;
