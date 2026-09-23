# Phase 2 Implementation Plan — Persistence, dedup, Transactions table

**Goal:** A confirmed import persists to IndexedDB, survives a reload, and re-importing the same or an overlapping export adds nothing. The Transactions view lists what was stored and can be sorted.

**Architecture:** Row identity stays pure and lives in `src/import/`. The existence check is a repository call in `src/db/`. `ImportView` orchestrates the two; neither module imports the other. `App.svelte` owns the Dexie connection lifecycle, which is what makes `remount()` a real reload substitute.

**Spec:** `docs/spec.md` — Data model, Import, Views, and "Required behavior coverage / Phase 2".

## Global Constraints

- Everything in `CLAUDE.md` continues to apply. Additions specific to this phase:
- `dexie` is installed pinned exact. Before writing schema or `liveQuery` code, read the installed package's types and README. Do not rely on remembered Dexie API.
- No module-level open connection. `src/db/database.ts` may construct the Dexie instance at module load, but `open()` happens in `App.svelte`'s mount and `close()` in its unmount. Dexie auto-opens on first query, so every repository call must be reachable only after mount.
- Domain purity holds: `src/import/identity.ts` imports nothing from `src/db` or `src/ui`.
- Schema version 1 declares `transactions` and `importBatches` only. `categories`, `rules` and `settings` arrive as later versions, so the migration path is exercised rather than assumed.
- `npm test` must stay fixture-free. Phase 2 behavior tests build statements in memory with `makeStatement`; they never touch `fixtures/`.
- Tests are behavior tests, integration-scoped. Each asserts a behavior, and renders the smallest surface containing it: `TransactionsView` for the table and sorting, `ImportView` for preview and confirm, `App` only for routing and the database lifecycle.
- Gate per task: `npm run typecheck && npm test` by default, escalating to `npm run test:all` for any task that changes `src/import/**`, `src/ui/views/ImportView.svelte`, or `src/App.svelte`. The 23 existing import tests still render `App`, so a change to any of those three can break them.
- Those import tests predate the integration-test rule. Migrating them to render `ImportView` would let `vitest related` narrow the suite by module graph, which it cannot do while every test reaches every module through `App`. That migration is not phase 2 work: the suite was just proven by mutation, and rewriting it would require re-proving all 30.
- The mutation pass always runs `test:mutate` (both projects). It mutates `src/import/**`, so running the behavior project alone would report every import mutation as SURVIVED.

Process invariants: TDD — every behavior change lands test-first.

---

### Task 1: Test helpers — in-memory statements and remount

**Files:**
- Create: `tests/helpers/makeStatement.ts`, `tests/helpers/remount.ts`

**Interfaces:**
```ts
makeStatement(rows: (string | number)[][], options?: { sheet?: string }): Promise<File>
remount<T>(component: T): Promise<ReturnType<typeof render>>
```
- `makeStatement` builds a one-sheet workbook with `write-excel-file/browser` and `.toBlob()`, sheet named `Transactions`, header row `Date | Details | GEL` prepended unless the caller supplies their own. Returns a `File` for `userEvent.upload`.
- `remount` unmounts the current `App` and renders a fresh one, which closes and reopens the Dexie connection. This is the only stand-in for a page reload, since Browser Mode cannot reload the page under test.

**Definition of done:**
- A behavior test can import two rows and see them in the preview without any file in `fixtures/`.
- `npm test` passes with `fixtures/` deleted.

**Verify:** `npm run typecheck && npm run test:all`

- [ ] **Step 1: `makeStatement`** — mirror the call shape already proven in `scripts/make-fixtures.ts`, but through the `/browser` export.
- [ ] **Step 2: `remount`** — unmount, then render `App` again; assert in a throwaway test that state does not leak, then delete it.
- [ ] **Step 3: Verify and commit** — `git commit -m "Add in-memory statement and remount test helpers"`

---

### Task 2: Dexie schema and connection lifecycle

**Files:**
- Create: `src/db/database.ts`, `src/db/persist.ts`
- Modify: `src/App.svelte`, `package.json`

**Interfaces:**
```ts
// src/db/database.ts
class BudgetDatabase extends Dexie { transactions: Table<Transaction, string>; importBatches: Table<ImportBatch, string> }
export const db: BudgetDatabase          // constructed, not opened

// src/db/persist.ts
requestPersistentStorage(): Promise<void>   // feature-detected, failure-tolerant, once
```
- Database name `budget-my`, matching the name `tests/setup.ts` already deletes.
- Version 1 stores: `transactions` keyed by `id`, indexed on `effectiveDate`, `postingDate`, `kind`, `counterparty`, `currency`, `importBatchId`; `importBatches` keyed by `id`.
- `Transaction` extends the phase 1 `ParsedRow` with `id`, `importBatchId`, and the nullable `conversionPairId`, `categoryId`, `categorySource` from the spec's data model, so later phases add no migration for columns that already exist.
- `requestPersistentStorage` records that it ran under a namespaced `localStorage` key and never throws; a rejected or missing `navigator.storage.persist` is a no-op.

**Definition of done:**
- `App.svelte` opens the connection on mount and closes it on unmount.
- No module evaluates a query at import time.
- A failing or absent Storage API does not surface an error to the user or fail a test.

**Verify:** `npm run typecheck && npm run test:all`

- [ ] **Step 1: Install `dexie` pinned exact**, then read its types before writing the schema.
- [ ] **Step 2: Schema and lifecycle** — version 1, open on mount, close on unmount.
- [ ] **Step 3: Persistent storage request** — feature-detected and failure-tolerant.
- [ ] **Step 4: Verify and commit** — `git commit -m "Add Dexie schema and connection lifecycle"`

