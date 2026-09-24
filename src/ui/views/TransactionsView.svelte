<script lang="ts">
  import { liveQuery } from 'dexie';
  import { DETAILS_KINDS, type Category, type RuleField, type Transaction } from '../../domain/types';
  import { wouldCategorize } from '../../categorize/counts';
  import { listCategories, saveCategory } from '../../db/categories';
  import { addRuleFromTransaction, listRules, type RuleDraft } from '../../db/rules';
  import { clearManualCategory, listAll, setManualCategory } from '../../db/transactions';
  import { toGelMinor } from '../../aggregate/convert';
  import { inPeriod, periodOptions } from '../../aggregate/period';
  import { formatMinor } from '../../import/amount';
  import { buildRateTable, rateFor } from '../../pairing/rates';
  import CategoryForm from '../components/CategoryForm.svelte';
  import RuleForm from '../components/RuleForm.svelte';

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
  const rules = liveQuery(async () => listRules());

  let sortKey = $state<SortKey>('effectiveDate');
  let ascending = $state(false);
  let pendingSelections = $state<Record<string, string>>({});
  let newCategoryRow = $state<Transaction | null>(null);
  let periodFilter = $state('');
  let categoryFilter = $state('');
  let kindFilter = $state('');
  let searchFilter = $state('');
  let promptRowId = $state<string | null>(null);
  let promptCategoryId = $state<string | null>(null);
  let editingRuleRow = $state<Transaction | null>(null);
  let editRuleDraft = $state<RuleDraft | null>(null);

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

  const periods = $derived(periodOptions(sorted.map((row) => row.effectiveDate)));

  const filtered = $derived.by(() => {
    const search = searchFilter.trim().toLowerCase();

    return sorted.filter((row) => {
      if (!inPeriod(row.effectiveDate, periodFilter)) return false;
      if (categoryFilter === UNCATEGORIZED) {
        if (row.categoryId !== null) return false;
      } else if (categoryFilter !== '' && row.categoryId !== categoryFilter) {
        return false;
      }
      if (kindFilter !== '' && row.kind !== kindFilter) return false;
      if (
        search !== '' &&
        !row.counterparty.toLowerCase().includes(search) &&
        !row.details.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });
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

  const promptCount = $derived.by(() => {
    const row = sorted.find((candidate) => candidate.id === promptRowId);
    if (!row || promptCategoryId === null) return 0;
    return wouldCategorize(
      sorted,
      $rules ?? [],
      { field: 'counterparty', match: 'equals', pattern: row.counterparty, categoryId: promptCategoryId },
      row.id,
    );
  });

  function promptText(row: Transaction, categoryId: string, count: number): string {
    return `Apply ${categoryName(categoryId)} to all ${row.counterparty} transactions? It would categorize ${count} now, and future imports too.`;
  }

  const editRuleCount = $derived.by(() => {
    if (!editingRuleRow || !editRuleDraft) return 0;
    return wouldCategorize(sorted, $rules ?? [], editRuleDraft, editingRuleRow.id);
  });

  function basedOnOptions(row: Transaction): { field: RuleField; value: string; label: string }[] {
    const options: { field: RuleField; value: string; label: string }[] = [
      { field: 'counterparty', value: row.counterparty, label: `Counterparty = ${row.counterparty}` },
    ];
    if (row.mcc !== null) {
      options.push({ field: 'mcc', value: row.mcc, label: `MCC = ${row.mcc}` });
    }
    options.push({ field: 'kind', value: row.kind, label: `Kind = ${row.kind}` });
    return options;
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
    showPrompt(row, value);
  }

  function cancelNewCategory() {
    if (newCategoryRow) clearPending(newCategoryRow.id);
    newCategoryRow = null;
  }

  async function saveNewCategory(category: Category) {
    await saveCategory(category);
    if (newCategoryRow) {
      const row = newCategoryRow;
      await setManualCategory(row.id, category.id);
      clearPending(row.id);
      showPrompt(row, category.id);
    }
    newCategoryRow = null;
  }

  function showPrompt(row: Transaction, categoryId: string) {
    promptRowId = row.id;
    promptCategoryId = categoryId;
    editingRuleRow = null;
    editRuleDraft = null;
  }

  function closePrompt() {
    promptRowId = null;
    promptCategoryId = null;
    editingRuleRow = null;
    editRuleDraft = null;
  }

  function resetCategory(row: Transaction) {
    void clearManualCategory(row.id);
    if (promptRowId === row.id) closePrompt();
  }

  async function createRuleFromPrompt(row: Transaction) {
    if (promptCategoryId === null) return;
    await addRuleFromTransaction(
      { field: 'counterparty', match: 'equals', pattern: row.counterparty, categoryId: promptCategoryId },
      row.id,
    );
    closePrompt();
  }

  function openEditRule(row: Transaction) {
    editingRuleRow = row;
    editRuleDraft = {
      field: 'counterparty',
      match: 'equals',
      pattern: row.counterparty,
      categoryId: promptCategoryId ?? '',
    };
  }

  async function saveRuleFromEdit(draft: RuleDraft) {
    if (!editingRuleRow) return;
    await addRuleFromTransaction(draft, editingRuleRow.id);
    closePrompt();
  }

  let newCategoryDialogEl = $state<HTMLDialogElement | null>(null);
  let editRuleDialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const dialogEl = newCategoryDialogEl;
    if (!dialogEl) return;
    if (newCategoryRow && !dialogEl.open) dialogEl.showModal();
    else if (!newCategoryRow && dialogEl.open) dialogEl.close();
  });

  $effect(() => {
    const dialogEl = editRuleDialogEl;
    if (!dialogEl) return;
    if (editingRuleRow && !dialogEl.open) dialogEl.showModal();
    else if (!editingRuleRow && dialogEl.open) dialogEl.close();
  });

  function onNewCategoryDialogClose() {
    if (newCategoryRow) cancelNewCategory();
  }

  function onEditRuleDialogClose() {
    if (editingRuleRow) closePrompt();
  }
</script>

<h1>Transactions</h1>

{#if sorted.length === 0}
  <p>No transactions yet. Import a statement to get started.</p>
{:else}
  <div class="filters">
    <p class="field">
      <label for="filter-period">Period</label>
      <select id="filter-period" bind:value={periodFilter}>
        <option value="">All periods</option>
        <optgroup label="Years">
          {#each periods.years as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
        <optgroup label="Quarters">
          {#each periods.quarters as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
        <optgroup label="Months">
          {#each periods.months as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
      </select>
    </p>
    <p class="field">
      <label for="filter-category">Category</label>
      <select id="filter-category" bind:value={categoryFilter}>
        <option value="">All categories</option>
        <option value={UNCATEGORIZED}>Uncategorized</option>
        {#each $categories ?? [] as category (category.id)}
          <option value={category.id}>{category.name}</option>
        {/each}
      </select>
    </p>
    <p class="field">
      <label for="filter-kind">Kind</label>
      <select id="filter-kind" bind:value={kindFilter}>
        <option value="">All kinds</option>
        {#each DETAILS_KINDS as kind (kind)}
          <option value={kind}>{kind}</option>
        {/each}
      </select>
    </p>
    <p class="field">
      <label for="filter-search">Search</label>
      <input id="filter-search" type="search" bind:value={searchFilter} />
    </p>
  </div>

  {#if filtered.length === 0}
    <p>No transactions match the filters.</p>
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
        {#each filtered as row (row.id)}
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
                  <button type="button" onclick={() => resetCategory(row)}>
                    Reset category for {row.counterparty}
                  </button>
                {/if}
              {/if}
            </td>
          </tr>
          {#if promptRowId === row.id && promptCategoryId !== null}
            <tr>
              <td colspan={COLUMNS.length + 3}>
                <p>{promptText(row, promptCategoryId, promptCount)}</p>
                <p class="actions">
                  <button type="button" onclick={() => void createRuleFromPrompt(row)}>
                    Create rule
                  </button>
                  <button type="button" onclick={() => openEditRule(row)}>Edit rule…</button>
                  <button type="button" onclick={closePrompt}>No</button>
                </p>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
{/if}

<dialog
  bind:this={newCategoryDialogEl}
  aria-labelledby="new-category-heading"
  onclose={onNewCategoryDialogClose}
>
  <h2 id="new-category-heading">New category</h2>
  {#if newCategoryRow}
    <CategoryForm categories={$categories ?? []} onsave={saveNewCategory} oncancel={cancelNewCategory} />
  {/if}
</dialog>

<dialog
  bind:this={editRuleDialogEl}
  aria-labelledby="edit-rule-heading"
  onclose={onEditRuleDialogClose}
>
  <h2 id="edit-rule-heading">Edit rule</h2>
  {#if editingRuleRow}
    <RuleForm
      categories={$categories ?? []}
      basedOn={basedOnOptions(editingRuleRow)}
      initialCategoryId={promptCategoryId ?? undefined}
      count={editRuleCount}
      onsave={saveRuleFromEdit}
      oncancel={closePrompt}
      ondraftchange={(draft) => (editRuleDraft = draft)}
    />
  {/if}
</dialog>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .filters .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

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

  .actions {
    display: flex;
    gap: var(--space-2);
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
