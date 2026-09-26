# Phase 7 Implementation Plan — Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings view with fallback manual rates, the import batch list with deletion, wipe, and JSON backup export and restore with the time since the last backup.

**Architecture:** One new Dexie table, `settings`, holds the manual rates and `lastBackupAt`. The GEL lookup `gelAmount` takes a `Rates` object of pair-derived table plus manual rates, and reports whether a pair or a manual rate priced the row, so every view converts and marks identically. Wipe and restore clear tables inside one transaction and never delete the database, so `App`'s connection and every `liveQuery` stay live.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Dexie 4.4.6 `liveQuery`, Vitest 4 Browser Mode with `@vitest/browser-playwright`, vitest-browser-svelte.

**Spec:** `docs/specs/phase-7-settings.md`. It is the source of truth for every name, label and message quoted below.

## Global Constraints

- Everything in `CLAUDE.md` applies. Read it first.
- **Derived, never stored:** only manual rates and `lastBackupAt` are new stored values. GEL amounts, rate sources, per-batch counts and per-currency counts are computed on read.
- **Money and rates:** a manual rate is parsed with `scaledFromDecimal(text, 6)` from `src/import/amount.ts` and stored as an integer at `RATE_SCALE` (`src/import/details/conversion.ts`). It is displayed with `formatRate`. Every GEL amount goes through `toGelMinor`. No float arithmetic on amounts or rates.
- **Base currency** stays the constant `'GEL'`, not a setting.
- **Dexie:** version 4 adds `settings: 'key'`, with no upgrade function. Earlier versions stay untouched. Every repository function starts with `await openDatabase()`, like the existing ones in `src/db/`.
- **Colors** only from `tokens.css` custom properties. The modal dialogs reuse the `<dialog>` + `showModal()` pattern in `src/ui/views/CategoriesView.svelte`, with `aria-labelledby` on a heading.
- **Accessibility:** every table has a `<caption>` (the name tests use) and `th` header cells. Every input and button has an accessible name.
- **Test surface:** render the smallest view that holds the behavior. That's `SettingsView`, then `TransactionsView`, `DashboardView`, `CategoriesView` or `RulesView` where the effect shows. `App` only for the remount checks. Load data with `importRows` (`tests/helpers/importRows.ts`) and `categorize` (`tests/helpers/categorize.ts`).
- **Locators:** anchor exact text with a regex (`/^no rate$/`), since locators match substrings. Buttons inside a dialog are located within `getByRole('dialog')`, because `Delete` also matches `Delete import …` and `Wipe` matches `Wipe all data`.
- **Test data is synthetic**, with made-up names only. The conversion and card rows below reuse the shapes in `tests/pairing.test.ts`. Its constants are module-local, so copy them into the new test file rather than importing.
- **Timeouts:** tests that import take `{ timeout: 5000 }` (`SLOW`). Tests that import, categorize and navigate `App` take `{ timeout: 15000 }`.
- **TDD:** every behavior lands test-first. Watch it fail for the expected reason, then implement.
- **Verify per task:** `npm run typecheck`, then `npx vitest run --project behavior <the task's test file>`. A task that changes `src/aggregate/`, `TransactionsView.svelte`, `DashboardView.svelte`, `App.svelte`, `src/db/database.ts` or `tests/setup.ts` also runs `npm test`.
- **Shell:** Windows. Use the Bash tool (Git Bash) or PowerShell for commands, and Write/Edit for files, never heredocs or scripts that write files.
- **Commits:** one per task, one short line in the repo's style (for example `Add manual fallback rates`), no attribution lines of any kind. Never push.

Mutation testing, the final `npm run test:all`, and the phase report are done by the controller after Task 6, per `CLAUDE.md`. They are not tasks here.

