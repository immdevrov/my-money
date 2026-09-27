<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { foreignCurrencies } from '../../aggregate/gel';
  import { deleteBatch, listBatchesWithCounts, type BatchSummary } from '../../db/batches';
  import { exportBackup, restoreBackup, wipeAll } from '../../db/backup';
  import {
    BACKUP_VERSION,
    backupFileName,
    calendarDaysSince,
    parseBackup,
    type BackupError,
    type BackupFile,
  } from '../../db/backupFormat';
  import { getLastBackupAt, getManualRates, setManualRate } from '../../db/settings';
  import { countTransactions, listAll } from '../../db/transactions';
  import { scaledFromDecimal } from '../../import/amount';
  import { formatRate } from '../../import/details/conversion';

  const RATE_DECIMALS = 6;
  const RATE_INPUT = /^\d{1,6}(\.\d{1,6})?$/;
  const INVALID_RATE =
    'Enter a positive rate below 1000000 with up to 6 decimals, or leave it empty to clear it.';
  const WIPE_MESSAGE =
    'Delete all transactions, imports, categories, rules and manual rates? This cannot be undone. Export a backup first if you may need them.';

  const rateData = liveQuery(async () => {
    const [rows, manual] = await Promise.all([listAll(), getManualRates()]);
    return { currencies: foreignCurrencies(rows, manual), manual };
  });

  let drafts = $state<Record<string, string>>({});
  let invalid = $state<Record<string, boolean>>({});
  let saved = $state<Record<string, 'set' | 'cleared'>>({});
  const savedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const SAVED_VISIBLE_MS = 2500;

  function setSaved(currency: string, outcome: 'set' | 'cleared' | null) {
    clearTimeout(savedTimers.get(currency));
    savedTimers.delete(currency);
    const next = { ...saved };
    if (outcome === null) {
      delete next[currency];
    } else {
      next[currency] = outcome;
      savedTimers.set(currency, setTimeout(() => setSaved(currency, null), SAVED_VISIBLE_MS));
    }
    saved = next;
  }

  function resetRateRows() {
    drafts = {};
    invalid = {};
    savedTimers.forEach(clearTimeout);
    savedTimers.clear();
    saved = {};
  }

  onDestroy(() => savedTimers.forEach(clearTimeout));

  function savedText(currency: string): string {
    const saved = $rateData?.manual[currency];
    return saved === undefined ? '' : formatRate(saved);
  }

  function parseRate(text: string): number | null | 'invalid' {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (!RATE_INPUT.test(trimmed)) return 'invalid';
    const scaled = scaledFromDecimal(trimmed, RATE_DECIMALS).value;
    return scaled > 0 ? scaled : 'invalid';
  }

  async function save(event: SubmitEvent, currency: string) {
    event.preventDefault();
    const rate = parseRate(drafts[currency] ?? savedText(currency));
    if (rate === 'invalid') {
      invalid = { ...invalid, [currency]: true };
      setSaved(currency, null);
      return;
    }
    await setManualRate(currency, rate);
    invalid = { ...invalid, [currency]: false };
    setSaved(currency, rate === null ? 'cleared' : 'set');
    const next = { ...drafts };
    delete next[currency];
    drafts = next;
  }

  const lastBackupAt = liveQuery(async () => getLastBackupAt());

  function lastBackupText(iso: string | null): string {
    if (iso === null) return 'Never backed up.';
    const days = calendarDaysSince(iso, new Date());
    if (days <= 0) return 'Last backup: today.';
    if (days === 1) return 'Last backup: 1 day ago.';
    return `Last backup: ${days} days ago.`;
  }

  async function downloadBackup() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFileName(backup.exportedAt);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function backupErrorText(error: BackupError): string {
    switch (error.code) {
      case 'not-json':
        return 'This file is not valid JSON.';
      case 'not-a-backup':
        return 'This file is not a budget-my backup.';
      case 'newer-version':
        return `This backup is version ${error.version}; this app reads version ${BACKUP_VERSION}.`;
      case 'invalid-exported-at':
        return 'This backup is damaged: exportedAt is invalid.';
      case 'missing-table':
        return `This backup is damaged: ${error.table} is missing.`;
      case 'invalid-entry':
        return `This backup is damaged: ${error.table} entry ${error.entry} is invalid.`;
    }
  }

  let pendingRestore = $state.raw<{ backup: BackupFile; currentTransactions: number } | null>(
    null,
  );
  let restoreDialogEl = $state<HTMLDialogElement | null>(null);
  let restoreOutcome = $state<{ ok: boolean; text: string } | null>(null);

  $effect(() => {
    const dialogEl = restoreDialogEl;
    if (!dialogEl) return;
    if (pendingRestore && !dialogEl.open) dialogEl.showModal();
    else if (!pendingRestore && dialogEl.open) dialogEl.close();
  });

  async function chooseBackup(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    restoreOutcome = null;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      restoreOutcome = { ok: false, text: backupErrorText(parsed.error) };
      return;
    }
    pendingRestore = { backup: parsed.backup, currentTransactions: await countTransactions() };
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    const { backup } = pendingRestore;
    pendingRestore = null;
    try {
      await restoreBackup(backup);
      resetRateRows();
      restoreOutcome = { ok: true, text: 'Backup restored.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      restoreOutcome = { ok: false, text: `The backup could not be restored: ${message}` };
    }
  }

  function cancelRestore() {
    pendingRestore = null;
  }

  function onRestoreDialogClose() {
    if (pendingRestore) cancelRestore();
  }

  const imports = liveQuery(async () => listBatchesWithCounts());

  let deleteTarget = $state<BatchSummary | null>(null);
  let deleteDialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const dialogEl = deleteDialogEl;
    if (!dialogEl) return;
    if (deleteTarget && !dialogEl.open) dialogEl.showModal();
    else if (!deleteTarget && dialogEl.open) dialogEl.close();
  });

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function localDateTime(iso: string): string {
    const date = new Date(iso);
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteBatch(deleteTarget.batch.id);
    deleteTarget = null;
  }

  function cancelDelete() {
    deleteTarget = null;
  }

  let wipeOpen = $state(false);
  let wipeDialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const dialogEl = wipeDialogEl;
    if (!dialogEl) return;
    if (wipeOpen && !dialogEl.open) dialogEl.showModal();
    else if (!wipeOpen && dialogEl.open) dialogEl.close();
  });

  function openWipe() {
    wipeOpen = true;
  }

  function cancelWipe() {
    wipeOpen = false;
  }

  function onWipeDialogClose() {
    if (wipeOpen) cancelWipe();
  }

  async function confirmWipe() {
    await wipeAll();
    resetRateRows();
    wipeOpen = false;
  }
