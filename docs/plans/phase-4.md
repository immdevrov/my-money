# Phase 4 Implementation Plan — Categorization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every transaction shows a category or is visibly uncategorized, and the user builds their own categories and rules quickly from the transactions in front of them.

**Architecture:** Only user decisions are stored: `manualCategoryId`, categories and rules. `listAll()` derives, pairs and assigns every row on every read. There is no re-apply pass. Assignment, rule ordering, pattern validation, counts and period bucketing are pure modules under `src/categorize/` and `src/aggregate/`, and the views only render them.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Dexie 4 with `liveQuery`, Vitest 4 Browser Mode, vitest-browser-svelte.

**Spec:** `docs/specs/phase-4-categorization.md`. It is the source of truth for every label, message and rule quoted below.

## Global Constraints

- Everything in `CLAUDE.md` applies.
- **Stored:** `StoredTransaction.manualCategoryId`, plus the `categories` and `rules` tables. **Derived on every read:** `paired`, `categoryId`, `categorySource`, `ruleId`. Never add a stored `categoryId` or `categorySource`, and never write a re-apply pass.
- The only seeded category is `{ id: 'currency-conversion', name: 'Currency conversion', type: 'transfer', color: '--palette-12' }`. No rules are seeded.
- Evaluation order: system (a paired conversion → `currency-conversion`), then manual, then rules by ascending `priority` (ties by `id`), with the first match winning, then uncategorized.
- `equals`: both sides trimmed, case-insensitive. `contains`: case-insensitive substring. `regex`: `new RegExp(pattern)` exactly as written, and a pattern that fails to compile matches nothing.
- Rule priorities are always `(position + 1) × 10`, and a new rule goes first.
- Colours are palette token names (`--palette-1` … `--palette-12`). No component contains a colour literal.
- Test data is synthetic. Use made-up names only (`Shop Alpha`, `Shop Beta`, …) and made-up MCCs (`1001`, `1002`, …). No real merchant, bank or MCC.
- **TDD:** every behavior lands test-first. Write the test, run it and watch it fail for the expected reason, then implement.
- Tests render the smallest surface that holds the behavior. Use `App` only for routing, remount and database lifecycle. Build statements inline with `importRows(rows, options?)` from `tests/helpers/importRows.ts`; never add a disk fixture.
- `vitest.config.ts` sets `testTimeout: 1000`. Keep each test's rendering minimal. If a test legitimately needs longer, pass a per-test timeout and say why in the task report. Don't raise the global.
- **Verify per task:** `npm run typecheck && npx vitest run --project behavior <task's test files>`. Before committing any task that touches `src/import/**`, `ImportView.svelte` or `App.svelte`, also run `npm run test:all`.
- **Mutation anchors:** when a task edits a line that `scripts/mutations.mjs` anchors on, update that anchor in the same commit so the list does not rot. Known in this phase: M64–M66 anchor on `paired.has(row.id)` / `pairStatus` in `TransactionsView.svelte` (Task 2).
- **Commits:** one per task, a single short line. No AI attribution or `Co-Authored-By`.

**Human verification:** at the finish, the user runs `npm run dev` and checks:
- `#/categories`: the colour swatches are legible in light and dark.
- `#/transactions`: the category cell, source label and prompt don't break the table layout at 1280 px width.
- `#/rules`: the move buttons read clearly.

These checks don't block anything. Everything else is proven by tests.

---

### Task 1: Category model, schema v3, seeding, palette, Categories view

**Files:**
- Modify: `src/domain/types.ts`, `src/db/database.ts`, `src/ui/views/ImportView.svelte` (write `manualCategoryId: null` instead of `categoryId`/`categorySource`), `src/ui/styles/tokens.css`, `src/App.svelte`
- Create: `src/categorize/seed.ts`, `src/db/categories.ts`, `src/ui/palette.ts`, `src/ui/components/CategoryForm.svelte`, `src/ui/views/CategoriesView.svelte`
- Test: `tests/categories.test.ts`