**Human verification (at the finish, non-blocking):** the user runs `npm run dev` and opens `#/settings` with data, in light and dark:
- The four sections (Manual rates, Backup, Imports, Wipe all data) read clearly. The rate inputs line up in their table, and at phone width nothing scrolls horizontally.
- Export backup downloads a `budget-my-backup-YYYY-MM-DD.json`, and restoring it in a fresh browser profile brings the data back.
- The three dialogs are modal, close on Escape, and Cancel is focusable.

---

### Task 1: Manual fallback rates in Settings and Transactions

**Files:**
- Modify: `src/db/database.ts` (v4), `src/aggregate/gel.ts`, `src/aggregate/count.ts`, `src/aggregate/compare.ts`, `src/aggregate/monthly.ts`, `src/ui/views/TransactionsView.svelte`, `src/ui/views/DashboardView.svelte` (signature only, see below), `src/App.svelte`
- Create: `src/db/settings.ts`, `src/ui/views/SettingsView.svelte`, `tests/settings-rates.test.ts`
- Delete: `src/ui/views/StubView.svelte`

**Interfaces (Produces):**
```ts
// src/db/database.ts
type SettingsRow =
  | { key: 'manualRates'; value: Record<string, number> }
  | { key: 'lastBackupAt'; value: string };
settings!: Table<SettingsRow, string>;             // v4: settings: 'key'

// src/db/settings.ts
getManualRates(): Promise<Record<string, number>>          // {} when unset
setManualRate(currency: string, rateScaled: number | null): Promise<void>   // null removes the currency's key

// src/aggregate/gel.ts  (rateTableFrom is removed; all callers move to ratesFrom)
type Rates = { table: Rate[]; manual: Record<string, number> };
type GelAmount = { minor: number; source: 'pair' | 'manual' };
ratesFrom(rows: Transaction[], manual: Record<string, number>): Rates;
gelAmount(row: Transaction, rates: Rates): GelAmount | null;

// src/aggregate/count.ts
countRow(row: Transaction, categories: Map<string, Category>, rates: Rates): Counted;

// src/aggregate/compare.ts, monthly.ts: input gains  manualRates: Record<string, number>
```

**Behavior:**
- `gelAmount`:
  - A GEL row gives `{ minor: amountMinor, source: 'pair' }`.
  - Otherwise, when `rateFor(table, currency, effectiveDate)` finds a rate, it gives `toGelMinor` at that rate, with `'pair'`.
  - Otherwise, when `manual[currency]` is set, it gives `toGelMinor` at that rate, with `'manual'`.
  - Otherwise it returns `null`.
- `compare` and `monthlyTotals` build `ratesFrom(rows, input.manualRates)` once. In this task, `DashboardView` passes `manualRates: {}`, and Task 2 wires the real rates.
- `TransactionsView` reads `liveQuery(getManualRates)`. Its GEL cell is `formatMinor(minor)`, plus ` (manual rate)` when the source is `'manual'`, or `no rate` for `null`.
- `SettingsView`: an `h1` "Settings", then a section with the `h2` "Manual rates".
  - The section holds a table captioned `Manual rates`, with the columns `Currency`, `Without a conversion rate`, `Manual rate (GEL per unit)`.
  - The rows are the union of every non-GEL currency in `listAll()` and every key of the saved rates, in alphabetical order.
  - `Without a conversion rate` counts the rows of that currency for which `rateFor` over the pair table returns `null`.
  - The rate cell holds an input labelled `Manual rate for {CUR}`, prefilled with `formatRate(saved)` or empty, and a button `Save rate for {CUR}`.
  - Save: an empty (trimmed) value calls `setManualRate(cur, null)`. A value matching `/^\d+(\.\d{1,6})?$/` whose scaled value is > 0 calls `setManualRate(cur, scaled)`. Anything else shows `Enter a positive rate with up to 6 decimals, or leave it empty to clear it.` in that row and saves nothing.
  - With no rows, the section shows `No foreign-currency transactions.` instead of the table.
- `App.svelte`: the `settings` route renders `SettingsView`. `StubView` and the routes' `phase` field go.

