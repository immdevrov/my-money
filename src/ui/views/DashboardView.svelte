<script lang="ts">
  import { liveQuery } from 'dexie';
  import { compare, type ComparisonRow } from '../../aggregate/compare';
  import { localToday, periodLabel, periodOf, periodsInSpan } from '../../aggregate/period';
  import { listCategories } from '../../db/categories';
  import { listAll } from '../../db/transactions';
  import { formatMinor } from '../../import/amount';

  const TYPE = 'month';
  const BASELINE = 'mean';

  const transactions = liveQuery(async () => listAll());
  const categories = liveQuery(async () => listCategories());

  let chosenPeriod = $state<string | null>(null);

  const view = $derived.by(() => {
    const rows = $transactions;
    if (rows === undefined || rows.length === 0) return null;

    const today = localToday(new Date());
    const earliest = rows.reduce(
      (min, row) => (row.effectiveDate < min ? row.effectiveDate : min),
      today,
    );
    const span = periodsInSpan(earliest, today, TYPE);
    const current = periodOf(today, TYPE);
    const fallback = span[1] ?? current;
    const period = chosenPeriod !== null && span.includes(chosenPeriod) ? chosenPeriod : fallback;

    const options = span.map((value) => ({
      value,
      label: value === current ? `${periodLabel(value)} (in progress)` : periodLabel(value),
    }));

    const comparison = compare({
      rows,
      categories: $categories ?? [],
      today,
      type: TYPE,
      period,
      baseline: BASELINE,
    });

    return { period, options, spending: comparison.spending };
  });

  function signed(minor: number): string {
    return minor > 0 ? `+${formatMinor(minor)}` : formatMinor(minor);
  }

  function percent(value: number | null): string {
    if (value === null) return '—';
    return value > 0 ? `+${value}%` : `${value}%`;
  }
</script>

<h1>Dashboard</h1>

{#if $transactions !== undefined && $transactions.length === 0}
  <p>No transactions yet. Import a statement to see the dashboard.</p>
{:else if view}
  <div class="pickers">
    <p class="field">
      <label for="dashboard-period">Period</label>
      <select
        id="dashboard-period"
        value={view.period}
        onchange={(event) => (chosenPeriod = event.currentTarget.value)}
      >
        {#each view.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </p>
  </div>

  <table>
    <caption>Spending comparison</caption>
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
      {#each view.spending.rows as row (row.categoryId)}
        {@render comparisonRow(row)}
      {/each}
    </tbody>
    <tfoot>
      {@render comparisonRow(view.spending.total)}
    </tfoot>
  </table>
{/if}

{#snippet comparisonRow(row: ComparisonRow)}
  <tr>
    <th scope="row">{row.name}</th>
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