**Interfaces (Produces):**
```ts
// types.ts
type CategoryType = 'expense' | 'income' | 'transfer' | 'ignore'
type Category = { id: string; name: string; type: CategoryType; color: string }
type RuleField = 'counterparty' | 'mcc' | 'details' | 'kind'
type RuleMatch = 'equals' | 'contains' | 'regex'
type Rule = { id: string; field: RuleField; match: RuleMatch; pattern: string; categoryId: string; priority: number }
type StoredTransaction = RowFacts & { id: string; importBatchId: string; manualCategoryId: string | null }
// Transaction stays StoredTransaction & DerivedFields in this task; Task 2 extends it.

// seed.ts
const CURRENCY_CONVERSION_ID = 'currency-conversion'
const CURRENCY_CONVERSION: Category

// palette.ts
const PALETTE: readonly { token: string; name: string }[]
// tokens --palette-1..12, names in order: Blue, Teal, Green, Lime, Yellow, Orange, Red, Pink, Purple, Indigo, Brown, Grey
function colourName(token: string): string

// db/categories.ts
listCategories(): Promise<Category[]>                       // sorted by name, localeCompare
saveCategory(category: Category): Promise<void>             // put
deletionImpact(id: string): Promise<{ rules: number; manual: number }>
deleteCategory(id: string): Promise<void>                   // one rw transaction over categories, rules, transactions;
                                                            // rejects with Error for CURRENCY_CONVERSION_ID

// CategoryForm.svelte props
{ category?: Category; categories: Category[]; onsave: (category: Category) => void; oncancel?: () => void }
```

**Schema v3** (in `database.ts`, after v2):
- Stores: `transactions: 'id, postingDate, currency, importBatchId, manualCategoryId'`, `importBatches: 'id, importedAt'`, `categories: 'id, name'`, `rules: 'id, priority, categoryId'`.
- Upgrade: set `row.manualCategoryId = row.categorySource === 'manual' ? row.categoryId : null`, then delete `categoryId` and `categorySource`. Also put `CURRENCY_CONVERSION` into `categories`.
- `db.on('populate', tx => tx.table('categories').add(CURRENCY_CONVERSION))`. `openDatabase()` itself never seeds.
- The v2 → v3 upgrade is untested, like v2 (tests always start empty). State this in the task report.

**Categories view:**
- Heading "Categories", and a table with caption "Categories". Columns: Name, Type, Colour, Actions.
- The Colour cell holds a swatch span styled `background: var(<token>)` plus `colourName(token)`.
- Edit and Delete buttons are named "Edit {name}" and "Delete {name}". Currency conversion has no Delete button, and its Type select is disabled when editing.
- CategoryForm fields are labelled "Name", "Type" and "Colour". The save button is "Save category".
  - Type defaults to `expense`.
  - Colour defaults to the first `PALETTE` token no category uses, else `--palette-1`.
  - An empty name gives "Name is required."
  - A name equal to another category's name, trimmed and case-insensitive, gives "A category with this name already exists."
  - A new category's id comes from `crypto.randomUUID()`.
- Delete opens a `<dialog>` with the text `Delete {name}? {r} rule(s) and {m} manual assignment(s) will be removed.`:
  - Singular "1 rule" / "1 manual assignment", plural otherwise.
  - Buttons "Delete" and "Cancel".
  - Counts come from `deletionImpact`.
- `App.svelte`: the `categories` route renders CategoriesView.
- `tokens.css`: `--palette-1` to `--palette-12` in `:root`, with dark values in the existing `prefers-color-scheme: dark` block. Each dark value must contrast with `--surface`.

