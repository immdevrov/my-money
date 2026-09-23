<script lang="ts">
  import { untrack } from 'svelte';
  import { CURRENCY_CONVERSION_ID } from '../../categorize/seed';
  import type { Category, CategoryType } from '../../domain/types';
  import { PALETTE } from '../palette';

  let {
    category,
    categories,
    onsave,
    oncancel,
  }: {
    category?: Category | undefined;
    categories: Category[];
    onsave: (category: Category) => void;
    oncancel?: (() => void) | undefined;
  } = $props();

  function firstUnusedToken(): string {
    const used = new Set(categories.map((existing) => existing.color));
    return PALETTE.find((entry) => !used.has(entry.token))?.token ?? '--palette-1';
  }

  let name = $state(untrack(() => category?.name ?? ''));
  let type = $state<CategoryType>(untrack(() => category?.type ?? 'expense'));
  let color = $state(untrack(() => category?.color ?? firstUnusedToken()));
  let error = $state<string | null>(null);

  const typeDisabled = untrack(() => category?.id === CURRENCY_CONVERSION_ID);

  function save() {
    const trimmed = name.trim();
    if (trimmed === '') {
      error = 'Name is required.';
      return;
    }

    const isDuplicate = categories.some(
      (existing) =>
        existing.id !== category?.id && existing.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      error = 'A category with this name already exists.';
      return;
    }

    error = null;
    onsave({ id: category?.id ?? crypto.randomUUID(), name: trimmed, type, color });
  }
</script>

<form
  onsubmit={(event) => {
    event.preventDefault();
    save();
  }}
>
  <p class="field">
    <label for="category-name">Name</label>
    <input id="category-name" type="text" bind:value={name} />
  </p>
  <p class="field">
    <label for="category-type">Type</label>
    <select id="category-type" bind:value={type} disabled={typeDisabled}>
      <option value="expense">expense</option>
      <option value="income">income</option>
      <option value="transfer">transfer</option>
      <option value="ignore">ignore</option>
    </select>
  </p>
  <p class="field">
    <label for="category-color">Colour</label>
    <select id="category-color" bind:value={color}>
      {#each PALETTE as entry (entry.token)}
        <option value={entry.token}>{entry.name}</option>
      {/each}
    </select>
  </p>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <p class="actions">
    <button type="submit">Save category</button>
    {#if oncancel}
      <button type="button" onclick={oncancel}>Cancel</button>
    {/if}
  </p>
</form>

<style>
  .field {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .error {
    background: var(--danger-surface);
    color: var(--danger);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
