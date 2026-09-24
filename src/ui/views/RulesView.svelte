<script lang="ts">
  import { liveQuery } from 'dexie';
  import { winsByRule } from '../../categorize/counts';
  import { listCategories } from '../../db/categories';
  import { addRule, deleteRule, listRules, reorderRule, updateRule, type RuleDraft } from '../../db/rules';
  import { listAll } from '../../db/transactions';
  import type { Rule } from '../../domain/types';
  import RuleForm from '../components/RuleForm.svelte';

  const rules = liveQuery(async () => listRules());
  const categories = liveQuery(async () => listCategories());
  const transactions = liveQuery(async () => listAll());

  let editingRule = $state<Rule | null>(null);
  let addFormVersion = $state(0);

  const ruleList = $derived($rules ?? []);
  const categoryList = $derived($categories ?? []);
  const matchCounts = $derived(winsByRule($transactions ?? []));

  function categoryName(id: string): string {
    return categoryList.find((category) => category.id === id)?.name ?? '';
  }

  function description(rule: Rule): string {
    return `${rule.field} ${rule.match} ${rule.pattern}`;
  }

  async function onSaveRule(draft: RuleDraft) {
    if (editingRule) {
      await updateRule({ ...editingRule, ...draft });
      editingRule = null;
    } else {
      await addRule(draft);
      addFormVersion += 1;
    }
  }

  function onEditCancel() {
    editingRule = null;
  }
</script>

<h1>Rules</h1>

{#if ruleList.length === 0}
  <p>No rules yet. Pick a category on a transaction to create one.</p>
{:else}
  <table>
    <caption>Rules</caption>
    <thead>
      <tr>
        <th scope="col">#</th>
        <th scope="col">Field</th>
        <th scope="col">Match</th>
        <th scope="col">Pattern</th>
        <th scope="col">Category</th>
        <th scope="col">Matches</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each ruleList as rule, index (rule.id)}
        <tr>
          <td>{index + 1}</td>
          <td>{rule.field}</td>
          <td>{rule.match}</td>
          <td>{rule.pattern}</td>
          <td>{categoryName(rule.categoryId)}</td>
          <td>{matchCounts.get(rule.id) ?? 0}</td>
          <td>
            <button type="button" onclick={() => (editingRule = rule)}>
              Edit rule {description(rule)}
            </button>
            <button type="button" onclick={() => void deleteRule(rule.id)}>
              Delete rule {description(rule)}
            </button>
            <button
              type="button"
              disabled={index === 0}
              onclick={() => void reorderRule(rule.id, 'up')}
            >
              Move rule {description(rule)} up
            </button>
            <button
              type="button"
              disabled={index === ruleList.length - 1}
              onclick={() => void reorderRule(rule.id, 'down')}
            >
              Move rule {description(rule)} down
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if categoryList.length > 0}
  <h2>{editingRule ? 'Edit rule' : 'Add rule'}</h2>
  {#key editingRule ? editingRule.id : `new-${addFormVersion}`}
    <RuleForm
      rule={editingRule ?? undefined}
      categories={categoryList}
      onsave={onSaveRule}
      oncancel={editingRule ? onEditCancel : undefined}
    />
  {/key}
{/if}