**Definition of done:**
- Adding "Groceries", type expense, colour Teal shows a row reading `Groceries expense Teal`.
- A fresh database lists exactly one category, "Currency conversion", type transfer, colour Grey, with no "Delete Currency conversion" button.
- Duplicate names ("groceries " next to "Groceries") and empty names are rejected with their messages.
- Renaming a category in the view updates its row.
- **Seeding runs once:** rename Currency conversion to "FX" in CategoriesView, `remount(App)`, navigate to Categories, and "FX" is listed with no "Currency conversion" row.
- Deleting "Groceries" (no rules, no manual assignments yet) confirms with `Delete Groceries? 0 rules and 0 manual assignments will be removed.`, and the row disappears after "Delete".

**Verify:** `npm run typecheck && npm run test:all`, since this task touches ImportView and App.

- [ ] **Step 1: Failing tests** in `tests/categories.test.ts` for each definition-of-done bullet.
- [ ] **Step 2: Implement** the types, schema v3, seeding, palette tokens, repository, CategoryForm, CategoriesView and route.
- [ ] **Step 3: Verify and commit:** `Add categories, schema v3 and the Categories view`

---

### Task 2: Derived assignment and the category column

**Files:**
- Modify: `src/domain/types.ts`, `src/db/transactions.ts`, `src/ui/views/TransactionsView.svelte`, `scripts/mutations.mjs` (M64–M66 anchors)
- Create: `src/categorize/assign.ts`
- Test: `tests/categorization.test.ts`, plus one test appended to `tests/categories.test.ts`

**Interfaces:**
- Consumes: `Category`, `Rule`, `CURRENCY_CONVERSION_ID`, `listCategories`, and CategoryForm (Task 1).
- Produces:
```ts
// types.ts
type Transaction = StoredTransaction & DerivedFields & {
  paired: boolean; categoryId: string | null; categorySource: CategorySource | null; ruleId: string | null
}

// assign.ts
type Candidate = Pick<StoredTransaction, 'details' | 'manualCategoryId'> &
  Pick<DerivedFields, 'counterparty' | 'mcc' | 'kind'> & { paired: boolean }
type Assignment = { categoryId: string | null; categorySource: CategorySource | null; ruleId: string | null }
matchesRule(rule: Rule, row: Candidate): boolean
assignCategory(row: Candidate, rules: Rule[]): Assignment

// db/transactions.ts
listAll(): Promise<Transaction[]>          // reads transactions + rules; derive → pair (pairConversions over conversion rows) → assign
setManualCategory(id: string, categoryId: string): Promise<void>
clearManualCategory(id: string): Promise<void>
```
- `assignCategory` implements the full evaluation order and matching rules from Global Constraints now. Rules only reach it from Task 4 on, and Task 4's tests prove the rule branch.
- In TransactionsView, drop the local `pairConversions` call. `pairStatus` and the rate table read `row.paired`. Update the M64–M66 anchors to the new lines.

**Category column** (a new last column, "Category"):
- **Paired conversion rows** (`categorySource === 'system'`): the category's name as plain text, with no select.
- **Every other row:**
  - A select named `Category for {counterparty}`. Options:
    - A disabled "Uncategorized" option, present only while `categoryId === null`, and selected then.
    - Every category by name.
    - "New category…".
  - Choosing a category calls `setManualCategory`. Choosing "New category…" opens a `<dialog>` containing CategoryForm. Saving it creates the category and calls `setManualCategory` with it. Cancel resets the select.
  - A source label, `rule` or `manual`, next to the select. Nothing when uncategorized.
  - A "Reset category" button on `manual` rows only, named `Reset category for {counterparty}`. It calls `clearManualCategory`.

**Test rows** (header `Date | Details | GEL | USD`):
- A pair: `['10/02/2025', 'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.', 273.5, null]` and `['10/02/2025', 'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735', null, -100]`.
- A card row: `['14/03/2025', 'Payment - Amount: GEL10.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 14/03/2025 10:00; Card No: ****1111', -10, null]`.