**Test data** (header `['Date', 'Details', 'GEL', 'USD', 'EUR']`):
- `CONVERSION_GEL` `['10/02/2025', 'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.', 273.5, null, null]`
- `CONVERSION_USD` `['10/02/2025', 'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735', null, -100, null]`
- `STREAM_AFTER` `['12/02/2025', 'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005', null, -20, null]`, priced by the pair at -54.70
- `STREAM_JAN` `['28/01/2025', 'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005', null, -20, null]`, which has no rate
- `CAFE_EUR` `['15/03/2025', 'Payment - Amount: EUR10.00; Merchant: Cafe Gamma, Online; MCC:5812', null, null, -10]`, which has no rate

**Definition of done** (tests in `tests/settings-rates.test.ts`):
- "a manual rate prices only what no conversion prices, and is marked": import all five. In Settings, fill `Manual rate for USD` with `2.5` and save. Then in Transactions:
  - `-50.00 (manual rate)` is shown once.
  - `-54.70` shows with no marker.
  - `-273.50` shows for the USD conversion.
  - `no rate` shows exactly once (the EUR row).
- "clearing a manual rate brings the marker back": save USD `2.5`, remount SettingsView, and the input shows `2.5`. Clear it and save. Transactions then shows `no rate` twice and no `(manual rate)` text.
- "an invalid rate is refused and saves nothing": for each of `abc`, `0` and `2.1234567`, save shows the message. After a remount the USD input is empty, and Transactions shows `no rate` twice.
- "the rates table lists each foreign currency with its rows without a conversion rate": import all five. Table `Manual rates` has the body rows `EUR | 1` and `USD | 1` (the first two cells) in that order.
- "with only GEL rows there are no rates to set": import `['05/02/2025', 'Alpha payment', -1, null, null]`. `No foreign-currency transactions.` is visible, and no `Manual rates` table.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-rates.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the schema, the settings repository, the rate lookup and its callers, the Settings view and route, and the Transactions marker.
- [ ] **Step 3: Verify and commit** `Add manual fallback rates`.

---

### Task 2: Manual rates in Dashboard totals

**Files:**
- Modify: `src/ui/views/DashboardView.svelte`
- Test: `tests/settings-rates.test.ts`

**Interfaces:**
- Consumes: `getManualRates()`, and the `manualRates` input of `compare` and `monthlyTotals` from Task 1.

**Behavior:** `DashboardView` reads `liveQuery(getManualRates)` and passes the result to both `compare` and `monthlyTotals`, in place of Task 1's `{}`.

