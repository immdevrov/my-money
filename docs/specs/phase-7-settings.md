# Phase 7 — Settings

The app keeps everything in one browser's IndexedDB. Phase 7 gives the user control over that store: a fallback rate for foreign-currency spending that no conversion prices, a backup file that moves the whole history between devices and back, the removal of one import, and a clean slate.

## Scope

In:
- Manual rates: one fallback rate per foreign currency, and a marker on every amount priced with one.
- Backup export and restore as JSON, and the time since the last backup.
- The import batch list, with deletion of one batch.
- Wiping all data.
- The `captureDownload` test helper.

Out:
- Dated manual rates, or manual rates that override a conversion's rate. Rates will be widened later; the lookup returns its source so that change stays inside it (see Decisions).
- Merging a backup into existing data.
- Any reminder to back up outside the Settings view.

## Storage

Dexie version 4 adds a `settings` table keyed by `key`. No existing row changes, so the version has no upgrade function.

```ts
type SettingsRow =
  | { key: 'manualRates'; value: Record<string, number> }   // currency → rate scaled by RATE_SCALE (1e6)
  | { key: 'lastBackupAt'; value: string }                   // ISO datetime
```

- A manual rate is what the user decided, so it is stored. What it produces, a GEL amount, is derived on every read like every other GEL amount.
- The base currency stays the constant `GEL`. It is not a setting: nothing else in the app could follow a change to it.

## Manual rates

### Lookup

```ts
// src/aggregate/gel.ts
type Rates = { table: Rate[]; manual: Record<string, number> }
type GelAmount = { minor: number; source: 'pair' | 'manual' }

ratesFrom(rows: Transaction[], manual: Record<string, number>): Rates   // replaces rateTableFrom
gelAmount(row: Transaction, rates: Rates): GelAmount | null
```

- A GEL row gives its `amountMinor`, with source `pair`.
- A non-GEL row uses `rateFor(table, currency, effectiveDate)` when it finds a rate, with source `pair`.
- Otherwise it uses `manual[currency]` when set, with source `manual`.
- Otherwise it returns `null`: no rate.
- A manual rate is a fallback only. A rate from a conversion pair is never replaced by it.
- `toGelMinor` does the arithmetic for both sources.

`countRow(row, categories, rates)` takes the `Rates` object. `compare` and `monthlyTotals` gain a `manualRates: Record<string, number>` input and build `rates` once, as they build the table today. A row priced by a manual rate is `counted`, so it enters totals and leaves the missing-rate counts.

### Settings view

A "Manual rates" section holds a table with the columns **Currency**, **Without a conversion rate**, and **Manual rate (GEL per unit)**.

- Rows: every non-GEL currency among the transactions, and every currency with a saved manual rate, in alphabetical order.
- **Without a conversion rate** counts the rows in that currency that no conversion pair prices, whether or not a manual rate covers them. It shows where a manual rate matters.
- The rate cell holds an input labelled `Manual rate for {CUR}`, prefilled with the saved rate formatted by `formatRate`, and a button `Save rate for {CUR}`.
  - A positive decimal with up to 6 whole digits and up to 6 fraction digits is saved, parsed digit-wise with `scaledFromDecimal` at 6 decimals.
  - An empty input clears the rate.
  - Anything else, including 0, shows `Enter a positive rate below 1000000 with up to 6 decimals, or leave it empty to clear it.` in that row and saves nothing.
- With no rows, the section shows `No foreign-currency transactions.`

### Transactions view

The GEL column of a row priced by a manual rate shows `{amount} (manual rate)`, for example `27.35 (manual rate)`. A row with no rate keeps `no rate`.

The Dashboard shows nothing new. Its totals, charts and missing-rate counts follow from `countRow`.

## Backup

### File

`budget-my-backup-YYYY-MM-DD.json`, dated with the local date of the export. `.gitignore` already ignores the name.

```ts
type BackupFile = {
  format: 'budget-my-backup'
  version: 1
  exportedAt: string                 // ISO datetime
  transactions: StoredTransaction[]
  importBatches: ImportBatch[]
  categories: Category[]
  rules: Rule[]
  manualRates: Record<string, number>
}
```

