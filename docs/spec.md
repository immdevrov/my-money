# Personal Budget App — Spec

What the app does and why. Working rules for building it live in `CLAUDE.md`.

This is a living document. Decisions reached in discussion are recorded here, with their reasoning, rather than in a parallel design doc.

## Goal
Local-only web app for a single user. Import bank statement exports (.xlsx), parse and categorize transactions, visualize spending, compare periods against baselines.

Base currency is GEL. All aggregation and display totals are in the base currency.

## Bank export format
- Workbook has multiple sheets. Transactions are on the sheet named "Transactions". Select it by name, not index. A missing sheet → import error naming the sheets found.
- Locate the header row by scanning for a row containing "Date" and "Details". Do not hardcode its index.
- Columns: Date, Details, then one column per currency (currently GEL, USD, EUR, GBP). Derive the currency list from the header cells after "Details".
  - Confirmed against the real export: nothing precedes "Date", nothing follows the last currency.
  - The real export has an unlabelled spacer column between "Details" and the first currency. Blank header cells after "Details" are ignored **wherever they occur**, not only at the end.
  - Each currency keeps its own absolute column index. The currency columns are not assumed to be contiguous, or to start immediately after "Details".
  - A derived currency must match `^[A-Z]{3}$`. Any other non-blank header aborts the import with an error naming that cell, instead of being treated as a currency and failing every row.
- Each row has a value in exactly one currency column. Zero or multiple values → failed row.
- Date column is the posting date. Accept all three cell forms:
  - String `DD/MM/YYYY`.
  - `Date` object: treat as UTC and extract with `getUTC*` methods.
  - Number: an Excel serial date.

### Amounts
- Amounts are signed decimals (negative = outflow), in either numeric or string cells.
- Conversion to minor units never passes through floating-point arithmetic:
  - A numeric cell is converted with `String(value)`, the shortest representation that round-trips, then parsed as a decimal string.
  - A decimal string is parsed digit-wise into minor units, half-up, away from zero.
  - More than two fraction digits is not expected from this export. The row still imports, rounded as above, and carries a warning, so an unexpected amount format surfaces rather than being silently rounded.
- The currency column is the only source of truth for the amount. The amount repeated inside Details is ignored: the bank frequently puts unrelated values there, so comparing the two produced constant false warnings. It is not parsed at all.

## Details parsing
Format: `<prefix> - Amount[:] <CUR><amount>; <body>`.

- `<prefix>` is not a closed set. `Income` and `Payment` are common, and the real export also uses `Outgoing Transfer`. Any prefix is accepted.
- `<body>` segments are separated by `;` for card rows and by `,` for service and fee rows.

Classify each row into a kind with independent matchers. Adding a new kind = one matcher + one fixture row.

| kind       | detection                                                   | extracted fields |
|------------|-------------------------------------------------------------|------------------|
| card       | body contains `Merchant:`                                   | merchant (text before first comma of the Merchant field), mcc (`MCC:1001`, no space), txDateTime (`Date: DD/MM/YYYY HH:mm`), cardLast4 (`Card No: ****1111`), originalAmount + originalCurrency (`Payment transaction amount and currency: 3.54 GEL`) |
| conversion | body starts with `Foreign Exchange` **or** `Automatic conversion` | rate — one matcher reads both `FX Rate:2.579` and `rate: 2.5790`, case-insensitively, with or without a space after the colon and with or without a trailing `.` |
| fee        | body starts with `Payment Fee`                              | payee (segment after `payment service,`, same as a service row), paymentCode |
| service    | body starts with `Payment,` and contains `payment service`  | payee (segment after `payment service,`), paymentCode (`payment code - 19518211161`) |
| transfer   | body contains `Beneficiary:`                                | beneficiary, account (`Account:`), bank (`Bank:`) |
| other      | no match                                                    | none; raw Details kept |

