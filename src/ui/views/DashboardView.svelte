<script lang="ts">
  import { liveQuery } from 'dexie';
  import {
    compare,
    WINDOW_SIZE,
    type Baseline,
    type BaselineResult,
    type ComparisonRow,
    type ComparisonTable,
  } from '../../aggregate/compare';
  import {
    dashboardPeriods,
    localToday,
    periodLabel,
    type PeriodType,
  } from '../../aggregate/period';
  import { listCategories } from '../../db/categories';
  import { listAll } from '../../db/transactions';
  import { formatMinor } from '../../import/amount';
  import Chart, { type ChartSeries } from '../charts/Chart.svelte';
  import { onHashChange, readQuery, replaceQuery } from '../hashQuery';

  type Tab = 'spending' | 'income';
  type QueryKey = 'type' | 'period' | 'tab';

  type BaselineColumn = { baseline: Baseline; label: string; vsLabel: string };

  const PERIOD_TYPES: readonly string[] = ['month', 'quarter', 'year'];
  const TABS: readonly string[] = ['spending', 'income'];

  const transactions = liveQuery(async () => listAll());
  const categories = liveQuery(async () => listCategories());

  function dashboardQuery(): Record<QueryKey, string> {
    const params = readQuery();
    return {
      type: params.get('type') ?? '',
      period: params.get('period') ?? '',
      tab: params.get('tab') ?? '',
    };
  }

  let query = $state(dashboardQuery());

  $effect(() =>
    onHashChange(() => {
      query = dashboardQuery();
    }),
  );

  const periodType = $derived(
    PERIOD_TYPES.includes(query.type) ? (query.type as PeriodType) : 'month',
  );
  const activeTab = $derived(TABS.includes(query.tab) ? (query.tab as Tab) : 'spending');

  const baselineColumns = $derived.by((): BaselineColumn[] => {
    const noun = periodType;
    const window = `${WINDOW_SIZE[periodType]} ${noun}s`;
    const columns: BaselineColumn[] = [
      { baseline: 'mean', label: `Mean (${window})`, vsLabel: 'vs mean' },
      { baseline: 'median', label: `Median (${window})`, vsLabel: 'vs median' },
      { baseline: 'previous', label: `Previous ${noun}`, vsLabel: `vs previous ${noun}` },
    ];
    if (periodType !== 'year') {
      columns.push({
        baseline: 'yearAgo',
        label: `Same ${noun} last year`,
        vsLabel: `vs same ${noun} last year`,
      });
    }
    return columns;
  });

  let spendingTabEl = $state<HTMLButtonElement | null>(null);
  let incomeTabEl = $state<HTMLButtonElement | null>(null);

  const view = $derived.by(() => {
    const rows = $transactions;
    const cats = $categories;
    if (rows === undefined || cats === undefined || rows.length === 0) return null;

    const today = localToday(new Date());
    const { span, current, defaultPeriod } = dashboardPeriods(rows, today, periodType);
    const period = span.includes(query.period) ? query.period : defaultPeriod;

    const options = span.map((value) => ({
      value,
      label: value === current ? `${periodLabel(value)} (in progress)` : periodLabel(value),
    }));

    const comparison = compare({
      rows,
      categories: cats,
      today,
      type: periodType,
      period,
    });

    return {
      period,
      options,
      spending: comparison.spending,
      income: comparison.income,
      missingRate: comparison.missingRate,
    };
  });

  function update(changes: Partial<Record<QueryKey, string>>) {
    query = { ...query, ...changes };
    replaceQuery({
      type: periodType,
      period: view?.period ?? query.period,
      tab: activeTab,
    });
  }

  function missingRateText(n: number): string {
    const noun = n === 1 ? 'transaction' : 'transactions';
    return `${n} ${noun} excluded from totals: no exchange rate.`;
  }

  function vsText({ delta, deltaPct }: BaselineResult): string {
    if (delta === null) return '';
    const change = delta > 0 ? `+${formatMinor(delta)}` : formatMinor(delta);
    const percent = deltaPct === null ? '—' : deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`;
    return `${change} (${percent})`;
  }

  function drillHref(period: string, category?: string): string {
    const params = new URLSearchParams({ period });
    if (category !== undefined) params.set('category', category);
    return `#/transactions?${params}`;
  }

  function rowHref(period: string, row: ComparisonRow): string {
    return drillHref(period, row.categoryId ?? 'uncategorized');
  }

  function categorySeries(tableData: ComparisonTable, color: string): ChartSeries[] {
    const series: ChartSeries[] = [
      { label: 'Current', values: tableData.rows.map((row) => row.current), color },
    ];
    const mean = baselineColumns.find((column) => column.baseline === 'mean');
    if (mean !== undefined && tableData.total.mean.value !== 'insufficient') {
      series.push({
        label: mean.label,
        values: tableData.rows.map((row) => (row.mean.value === 'insufficient' ? 0 : row.mean.value)),
        color: '--chart-baseline',
      });
    }
    return series;
  }

  function selectTab(tab: Tab) {
    update({ tab });
  }

  function onTabKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    selectTab(activeTab === 'spending' ? 'income' : 'spending');
    (activeTab === 'spending' ? spendingTabEl : incomeTabEl)?.focus();
  }