**Definition of done** (a test in `tests/settings-rates.test.ts`, `SLOW`):
- "a manual rate enters the Dashboard totals": `freezeDate('2025-06-15T12:00:00')`, header `['Date', 'Details', 'GEL', 'USD']`, rows `['10/05/2025', 'Grocer payment', -20, null]` and `['12/05/2025', 'Payment - Amount: USD10.00; Merchant: Stream Beta, Online; MCC:1005', null, -10]`.
  - Dashboard before any rate: `1 transaction excluded from totals: no exchange rate.` is visible, and the `Spending comparison` row starting `Total spending` has current `20.00`.
  - Save `Manual rate for USD` = `2.5` in Settings. Dashboard then shows `Total spending` current `45.00`, and no text containing `no exchange rate`, from either the comparison or the monthly chart.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-rates.test.ts`, then `npm test`.

- [ ] **Step 1: Failing test** above.
- [ ] **Step 2: Implement** the wiring.
- [ ] **Step 3: Verify and commit** `Count manually priced rows in Dashboard totals`.

---

### Task 3: Import list and batch deletion

**Files:**
- Modify: `src/db/batches.ts`, `src/ui/views/SettingsView.svelte`
- Create: `tests/settings-imports.test.ts`

**Interfaces (Produces):**
```ts
// src/db/batches.ts
type BatchSummary = { batch: ImportBatch; transactions: number };   // live count of rows with that importBatchId
listBatchesWithCounts(): Promise<BatchSummary[]>                     // newest first by importedAt
deleteBatch(id: string): Promise<void>                               // one rw transaction: the batch row and its transactions
```

**Behavior:**
- A section with the `h2` "Imports" holds a table captioned `Imports`, with the columns `File`, `Imported`, `Transactions` and a last header cell `Actions`.
  - `Imported` is the local `YYYY-MM-DD HH:mm` of `importedAt`.
  - Each row has a button `Delete import {fileName}`.
- The button opens a modal dialog with the heading `Delete import` and the text `Delete import {fileName}? This removes {N} transactions.`, with the buttons `Delete` and `Cancel`. `Delete` calls `deleteBatch` and closes the dialog.
- With no batches, the section shows `No imports yet.` instead of the table.
- The list is a `liveQuery`, so it and the rates table (Task 1) update after a delete.

**Test data** (header `['Date', 'Details', 'GEL', 'USD', 'EUR']`, rows from Task 1 plus):
- `january.xlsx`, imported under `freezeDate('2025-03-01T10:00:00')`: `CONVERSION_GEL`, `['05/02/2025', 'Alpha payment', -1, null, null]`.
- `february.xlsx`, imported under `freezeDate('2025-03-02T11:30:00')`: `CONVERSION_USD`, `['06/02/2025', 'Beta payment', -2, null, null]`, `['07/02/2025', 'Gamma payment', -3, null, null]`.

Pass `fileName` through `importRows`' options.

**Definition of done** (tests in `tests/settings-imports.test.ts`, `SLOW`):
- "with no imports the list says so": `No imports yet.` is visible.
- "imports are listed newest first with their live row counts": the body rows are `february.xlsx | 2025-03-02 11:30 | 3` and `january.xlsx | 2025-03-01 10:00 | 2`.
- "deleting an import removes only its rows and unpairs what it paired":
  - Transactions first shows `paired` twice.
  - `Delete import january.xlsx` opens a dialog containing `Delete import january.xlsx? This removes 2 transactions.`
  - `Cancel` leaves both imports listed.
  - Reopening it and choosing `Delete` leaves one row, `february.xlsx`.
  - Transactions then has 3 body rows, `Beta payment` and `Gamma payment` present, `Alpha payment` absent, `unpaired` once and `paired` never.
- "a saved rate stays listed after its currency's rows are gone": import `CAFE_EUR` as `euro.xlsx`, save `Manual rate for EUR` = `3`, delete `euro.xlsx`. Table `Manual rates` has the row `EUR | 0`, and the input shows `3`.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-imports.test.ts`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the repository functions and the Imports section.
- [ ] **Step 3: Verify and commit** `List imports and delete one`.

---

### Task 4: Wipe all data

**Files:**
- Create: `src/db/backup.ts` (`wipeAll` now; export and restore arrive in Tasks 5–6), `tests/settings-wipe.test.ts`
- Modify: `src/ui/views/SettingsView.svelte`

**Interfaces (Produces):**
```ts
// src/db/backup.ts
wipeAll(): Promise<void>   // one rw transaction over all five tables: clear each, then add CURRENCY_CONVERSION
```

**Behavior:**
- A section with the `h2` "Wipe all data" holds a button `Wipe all data`. It opens a modal dialog with the heading `Wipe all data` and the text `Delete all transactions, imports, categories, rules and manual rates? This cannot be undone. Export a backup first if you may need them.`, with the buttons `Wipe` and `Cancel`.
- `Wipe` calls `wipeAll` and closes the dialog. It never deletes the database or touches `localStorage`.

**Test data:** Task 1's five rows (header with USD and EUR), then `categorize([{ name: 'Streaming', contains: 'Stream' }])`, then USD manual rate `2.5` saved in Settings.

