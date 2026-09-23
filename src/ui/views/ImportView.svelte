<script lang="ts">
  import {
    DETAILS_KINDS,
    type FailureReason,
    type ImportPreview,
    type RowWarning,
    type WorkbookError,
  } from '../../domain/types';
  import { createBatch } from '../../db/batches';
  import { isDatabaseClosed } from '../../db/database';
  import { existingIds, listAll, putMany } from '../../db/transactions';
  import { pairConversions } from '../../pairing/pairConversions';
  import { formatMinor } from '../../import/amount';
  import { buildPreview } from '../../import/buildPreview';
  import { formatRate } from '../../import/details/conversion';
  import { assignIds, splitNewAndDuplicate, type IdentifiedRow } from '../../import/identity';
  import { readWorkbook } from '../../import/readWorkbook';

  const SHEET_NAME = 'Transactions';

  let fileName = $state<string | null>(null);
  let preview = $state<ImportPreview | null>(null);
  let failure = $state<WorkbookError | null>(null);
  let newRows = $state<IdentifiedRow[]>([]);
  let duplicates = $state<IdentifiedRow[]>([]);
  let importedCount = $state<number | null>(null);
  let unpairedCount = $state(0);

  async function onSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    fileName = file.name;
    preview = null;
    failure = null;
    newRows = [];
    duplicates = [];
    importedCount = null;
    unpairedCount = 0;

    const read = await readWorkbook(file, SHEET_NAME);
    if (!read.ok) {
      failure = read.error;
      return;
    }

    const built = buildPreview(read.rows);
    if (!built.ok) {
      failure = built.error;
      return;
    }

    preview = built.preview;

    const identified = assignIds(built.preview.rows);
    try {
      const known = await existingIds(identified.map((row) => row.id));
      const split = splitNewAndDuplicate(identified, known);
      newRows = split.newRows;
      duplicates = split.duplicates;
    } catch (error) {
      if (!isDatabaseClosed(error)) throw error;
    }
  }

  async function onConfirm() {
    if (newRows.length === 0) return;

    const batchId = await createBatch(fileName ?? 'statement.xlsx', {
      imported: newRows.length,
      duplicate: duplicates.length,
      failed: preview?.failed.length ?? 0,
    });

    await putMany(
      newRows.map((row) => ({
        id: row.id,
        postingDate: row.postingDate,
        currency: row.currency,
        amountMinor: row.amountMinor,
        details: row.details,
        importBatchId: batchId,
        categoryId: null,
        categorySource: null,
      })),
    );

    importedCount = newRows.length;
    duplicates = [...duplicates, ...newRows];
    newRows = [];

    unpairedCount = await pairStoredConversions();
  }

  async function pairStoredConversions(): Promise<number> {
    const rows = await listAll();
    return pairConversions(rows.filter((row) => row.kind === 'conversion')).unpaired.length;
  }

  function errorText(error: WorkbookError): string {
    switch (error.code) {
      case 'sheet-not-found':
        return `No sheet named "${error.sheetName}". Sheets found: ${error.sheetsFound.join(', ')}.`;
      case 'header-row-not-found':
        return 'No header row found. Expected a row containing "Date" and "Details".';
      case 'invalid-currency-header':
        return (
          `Unexpected column header after Details: "${error.header}". Expected a three-letter currency code.` +
          ` Header row cells: ${error.headerCells.map((text, i) => `${i + 1}="${text}"`).join(', ')}.`
        );
    }
  }

  function warningText(warning: RowWarning): string {
    return `Row ${warning.rowNumber}: amount has more than two decimals (${warning.cell}), rounded to ${warning.rounded}`;
  }

  function reasonText(reason: FailureReason): string {
    switch (reason.code) {
      case 'no-currency-value': {
        const seen = reason.cells
          .map((cell) => `${cell.column}=${cell.present ? `"${cell.value}"` : 'absent'}`)
          .join(' ');
        return `No amount in any currency column — cells after Details: ${seen}`;
      }
      case 'multiple-currency-values':
        return `Amount in more than one currency (${reason.currencies.join(', ')})`;
      case 'unparseable-date':
        return `Unreadable date "${reason.cell}"`;
      case 'unparseable-amount':
        return `Unreadable amount "${reason.cell}"`;
      case 'missing-details':
        return 'No details';
    }
  }