- `effectiveDate` = date part of `txDateTime` if present, else `postingDate`. Periods use `effectiveDate`. Store both dates.
- The `transfer` **kind** is a parsing label and is not the same thing as the `transfer` **category type**. A paired conversion is internal movement and is excluded from spending; an outgoing transfer to another party is real money leaving and must not be. Nothing may treat `kind === 'transfer'` as internal movement.
- The import preview shows a count of `other` rows, so new formats surface immediately.
- Every row format in this section is confirmed against the real export, including `conversion`.

## Import module design

The pipeline has exactly one impure boundary:

```ts
readWorkbook(file: File, sheet: string): Promise<ReadResult>    // impure, browser only
buildPreview(rows: unknown[][]): PreviewResult                  // pure, sync, total
```

Both return a discriminated result rather than throwing, so a workbook-level problem — a missing sheet, no header row, a non-currency column after `Details` — renders as a specific sentence instead of an exception.

`ImportView` makes those two calls and renders the result. It never performs header detection, normalization, or Details parsing itself — otherwise domain logic leaks into Svelte, where it can only be tested through the UI.

```ts
type ImportPreview = {
  headerRowNumber: number
  headerCells: string[]
  currencyColumns: { code: string; column: number }[]
  currencies: string[]
  rows: ParsedRow[]
  failed: { rowNumber: number; details: string; reason: FailureReason }[]
  warnings: { rowNumber: number; code: 'unexpected-precision'; cell: string; rounded: string }[]
  countsByKind: Record<DetailsKind, number>
}
```

Failures and errors are deliberately different things:

- **Row-level** problems never throw. Two currency values, an unparseable date, a missing amount → the row lands in `failed` with a discriminated `FailureReason`, so the UI renders a specific sentence and tests assert that exact text. One bad row must never abort an import of hundreds of good ones.
- **Workbook-level** problems abort with a typed error and produce no preview: missing `Transactions` sheet (naming the sheets found), no locatable header row, a post-`Details` header that is not a currency code.

## Currency

Conversion pairing:
- Conversion rows come in pairs: a GEL `Income` and a foreign-currency `Payment` with the same posting date and rate.
- Pair them by (postingDate, rate, opposite direction).
- Never pair by computed amount: bank rounding differs by 0.01–0.02.
- Paired conversions are internal movement: category type `transfer`, excluded from income and spending.
- A pair is one movement stored as two rows. Any aggregation that does include transfers, such as a future cash-flow or per-currency view, counts the pair once, never as an income plus a payment.
- An unpaired conversion row → import warning.
- Pairing runs over all unpaired conversion rows in the DB after each import, not only the new batch.

Rates:
- The rate table is derived from conversion pairs as (date, currency, rate), where rate = GEL per 1 unit of the foreign currency.
- A non-GEL transaction converts at the nearest rate on or before its `effectiveDate` for that currency.
- Fallback: a manual rate per currency in Settings.
- A non-GEL transaction with no available rate:
  - Shows a missing-rate marker in the GEL column.
  - Is excluded from totals.
  - The dashboard shows the count of such excluded transactions.
- Base-currency amounts are computed at aggregation time, never stored.

## Data model
```
Transaction {
  id
  postingDate: ISO date
  txDateTime: ISO datetime | null
  effectiveDate: ISO date
  amountMinor: int (negative = outflow)
  currency
  kind: 'card' | 'conversion' | 'service' | 'fee' | 'transfer' | 'other'
  details: raw string
  counterparty
  merchant | null
  mcc | null
  cardLast4 | null
  paymentCode | null
  conversionRate | null
  conversionPairId | null
  beneficiary | null
  account | null
  bank | null
  originalAmountMinor | null
  originalCurrency | null
  manualCategoryId | null
  importBatchId
}

Category { id, name, type: 'expense' | 'income' | 'transfer' | 'ignore', color }

Rule {
  id
  field: 'counterparty' | 'mcc' | 'details' | 'kind'
  match: 'equals' | 'contains' | 'regex'
  pattern
  categoryId
  priority
}

ImportBatch { id, fileName, importedAt, counts }

Settings { baseCurrency: 'GEL', manualRates: Record<currency, number> }
```
- `counterparty` values:
  - card → merchant
  - service or fee → payee
  - conversion → "Currency conversion"
  - transfer → beneficiary
  - other → truncated details