**Definition of done** (tests in `tests/settings-wipe.test.ts`, `{ timeout: 15000 }`):
- "cancelling a wipe keeps everything": `Cancel` in the dialog. The Imports table still has 1 row, and the `Manual rates` table is still shown.
- "wipe leaves the app as freshly installed, and it stays so after a reload":
  - Set `location.hash = '#/settings'`, render `App`, and wipe through the dialog.
  - Settings then shows `No imports yet.` and `No foreign-currency transactions.`
  - Following the nav links: Transactions shows `No transactions yet. Import a statement to get started.`, the `Categories` table's only body row is `Currency conversion`, and Rules shows `No rules yet. Pick a category on a transaction to create one.`
  - `remount(App)`, then navigate to Settings: `No imports yet.` again. Then Categories: still only `Currency conversion`.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-wipe.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** `wipeAll` and the section.
- [ ] **Step 3: Verify and commit** `Wipe all data`.

---

### Task 5: Backup export and the time since the last backup

**Files:**
- Create: `src/db/backupFormat.ts` (the `BackupFile` type now; `parseBackup` in Task 6), `tests/helpers/captureDownload.ts`, `tests/settings-backup.test.ts`
- Modify: `src/db/backup.ts`, `src/db/settings.ts`, `src/ui/views/SettingsView.svelte`, `tests/setup.ts`

**Interfaces (Produces):**
```ts
// src/db/backupFormat.ts
const BACKUP_FORMAT = 'budget-my-backup'; const BACKUP_VERSION = 1;
type BackupFile = {
  format: 'budget-my-backup'; version: 1; exportedAt: string;
  transactions: StoredTransaction[]; importBatches: ImportBatch[];
  categories: Category[]; rules: Rule[]; manualRates: Record<string, number>;
};

// src/db/backup.ts
exportBackup(): Promise<BackupFile>   // reads every table in one r transaction; exportedAt = new Date().toISOString(); stores lastBackupAt = exportedAt

// src/db/settings.ts
getLastBackupAt(): Promise<string | null>

// tests/helpers/captureDownload.ts
captureDownload(): () => Promise<File>
```

**Behavior:**
- A section with the `h2` "Backup" holds a button `Export backup` and the last-backup line.
- **Export:** `exportBackup()`, then `JSON.stringify(backup, null, 2)` as an `application/json` Blob. The Blob goes to `URL.createObjectURL`. The view then creates an anchor with `href` set to that URL and `download` set to `budget-my-backup-{local YYYY-MM-DD of exportedAt}.json`, calls `anchor.click()`, and revokes the URL.
- **Last backup line**, from `liveQuery(getLastBackupAt)`:
  - `Never backed up.` when there is none.
  - Otherwise, with `days` = local calendar days from the backup's date to today's date (`new Date()` at render): `Last backup: today.` for 0 or less, `Last backup: 1 day ago.`, and `Last backup: {N} days ago.`
- **captureDownload:**
  - `vi.spyOn(URL, 'createObjectURL')` records the Blob and returns `'blob:captured'`.
  - `vi.spyOn(HTMLAnchorElement.prototype, 'click')` records `this.download` and does not call through.
  - The returned function waits with `vi.waitFor` until both are recorded, then resolves `new File([blob], name, { type: blob.type })`.
- `tests/setup.ts` calls `vi.restoreAllMocks()` in `beforeEach`.

**Definition of done** (tests in `tests/settings-backup.test.ts`):
- "export downloads a dated backup of every stored table" (`SLOW`):
  - `freezeDate('2025-06-15T12:00:00')`, import Task 1's `CONVERSION_GEL`, `CONVERSION_USD` and `STREAM_JAN`, and save USD rate `2.5`.
  - Export gives a file named `budget-my-backup-2025-06-15.json`.
  - Its parsed JSON has `format` `budget-my-backup`, `version` 1, 3 transactions, 1 import batch, 1 category (Currency conversion), 0 rules, and `manualRates` `{ USD: 2500000 }`.
  - No transaction record has a `kind` or `effectiveDate` key: derived fields are not exported.