---

### Task 3: Row identity and the new/duplicate split

**Files:**
- Create: `src/import/identity.ts`
- Create: `src/db/transactions.ts`, `src/db/batches.ts`

**Interfaces:**
```ts
// src/import/identity.ts — pure, no DB, no UI
type IdentifiedRow = ParsedRow & { id: string }
assignIds(rows: ParsedRow[]): IdentifiedRow[]
splitNewAndDuplicate(rows: IdentifiedRow[], existing: ReadonlySet<string>): { newRows: IdentifiedRow[]; duplicates: IdentifiedRow[] }

// src/db/transactions.ts
existingIds(ids: string[]): Promise<Set<string>>
putMany(rows: Transaction[]): Promise<void>
listAll(): Promise<Transaction[]>

// src/db/batches.ts
createBatch(fileName: string, counts: BatchCounts): Promise<string>
```
- `id` is exactly `JSON.stringify([postingDate, currency, amountMinor, details, n])` per the spec, where `n` is the occurrence index among identical tuples **within the same file**. Two identical rows in one file therefore get `n = 0` and `n = 1` and both survive dedup; the same file imported twice produces the same two ids and adds nothing.
- `existingIds` is the only dedup input from storage, so `splitNewAndDuplicate` stays pure and testable through behavior alone.

**Definition of done:**
- Identical rows within one file receive distinct ids.
- Re-importing a file yields an empty `newRows`.
- Overlapping files yield only the non-shared rows as new.

**Verify:** `npm run typecheck && npm run test:all`

- [ ] **Step 1: `assignIds`** with the occurrence index.
- [ ] **Step 2: `splitNewAndDuplicate`.**
- [ ] **Step 3: Repositories** — `existingIds`, `putMany`, `listAll`, `createBatch`.
- [ ] **Step 4: Verify and commit** — `git commit -m "Add row identity and dedup split"`

---

### Task 4: Preview counts and the confirm step

**Files:**
- Modify: `src/ui/views/ImportView.svelte`

**Definition of done:**
- After a file is chosen, the preview reports new, duplicate and failed counts, each with an accessible name a test can locate by role.
- A `Confirm import` button persists only `newRows`, plus one `ImportBatch` recording file name, timestamp and counts.
- Confirming twice with the same file is harmless: the second preview reports 0 new.
- The button is absent, or reports nothing to confirm, when `newRows` is empty.

**Behavior tests:**
- A confirmed import appears in the Transactions table.
- Re-importing the same file shows 0 new rows in the preview; the table row count is unchanged.
- Overlapping exports import as a union without duplicates.
- Identical rows within one file are both present.

**Verify:** `npm run typecheck && npm run test:all`

- [ ] **Step 1: New/duplicate counts in the preview.**
- [ ] **Step 2: Confirm persists new rows and a batch.**
- [ ] **Step 3: Verify and commit** — `git commit -m "Add import confirm step with dedup counts"`

---

### Task 5: Transactions table and sorting

**Files:**
- Create: `src/ui/views/TransactionsView.svelte`
- Modify: `src/App.svelte`

**Definition of done:**
- Columns, per the spec's phased build-up: effective date, posting date, kind, counterparty, amount in original currency. GEL amount and pair status are phase 3; category and every filter are phase 4.
- Semantic `<table>` with header cells and a caption naming the table, so tests locate rows by role.
- Reactive through Dexie `liveQuery` consumed with Svelte store syntax. One `liveQuery` over the table; sorting is applied in a `$derived` over the resulting array, because `$derived` cannot auto-subscribe to a freshly constructed observable. This reads the whole table, which is correct for one person's history and revisited if it ever is not.
- Each sortable column header is a button with an accessible name, and carries `aria-sort`.
- Empty state renders a message rather than an empty table.

**Behavior tests:**
- Data survives `remount(App)` — this one renders `App`, because the connection lifecycle is what it proves.
- Sorting by each sortable column produces the expected rows — renders `TransactionsView`.

**Verify:** `npm run typecheck && npm run test:all`

- [ ] **Step 1: Table with liveQuery.**
- [ ] **Step 2: Sorting with `aria-sort`.**
- [ ] **Step 3: Verify and commit** — `git commit -m "Add Transactions table with sorting"`

---

### Task 6: Mutation pass and phase report

**Files:**
- Modify: `scripts/mutations.mjs`

**Definition of done:**
- One mutation per bullet of "Required behavior coverage / Phase 2", plus one per decision point added this phase. At minimum: the occurrence index `n` (drop it, so identical rows collide); the `existingIds` lookup (return empty, so nothing dedups); `putMany` persisting `newRows` versus all rows; the sort comparator direction; the `liveQuery` dependency; the connection close on unmount.
- Phase 1's 30 mutations are re-proven, since this phase changes `ImportView` and the shared preview path.
- Every mutation changes exactly one thing, **still typechecks**, and is reverted immediately.
- A mutation counts as caught only when a test assertion fails.
- Mutations are listed for approval before any are applied.
- The phase report is given in the session, not written as a file.

**Verify:** `npm run typecheck && npm run test:all` → clean after all mutations are reverted

- [ ] **Step 1: List mutations for approval.**
- [ ] **Step 2: `npm run mutate`** and resolve every survivor.
- [ ] **Step 3: Report in session and commit** — `git commit -m "Prove phase 2 persistence and dedup by mutation"`

---

## Open questions for the gate

- `navigator.storage.persist()` is expected to resolve `false` in headless Chromium without a user gesture. The requirement is that the app tolerates it, not that it succeeds; the user confirms the real grant in their own browser.
- Sorting is by single column. Multi-column sort is not in the spec and is not built.
