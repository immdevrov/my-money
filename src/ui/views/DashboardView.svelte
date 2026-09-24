<script lang="ts">
  import { liveQuery } from 'dexie';
  import {
    compare,
    type Baseline,
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
  import { onHashChange, readQuery, replaceQuery } from '../hashQuery';

  type Tab = 'spending' | 'income';
  type QueryKey = 'type' | 'period' | 'baseline' | 'tab';

  const PERIOD_TYPES: readonly string[] = ['month', 'quarter', 'year'];
  const BASELINES: readonly string[] = ['mean', 'median', 'previous'];
  const TABS: readonly string[] = ['spending', 'income'];

  const transactions = liveQuery(async () => listAll());
  const categories = liveQuery(async () => listCategories());

  function dashboardQuery(): Record<QueryKey, string> {
    const params = readQuery();
    return {
      type: params.get('type') ?? '',
      period: params.get('period') ?? '',
      baseline: params.get('baseline') ?? '',
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
  const baseline = $derived(
    BASELINES.includes(query.baseline) ? (query.baseline as Baseline) : 'mean',
  );
  const activeTab = $derived(TABS.includes(query.tab) ? (query.tab as Tab) : 'spending');

  function update(changes: Partial<Record<QueryKey, string>>) {
    query = { ...query, ...changes };
    replaceQuery({ type: periodType, period: query.period, baseline, tab: activeTab });
  }

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
      baseline,
    });

    return {
      period,
      options,
      spending: comparison.spending,
      income: comparison.income,
      missingRate: comparison.missingRate,
    };
  });

  function missingRateText(n: number): string {
    const noun = n === 1 ? 'transaction' : 'transactions';
    return `${n} ${noun} excluded from totals: no exchange rate.`;
  }

  function signed(minor: number): string {
    return minor > 0 ? `+${formatMinor(minor)}` : formatMinor(minor);
  }

  function percent(value: number | null): string {
    if (value === null) return '—';
    return value > 0 ? `+${value}%` : `${value}%`;
  }

  function drillHref(period: string, category?: string): string {
    const params = new URLSearchParams({ period });
    if (category !== undefined) params.set('category', category);
    return `#/transactions?${params}`;
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
    <p class="field">
      <label for="dashboard-baseline">Baseline</label>
      <select
        id="dashboard-baseline"
        value={baseline}
        onchange={(event) => update({ baseline: event.currentTarget.value })}
      >
        <option value="mean">Mean</option>
        <option value="median">Median</option>
        <option value="previous">Previous period</option>
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
      {@render comparisonTable('Spending comparison', view.spending, view.period)}
    </div>
  {:else}
    <div
      class="tabpanel"
      role="tabpanel"
      id="dashboard-panel-income"
      aria-labelledby="dashboard-tab-income"
    >
      {@render comparisonTable('Income comparison', view.income, view.period)}
    </div>
  {/if}
{/if}

{#snippet comparisonTable(caption: string, tableData: ComparisonTable, period: string)}
  <table>
    <caption>{caption}</caption>
    <thead>
      <tr>
        <th scope="col">Category</th>
        <th scope="col" class="number">Current</th>
        <th scope="col" class="number">Baseline</th>
        <th scope="col" class="number">Change</th>
        <th scope="col" class="number">Change %</th>
      </tr>
    </thead>
    <tbody>
      {#each tableData.rows as row (row.categoryId)}
        {@render comparisonRow(row, drillHref(period, row.categoryId ?? 'uncategorized'))}
      {/each}
    </tbody>
    <tfoot>
      {@render comparisonRow(tableData.total, drillHref(period))}
    </tfoot>
  </table>
{/snippet}

{#snippet comparisonRow(row: ComparisonRow, href: string)}
  <tr>
    <th scope="row"><a {href}>{row.name}</a></th>
    <td class="number">{formatMinor(row.current)}</td>
    {#if row.baseline === 'insufficient'}
      <td class="number">insufficient data</td>
      <td class="number"></td>
      <td class="number"></td>
    {:else}
      <td class="number">{formatMinor(row.baseline)}</td>
      <td class="number">{row.delta === null ? '' : signed(row.delta)}</td>
      <td class="number">{percent(row.deltaPct)}</td>
    {/if}
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
  }

  tfoot th,
  tfoot td {
    font-weight: 600;
    border-top: 2px solid var(--border);
  }
</style>