**Definition of done:**
- After import, both pair rows show the text "Currency conversion" and have no category select. The Shop Alpha select shows "Uncategorized", with no source label.
- After creating "Groceries" via "New category…" on the Shop Alpha row, that row's select shows Groceries with source `manual`, and "Groceries" is an option in every row's select.
- The manual choice survives `remount(App)`: navigate to Transactions and it still shows Groceries `manual`.
- "Reset category" returns the row to "Uncategorized", and the Reset button disappears.
- `categories.test.ts`: renaming Groceries in CategoriesView changes the Shop Alpha row to show the new name.
- The existing pair-status and GEL-amount tests in `tests/pairing.test.ts` still pass.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/categorization.test.ts tests/categories.test.ts tests/pairing.test.ts`

- [ ] **Step 1: Failing tests** for each bullet.
- [ ] **Step 2: Implement** `assign.ts`, `listAll`, the manual setters, the column and the dialog, and update the anchors.
- [ ] **Step 3: Verify and commit:** `Derive categories on read and add the category column`

---

### Task 3: Transactions filters

**Files:**
- Create: `src/aggregate/period.ts`
- Modify: `src/ui/views/TransactionsView.svelte`
- Test: `tests/transaction-filters.test.ts`

**Interfaces (Produces):**
```ts
// aggregate/period.ts — phase 5 reuses it
type PeriodOption = { value: string; label: string }
// values: '2025' | '2025-Q1' | '2025-02'; labels: '2025' | '2025 Q1' | '2025-02'
periodOptions(effectiveDates: string[]): { years: PeriodOption[]; quarters: PeriodOption[]; months: PeriodOption[] }   // each newest first, distinct
inPeriod(effectiveDate: string, period: string): boolean     // '' matches everything
```

**Filter bar** (above the table, all combined with AND):
- Select "Period": "All periods", then `<optgroup>` "Years", "Quarters", "Months" built from `periodOptions`.
- Select "Category": "All categories", "Uncategorized" (`categoryId === null`), then each category by name. It matches the derived `categoryId`.
- Select "Kind": "All kinds", then each of `DETAILS_KINDS`.
- Search input "Search": case-insensitive substring of `counterparty` or `details`.
- With transactions present but none visible, show "No transactions match the filters." The filter bar stays, so the user can change it back. The empty-database message stays as it is.

**Test rows** (header `Date | Details | GEL`), plain `other` rows whose counterparty equals their details:
- `['15/01/2025', 'Alpha payment', -1]`
- `['20/02/2025', 'Beta payment', -2]`
- `['10/04/2025', 'Gamma payment', -3]`
- `['05/01/2024', 'Delta payment', -4]`
- For kind: `['17/03/2025', 'Payment - Amount GEL5.00; Payment Fee, 17/03/2025 , payment service, Bank Mu, Subscriber number 1, payment code - 1', -5]`, which parses as `fee`.

**Definition of done:**
- Period `2024` → only Delta. `2025 Q1` → Alpha, Beta and the fee row, not Gamma. `2025-02` → only Beta.
- Category: after Alpha is manually set to a new category "Groceries", "Groceries" → only Alpha, and "Uncategorized" → every row except Alpha.
- Kind `fee` → only the fee row.
- Search `BETA` → only Beta. Search `bank mu` → only the fee row (counterparty match). Search `payment code` → only the fee row (details match).
- Period `2025` plus search `gamma` → only Gamma. Period `2024` plus search `gamma` → "No transactions match the filters."

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/transaction-filters.test.ts tests/transactions.test.ts`

- [ ] **Step 1: Failing tests** for each bullet.
- [ ] **Step 2: Implement** `period.ts` and the filter bar.
- [ ] **Step 3: Verify and commit:** `Add Transactions filters`

---

### Task 4: Rules engine and Rules view (add, delete, counts)

**Files:**
- Create: `src/categorize/order.ts`, `src/categorize/validate.ts`, `src/categorize/counts.ts`, `src/db/rules.ts`, `src/ui/components/RuleForm.svelte`, `src/ui/views/RulesView.svelte`
- Modify: `src/App.svelte`
- Test: `tests/rules.test.ts`, plus appended tests in `tests/categorization.test.ts` and `tests/categories.test.ts`