</script>

<h1>Import</h1>

<p class="field">
  <label for="statement-file">Statement file</label>
  <input id="statement-file" type="file" accept=".xlsx" onchange={onSelect} />
</p>

{#if failure}
  <p class="error" role="alert">{errorText(failure)}</p>
{/if}

{#if preview}
  <p>File: {fileName}</p>
  <p>Header row: {preview.headerRowNumber}</p>
  <p>Currencies: {preview.currencies.join(', ')}</p>
  <p>New rows: {newRows.length}</p>
  <p>Duplicate rows: {duplicates.length}</p>

  {#if newRows.length > 0}
    <p><button type="button" onclick={onConfirm}>Confirm import</button></p>
  {:else}
    <p>Nothing new to import.</p>
  {/if}

  {#if importedCount !== null}
    <p role="status">Imported {importedCount} rows.</p>
  {/if}

  {#if unpairedCount > 0}
    <p role="alert">{unpairedCount} conversion rows could not be paired.</p>
  {/if}
  <p class="details">
    Header cells: {preview.headerCells.map((text, i) => `${i + 1}="${text}"`).join(' ')}
  </p>
  <p class="details">
    Currency columns: {preview.currencyColumns.map((c) => `${c.code}@${c.column}`).join(' ')}
  </p>

  <table>
    <caption>Counts per kind</caption>
    <thead>
      <tr><th scope="col">Kind</th><th scope="col">Rows</th></tr>
    </thead>
    <tbody>
      {#each DETAILS_KINDS as kind (kind)}
        <tr><th scope="row">{kind}</th><td>{preview.countsByKind[kind]}</td></tr>
      {/each}
    </tbody>
  </table>

  {#if preview.warnings.length > 0}
    <h2 id="warnings-heading">Warnings</h2>
    <ul aria-labelledby="warnings-heading">
      {#each preview.warnings as warning (`${warning.rowNumber}-${warning.code}`)}
        <li>{warningText(warning)}</li>
      {/each}
    </ul>
  {/if}

  {#if preview.failed.length > 0}
    <table>
      <caption>Failed rows</caption>
      <thead>
        <tr><th scope="col">#</th><th scope="col">Reason</th><th scope="col">Details</th></tr>
      </thead>
      <tbody>
        {#each preview.failed as row (row.rowNumber)}
          <tr>
            <th scope="row">{row.rowNumber}</th>
            <td>{reasonText(row.reason)}</td>
            <td class="details">{row.details}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <table>
    <caption>Parsed rows</caption>
    <thead>
      <tr>
        <th scope="col">#</th>
        <th scope="col">Posting date</th>
        <th scope="col">Effective date</th>
        <th scope="col">Kind</th>
        <th scope="col">Counterparty</th>
        <th scope="col">Amount</th>
        <th scope="col">Currency</th>
        <th scope="col">MCC</th>
        <th scope="col">Card</th>
        <th scope="col">Rate</th>
        <th scope="col">Payment code</th>
        <th scope="col">Account</th>
        <th scope="col">Bank</th>
        <th scope="col">Original amount</th>
        <th scope="col">Details</th>
      </tr>
    </thead>
    <tbody>
      {#each preview.rows as row (row.rowNumber)}
        <tr>
          <th scope="row">{row.rowNumber}</th>
          <td>{row.postingDate}</td>
          <td>{row.effectiveDate}</td>
          <td>{row.kind}</td>
          <td>{row.counterparty}</td>
          <td class="amount">{formatMinor(row.amountMinor)}</td>
          <td>{row.currency}</td>
          <td>{row.mcc ?? ''}</td>
          <td>{row.cardLast4 ?? ''}</td>
          <td>{row.conversionRateScaled === null ? '' : formatRate(row.conversionRateScaled)}</td>
          <td>{row.paymentCode ?? ''}</td>
          <td>{row.account ?? ''}</td>
          <td>{row.bank ?? ''}</td>
          <td class="amount">
            {row.originalAmountMinor === null
              ? ''
              : `${formatMinor(row.originalAmountMinor)} ${row.originalCurrency ?? ''}`.trim()}
          </td>
          <td class="details">{row.details}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

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

  .amount {
    text-align: right;
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .details {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
</style>
