# Phase 1 Implementation Plan — Import preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can drop a bank statement `.xlsx` on the Import view and see every row parsed, classified, and validated — with no persistence.

**Architecture:** One impure boundary (`readWorkbook`, which owns read-excel-file) feeding a pure, total `buildPreview`. The Svelte shell routes by hash and renders the preview; it performs no parsing itself. Every parsing decision is proven through a browser behavior test that drives the real UI.

**Tech Stack:** Vite 8, Svelte 5 (runes), TypeScript 6, read-excel-file 9 (pinned exact), Vitest 4 Browser Mode + `@vitest/browser-playwright` + `vitest-browser-svelte`, `write-excel-file` + `tsx` (dev-only).

**Spec:** `docs/spec.md`

## Global Constraints

- Client-only SPA. No backend, no network requests carrying financial data.
- Pinned versions: `read-excel-file@9.3.10` (exact, no caret), `vitest@4.1.11`, `@vitest/browser-playwright@4.1.11`, `vitest-browser-svelte@3.1.0`, `svelte@5.57.1`, `typescript@6.0.3`, `svelte-check@4.7.6`, `vite@8.3.0`, `@sveltejs/vite-plugin-svelte@7.3.0`, `write-excel-file@4.1.1`, `tsx@4.23.15`.
  - **Not** TypeScript 7: `svelte-check@4.7.6` peers `typescript ^5.0.0 || ^6.0.0`.
  - **Not** Vitest 5: `@vitest/browser-playwright@5.0.1` peers `vitest` at exactly `5.0.1`, and `docs/spec.md` specifies Vitest 4.
  - Dexie and Chart.js are **not** installed in phase 1. They belong to phases 2 and 6.
- `src/import/readWorkbook.ts` is the only file that may import read-excel-file.
- Domain modules (`src/domain`, `src/import`) never import from `src/ui`.
- No floating-point arithmetic on amounts.
- Every interactive element has an accessible name. Every table has a `<caption>`.
- Tests: only `tests/**/*.test.ts`, each rendering `src/App.svelte` and nothing else from `src/`. No unit tests, no component tests, no jsdom/happy-dom, no screenshots.
- `.gitignore` ignores `*.xlsx` everywhere. Fixtures are generated, never committed.
- Chromium runs headless with `timezoneId: 'Asia/Tbilisi'`.
- Before writing the read-excel-file adapter (Task 4), read `node_modules/read-excel-file/README.md` and its `.d.ts` files. Before writing `vitest.config.ts` (Task 2), read the installed Vitest and `vitest-browser-svelte` types. Do not rely on remembered API.

Process invariants: TDD — every behavior change lands test-first. Run the task's Verify command before every commit.

**Human verification:** one batched checkpoint at the finish (after Task 11). The user runs `npm run dev` in their own terminal, opens the Import view, and drops their real export. Pass = zero failed rows. Never start the dev server on their behalf.

---

### Task 1: Scaffold, app shell, design tokens

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, `.gitignore`
- Create: `src/main.ts`, `src/App.svelte`, `src/ui/styles/tokens.css`
- Create: `src/ui/views/ImportView.svelte`, `src/ui/views/StubView.svelte`

**Interfaces:**
- Produces: `App.svelte` renders a `<nav>` with six links whose hashes are `#/import`, `#/transactions`, `#/rules`, `#/categories`, `#/dashboard`, `#/settings`. Unknown or empty hash renders the Import view. `StubView.svelte` takes props `{ title: string; phase: number }` and renders `<h1>{title}</h1>` plus the text `Arrives in phase {phase}.`