**Interfaces (Produces):**
```ts
// order.ts
insertRule(rules: Rule[], rule: Rule): Rule[]                             // rule first, all renumbered (i+1)*10
moveRule(rules: Rule[], id: string, direction: 'up' | 'down'): Rule[]     // swap with neighbour, renumber; no-op at ends

// validate.ts
patternError(match: RuleMatch, pattern: string): string | null
// '' after trim → 'Pattern is required.'; regex that throws → 'Pattern is not a valid regular expression.'

// counts.ts
winsByRule(rows: Pick<Transaction, 'ruleId'>[]): Map<string, number>

// db/rules.ts
type RuleDraft = Pick<Rule, 'field' | 'match' | 'pattern' | 'categoryId'>
listRules(): Promise<Rule[]>                                              // by priority, then id
addRule(draft: RuleDraft): Promise<void>                                  // id = crypto.randomUUID(); insertRule; bulkPut in one transaction
updateRule(rule: Rule): Promise<void>                                     // put, keeps priority
deleteRule(id: string): Promise<void>
reorderRule(id: string, direction: 'up' | 'down'): Promise<void>          // moveRule; bulkPut in one transaction

// RuleForm.svelte props
{ rule?: Rule; categories: Category[]; basedOn?: { field: RuleField; value: string; label: string }[];
  initialCategoryId?: string; onsave: (draft: RuleDraft) => void; oncancel?: () => void; count?: number }
// Without basedOn: selects "Field", "Match", input "Pattern", select "Category", button "Save rule".
// With basedOn (Task 6): radio group "Based on" replaces Field/Match/Pattern; match is 'equals'.
```

**Rules view:**
- Heading "Rules". When there are no rules: "No rules yet. Pick a category on a transaction to create one."
- Otherwise, a table with caption "Rules". Columns: #, Field, Match, Pattern, Category, Matches, Actions.
- Matches comes from `winsByRule(listAll())`, and is 0 for a rule that wins nothing.
- A rule's description is `{field} {match} {pattern}`. The delete button is named `Delete rule {description}`.
- An "Add rule" section holds RuleForm. Validation messages show beside the form, and nothing is saved while `patternError` returns a message.
- `App.svelte`: the `rules` route renders RulesView.

**Test rows** (header `Date | Details | GEL | USD`):
- Shop Alpha card rows, three of them: dates 14/03, 15/03, 16/03/2025, `MCC:1001`, amounts -10, -11, -12.
- Shop Beta, one row: 17/03/2025, `MCC:1001`, -13.
- The conversion pair from Task 2, plus an unpaired conversion: `['11/02/2025', 'Payment - Amount USD30.00; Foreign Exchange. FX Rate:3.1', null, -30]`.
- Categories are created in CategoriesView first ("Groceries", "Transfers out" with type transfer).

**Definition of done** (`rules.test.ts`):
- Adding `counterparty equals Shop Alpha → Groceries` lists one rule with Matches `3`. In Transactions, the three Shop Alpha rows show Groceries `rule`, and Shop Beta stays uncategorized.
- Adding a second rule `mcc equals 1001 → Groceries` lists it at `#` 1 above the first. The new rule wins every MCC 1001 row: Matches `4` for the new rule, `0` for the older one.
- Deleting a rule removes it from the table, and its rows return to uncategorized.
- An empty pattern shows "Pattern is required." A `regex` of `(` shows "Pattern is not a valid regular expression." Neither adds a rule.

**Definition of done** (appended to `categorization.test.ts`):
- **Case-insensitive:** the rule `counterparty equals shop alpha` categorizes the "Shop Alpha" rows.
- **A manual choice survives rule changes:** Shop Beta manually set to "Transfers out", then the rule `mcc equals 1001 → Groceries` added, and Shop Beta still shows Transfers out `manual`.
- **No rule can recategorize a paired conversion:** after the rule `kind equals conversion → Transfers out`, both pair rows still show "Currency conversion", while the unpaired conversion row shows Transfers out `rule`.
- **Rule fallback on reset:** a manual row covered by a rule returns to the rule's category with source `rule` after "Reset category".