</script>

<h1>Dashboard</h1>

{#if $transactions !== undefined && $transactions.length === 0}
  <p>No transactions yet. Import a statement to see the dashboard.</p>
{:else if view}
  <div class="pickers">
    <p class="field">
      <label for="dashboard-period-type">Period type</label>
      <select
        id="dashboard-period-type"
        value={periodType}
        onchange={(event) => update({ type: event.currentTarget.value, period: '' })}
      >
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
      </select>
    </p>
    <p class="field">
      <label for="dashboard-period">Period</label>
      <select
        id="dashboard-period"
        value={view.period}
        onchange={(event) => update({ period: event.currentTarget.value })}
      >
        {#each view.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </p>
  </div>

  {#if view.missingRate > 0}
    <p>{missingRateText(view.missingRate)}</p>
  {/if}

  <div class="tabs" role="tablist" aria-label="Comparison">
    <button
      type="button"
      role="tab"
      id="dashboard-tab-spending"
      aria-selected={activeTab === 'spending'}
      aria-controls="dashboard-panel-spending"
      tabindex={activeTab === 'spending' ? 0 : -1}
      bind:this={spendingTabEl}
      onclick={() => selectTab('spending')}
      onkeydown={onTabKeydown}
    >
      Spending
    </button>
    <button
      type="button"
      role="tab"
      id="dashboard-tab-income"
      aria-selected={activeTab === 'income'}
      aria-controls="dashboard-panel-income"
      tabindex={activeTab === 'income' ? 0 : -1}
      bind:this={incomeTabEl}
      onclick={() => selectTab('income')}
      onkeydown={onTabKeydown}
    >
      Income
    </button>
  </div>

  {#if activeTab === 'spending'}
    <div
      class="tabpanel"
      role="tabpanel"
      id="dashboard-panel-spending"
      aria-labelledby="dashboard-tab-spending"
    >
      {@render categoryChart('Spending by category', '--chart-spending', view.spending, view.period)}
      {@render comparisonTable('Spending comparison', view.spending, view.period)}
    </div>
  {:else}
    <div
      class="tabpanel"
      role="tabpanel"
      id="dashboard-panel-income"
      aria-labelledby="dashboard-tab-income"
    >
      {@render categoryChart('Income by category', '--chart-income', view.income, view.period)}
      {@render comparisonTable('Income comparison', view.income, view.period)}
    </div>
  {/if}
{/if}

{#snippet categoryChart(name: string, color: string, tableData: ComparisonTable, period: string)}
  {#if tableData.rows.length > 0}
    <Chart
      kind="bar"
      {name}
      labelHeader="Category"
      labels={tableData.rows.map((row) => row.name)}
      series={categorySeries(tableData, color)}
      onselect={(index) => {
        const row = tableData.rows[index];
        if (row !== undefined) location.hash = rowHref(period, row);
      }}
    />
  {/if}
{/snippet}

{#snippet comparisonTable(caption: string, tableData: ComparisonTable, period: string)}
  <div class="table-scroll">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col" class="number">Current</th>
          {#each baselineColumns as column (column.baseline)}
            <th scope="col" class="number">{column.label}</th>
            <th scope="col" class="number">{column.vsLabel}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each tableData.rows as row (row.categoryId)}
          {@render comparisonRow(row, rowHref(period, row))}
        {/each}
      </tbody>
      <tfoot>
        {@render comparisonRow(tableData.total, drillHref(period))}
      </tfoot>
    </table>
  </div>
{/snippet}

{#snippet comparisonRow(row: ComparisonRow, href: string)}
  <tr>
    <th scope="row"><a {href}>{row.name}</a></th>
    <td class="number">{formatMinor(row.current)}</td>
    {#each baselineColumns as column (column.baseline)}
      {@const result = row[column.baseline]}
      {#if result !== null}
        <td class="number">
          {result.value === 'insufficient' ? 'insufficient data' : formatMinor(result.value)}
        </td>
        <td class="number">{vsText(result)}</td>
      {/if}
    {/each}
  </tr>
{/snippet}

<style>
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .tabs {
    display: flex;
    gap: var(--space-3);
    border-bottom: 1px solid var(--border);
    margin-top: var(--space-3);
  }

  .tabs button {
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-2) var(--space-1);
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  .tabpanel {
    margin-top: var(--space-2);
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: var(--space-2);
  }

  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: var(--space-1) var(--space-2);
    text-align: left;
  }

  th a {
    color: var(--accent);
  }

  .number {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  tfoot th,
  tfoot td {
    font-weight: 600;
    border-top: 2px solid var(--border);
  }
</style>