**Definition of done:**
- `npm run dev` serves the app; `npm run build` produces `dist/`.
- `vite.config.ts` sets `base: '/budget-my/'`.
- Navigation is a `<nav aria-label="Views">` containing links named exactly: `Import`, `Transactions`, `Rules`, `Categories`, `Dashboard`, `Settings`.
- Clicking a nav link changes `location.hash` and swaps the rendered view. The active link carries `aria-current="page"`.
- Views 2–6 render `StubView`; Import renders `ImportView`, which at this task shows only `<h1>Import</h1>`.
- `tokens.css` defines, on `:root`, custom properties for surface/text/border/accent colors, a 4-step spacing scale, and a type scale; it redefines only the colors inside `@media (prefers-color-scheme: dark)`. No component declares a literal color.
- `.gitignore` contains `node_modules/`, `dist/`, `scratch/`, `*.xlsx`, `budget-my-backup-*.json`.

**Verify:** `npm run typecheck && npm run build` → both exit 0 (`typecheck` = `svelte-check --tsconfig ./tsconfig.json`)

- [ ] **Step 1: Initialize package and configs** — install the pinned versions above; scripts `dev`, `build`, `preview`, `typecheck`. `tsconfig.json` sets `strict: true`, `verbatimModuleSyntax: true`, `moduleResolution: "bundler"`.
- [ ] **Step 2: Shell, routing, stub views, tokens** — hash routing via a `$state` rune updated from a `hashchange` listener registered in `$effect`.
- [ ] **Step 3: Verify and commit** — run Verify, then `git commit -m "Scaffold app shell with hash routing and design tokens"`

---