**Definition of done** (appended to `categories.test.ts`):
- **The delete cascades:** with rule `counterparty equals Shop Alpha → Groceries` and Shop Beta manually Groceries, deleting Groceries confirms with `Delete Groceries? 1 rule and 1 manual assignment will be removed.` Afterwards the Rules view shows the empty state, and all four card rows are uncategorized.

**Verify:** `npm run typecheck && npm run test:all`, since this task touches App.

- [ ] **Step 1: Failing tests** for each bullet.
- [ ] **Step 2: Implement** `order.ts`, `validate.ts`, `counts.ts`, the repository, RuleForm (free mode), RulesView and the route.
- [ ] **Step 3: Verify and commit:** `Add rules, the Rules view and match counts`

---

### Task 5: Rule reorder and edit

**Files:**
- Modify: `src/ui/views/RulesView.svelte`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: `reorderRule`, `updateRule`, RuleForm with the `rule` prop (Task 4).
- Buttons `Move rule {description} up` / `Move rule {description} down`, disabled on the first and last rule respectively.
- `Edit rule {description}` opens RuleForm prefilled in place of the add form. Saving calls `updateRule` and keeps the position.

**Definition of done:**
- Setup: add `counterparty equals Shop Alpha → Transfers out`, then `mcc equals 1001 → Groceries`. The newer rule goes first, so mcc is #1 and counterparty is #2.
  - Shop Alpha rows show Groceries, and Matches reads 4 for mcc and 0 for counterparty.
  - After "Move rule mcc equals 1001 down", the counterparty rule is #1. Shop Alpha rows show Transfers out, Shop Beta still shows Groceries, and Matches reads 3 for counterparty and 1 for mcc.