- `id` = `JSON.stringify([postingDate, currency, amountMinor, details, n])`, where n = occurrence index among identical rows within the same file.
- Dexie schema changes go through versioned migrations.

## Import
- Flow:
  1. File drop.
  2. Parse and normalize.
  3. Dedup check.
  4. Preview.
  5. Confirm.
  6. Persist.
  7. Conversion pairing.
- The preview shows:
  - Every parsed row with its extracted fields.
  - Counts per kind.
  - New, duplicate, and failed rows (with a reason for each failure).
  - Warnings (unexpected precision, unpaired conversion).
- Re-importing the same or an overlapping export produces zero new rows.
- Deleting an import batch removes its transactions.

## Categorization
Specified in `docs/specs/phase-4-categorization.md`. In short:
- Evaluation order: system (a paired conversion → Currency conversion), then manual, then rules by ascending priority with first match winning, then uncategorized.
- Only the manual choice is stored. System and rule assignments are derived on every read, so a rule change needs no re-apply pass.
- No rules are seeded. The only seeded category is Currency conversion.

No rules are seeded. The user creates every rule.

## Period semantics
- Periods are calendar month, quarter, and year, bucketed by `effectiveDate`.
- Only complete periods count toward baselines. The current incomplete period is excluded.
- Baseline options: mean, median, previous period.
- Mean and median are computed:
  - Over all complete periods in the data, excluding the compared period.
  - Per category, counting 0 for periods where the category has no transactions.
- Spending and income totals exclude categories of type `transfer` and `ignore`.
- A baseline requires at least 3 complete periods; otherwise display "insufficient data".
- Comparison output, per category and in total: current, baseline, delta, delta %.

## Views
1. **Import:** file drop, preview (see Import), confirm.
2. **Transactions:**
   - Columns: effective date, posting date, kind, counterparty, amount in original currency, amount in GEL (with missing-rate marker), category, pair status for conversion rows.
   - Sort.
   - Filters: period, category, kind, uncategorized, text.
   - Inline category edit.

   The view is built up across phases, because a column cannot be rendered before the data behind it exists. Phase 2 ships effective date, posting date, kind, counterparty, amount in original currency, and sorting. Phase 3 adds amount in GEL and pair status. Phase 4 adds the category column, inline category edit, and every filter — filters are deferred whole rather than split, so the filter bar is built once against a complete set.
3. **Rules:** CRUD, reorder priority, match count per rule.
4. **Categories:** CRUD with type and color.
5. **Dashboard:**
   - Period type and period picker, plus baseline picker.
   - Comparison table. Clicking a row opens Transactions filtered to that category and the selected period.
   - Count of transactions excluded from totals for missing rates.
   - Grouped bar chart per category (current vs baseline). Clicking a bar uses the same drill-down handler as the table row.
   - Line chart of monthly income and expense over the full history.
6. **Settings:** manual currency rates, full DB export/import as JSON, import batch list with delete, wipe all data.

## Build phases
1. Scaffold, app shell with hash routing and stub views, design tokens, Vitest projects (`behavior`, `scratch`), `tests/setup.ts` and helpers, synthetic fixture generator, domain types, import module, Import view with parsed preview (no persistence yet).
2. Dexie schema, persistence, dedup, confirm step, Transactions table.
3. Conversion pairing, rate table, pair status and GEL amounts in the Transactions table.
4. Categories, rules, categorizer, manual override, Rules and Categories views.
5. Aggregation engine, Dashboard pickers, comparison table with drill-down.
6. Charts with accessible data tables, bar-click drill-down.
7. Settings: manual rates, backup export/import, batch deletion, wipe.

### Phase 1 gate
Phase 1 is done only when the user confirms, through the Import view run locally, that the real export parses with zero failed rows.

