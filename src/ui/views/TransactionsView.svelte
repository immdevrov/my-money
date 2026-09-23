<script lang="ts">
  import { liveQuery } from 'dexie';
  import type { Category, Transaction } from '../../domain/types';
  import { listCategories, saveCategory } from '../../db/categories';
  import { clearManualCategory, listAll, setManualCategory } from '../../db/transactions';
  import { toGelMinor } from '../../aggregate/convert';
  import { formatMinor } from '../../import/amount';
  import { buildRateTable, rateFor } from '../../pairing/rates';
  import CategoryForm from '../components/CategoryForm.svelte';

  const BASE_CURRENCY = 'GEL';
  const MISSING_RATE = 'no rate';
  const UNCATEGORIZED = 'uncategorized';
  const NEW_CATEGORY = 'new-category';

  type SortKey = 'effectiveDate' | 'postingDate' | 'kind' | 'counterparty' | 'amountMinor';

  const COLUMNS: { key: SortKey; label: string }[] = [
    { key: 'effectiveDate', label: 'Effective date' },
    { key: 'postingDate', label: 'Posting date' },
    { key: 'kind', label: 'Kind' },
    { key: 'counterparty', label: 'Counterparty' },
    { key: 'amountMinor', label: 'Amount' },
  ];

  const transactions = liveQuery(async () => listAll());
  const categories = liveQuery(async () => listCategories());

  let sortKey = $state<SortKey>('effectiveDate');
  let ascending = $state(false);
  let pendingSelections = $state<Record<string, string>>({});
  let newCategoryRow = $state<Transaction | null>(null);

  const sorted = $derived.by(() => {
    const rows = [...($transactions ?? [])];
    const direction = ascending ? 1 : -1;

    rows.sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      if (a === b) return left.id < right.id ? -1 : 1;
      return (a < b ? -1 : 1) * direction;
    });

    return rows;
  });

  function toggle(key: SortKey) {
    if (sortKey === key) ascending = !ascending;
    else {
      sortKey = key;
      ascending = true;
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return ascending ? 'ascending' : 'descending';
  }

  function amount(row: Transaction): string {
    return `${formatMinor(row.amountMinor)} ${row.currency}`;
  }

  const rateTable = $derived(
    buildRateTable(
      sorted
        .filter((row) => row.paired && row.currency !== BASE_CURRENCY)
        .flatMap((row) =>
          row.conversionRateScaled === null
            ? []
            : [{ date: row.postingDate, currency: row.currency, rateScaled: row.conversionRateScaled }],
        ),
    ),
  );

  function inGel(row: Transaction): string {
    if (row.currency === BASE_CURRENCY) return formatMinor(row.amountMinor);

    const rate = rateFor(rateTable, row.currency, row.effectiveDate);
    if (rate === null) return MISSING_RATE;

    return formatMinor(toGelMinor(row.amountMinor, rate.rateScaled));
  }

  function pairStatus(row: Transaction): string {
    if (row.kind !== 'conversion') return '';
    return row.paired ? 'paired' : 'unpaired';
  }

  function categoryName(categoryId: string | null): string {
    return ($categories ?? []).find((category) => category.id === categoryId)?.name ?? '';
  }

  function selectValue(row: Transaction): string {
    return pendingSelections[row.id] ?? row.categoryId ?? UNCATEGORIZED;
  }

  function clearPending(id: string) {
    if (!(id in pendingSelections)) return;
    const next = { ...pendingSelections };
    delete next[id];
    pendingSelections = next;
  }

  function onCategoryChange(row: Transaction, value: string) {
    if (value === NEW_CATEGORY) {
      pendingSelections = { ...pendingSelections, [row.id]: NEW_CATEGORY };
      newCategoryRow = row;
      return;
    }
    void setManualCategory(row.id, value);
  }

  function cancelNewCategory() {
    if (newCategoryRow) clearPending(newCategoryRow.id);
    newCategoryRow = null;
  }

  async function saveNewCategory(category: Category) {
    await saveCategory(category);
    if (newCategoryRow) {
      await setManualCategory(newCategoryRow.id, category.id);
      clearPending(newCategoryRow.id);
    }
    newCategoryRow = null;
  }
</script>

<h1>Transactions</h1>

{#if sorted.length === 0}
  <p>No transactions yet. Import a statement to get started.</p>
{:else}
  <table>
    <caption>Transactions</caption>
    <thead>
      <tr>
        {#each COLUMNS as column (column.key)}
          <th scope="col" aria-sort={ariaSort(column.key)}>
            <button type="button" onclick={() => toggle(column.key)}>{column.label}</button>
          </th>
        {/each}
        <th scope="col">Amount in GEL</th>
        <th scope="col">Pair status</th>
        <th scope="col">Category</th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as row (row.id)}
        <tr>
          <td>{row.effectiveDate}</td>
          <td>{row.postingDate}</td>
          <td>{row.kind}</td>
          <td>{row.counterparty}</td>
          <td>{amount(row)}</td>
          <td>{inGel(row)}</td>
          <td>{pairStatus(row)}</td>
          <td>
            {#if row.categorySource === 'system'}
              {categoryName(row.categoryId)}
            {:else}
              <select
                aria-label={`Category for ${row.counterparty}`}
                value={selectValue(row)}
                onchange={(event) => onCategoryChange(row, event.currentTarget.value)}
              >
                {#if row.categoryId === null}
                  <option value={UNCATEGORIZED} disabled selected>Uncategorized</option>
                {/if}
                {#each $categories ?? [] as category (category.id)}
                  <option value={category.id}>{category.name}</option>
                {/each}
                <option value={NEW_CATEGORY}>New category…</option>
              </select>
              {#if row.categorySource}
                <span>{row.categorySource}</span>
              {/if}
              {#if row.categorySource === 'manual'}
                <button type="button" onclick={() => void clearManualCategory(row.id)}>
                  Reset category for {row.counterparty}
                </button>
              {/if}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if newCategoryRow}
  <dialog open>
    <CategoryForm categories={$categories ?? []} onsave={saveNewCategory} oncancel={cancelNewCategory} />
  </dialog>
{/if}

<style>
  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: var(--space-1) var(--space-2);
    text-align: left;
  }

  th button {
    background: none;
    border: 0;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    padding: 0;
  }
</style>