- "the last backup counts calendar days":
  - `freezeDate('2025-06-15T23:30:00')`: `Never backed up.`, then export, then `Last backup: today.`
  - `freezeDate('2025-06-16T00:30:00')` and remount SettingsView: `Last backup: 1 day ago.`
  - `freezeDate('2025-06-18T09:00:00')` and remount: `Last backup: 3 days ago.`
- "a wipe forgets the last backup": export, then wipe through the dialog, then `Never backed up.`

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-backup.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above, with the helper.
- [ ] **Step 2: Implement** export, the file download and the last-backup line.
- [ ] **Step 3: Verify and commit** `Export a backup and show its age`.

---

### Task 6: Restore from backup

**Files:**
- Modify: `src/db/backupFormat.ts`, `src/db/backup.ts`, `src/ui/views/SettingsView.svelte`
- Test: `tests/settings-backup.test.ts`

**Interfaces (Produces):**
```ts
// src/db/backupFormat.ts — pure, no DB or UI import
type BackupTable = 'transactions' | 'importBatches' | 'categories' | 'rules' | 'manualRates';
type BackupError =
  | { code: 'not-json' }
  | { code: 'not-a-backup' }
  | { code: 'newer-version'; version: number }
  | { code: 'invalid-exported-at' }
  | { code: 'missing-table'; table: BackupTable }
  | { code: 'invalid-entry'; table: BackupTable; entry: number };   // 1-based
parseBackup(text: string): { ok: true; backup: BackupFile } | { ok: false; error: BackupError };

// src/db/backup.ts
restoreBackup(backup: BackupFile): Promise<void>
```

**Behavior:**
- `parseBackup` checks, in this order:
  1. `JSON.parse` fails → `not-json`.
  2. Not an object, or `format !== 'budget-my-backup'` → `not-a-backup`.
  3. `version` not a number → `not-a-backup`. `version > 1` → `newer-version`.
  4. `exportedAt` not a string → `invalid-exported-at`.
  5. Each table in the order `transactions`, `importBatches`, `categories`, `rules`, `manualRates`: missing, or of the wrong container type → `missing-table`. Otherwise the first bad record → `invalid-entry`.
- Record checks:
  - **transactions:** `id` string, `postingDate` `/^\d{4}-\d{2}-\d{2}$/`, `currency` `/^[A-Z]{3}$/`, `amountMinor` safe integer, `details` string, `importBatchId` string, `manualCategoryId` string or null.
  - **importBatches:** `id`, `fileName` and `importedAt` strings, `counts.imported`, `counts.duplicate` and `counts.failed` safe integers.
  - **categories:** `id`, `name` and `color` strings, `type` one of `expense`, `income`, `transfer`, `ignore`.
  - **rules:** `id`, `pattern` and `categoryId` strings, `field` one of `counterparty`, `mcc`, `details`, `kind`, `match` one of `equals`, `contains`, `regex`, `priority` safe integer.
  - **manualRates:** a key matching `/^[A-Z]{3}$/` with a positive safe integer value, entries in `Object.entries` order.
  
  A record is copied with only its known keys, so unknown keys never reach the database.
- The view's error sentences (spec, Restore step 1):
  - `This file is not valid JSON.`
  - `This file is not a budget-my backup.`
  - `This backup is version {N}; this app reads version 1.`
  - `This backup is damaged: exportedAt is invalid.`
  - `This backup is damaged: {table} is missing.`
  - `This backup is damaged: {table} entry {i} is invalid.`
- `restoreBackup`: one rw transaction over all five tables.
  1. Clear each table.
  2. `bulkAdd` the backup's transactions, importBatches, categories and rules.
  3. Add Currency conversion when no category has its id.
  4. Put `manualRates` and `lastBackupAt = exportedAt`.