### Task 2: Vitest browser harness and the first behavior test

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/app-shell.test.ts`

**Interfaces:**
- Consumes: `src/App.svelte` from Task 1.
- Produces: the `behavior` and `scratch` Vitest projects; `npm test` runs `behavior` only, `npm run test:scratch` runs `scratch` with `passWithNoTests`.

**Definition of done:**
- `behavior` project: `include: ['tests/**/*.test.ts']`, browser mode, `@vitest/browser-playwright` provider, Chromium, headless, `fileParallelism: false`, `setupFiles: ['tests/setup.ts']`, Playwright context option `timezoneId: 'Asia/Tbilisi'`.
- `tests/setup.ts`: `beforeEach` deletes the app IndexedDB database by name (harmless while none exists), resets `location.hash` to `''`, and calls `vi.useRealTimers()`. Any `console.error` fails the test. `dangerouslyIgnoreUnhandledErrors` is never set.
- `tests/app-shell.test.ts` proves: the six nav links render with their exact names; the Import view is shown by default; clicking `Transactions` shows `Arrives in phase 2.`; the Transactions link then has `aria-current="page"`.

**Verify:** `npm test` → 1 test file, all assertions pass

- [ ] **Step 1: Read installed API** — read the installed `vitest` and `vitest-browser-svelte` types and docs for the v4 browser-mode config shape before writing config.
- [ ] **Step 2: Failing test** — `tests/app-shell.test.ts` with the four assertions above, using `getByRole('link', { name: 'Transactions' })` and `expect.element(...)`.
- [ ] **Step 3: Config and setup until green**
- [ ] **Step 4: Verify and commit** — `git commit -m "Add Vitest browser-mode harness and app shell test"`

---

### Task 3: Synthetic fixture generator

**Files:**
- Create: `scripts/make-fixtures.ts`, `tests/helpers/loadFixture.ts`
- Modify: `package.json` (add `fixtures` and `pretest` scripts)

**Interfaces:**
- Produces: `loadFixture(name: string): Promise<File>` — resolves `fixtures/<name>.xlsx` through a Vite `?url` import map, fetches it, returns a `File` whose `name` is `<name>.xlsx`, ready for `userEvent.upload`.
- Produces five fixtures: `statement-sample`, `date-forms`, `no-transactions-sheet`, `header-at-top`, `bad-currency-header`.

**Definition of done:**

`fixtures/statement-sample.xlsx` — sheets in order `Summary`, `Transactions`, `Info`. The `Transactions` sheet has a title at row 1, a blank row, a period row, a blank row, then the header at **sheet row 5**: `Date | Details | GEL | USD | EUR | GBP` followed by **two blank trailing cells**. Data rows begin at sheet row 6, in this exact order:

| # | Date cell | Details | Amount cell |
|---|---|---|---|
| 6 | `"14/03/2025"` string | `Payment - Amount: GEL45.50; Merchant: Shop Alpha, Tbilisi, GE, MCC: 1001, Date: 14/03/2025 14:23, Card: *1234` | GEL `-45.5` number |
| 7 | `Date` object `2025-03-20T00:00:00Z` | `Payment - Amount: USD12.00; Merchant: Stream Beta, Online, US, MCC: 1004, Date: 20/03/2025 09:05, Card: *1234, Payment transaction amount and currency: 12.00 USD` | USD `-12` number |
| 8 | `45748` number (serial for 2025-04-01) | `Payment - Amount: GEL22.00; Merchant: Courier Gamma, Tbilisi, GE, MCC: 1002, Date: 31/03/2025 23:41, Card: *1234` | GEL `-22` number |
| 9 | `"05/02/2025"` string | `Payment - Amount: EUR30.10; Merchant: Meals Delta, Tallinn, EE, MCC: 1003, Date: 05/02/2025 19:02, Card: *5678` | EUR `"-30.10"` **string** |
| 10 | `"10/02/2025"` string | `Income - Amount: GEL273.50; Automatic conversion, rate: 2.7350` | GEL `273.5` number |
| 11 | `"10/02/2025"` string | `Payment - Amount: USD100.00; Automatic conversion, rate: 2.7350` | USD `-100` number |
| 12 | `"12/02/2025"` string | `Payment - Amount GEL1.50; Payment Fee, Bank Mu, Payment code: 123456` | GEL `-1.5` number |
| 13 | `"18/02/2025"` string | `Payment - Amount: GEL50.88; Payment, utility payment service, Phone Kappa, Payment code: 789012` | GEL `-50.88` number |
| 14 | `"20/02/2025"` string | `Payment - Amount: GEL20.00; Standing order execution` | GEL `-20` number |
| 15 | `"22/02/2025"` string | `Payment - Amount: GEL10.00; Merchant: Shop Epsilon, Tbilisi, GE, MCC: 1001, Date: 22/02/2025 10:00, Card: *1234` | GEL `-12` number |
| 16 | `"24/02/2025"` string | `Payment - Amount: GEL10.08; Payment, utility payment service, Net Lambda, Payment code: 345678` | GEL `-10.075` number |
| 17 | `"25/02/2025"` string | `Payment - Amount: GEL15.00; Merchant: Shop Zeta, Tbilisi, GE, MCC: 1001, Date: 25/02/2025 12:00, Card: *1234` | GEL `-15` **and** USD `-5` |
| 18 | `"26/02/2025"` string | `Payment - Amount: GEL5.00; Merchant: Shop Eta, Tbilisi, GE, MCC: 1001, Date: 26/02/2025 12:00, Card: *1234` | none |
| 19 | `"not a date"` string | `Payment - Amount: GEL7.00; Merchant: Shop Theta, Tbilisi, GE, MCC: 1001, Date: 27/02/2025 12:00, Card: *1234` | GEL `-7` number |

Row 8's date cell must be written as a **bare number** with no date format, so read-excel-file reports a number rather than a `Date`. Row 7's must be written as a formatted `Date`. If `write-excel-file` cannot express both, replace it with SheetJS and note it in the phase report.

Other fixtures:
- `date-forms.xlsx` — sheet `Transactions`, header at sheet row 1, three card rows that encode **the same date, 2025-03-14**, one per cell form: the string `"14/03/2025"`, a `Date` object for `2025-03-14T00:00:00Z`, and the bare serial number `45730`. All three carry Details `Payment - Amount: GEL1.00; Merchant: Same Date, Tbilisi, GE, MCC: 1001, Date: 14/03/2025 08:00, Card: *1234` and GEL `-1`. This fixture exists so the three forms can be proven to agree, which `statement-sample` cannot show because its three forms fall on different dates.
- `no-transactions-sheet.xlsx` — sheets `Summary`, `Data` only.
- `header-at-top.xlsx` — sheet `Transactions`, header at sheet row 1, two card rows dated `01/01/2025` and `02/01/2025` for GEL `-1` and `-2`.
- `bad-currency-header.xlsx` — sheet `Transactions`, header at sheet row 1: `Date | Details | GEL | Balance`, one row.

`npm run fixtures` regenerates all four deterministically; `pretest` runs it.

**Verify:** `npm run fixtures && npm run typecheck` → exit 0, and `ls fixtures/*.xlsx` lists exactly the five files

- [ ] **Step 1: Read `write-excel-file` API** — confirm how to force a bare-number cell versus a date-formatted cell.
- [ ] **Step 2: Write the generator and `loadFixture`**
- [ ] **Step 3: Verify and commit** — `git commit -m "Add synthetic fixture generator"`

---

### Task 4: Workbook reading, header detection, kind counts

**Files:**
- Create: `src/domain/types.ts`, `src/import/readWorkbook.ts`, `src/import/headerRow.ts`, `src/import/details/classify.ts`, `src/import/buildPreview.ts`
- Modify: `src/ui/views/ImportView.svelte`
- Test: `tests/import-preview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type DetailsKind = 'card' | 'conversion' | 'service' | 'fee' | 'other'
  type WorkbookError =
    | { code: 'sheet-not-found'; sheetName: string; sheetsFound: string[] }
    | { code: 'header-row-not-found' }
    | { code: 'invalid-currency-header'; header: string }
  readWorkbook(file: File, sheet: string):
    Promise<{ ok: true; rows: unknown[][] } | { ok: false; error: WorkbookError }>
  findHeaderRow(rows: unknown[][]):
    { ok: true; headerRowIndex: number; currencies: string[] } | { ok: false; error: WorkbookError }
  classifyDetails(details: string): DetailsKind
  buildPreview(rows: unknown[][]):
    { ok: true; preview: ImportPreview } | { ok: false; error: WorkbookError }

  type ImportPreview = {
    headerRowNumber: number          // 1-based sheet row
    currencies: string[]
    rows: ParsedRow[]                // populated in Task 5
    failed: FailedRow[]              // populated in Task 7
    warnings: RowWarning[]           // populated in Task 8
    countsByKind: Record<DetailsKind, number>
  }
  ```
  Both `readWorkbook` and `buildPreview` are total — they return errors, never throw.
- Later tasks rely on `ImportPreview` gaining `rows`, `failed` and `warnings`; Task 4 populates `headerRowNumber`, `currencies` and `countsByKind` only. `ParsedRow`, `FailedRow` and `RowWarning` are declared in `src/domain/types.ts` in this task and filled in by Tasks 5, 7 and 8.
- `classifyDetails` is absorbed into `parseDetails` in Task 6; `src/import/details/classify.ts` keeps the branch logic and is re-exported, not duplicated.

**Definition of done:**
- `readWorkbook` selects the sheet by the name `Transactions`, never by index; a missing sheet returns `sheet-not-found` carrying the sheet names found in workbook order.
- `findHeaderRow` scans for the first row containing both `Date` and `Details`; it does not hardcode an index. Currencies are the cells after `Details`, with trailing blanks dropped. A non-blank cell that fails `^[A-Z]{3}$` returns `invalid-currency-header` carrying that cell's text.
- `classifyDetails`: body contains `Merchant:` → `card`; body starts with `Automatic conversion` → `conversion`; starts with `Payment Fee` → `fee`; starts with `Payment,` and contains `payment service` → `service`; otherwise `other`. Matchers are independent and evaluated in that order.
- ImportView has a file input labelled `Statement file`, and after upload renders a table captioned `Counts per kind` with one row per kind and its count, plus the text `Header row: 5` and `Currencies: GEL, USD, EUR, GBP`.
- For `statement-sample`: card 5, conversion 2, fee 1, service 2, other 1.

**Verify:** `npm test -- tests/import-preview.test.ts` → passes

- [ ] **Step 1: Read `node_modules/read-excel-file` README and `.d.ts`** — record the v9 call shape used.
- [ ] **Step 2: Failing test** — upload `statement-sample`, assert header row, currency list, and the five kind counts above.
- [ ] **Step 3: Implement** the five modules and the view section.
- [ ] **Step 4: Verify and commit** — `git commit -m "Parse workbook, detect header row, count Details kinds"`

---

### Task 5: Dates, amounts and currency per row

**Files:**
- Create: `src/import/date.ts`, `src/import/amount.ts`, `src/import/normalizeRow.ts`
- Modify: `src/import/buildPreview.ts`, `src/ui/views/ImportView.svelte`, `tests/import-preview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  parsePostingDate(cell: unknown): { ok: true; iso: string } | { ok: false }
  parseAmountMinor(cell: unknown):
    { ok: true; minor: number; extraPrecision: boolean } | { ok: false }
  ```
  `parseAmountMinor` converts a numeric cell with `String(value)` and then parses the decimal string digit-wise, half-up away from zero. `extraPrecision` is true when more than two fraction digits were present. No floating-point arithmetic.

**Definition of done:**
- Uploading `date-forms` shows **three rows whose `Posting date` cell all read `2025-03-14`** — the string form, the `Date` object (read with `getUTC*`, never local getters), and the bare serial `45730`. This is the assertion that the three forms agree.
- In `statement-sample` the same three forms appear on different dates and must each be right: `"14/03/2025"` → `2025-03-14`, the `Date` object → `2025-03-20`, serial `45748` → `2025-04-01`.
- `effectiveDate` is the date part of `txDateTime` when present, else `postingDate`. Row 8 shows posting `2025-04-01` and effective `2025-03-31`.
- Exactly one currency column must hold a value; that column's header is the row's currency.
- The preview renders a table captioned `Parsed rows` with columns `#`, `Posting date`, `Effective date`, `Kind`, `Counterparty`, `Amount`, `Currency`, `MCC`, `Card`, `Rate`, `Payment code`, `Original amount`, `Details`.
- Amounts display signed with exactly two decimals: row 6 shows `-45.50`, row 9 shows `-30.10` (from a **string** cell), row 10 shows `273.50`, row 16 shows `-10.08`.
- `counterparty`: card → merchant; service or fee → payee; conversion → `Currency conversion`; other → details truncated to 60 characters.

**Verify:** `npm test -- tests/import-preview.test.ts` → passes

- [ ] **Step 1: Failing test** — upload `date-forms` and assert all three posting dates read `2025-03-14`; then upload `statement-sample` and assert the exact date and amount strings listed above for rows 6, 7, 8, 9, 10, 16.
- [ ] **Step 2: Implement** date, amount, normalizeRow, and the parsed-rows table.
- [ ] **Step 3: Verify and commit** — `git commit -m "Parse dates, amounts and currency per row"`

---

### Task 6: Per-kind extracted fields

**Files:**
- Create: `src/import/details/card.ts`, `conversion.ts`, `fee.ts`, `service.ts`, `index.ts`
- Modify: `src/import/normalizeRow.ts`, `tests/import-preview.test.ts`

**Interfaces:**
- Produces: `parseDetails(details: string): { kind: DetailsKind } & ExtractedFields`, where `ExtractedFields` covers `merchant`, `mcc`, `txDateTime`, `cardLast4`, `originalAmountMinor`, `originalCurrency`, `conversionRate`, `payee`, `paymentCode`, each `null` when absent.

**Definition of done:**
- Head grammar: `^(Income|Payment)\s+-\s+Amount:?\s+([A-Z]{3})([\d,.]+);` — row 12 has no colon after `Amount` and must still parse.
- card: merchant is the text before the first comma after `Merchant:` → row 6 `Shop Alpha`, row 9 `Meals Delta`. `MCC: 1001` → `1001`. `Date: 14/03/2025 14:23` → `2025-03-14T14:23`. Card last4 tolerates `Card: *1234` and a bare four digits → `1234`; row 9 → `5678`. `Payment transaction amount and currency: 12.00 USD` → `1200` / `USD` on row 7, `null` elsewhere.
- conversion: `rate: 2.7350` → `2.735` on rows 10 and 11.
- fee: payee is the segment after `Payment Fee,` → `Bank Mu`; `Payment code: 123456` → `123456`.
- service: payee is the segment after `payment service,` → row 13 `Phone Kappa`, row 16 `Net Lambda`; payment codes `789012` and `345678`.
- Row 14 is `other` and its `Details` cell shows the raw string verbatim.

**Verify:** `npm test -- tests/import-preview.test.ts` → passes

- [ ] **Step 1: Failing test** — assert every extracted value named above, by row.
- [ ] **Step 2: Implement** the four matchers behind `parseDetails`.
- [ ] **Step 3: Verify and commit** — `git commit -m "Extract per-kind fields from Details"`

---

### Task 7: Failed rows and workbook-level errors

**Files:**
- Modify: `src/import/normalizeRow.ts`, `src/import/buildPreview.ts`, `src/ui/views/ImportView.svelte`, `tests/import-preview.test.ts`

**Definition of done:**
- A row with values in two currency columns fails with reason text `Row 17: amount in more than one currency (GEL, USD)`.
- A row with no currency value fails with `Row 18: no amount in any currency column`.
- A row whose date cell cannot be parsed fails with `Row 19: unreadable date "not a date"`.
- Failed rows render in a table captioned `Failed rows` with columns `#`, `Reason`, `Details`. `statement-sample` yields exactly 3.
- A failed row never aborts the import: `Parsed rows` still contains 11 rows.
- Uploading `no-transactions-sheet` renders, with no preview tables, the text `No sheet named "Transactions". Sheets found: Summary, Data.`
- Uploading `bad-currency-header` renders `Unexpected column header after Details: "Balance". Expected a three-letter currency code.`
- Uploading `header-at-top` succeeds with `Header row: 1` and 2 parsed rows, proving header detection is a scan.

**Verify:** `npm test -- tests/import-preview.test.ts` → passes

- [ ] **Step 1: Failing test** — the eight assertions above, each on its exact message string.
- [ ] **Step 2: Implement** failure reasons, the failed-rows table, and the error states.
- [ ] **Step 3: Verify and commit** — `git commit -m "Report failed rows and workbook-level import errors"`

---

### Task 8: Validation warnings

**Files:**
- Create: `src/import/validate.ts`
- Modify: `src/import/buildPreview.ts`, `src/ui/views/ImportView.svelte`, `tests/import-preview.test.ts`

**Definition of done:**
- The amount inside Details is compared to the column amount in minor units. Row 15 (`GEL10.00` vs column `-12`) warns: `Row 15: Details says 10.00 but the column says -12.00`. Comparison is on absolute value, so a `Payment` row whose Details amount is unsigned does not warn spuriously.
- Row 16's cell `-10.075` warns: `Row 16: amount has more than two decimals (-10.075), rounded to -10.08`. The row still parses, with `amountMinor` `-1008`.
- Warnings render in a list captioned/labelled `Warnings`; `statement-sample` yields exactly 2, in row order.
- A warning never makes a row fail.

**Verify:** `npm test -- tests/import-preview.test.ts` → passes

- [ ] **Step 1: Failing test** — both message strings verbatim, plus the count of 2 and `amountMinor` proven via the displayed `-10.08`.
- [ ] **Step 2: Implement** validation and the warnings region.
- [ ] **Step 3: Verify and commit** — `git commit -m "Warn on amount mismatch and unexpected precision"`

---

### Task 9: The `expected.json` oracle

**Files:**
- Create: `fixtures/expected.json`
- Modify: `tests/import-preview.test.ts`

**Definition of done:**
- `fixtures/expected.json` is hand-authored — never emitted by the generator — and holds, for `statement-sample`: `headerRowNumber` 5, `currencies` `["GEL","USD","EUR","GBP"]`, `countsByKind` `{card:5, conversion:2, fee:1, service:2, other:1}`, `parsedCount` 11, `failedCount` 3, `warningCount` 2, and a `rows` array of display strings for rows 6, 7, 8, 9, 10, 12, 13, 14, 16.
- One test drives the UI, reads the rendered `Parsed rows` table, and asserts it against `expected.json`. It imports the JSON directly; this is data, not app code, so it does not breach the "only `App.svelte`" rule.

**Verify:** `npm test` → whole suite passes

- [ ] **Step 1: Author `expected.json` by hand** from this plan's fixture table, not by running the app.
- [ ] **Step 2: Failing test**, then reconcile any disagreement by fixing the **app**, not the oracle.
- [ ] **Step 3: Verify and commit** — `git commit -m "Assert import preview against hand-authored oracle"`

---

### Task 10: GitHub Pages deployment

**Files:**
- Create: `.github/workflows/deploy.yml`

**Definition of done:**
- Workflow triggers on push to the default branch and on `workflow_dispatch`; permissions `contents: read`, `pages: write`, `id-token: write`; concurrency group `pages`.
- Steps: checkout, setup-node 22 with npm cache, `npm ci`, `npm run build`, upload `dist/` as a Pages artifact, deploy.
- Tests are **not** run in CI in phase 1: Browser Mode needs Playwright browsers, which is phase 2 work. The workflow builds only.

**Verify:** `npm run build` → exit 0, and the workflow file parses as valid YAML (`node -e "require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8')"` plus a YAML lint if available). `verify: human-eyes — after the first push, check the Pages URL loads and nav works.`

- [ ] **Step 1: Write the workflow**
- [ ] **Step 2: Verify and commit** — `git commit -m "Deploy to GitHub Pages on push"`

---

### Task 11: Mutation pass and phase report

**Files:**
- Create: `docs/reports/phase-1.md`

**Definition of done:**
- One mutation per bullet of `docs/spec.md` "Required behavior coverage / Phase 1", plus one per decision point added this phase. At minimum: header scan start index; the `^[A-Z]{3}$` currency guard; trailing-blank trimming; each of the five `classifyDetails` branches; serial-date epoch; `getUTC*` → local getters; `effectiveDate` → `postingDate`; half-up → truncate in `parseAmountMinor`; the `extraPrecision` threshold `2` → `3`; the exactly-one-currency check; merchant "before first comma" → whole field; the amount-mismatch comparison.
- Each mutation changes exactly one thing, still typechecks, and is reverted immediately after.
- A mutation counts as caught only when a **test assertion** fails — not merely an unhandled error or `console.error`.
- Any uncaught mutation is resolved by strengthening a test, or recorded as equivalent with reasoning. Never weakened or dropped.
- `docs/reports/phase-1.md` records what was built, the read-excel-file v9 call shape used, whether `write-excel-file` could express both date cell forms, every mutation with its outcome, and the open assumptions about Details label formats that the user should confirm against the real export.

**Verify:** `npm run typecheck && npm test` → clean after all mutations are reverted

- [ ] **Step 1: List mutations** in the report before applying any.
- [ ] **Step 2: Apply, observe, revert** each one in turn.
- [ ] **Step 3: Write the report and commit** — `git commit -m "Add phase 1 report with mutation results"`

---

## Known assumptions to confirm at the gate

These Details sub-formats are **not** specified in `docs/spec.md` and are inferred. The parser is written tolerantly, but the real export may differ. Each is a one-line fix once the user reports it:

- Card last four digits: assumed `Card: *1234`.
- MCC label: assumed `MCC: 1001`.
- Card transaction timestamp: assumed `Date: DD/MM/YYYY HH:mm` (this one **is** in the spec).
- Fee payee: assumed the segment after `Payment Fee,`.
- Service payee: assumed the segment after `payment service,`.
- Conversion rate label: assumed `rate: 2.7350`.
- Original amount: assumed `Payment transaction amount and currency: 12.00 USD`.