- The first rule's "up" button and the last rule's "down" button are disabled.
- Edit keeps position: from the setup order (mcc #1), editing the counterparty rule's pattern to `Shop Beta` leaves it at #2 with Matches 0. After "Move rule counterparty equals Shop Beta up", Shop Beta shows Transfers out, Shop Alpha shows Groceries, and Matches reads 1 for counterparty and 3 for mcc.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/rules.test.ts`

- [ ] **Step 1: Failing tests** for each bullet.
- [ ] **Step 2: Implement** the move and edit actions.
- [ ] **Step 3: Verify and commit:** `Reorder and edit rules`

---

### Task 6: Categorize, then "apply to all"

**Files:**
- Create: the candidate count in `src/categorize/counts.ts`
- Modify: `src/db/rules.ts`, `src/ui/views/TransactionsView.svelte`, `src/ui/components/RuleForm.svelte` (the "Based on" mode)
- Test: `tests/categorization.test.ts`

**Interfaces (Produces):**
```ts
// counts.ts
wouldCategorize(rows: Transaction[], rules: Rule[], candidate: RuleDraft, originId: string): number
// Treats originId's manualCategoryId as cleared, inserts the candidate first (id '__candidate__'),
// re-runs assignCategory, and counts rows whose ruleId is '__candidate__'.

// db/rules.ts
addRuleFromTransaction(draft: RuleDraft, transactionId: string): Promise<void>
// One transaction: insert the rule first (as addRule), then clear that transaction's manualCategoryId.
```

**Behavior:**
- After a category is picked, or created via "New category…", on a non-system row, show an inline prompt in a full-width row directly below it:
  - The prompt text is `Apply {category} to all {counterparty} transactions? It would categorize {N} now, and future imports too.`, with N from `wouldCategorize` using the draft `{ field: 'counterparty', match: 'equals', pattern: counterparty, categoryId }`.
  - Buttons: "Create rule", "Edit rule…", "No".
  - Only one prompt is open at a time. Picking on another row replaces it.
- **Create rule** calls `addRuleFromTransaction` with that draft and closes the prompt.
- **Edit rule…** opens a `<dialog>` with RuleForm in "Based on" mode:
  - Options `Counterparty = {counterparty}`, `MCC = {mcc}` (only when the row has one) and `Kind = {kind}`.
  - The category is preset to the picked one.
  - The live text `Would categorize {N} transactions` is recomputed with `wouldCategorize` for the selected option.
  - "Save rule" calls `addRuleFromTransaction`. "Cancel" closes the dialog, leaves the manual assignment, and closes the prompt.
- **No** closes the prompt, and the row stays `manual`.

**Test rows:** the Task 4 rows, plus a Shop Gamma card row with `MCC:1002` (18/03/2025, -14). "Groceries" exists.

**Definition of done:**
- Picking Groceries on one Shop Alpha row shows `Apply Groceries to all Shop Alpha transactions? It would categorize 3 now, and future imports too.`
- After "Create rule", all three Shop Alpha rows show Groceries `rule`, including the picked one, and no row shows `manual`. Shop Beta and Shop Gamma are unchanged. The Rules view lists `counterparty equals Shop Alpha` with Matches 3.
- "No" leaves only the picked row as Groceries `manual`, and the other two Shop Alpha rows uncategorized.
- "Edit rule…", choosing `MCC = 1001`, shows `Would categorize 4 transactions`. "Save rule" makes all Shop Alpha and Shop Beta rows Groceries `rule`, while Shop Gamma stays uncategorized.
- "New category…" on the Shop Gamma row, creating "Fun", assigns Fun `manual` and shows the prompt naming Fun, with N = 1.
- No prompt ever appears for a paired conversion row, which has no select.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/categorization.test.ts tests/rules.test.ts`

- [ ] **Step 1: Failing tests** for each bullet.
- [ ] **Step 2: Implement** `wouldCategorize`, `addRuleFromTransaction`, the prompt, and RuleForm's "Based on" mode.
- [ ] **Step 3: Verify and commit:** `Create rules from a categorized transaction`

---

### Task 7: Mutations and phase gate

**Files:**
- Modify: `scripts/mutations.mjs`

- [ ] **Step 1: Draft the mutation list and get approval.** Each mutation names the new or changed test it proofreads, plus a one-line change in `src/`. Every new or changed test gets at least one. Each mutation changes exactly one thing, still typechecks (watch `noUnusedLocals`), and changes behavior rather than compilation. Candidates to cover:
  - System before manual.
  - Manual before rules.
  - Ascending priority.
  - First match wins.
  - Case-folding in `equals`.
  - A null field value never matches.
  - Malformed regex matches nothing.
  - New rule first.
  - Renumbering on move.
  - Move direction.
  - Cascade deletes rules.
  - Cascade clears manual assignments.
  - Currency conversion undeletable.
  - Seeding only on populate/upgrade.
  - `winsByRule` counts wins.
  - `wouldCategorize` clears the origin's manual assignment.
  - `addRuleFromTransaction` clears the origin.
  - Each filter predicate.
  - Each `inPeriod` granularity.
  - Duplicate-name check.
  - `patternError` messages.

  **Present the list to the user and wait for approval.**
- [ ] **Step 2: Apply.** Add the approved mutations to `scripts/mutations.mjs` after M67. Run each with `node scripts/mutate.mjs --only <id>` after `npm run fixtures`. Every mutation must be caught by an assertion. A mutation caught only by `console.error` or a crash needs an added assertion. For a surviving mutation, strengthen the test, or record it as equivalent with its reasoning. Never weaken a mutation.
- [ ] **Step 3: Phase gate.**
  - `npm run typecheck` passes.
  - `npm run test:all` passes, earlier phases included.
  - `scratch/` is absent.
  - Every "Required behavior coverage" bullet in the spec maps to a test.
- [ ] **Step 4: Commit** `Prove phase 4 categorization by mutation`, and give the phase report in the session: what was built, the mutation outcome in a line, and any equivalent mutations with reasoning.
