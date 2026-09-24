<script lang="ts">
  import { untrack } from 'svelte';
  import { patternError } from '../../categorize/validate';
  import type { RuleDraft } from '../../db/rules';
  import type { Category, Rule, RuleField, RuleMatch } from '../../domain/types';

  let {
    rule,
    categories,
    initialCategoryId,
    onsave,
    oncancel,
  }: {
    rule?: Rule | undefined;
    categories: Category[];
    basedOn?: { field: RuleField; value: string; label: string }[] | undefined;
    initialCategoryId?: string | undefined;
    onsave: (draft: RuleDraft) => void;
    oncancel?: (() => void) | undefined;
    count?: number | undefined;
  } = $props();

  const FIELDS: RuleField[] = ['counterparty', 'mcc', 'details', 'kind'];
  const MATCHES: RuleMatch[] = ['equals', 'contains', 'regex'];

  let field = $state<RuleField>(untrack(() => rule?.field ?? 'counterparty'));
  let match = $state<RuleMatch>(untrack(() => rule?.match ?? 'equals'));
  let pattern = $state(untrack(() => rule?.pattern ?? ''));
  let categoryId = $state(
    untrack(() => rule?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? ''),
  );
  let error = $state<string | null>(null);

  function save() {
    const message = patternError(match, pattern);
    if (message) {
      error = message;
      return;
    }

    error = null;
    onsave({ field, match, pattern, categoryId });
  }
</script>

<form
  onsubmit={(event) => {
    event.preventDefault();
    save();
  }}
>
  <p class="field">
    <label for="rule-field">Field</label>
    <select id="rule-field" bind:value={field}>
      {#each FIELDS as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </p>
  <p class="field">
    <label for="rule-match">Match</label>
    <select id="rule-match" bind:value={match}>
      {#each MATCHES as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </p>
  <p class="field">
    <label for="rule-pattern">Pattern</label>
    <input id="rule-pattern" type="text" bind:value={pattern} />
  </p>
  <p class="field">
    <label for="rule-category">Category</label>
    <select id="rule-category" bind:value={categoryId}>
      {#each categories as category (category.id)}
        <option value={category.id}>{category.name}</option>
      {/each}
    </select>
  </p>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <p class="actions">
    <button type="submit">Save rule</button>
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