- It holds exactly the stored rows. Nothing derived is stored, so nothing derived is exported.
- `lastBackupAt` is not in the file. A restore sets it from `exportedAt`.

### Export

An `Export backup` button reads every table, writes the file and hands it to the browser as a download through `URL.createObjectURL`. It then stores `lastBackupAt` as the file's `exportedAt`.

### Restore

A file input labelled `Restore from backup`.

1. The chosen file is read and passed to the pure `parseBackup(text)`, which returns `{ ok: true, backup }` or `{ ok: false, error }`. The error shown for each failure is:
   - Not JSON: `This file is not valid JSON.`
   - JSON without `format: 'budget-my-backup'`: `This file is not a budget-my backup.`
   - A `version` above 1: `This backup is version {N}; this app reads version 1.`
   - A missing, non-string or unreadable `exportedAt`: `This backup is damaged: exportedAt is invalid.`
   - A missing table, or one that is not an array (an object for `manualRates`): `This backup is damaged: {table} is missing.`
   - A record without the fields and types its table needs: `This backup is damaged: {table} entry {i} is invalid.`, where `i` counts from 1, in key order for `manualRates`. The table is named `transactions`, `importBatches`, `categories`, `rules` or `manualRates`.
2. On success, a modal dialog asks: `Replace all data with this backup? It holds {T} transactions, {C} categories and {R} rules. Your current {M} transactions will be replaced.` with the buttons `Restore` and `Cancel`.
3. `Restore` runs one `rw` transaction over every table: it clears them all, then adds the backup's rows and its `manualRates`, and sets `lastBackupAt` to `exportedAt`. If the backup has no Currency conversion category, it is re-seeded, because pairing's category assignment depends on it.
4. Then the view shows `Backup restored.` If the transaction fails, for example on a duplicate id, the old data is intact and the view shows `The backup could not be restored: {message}`.

`Cancel` closes the dialog and changes nothing. A parse error changes nothing either.

### Last backup

Beside the Export button:
- `Never backed up.` when there is no `lastBackupAt`.
- Otherwise `Last backup: today.`, `Last backup: 1 day ago.` or `Last backup: {N} days ago.`, counting calendar days in local time between `lastBackupAt` and `new Date()` at render. A backup dated in the future reads as today.

## Imports

An "Imports" section lists the import batches, newest first by `importedAt`, in a table with the columns **File**, **Imported** (local date and time, `YYYY-MM-DD HH:mm`) and **Transactions**.

- **Transactions** is the live count of stored rows whose `importBatchId` is that batch. It is not the batch's stored `counts.imported`: a count on screen must be what the delete will remove.
- Each row has a button `Delete import {fileName}`. It opens a modal dialog: `Delete import {fileName}? This removes {N} transactions.`, with `Delete` and `Cancel`.
- `Delete` removes the batch and every transaction with its `importBatchId`, in one transaction. Pairing, categories and totals follow on the next read, because none of them is stored.
- With no batches, the section shows `No imports yet.`

## Wipe

A "Wipe all data" section holds a button `Wipe all data`. It opens a modal dialog: `Delete all transactions, imports, categories, rules and manual rates? This cannot be undone. Export a backup first if you may need them.`, with `Wipe` and `Cancel`.

`Wipe` clears every table in one transaction and re-seeds Currency conversion, so the result is the state of a fresh install. `Never backed up.` follows, since `settings` is cleared too. `localStorage` is not touched: its one key records that persistent storage was requested for this origin, which is not data.

## Connection

Wipe and restore clear tables. They never delete the database. `App` owns the one connection and keeps it open, and every `liveQuery` re-fires after the write, so every view shows the new state without a reload.

## Modules and files