- The gate is manual and user-reported. Claude never sees the real export.
- The preview is therefore the only diagnostic channel: every failed row states a specific reason, and every `other` row shows its raw Details, so an unhandled format can be reported without sharing the file.

## Required behavior coverage

Phase 1, import preview:
- Synthetic reference fixture: counts per kind and the parsed fields of selected rows match `fixtures/expected.json`.
- A missing "Transactions" sheet shows an error naming the sheets found.
- A header row at a non-default position is detected.
- All three date cell forms display the same date.
- Amounts display exactly.
- A two-currency row and an unparseable date become failed rows with reasons.
- An amount with a third decimal shows a warning and imports rounded half-up.
- An unknown Details format is counted as `other`.
- A month-boundary card payment shows different effective and posting dates.

Phase 2, persistence and dedup:
- A confirmed import appears in the Transactions table.
- Data survives `remount()`.
- Re-importing the same file shows 0 new rows in the preview; the table row count is unchanged.
- Overlapping exports import as a union without duplicates.
- Identical rows within one file are both present.
- Sorting by each sortable column produces the expected rows.

Phase 3, pairing and rates:
- A conversion pair shows as paired on both sides, in either wording of the Details body.
- An unpaired conversion shows a preview warning and an unpaired status.
- A pair split across two files shows as paired after the second import.
- A non-GEL transaction shows its GEL amount at the nearest earlier rate.
- A transaction with no earlier rate shows the missing-rate marker.

Phase 4, categorization: see `docs/specs/phase-4-categorization.md`.

Phase 5, comparison:
- With `freezeDate`, comparison table values for every period type and baseline match the expected values.
- The current incomplete period is excluded from baselines.
- Fewer than 3 complete periods shows "insufficient data".
- The mean counts zero for months where a category is absent.
- Transfer and ignore categories are excluded from totals.
- A month-boundary card payment is counted in its effective month.
- The missing-rate exclusion count is shown.
- Clicking a comparison table row opens Transactions filtered to that category and period.

Phase 6, charts:
- Each chart's data table matches the comparison table and the monthly totals.
- `setColorScheme('dark')` re-renders charts without errors.
- Bar-click drill-down reuses the table row handler and is not tested separately.

Phase 7, settings:
- A manual rate replaces missing-rate markers and updates totals.
- Export (via `captureDownload()`), then wipe, then upload the captured file restores transactions, categories, and rules identically.
- Deleting an import batch removes only its rows.
- Wipe leaves the app in its empty state.

## Decisions

Recorded as they are made, with the reasoning, so a later reader does not relitigate them.

### The real export never enters the repo
The user tests imports against their own bank export and reports the result. No anonymized fixture exists, and the repo is public.

- `.gitignore` ignores `*.xlsx` everywhere, with no allow-list, so no statement can be committed by accident. Synthetic fixtures are generated rather than committed, which is what makes a blanket ignore possible.
- `fixtures/expected.json` is hand-authored, never generated. It is an independent oracle; deriving it from the generator would mirror the generator's own bugs.
- The import preview is the only diagnostic channel, which is why its failure reasons are specific and `other` rows show raw Details.

### `id` is a composite key, not a hash
A hash collision would give two different transactions the same id. Dedup treats a known id as already imported, so one of them would be dropped with no symptom — silent data loss in a money app. `JSON.stringify` of the tuple rather than a joined string, because `details` is free text and may contain any separator.

### Amounts are parsed digit-wise
`Math.round(value * 100)` is correct for every two-decimal value; this was verified by brute force over 0.00–100000.00, with zero mismatches. It is wrong for three-decimal values — `10.075` gives `1007`, a cent low.

A statement in GEL/USD/EUR/GBP should never contain a third decimal, so this is not a live bug. The digit-wise parser is adopted anyway because it costs the same, satisfies "no floating-point arithmetic on amounts" literally rather than in spirit, and makes it possible to *detect* an unexpected third decimal and warn instead of silently rounding.

### The currency column is the only source of an amount
An earlier draft cross-checked the amount in `Details` against the currency column and warned on a mismatch. That check is gone, and `amount-mismatch` is not a warning kind.

