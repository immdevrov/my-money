<script lang="ts">
  import { liveQuery } from 'dexie';
  import { CURRENCY_CONVERSION_ID } from '../../categorize/seed';
  import type { Category } from '../../domain/types';
  import { deleteCategory, deletionImpact, listCategories, saveCategory } from '../../db/categories';
  import CategoryForm from '../components/CategoryForm.svelte';
  import { colourName } from '../palette';

  const categories = liveQuery(async () => listCategories());

  let editing = $state<Category | null>(null);
  let deleteTarget = $state<Category | null>(null);
  let deleteCounts = $state<{ rules: number; manual: number }>({ rules: 0, manual: 0 });
  let addFormVersion = $state(0);
  let pendingSavedId = $state<string | null>(null);
  let deleteDialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const list = $categories;
    const id = pendingSavedId;
    if (list !== undefined && id !== null && list.some((category) => category.id === id)) {
      pendingSavedId = null;
      addFormVersion += 1;
    }
  });

  $effect(() => {
    const dialogEl = deleteDialogEl;
    if (!dialogEl) return;
    if (deleteTarget && !dialogEl.open) dialogEl.showModal();
    else if (!deleteTarget && dialogEl.open) dialogEl.close();
  });

  async function onSave(category: Category) {
    const wasAdd = !editing;
    await saveCategory(category);
    editing = null;
    if (wasAdd) pendingSavedId = category.id;
  }

  function onEditCancel() {
    editing = null;
  }

  async function openDelete(category: Category) {
    deleteCounts = await deletionImpact(category.id);
    deleteTarget = category;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteCategory(deleteTarget.id);
    deleteTarget = null;
  }

  function cancelDelete() {
    deleteTarget = null;
  }

  function onDeleteDialogClose() {
    if (deleteTarget) cancelDelete();
  }

  function impactText(name: string, counts: { rules: number; manual: number }): string {
    const rulesText = counts.rules === 1 ? '1 rule' : `${counts.rules} rules`;
    const manualText = counts.manual === 1 ? '1 manual assignment' : `${counts.manual} manual assignments`;
    return `Delete ${name}? ${rulesText} and ${manualText} will be removed.`;
  }
</script>

<h1>Categories</h1>

<table>
  <caption>Categories</caption>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Type</th>
      <th scope="col">Colour</th>
      <th scope="col">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each $categories ?? [] as category (category.id)}
      <tr>
        <td>{category.name}</td>
        <td>{category.type}</td>
        <td>
          <span class="swatch" style={`background: var(${category.color})`}></span>
          {colourName(category.color)}
        </td>
        <td>
          <button type="button" onclick={() => (editing = category)}>Edit {category.name}</button>
          {#if category.id !== CURRENCY_CONVERSION_ID}
            <button type="button" onclick={() => openDelete(category)}>Delete {category.name}</button>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

{#if $categories !== undefined}
  {@const categoryList = $categories}
  <h2>{editing ? 'Edit category' : 'Add category'}</h2>
  {#key `${editing?.id ?? 'new'}-${addFormVersion}`}
    <CategoryForm
      category={editing ?? undefined}
      categories={categoryList}
      onsave={onSave}
      oncancel={editing ? onEditCancel : undefined}
    />
  {/key}
{/if}

<dialog bind:this={deleteDialogEl} aria-labelledby="delete-category-heading" onclose={onDeleteDialogClose}>
  <h2 id="delete-category-heading">Delete category</h2>
  {#if deleteTarget}
    <p>{impactText(deleteTarget.name, deleteCounts)}</p>
  {/if}
  <button type="button" onclick={confirmDelete}>Delete</button>
  <button type="button" onclick={cancelDelete} autofocus>Cancel</button>
</dialog>

<style>
  .swatch {
    display: inline-block;
    width: 0.9em;
    height: 0.9em;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: var(--space-1);
    border: 1px solid var(--border);
  }
</style>