```
src/db/database.ts               v4: settings table
src/db/settings.ts               getManualRates, setManualRate, getLastBackupAt
src/db/backupFormat.ts           BackupFile, parseBackup (pure)
src/db/backup.ts                 exportBackup, restoreBackup, wipeAll
src/db/batches.ts                + listBatchesWithCounts, deleteBatch
src/aggregate/gel.ts             Rates, ratesFrom, gelAmount with source
src/aggregate/count.ts           countRow takes Rates
src/aggregate/compare.ts         + manualRates input
src/aggregate/monthly.ts         + manualRates input
src/ui/views/SettingsView.svelte
src/ui/views/TransactionsView.svelte   manual-rate marker
src/ui/views/DashboardView.svelte      passes manual rates
src/App.svelte                   Settings route renders SettingsView
src/ui/views/StubView.svelte     deleted: no stub view remains
tests/helpers/captureDownload.ts
tests/settings-rates.test.ts
tests/settings-backup.test.ts
tests/settings-imports.test.ts
tests/settings-wipe.test.ts
```

## Test helper

`captureDownload()` in `tests/helpers/captureDownload.ts` spies on `URL.createObjectURL` and on anchor clicks, and returns a function that resolves a `File` holding the Blob the app handed to `createObjectURL`, named by the `download` attribute of the anchor the app clicked. The click is not passed through, so no real download starts. The test can upload that `File` as it is.

## Required behavior coverage

Manual rates:
- A manual rate replaces the `no rate` marker with `{amount} (manual rate)` in Transactions, and updates the Dashboard's totals and missing-rate count.
- A row that a conversion pair prices keeps its pair rate, with no marker, when a manual rate for its currency is set.
- Clearing a manual rate brings the `no rate` marker back.
- An invalid rate shows its message and saves nothing.
- The rates table lists each foreign currency with its count of rows without a conversion rate, and a saved rate for a currency with no rows.

Backup:
- Export, captured with `captureDownload()`, is named `budget-my-backup-{date}.json`. Wipe, then restore of the captured file, brings back transactions (with a manual category), categories, rules in priority order, and manual rates identically, and they survive a remount of `App`.
- A file that is not JSON, one that is not a backup, a newer version and a damaged record each show their message, and the data is unchanged.
- Cancelling a restore changes nothing.
- Last backup reads `Never backed up.`, then `Last backup: today.` after an export, and `Last backup: {N} days ago.` later. A restore reports the age of the file's `exportedAt`, and a wipe returns it to `Never backed up.`

Imports:
- Deleting one of two imports removes only its rows. Its confirmation states how many, and the list no longer shows it.
- A conversion pair split across the two imports shows as unpaired after either is deleted.

Wipe:
- Wipe leaves the empty state: no transactions, only Currency conversion among categories, no rules, no imports, no manual rates, never backed up. It survives a remount of `App`.

## Decisions

### Restore replaces, never merges
Categories and rules have random ids. Merging two histories would duplicate "Groceries", interleave two priority orders, and leave manual choices pointing at categories the merge dropped. A replace always ends in the state the file describes, which is what a backup is for. The confirmation states what is replaced.

### A manual rate is a fallback, and it is marked
The rate a conversion actually used is evidence. A typed-in rate is an estimate, so it applies only where there is no evidence, and every amount it produces says so. Without the marker, an old estimate the user has forgotten would be indistinguishable from real data.

### The rate lookup reports its source
Manual rates could have been added to the rate table as dated entries, which would change no signature. But a manual rate has no date, and giving it one would distort the "nearest rate" rule. The marker would also need to know which entries are real. Returning the source instead keeps one function in charge of every GEL amount, so rates can later grow dated or overriding manual entries without changing any caller.

### The last backup is stored in the database
It describes the data, not the device. `localStorage` would survive a wipe and report a backup of data that no longer exists. A restore sets it from the file's `exportedAt`, because the data on screen is exactly as current as that file.

### Deleting an import removes the rows it brought
Dedup keeps a row with the first import that brought it. When two exports overlap, deleting the first removes the shared rows even though the second file contained them. Recording every file a row appeared in would cost a stored list per row, for a case that re-importing the second file already repairs. The confirmation states the exact number of rows that will go.

### Wipe and restore clear tables, not the database
Deleting the database would close the connection `App` owns and leave every `liveQuery` subscribed to a closed database. Clearing tables inside a transaction keeps the connection open and gives an atomic restore.