</script>

<h1>Settings</h1>

<section aria-labelledby="manual-rates-heading">
  <h2 id="manual-rates-heading">Manual rates</h2>

  {#if $rateData !== undefined}
    {#if $rateData.currencies.length === 0}
      <p>No foreign-currency transactions.</p>
    {:else}
      <table>
        <caption>Manual rates</caption>
        <thead>
          <tr>
            <th scope="col">Currency</th>
            <th scope="col">Without a conversion rate</th>
            <th scope="col">Manual rate (GEL per unit)</th>
          </tr>
        </thead>
        <tbody>
          {#each $rateData.currencies as { currency, withoutRate } (currency)}
            <tr>
              <th scope="row">{currency}</th>
              <td>{withoutRate}</td>
              <td>
                <form class="rate" onsubmit={(event) => save(event, currency)}>
                  <input
                    type="text"
                    inputmode="decimal"
                    aria-label={`Manual rate for ${currency}`}
                    bind:value={
                      () => drafts[currency] ?? savedText(currency),
                      (value) => {
                        drafts = { ...drafts, [currency]: value };
                        setSaved(currency, null);
                      }
                    }
                  />
                  <button type="submit" aria-label={`Save rate for ${currency}`}>Save</button>
                  <span class="saved" role="status">
                    {#if saved[currency]}
                      <span out:fade>{saved[currency] === 'set' ? 'Saved' : 'Cleared'}</span>
                    {/if}
                  </span>
                </form>
                {#if invalid[currency]}
                  <p class="error" role="alert">{INVALID_RATE}</p>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<section aria-labelledby="backup-heading">
  <h2 id="backup-heading">Backup</h2>
  <button type="button" onclick={downloadBackup}>Export backup</button>
  {#if $lastBackupAt !== undefined}
    <p>{lastBackupText($lastBackupAt)}</p>
  {/if}
  <p class="restore">
    <label for="restore-file">Restore from backup</label>
    <input id="restore-file" type="file" accept=".json,application/json" onchange={chooseBackup} />
  </p>
  {#if restoreOutcome}
    {#if restoreOutcome.ok}
      <p role="status">{restoreOutcome.text}</p>
    {:else}
      <p class="error" role="alert">{restoreOutcome.text}</p>
    {/if}
  {/if}
</section>

<dialog bind:this={restoreDialogEl} aria-labelledby="restore-dialog-heading" onclose={onRestoreDialogClose}>
  <h2 id="restore-dialog-heading">Restore backup</h2>
  {#if pendingRestore}
    <p>
      Replace all data with this backup? It holds {pendingRestore.backup.transactions.length} transactions,
      {pendingRestore.backup.categories.length} categories and {pendingRestore.backup.rules.length} rules.
      Your current {pendingRestore.currentTransactions} transactions will be replaced.
    </p>
  {/if}
  <button type="button" onclick={confirmRestore}>Restore</button>
  <button type="button" onclick={cancelRestore} autofocus>Cancel</button>
</dialog>

<section aria-labelledby="imports-heading">
  <h2 id="imports-heading">Imports</h2>

  {#if $imports !== undefined}
    {#if $imports.length === 0}
      <p>No imports yet.</p>
    {:else}
      <table>
        <caption>Imports</caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Imported</th>
            <th scope="col">Transactions</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each $imports as summary (summary.batch.id)}
            <tr>
              <td>{summary.batch.fileName}</td>
              <td>{localDateTime(summary.batch.importedAt)}</td>
              <td>{summary.transactions}</td>
              <td>
                <button type="button" onclick={() => (deleteTarget = summary)}>
                  Delete import {summary.batch.fileName}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<dialog bind:this={deleteDialogEl} aria-labelledby="delete-import-heading" onclose={cancelDelete}>
  <h2 id="delete-import-heading">Delete import</h2>
  {#if deleteTarget}
    <p>
      Delete import {deleteTarget.batch.fileName}? This removes {deleteTarget.transactions} transactions.
    </p>
  {/if}
  <button type="button" onclick={confirmDelete}>Delete</button>
  <button type="button" onclick={cancelDelete} autofocus>Cancel</button>
</dialog>

<section aria-labelledby="wipe-heading">
  <h2 id="wipe-heading">Wipe all data</h2>
  <button type="button" onclick={openWipe}>Wipe all data</button>
</section>

<dialog bind:this={wipeDialogEl} aria-labelledby="wipe-dialog-heading" onclose={onWipeDialogClose}>
  <h2 id="wipe-dialog-heading">Wipe all data</h2>
  <p>{WIPE_MESSAGE}</p>
  <button type="button" onclick={confirmWipe}>Wipe</button>
  <button type="button" onclick={cancelWipe} autofocus>Cancel</button>
</dialog>

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
    vertical-align: top;
  }

  .rate {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rate input {
    width: 10ch;
  }

  .saved {
    align-self: center;
    color: var(--success);
    font-size: var(--text-sm);
  }

  .restore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .restore input {
    max-width: 100%;
  }

  .error {
    background: var(--danger-surface);
    color: var(--danger);
    margin: var(--space-1) 0 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
  }
</style>