- **View:**
  - A file input labelled `Restore from backup`, in the Backup section. Choosing a file reads `file.text()` and runs `parseBackup`.
  - A parse error shows its sentence (`role="alert"`) and opens no dialog.
  - Success opens a modal dialog with the heading `Restore backup` and the text `Replace all data with this backup? It holds {T} transactions, {C} categories and {R} rules. Your current {M} transactions will be replaced.`, with the buttons `Restore` and `Cancel`. `M` is the current transaction count.
  - `Restore` runs `restoreBackup`, then shows `Backup restored.` (`role="status"`). A rejection shows `The backup could not be restored: {error.message}` (`role="alert"`), and the data is unchanged.
  - `Cancel` closes the dialog and changes nothing.
  - The input's value is reset after each attempt, so the same file can be chosen again.

**Definition of done** (tests in `tests/settings-backup.test.ts`):
- "a backup restores everything identically, and it survives a reload" (`{ timeout: 15000 }`):
  - `freezeDate('2025-06-15T12:00:00')`, `location.hash = '#/settings'`, render `App`.
  - Data: Task 1's `CONVERSION_GEL`, `CONVERSION_USD` and `STREAM_JAN`, plus `['05/02/2025', 'Grocer payment', -12, null, null]` and `['06/02/2025', 'Shop Alpha', -7, null, null]`. Then `categorize([{ name: 'Groceries', contains: 'Grocer' }])`, `Groceries` chosen manually in the `Category for Shop Alpha` select in Transactions, and USD rate `2.5`.
  - Record the text of every row of the `Transactions`, `Categories` and `Rules` tables and the USD rate input.
  - Export, wipe, then upload the captured file to `Restore from backup`.
  - The dialog reads `Replace all data with this backup? It holds 5 transactions, 2 categories and 1 rules. Your current 0 transactions will be replaced.`
  - Choose `Restore`, and `Backup restored.` shows.
  - Every recorded table and the rate input then equal their recorded values.
  - After `remount(App)` they are still equal.
- "a restore reports the age of the backup it restored" (`SLOW`): export under `freezeDate('2025-06-15T12:00:00')`, then wipe. Under `freezeDate('2025-06-20T12:00:00')`, restore. `Last backup: 5 days ago.`
- "cancelling a restore changes nothing" (`SLOW`): import `STREAM_JAN`, export, then import `['05/02/2025', 'Alpha payment', -1, null, null]`. Upload the backup, and the dialog says `Your current 2 transactions`. `Cancel`. Transactions still has 2 body rows.
- "a file that is not a usable backup is refused and changes nothing" (`SLOW`): import `STREAM_JAN`. Upload each of the following `File`s and see its sentence, with no dialog. Transactions then still has its 1 body row.

  | File contents | Sentence |
  |---|---|
  | `nope` | `This file is not valid JSON.` |
  | `{"hello":1}` | `This file is not a budget-my backup.` |
  | `{"format":"budget-my-backup","version":2}` | `This backup is version 2; this app reads version 1.` |
  | `{"format":"budget-my-backup","version":1,"transactions":[],"importBatches":[],"categories":[],"rules":[],"manualRates":{}}` | `This backup is damaged: exportedAt is invalid.` |
  | the same with `"exportedAt":"2025-06-15T08:00:00.000Z"` and without `rules` | `This backup is damaged: rules is missing.` |
  | the same with `"rules":[]` and `"transactions":[{"id":1}]` | `This backup is damaged: transactions entry 1 is invalid.` |

- "a restore that fails leaves the data intact" (`SLOW`):
  - Import `STREAM_JAN` and export. Parse the captured JSON in the test and duplicate its first transaction.
  - Upload that as `dup.json` and choose `Restore`.
  - A message starting `The backup could not be restored:` shows, and Transactions still has its 1 body row.
  - No `console.error` may fire: the view catches the rejection.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/settings-backup.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** `parseBackup`, `restoreBackup` and the restore flow.
- [ ] **Step 3: Verify and commit** `Restore from a backup`.