The real export settled it. Where a card row carries `Payment transaction amount and currency:`, that figure is the *original* amount in the *original* currency — it differs from the posted amount whenever the card was used abroad, which is exactly when it appears. Comparing the two compares a foreign amount against its converted result, so every genuine foreign payment warned. The other kinds carry no amount in `Details` at all.

The original amount is still extracted, as `originalAmountMinor` and `originalCurrency`, because it is real data worth keeping. It is simply not evidence about the posted amount. The remaining warning, `unexpected-precision`, comes from the currency column alone.

### The conversion format was invented, then corrected
Phase 1 shipped a guessed conversion body, `Automatic conversion, rate: 2.7350`, because no conversion row had been seen. Phase 3's pairing and the whole rate table were built on it. The real export says:

```
Payment - Amount USD1000.00; Foreign Exchange. FX Rate:2.579
Income - Amount GEL2579.00; Foreign Exchange. FX Rate:2.579.
```

Only the marker was wrong. `FX Rate:2.579` is already matched by the existing `/rate:?\s*(\d+(?:\.\d+)?)/i`, case-insensitively and with no space after the colon, and the greedy decimal stops before the sentence's trailing `.`. Everything the pairing rests on survived contact: the two sides share a posting date and a rate, run in opposite directions, and `2579.00 / 1000.00 = 2.579` confirms the rate is GEL per one unit of the foreign currency.

The currency also appears in the head, as `Amount USD1000.00`. It is not read from there. The currency column is the only source of a row's currency and amount, per the decision above, and the head would only duplicate it.

Both markers are accepted rather than the old one being replaced. Two rows are not enough to conclude that `Automatic conversion` never appears — statements differ by account, product and vintage, and an unrecognised conversion is not a loud failure: it silently becomes an `other` row, never pairs, and contributes no rate. Accepting both costs one `||`. Guessing that the old wording is dead costs a silent hole in the rate table.

Each marker is therefore exercised separately, so neither can rot unnoticed: the generated fixture uses the real `Foreign Exchange` wording, and a behavior test covers `Automatic conversion`.

The cost of the guess was one string. That is the argument for keeping format assumptions in a single matcher per kind rather than spread across the pipeline.

### The app shell exists from phase 1
Every behavior test renders `App` and navigates through the app's own navigation. Without a shell in phase 1, phase 1's tests would reach the Import view by a route no later test uses, and would be rewritten in phase 2 along with the helpers.

### Deployed to GitHub Pages
- Public repo, built and deployed by a GitHub Actions workflow.
- Vite `base` is the repo path; routing is hash-based, because Pages has no SPA fallback for path routes.
- `github.io` is one origin shared by every Pages project on the account, so the Dexie database name and every `localStorage` key are namespaced to this app.
- `localhost` in development and `github.io` in use are separate origins, therefore separate databases. Development cannot corrupt real history.
- Data is per-device and does not sync. The deployed app opened on another device has an empty database. The phase 7 JSON export is the only way data moves between devices.

### Storage durability
IndexedDB is evictable and clearing site data removes everything. From phase 2 the app requests `navigator.storage.persist()` once on first load, feature-detected and failure-tolerant. Phase 7 surfaces how long it has been since the last backup.

### Design tokens from phase 1
`src/ui/styles/tokens.css` is established in phase 1 rather than retrofitted. The chart rules already require colors to be read from CSS custom properties and charts to re-render on `prefers-color-scheme` change, so the token layer is mandatory regardless; building it first avoids restyling every view in phase 6.

### `write-excel-file` for the fixture generator
Same author as `read-excel-file`, so encoding quirks mirror the reader, and it installs from npm rather than a CDN tarball. It must be able to emit a bare numeric serial-date cell, a `Date` cell, and a string date cell, since the spec requires all three forms. If it cannot, it is replaced with SheetJS and nothing else changes.

## Out of scope (v1)
Budgets/targets, multiple banks, auth, sync, LLM categorization, recurring-payment detection, forecasting.
