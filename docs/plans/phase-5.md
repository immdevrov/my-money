# Phase 5 Implementation Plan — Dashboard comparison

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Dashboard compares a chosen period's spending and income against a baseline, per category and in total, and every row drills down to the transactions behind it.

**Architecture:** Every number is computed on read from `listAll()`. Nothing new is stored. Rate lookup, GEL conversion, period arithmetic and the comparison are pure modules under `src/pairing/` and `src/aggregate/`. `DashboardView` only renders `compare(...)`. The hash query (`#/route?k=v`) is the only store of Transactions filters and Dashboard state, and it is what carries a drill-down between views.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Dexie 4 with `liveQuery`, Vitest 4 Browser Mode, vitest-browser-svelte.

**Spec:** `docs/specs/phase-5-dashboard.md`. It is the source of truth for every label, message and rule quoted below.

## Global Constraints

- Everything in `CLAUDE.md` applies.
- **Derived, never stored:** GEL amounts, rates, period buckets, totals, baselines, deltas and the missing-rate count. No schema change in this phase.
- **Money:** integer minor units throughout. The mean, the even-count median and the percent are all rounded half-up, away from zero, in integer arithmetic. No float division on amounts: compute `q = trunc(n / d)` and the remainder with integers, then round on `2·|r| ≥ |d|`.
- **Today:** `today` is the local date as `YYYY-MM-DD`, built from `new Date()` with `getFullYear` / `getMonth` / `getDate` at the moment the Dashboard computes. Never cache it. Pure modules receive it as a parameter.
- **Period values:** `'2025'`, `'2025-Q1'`, `'2025-03'`. **Labels:** `'2025'`, `'2025 Q1'`, `'2025-03'`, the same as the Transactions period filter.
- **Excluded from totals:** rows whose category has type `transfer` or `ignore`, which includes paired conversions (system-assigned `currency-conversion`, type `transfer`). Rows with no GEL amount are excluded too and counted in `missingRate`.
- **Test data is synthetic.** Use made-up names only (`Grocer …`, `Taxi …`, `Salary …`, `Mystery …`) and made-up MCCs (`1001`…). No real merchant, bank or MCC.
- **TDD:** every behavior lands test-first. Write the test, run it and watch it fail for the expected reason, then implement.
- **Test surface:** render the smallest surface that holds the behavior. Use `DashboardView` or `TransactionsView` for view behavior. Use `App` only for navigation between views (drill-down, Back, nav links, URL on entry). Build statements inline with `importRows(rows, options?)`. Never add a disk fixture.
- **Timeouts:** `vitest.config.ts` sets `testTimeout: 1000`. Dashboard tests import, then drive the Categories and Rules views, then render. If one measurably needs longer, give that test `{ timeout: 5000 }` and say so in the task report. Don't raise the global.
- **Verify per task:** `npm run typecheck && npx vitest run --project behavior <task's test files>`. Before committing any task that touches `src/pairing/**`, `App.svelte` or `TransactionsView.svelte`, also run `npm test`, which is the whole behavior project. The final task runs `npm run test:all`.
- **Mutation anchors:** when a task edits a line that `scripts/mutations.mjs` anchors on, update that anchor in the same commit, so that it still names the same behavior at its new location. Known in this phase:
  - M57–M59 in `src/pairing/rates.ts` (Task 1).
  - M62, M63 and M66 in `TransactionsView.svelte`, whose logic moves to `src/aggregate/gel.ts` (Task 1).
  - M110–M116 filter predicates in `TransactionsView.svelte` (Task 6).
  - Run `node scripts/mutate.mjs --only <id>` for each moved anchor to confirm it still applies and is still caught.
- **Commits:** one per task, a single short line. No AI attribution or `Co-Authored-By`.

**Human verification:** at the finish, the user runs `npm run dev` and checks, in light and dark:
- `#/dashboard`: the pickers, tabs and comparison table read clearly at 1280 px and at phone width. The selected tab is visually distinct. "insufficient data" and "—" don't misalign columns.
- `#/transactions` after a drill-down: the filters show the drilled values.

These checks don't block anything. Everything else is proven by tests.

---

### Task 1: Nearest-rate lookup and shared GEL conversion

**Files:**
- Modify: `src/pairing/rates.ts`, `src/ui/views/TransactionsView.svelte`, `scripts/mutations.mjs` (anchors M57–M59, M62, M63, M66)
- Create: `src/aggregate/gel.ts`
- Test: `tests/pairing.test.ts`

**Interfaces (Produces):**
```ts
// rates.ts — signature unchanged except the parameter name
rateFor(table: Rate[], currency: string, date: string): Rate | null

// gel.ts
rateTableFrom(rows: Transaction[]): Rate[]          // paired, non-GEL rows with conversionRateScaled → (postingDate, currency, rateScaled), via buildRateTable
gelAmount(row: Transaction, table: Rate[]): number | null   // GEL row → amountMinor; else toGelMinor at rateFor(...), or null
```

**Rate lookup rule (spec, "Rate lookup"):**
- Two candidates for currency C and date D:
  - **Before:** the latest rate with `date <= D`, of any age.
  - **After:** the earliest rate with `date > D` and `date.slice(0, 7) === D.slice(0, 7)`.
- The candidate fewer days from D wins, and a tie goes to Before. With neither, return `null`.
- Days are computed from `Date.UTC` of the ISO parts. There is no local-time `Date` parsing.

**Definition of done:**
- `TransactionsView` gets its rate table and GEL cell from `gel.ts`. The Transactions view keeps no rate logic of its own except rendering `MISSING_RATE` ('no rate') for `null`.
- Tests in `tests/pairing.test.ts` use `OPTIONS` and the existing conversion pair (10/02/2025, rate 2.735, USD −100 ↔ GEL 273.50). Add an early pair on 02/02/2025 at rate 2.0: `['02/02/2025', 'Income - Amount GEL100.00; Foreign Exchange. FX Rate:2.0.', 100, null, null]` and `['02/02/2025', 'Payment - Amount USD50.00; Foreign Exchange. FX Rate:2.0', null, -50, null]`. Streaming rows are USD −20 card rows as `STREAM_*`, for which 2.0 gives `-40.00` and 2.735 gives `-54.70`.
  - **Replace** "a rate is not applied to a transaction dated before it" with "a later rate is not applied across a month boundary". The row is dated 28/01/2025, only the 10/02 pair exists, and exactly one cell reads `no rate`.
  - "with no earlier rate, a later rate in the same month applies": a row on 01/02/2025 with the 10/02 pair → `-54.70`.
  - "a closer later rate beats an earlier one": a row on 08/02/2025 with both pairs → `-54.70`, and no `-40.00` cell.
  - "an earlier rate wins a tie": a row on 06/02/2025 with both pairs → `-40.00`, and no `-54.70` cell.
  - "a closer earlier rate beats a later one": a row on 04/02/2025 with both pairs → `-40.00`.
  - All existing pairing tests still pass unchanged.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/pairing.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** for the four new cases and the replaced one. The replaced test passes today, so watch the new ones fail.
- [ ] **Step 2: Implement** the lookup in `rateFor`, create `gel.ts`, switch `TransactionsView` to it, and move the anchors. Confirm each moved anchor with `node scripts/mutate.mjs --only <id>`.
- [ ] **Step 3: Verify and commit** `Take the nearest rate, later ones within the month`.

---

### Task 2: Comparison engine and the Dashboard (month, mean, Spending)

**Files:**
- Modify: `src/aggregate/period.ts`, `src/App.svelte` (the `dashboard` route renders DashboardView)
- Create: `src/aggregate/compare.ts`, `src/ui/views/DashboardView.svelte`, `tests/helpers/freezeDate.ts`, `tests/helpers/categorize.ts`
- Test: `tests/dashboard.test.ts`

**Interfaces (Produces):**
```ts
// period.ts (additions)
type PeriodType = 'month' | 'quarter' | 'year'
periodOf(date: string, type: PeriodType): string
periodsInSpan(earliest: string, today: string, type: PeriodType): string[]   // newest first, includes today's period
previousPeriod(period: string): string                                      // '2025-01' → '2024-12', '2025-Q1' → '2024-Q4', '2025' → '2024'
periodLabel(period: string): string
isPeriod(value: string): boolean                                           // /^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$/
localToday(now: Date): string                                              // YYYY-MM-DD from local getters

// compare.ts: exactly the types in the spec's "Comparison" section
type Baseline = 'mean' | 'median' | 'previous'
compare(input: { rows: Transaction[]; categories: Category[]; today: string; type: PeriodType; period: string; baseline: Baseline }): Comparison
// Comparison = { spending: ComparisonTable; income: ComparisonTable; missingRate: number }
// ComparisonTable = { rows: ComparisonRow[]; total: ComparisonRow }
// ComparisonRow = { categoryId: string | null; name: string; current: number; baseline: number | 'insufficient'; delta: number | null; deltaPct: number | null }

// tests/helpers/freezeDate.ts
freezeDate(iso: string): void      // vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso))

// tests/helpers/categorize.ts: drives the real views, like importRows
type CategorySpec = { name: string; type?: CategoryType; contains?: string }
categorize(specs: CategorySpec[]): Promise<void>
// renders CategoriesView and adds each category (Add category → Name → Type when not expense → Save category), cleanup();
// renders RulesView and, for each spec with `contains`, adds a rule: Add rule → Match 'contains' → Pattern → Category → Save rule, cleanup()
```

`compare` implements the whole spec in this task: all three baselines, both tabs, exclusions and `missingRate`. Tasks 3–5 add the UI and the tests that reach the rest. Keep it one module, split into small functions (bucket, pool, baseline, row). `compare` uses `rateTableFrom` and `gelAmount` from Task 1.

**DashboardView in this task:**
- Heading "Dashboard".
- A "Period" select only: every period in the span for `month`, newest first, labelled by `periodLabel`. The current period is labelled `{label} (in progress)`. The default is the most recent complete period, or the current one when none is complete.
- Baseline fixed to `mean`, and only the Spending table.
- Table "Spending comparison" with columns Category, Current, Baseline, Change, Change %. The total row "Total spending" is last.
- Cell text:
  - Amounts use `formatMinor`.
  - Change is signed: `+62.50` when positive, `-12.50` when negative, `0.00` at zero.
  - Change % reads `+109%`, `-24%`, `0%`, or `—` for `null`.
  - An insufficient baseline shows `insufficient data`, and the two Change cells are empty.
- Empty database: `No transactions yet. Import a statement to see the dashboard.`, with no pickers and no table.
- Category names are plain text in this task. Task 7 makes them links.

**Test data** (header `Date | Details | GEL`, `freezeDate('2025-06-15T12:00:00')`, `categorize([{ name: 'Groceries', contains: 'Grocer' }, { name: 'Transport', contains: 'Taxi' }, { name: 'Unused' }])`):
```
MONTHS = 10/01/2025 Grocer Jan -100 · 12/01/2025 Taxi Jan -20 · 10/02/2025 Grocer Feb -50
         10/03/2025 Grocer Mar -80 · 12/03/2025 Taxi Mar -10 · (no April rows)
         10/05/2025 Grocer May -120 · 12/05/2025 Taxi May -30 · 10/06/2025 Grocer Jun -40
```

**Definition of done** (tests in `tests/dashboard.test.ts`; rows read top to bottom, cells left to right):
- "defaults to the last complete month and compares it with the mean":
  - The Period select shows `2025-05`, and its first option is `2025-06 (in progress)`.
  - Groceries | 120.00 | 57.50 | +62.50 | +109%
  - Transport | 30.00 | 7.50 | +22.50 | +300%
  - Total spending | 150.00 | 65.00 | +85.00 | +131%
  - No Unused row.
  - This test also proves the zero-counting mean: April is empty, and Transport is absent in February.
- "the current month can be compared but never feeds a baseline": select `2025-06 (in progress)`.
  - Groceries | 40.00 | 70.00 | -30.00 | -43%
  - Transport | 0.00 | 12.00 | -12.00 | -100%
  - Total spending | 40.00 | 82.00 | -42.00 | -51%
- "fewer than 3 complete periods shows insufficient data":
  - Rows are only `10/03/2025 Grocer Mar -80` and `10/05/2025 Grocer May -120`, with the Groceries category.
  - Groceries | 120.00 | insufficient data | (empty) | (empty)
  - Total spending | 120.00 | insufficient data | (empty) | (empty)
- "an empty database shows the empty message".

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard.test.ts`, then `npm test` (App changed).

- [ ] **Step 1: Helpers.** Write `freezeDate` and `categorize`. `categorize` is proven by the first dashboard test.
- [ ] **Step 2: Failing tests** above.
- [ ] **Step 3: Implement** the `period.ts` additions, `compare.ts`, `DashboardView` and the App route.
- [ ] **Step 4: Verify and commit** `Compare a month with the mean on the Dashboard`.

---

### Task 3: Period type and baseline pickers

**Files:**
- Modify: `src/ui/views/DashboardView.svelte`
- Test: `tests/dashboard.test.ts`

**Interfaces:** consumes `compare`, `periodsInSpan` and `PeriodType` from Task 2. It produces no new exports.

**UI:**
- A "Period type" select (Month, Quarter, Year) comes before Period.
- A "Baseline" select (Mean, Median, Previous period) comes after it.
- Changing the period type resets Period to that type's default: the most recent complete period, else the current one.

**Test data** (all at `freezeDate('2025-06-15T12:00:00')`, Groceries `contains: 'Grocer'`, plus Transport for MONTHS):
```
QUARTERS = 10/02/2024 Grocer 24Q1 -30 · 10/05/2024 Grocer 24Q2 -60 · 10/08/2024 Grocer 24Q3 -120
           10/02/2025 Grocer 25Q1 -40 · 10/04/2025 Grocer 25Q2 -10
YEARS    = 01/03/2021 Grocer 2021 -100 · 01/03/2022 Grocer 2022 -250
           01/03/2024 Grocer 2024 -300 · 01/03/2025 Grocer 2025 -50
```

**Definition of done:**
- "months against median and previous" (MONTHS, period 2025-05):
  - Median:
    - Groceries | 120.00 | 65.00 | +55.00 | +85%
    - Transport | 30.00 | 5.00 | +25.00 | +500%
    - Total spending | 150.00 | 70.00 | +80.00 | +114%
  - Previous period:
    - Groceries | 120.00 | 0.00 | +120.00 | —
    - Transport | 30.00 | 0.00 | +30.00 | —
    - Total spending | 150.00 | 0.00 | +150.00 | —
- "previous is insufficient for the first period in the span": MONTHS, period `2025-01`, Previous period → Groceries | 100.00 | insufficient data.
- "quarters against each baseline" (QUARTERS, Period type Quarter):
  - The Period select resets to `2025 Q1`.
  - Mean: Groceries | 40.00 | 52.50 | -12.50 | -24%
  - Median: Groceries | 40.00 | 45.00 | -5.00 | -11%
  - Previous period: Groceries | 40.00 | 0.00 | +40.00 | —
  - Total spending matches Groceries in each.
- "years against each baseline" (YEARS, Period type Year):
  - The Period select resets to `2024`.
  - Mean: Groceries | 300.00 | 116.67 | +183.33 | +157%. This also proves half-up rounding of 350.00 / 3.
  - Median: Groceries | 300.00 | 100.00 | +200.00 | +200%
  - Previous period: Groceries | 300.00 | 0.00 | +300.00 | —

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard.test.ts`

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the two selects and the period reset.
- [ ] **Step 3: Verify and commit** `Pick the period type and baseline on the Dashboard`.

---

### Task 4: Income tab and what counts

**Files:**
- Modify: `src/ui/views/DashboardView.svelte` (and `compare.ts` only if a test exposes a gap)
- Test: `tests/dashboard.test.ts`

**UI:**
- A `tablist` named "Comparison" with the tabs "Spending" (selected by default) and "Income".
- Each tab has `aria-selected` and `aria-controls` pointing at its `tabpanel`. Only the selected panel is rendered.
- ArrowRight and ArrowLeft move to the other tab, selecting it and focusing it.
- The Income panel holds the table "Income comparison", with the total row "Total income".

**Test data MIXED** (header `Date | Details | GEL | USD`; every GEL row carries a trailing `null`; `freezeDate('2025-06-15T12:00:00')`):
- All of MONTHS.
- `25/03/2025 Salary Mar 1500` · `25/04/2025 Salary Apr 1500` · `25/05/2025 Salary May 1500`
- `20/05/2025 Grocer refund 10`
- `15/05/2025 Mystery out -7` · `16/05/2025 Mystery in 5`
- `18/05/2025 Savings May -500` · `19/05/2025 Hidden May -60`
- A paired conversion: `['10/05/2025', 'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.', 273.5, null]` and `['10/05/2025', 'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735', null, -100]`
- Categories: Groceries/Grocer, Transport/Taxi, Salary (income)/Salary, Savings (transfer)/Savings, Hidden (ignore)/Hidden.

**Definition of done** (period 2025-05, mean):
- "spending nets refunds, splits uncategorized by sign and excludes transfers":
  - Groceries | 110.00 | 57.50 | +52.50 | +91%
  - Transport | 30.00 | 7.50 | +22.50 | +300%
  - Uncategorized | 7.00 | 0.00 | +7.00 | —
  - Total spending | 147.00 | 65.00 | +82.00 | +126%
  - No Savings, Hidden or Currency conversion row.
- "the Income tab shows income categories and uncategorized inflows": click the "Income" tab. The "Spending comparison" table is gone.
  - Salary | 1500.00 | 750.00 | +750.00 | +100%
  - Uncategorized | 5.00 | 0.00 | +5.00 | —
  - Total income | 1505.00 | 750.00 | +755.00 | +101%
  - The paired conversion's +273.50 is not counted.
- "arrow keys move between tabs": focus Spending and press ArrowRight. Income is selected and "Income comparison" is shown.
- "a month-boundary card payment counts in its effective month":
  - Its own rows: `['01/05/2025', 'Payment - Amount: GEL25.00; Merchant: Grocer Omega, Tbilisi; MCC:1001; Date: 30/04/2025 18:00; Card No: ****1111', -25]`, plus `10/01/2025 Grocer Jan -100`, `10/02/2025 Grocer Feb -50` and `10/03/2025 Grocer Mar -80`, with Groceries.
  - Period `2025-04`, pool Jan, Feb, Mar, May → Groceries | 25.00 | 57.50 | -32.50 | -57%.
  - Period `2025-05`, pool Jan–Apr → Groceries | 0.00 | 63.75 | -63.75 | -100%.
  - Bucketing by `postingDate` would put the 25.00 in May instead.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard.test.ts`

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the tabs. Fix `compare` only where a test shows a gap.
- [ ] **Step 3: Verify and commit** `Split the Dashboard into Spending and Income tabs`.

---

### Task 5: Missing-rate exclusion count

**Files:**
- Modify: `src/ui/views/DashboardView.svelte`
- Test: `tests/dashboard.test.ts`

**UI:** `{N} transaction excluded from totals: no exchange rate.` when N is 1, or `{N} transactions excluded from totals: no exchange rate.` otherwise. It is hidden when N is 0.

**Test data** (header `Date | Details | GEL | USD`, `freezeDate('2025-06-15T12:00:00')`, Groceries and Transport as in MONTHS): MONTHS with a trailing `null`, plus two USD card rows with no conversion anywhere:
- `['12/03/2025', 'Payment - Amount: USD4.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -4]`
- `['12/05/2025', 'Payment - Amount: USD9.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -9]`

**Definition of done:**
- "rows without a rate are counted and excluded":
  - Period 2025-05, Mean: shows `2 transactions excluded from totals: no exchange rate.`, and Groceries | 120.00 | 57.50 is unchanged.
  - Switch to Previous period: shows `1 transaction excluded from totals: no exchange rate.`, since April and May feed nothing from March.
- "the count covers only the compared period when the baseline is insufficient": period 2025-01, Previous period → no "excluded from totals" text.
- The Task 2 MONTHS test asserts no "excluded from totals" text. Add that one assertion there.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard.test.ts`

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the message.
- [ ] **Step 3: Verify and commit** `Show transactions excluded for missing rates`.

---

### Task 6: Hash query and Transactions filters in the URL

**Files:**
- Create: `src/ui/hashQuery.ts`
- Modify: `src/App.svelte` (match routes on the path before `?`), `src/ui/views/TransactionsView.svelte`, `scripts/mutations.mjs` (anchors M110–M116 if their lines change)
- Test: `tests/transaction-filters.test.ts`, `tests/app-shell.test.ts`

**Interfaces (Produces):**
```ts
// hashQuery.ts
readQuery(): URLSearchParams                           // params after '?' in location.hash; empty when none
replaceQuery(values: Record<string, string>): void     // keeps the current path; drops '' values; history.replaceState(null, '', '#/path' or '#/path?…')
onHashChange(callback: () => void): () => void          // subscribes to 'hashchange'; returns the unsubscribe
```

**Behavior:**
- TransactionsView reads `period`, `category`, `kind` and `q` on mount and on every `hashchange`. Every filter change calls `replaceQuery`.
- Unknown values fall back to "All": a `period` failing `isPeriod`, a `kind` not in `DETAILS_KINDS`, or a `category` that is neither `uncategorized` nor a loaded category id.
- The Period select always offers the active period, labelled by `periodLabel`, even with no row in it.
- App's nav links stay `#/{path}`, and `aria-current` compares paths only.

**Definition of done:**
- In `tests/transaction-filters.test.ts` (ALL rows):
  - "filters survive a remount through the URL": set Period `2025-02` and Search `beta`, then `remount(TransactionsView)`. Period shows `2025-02`, Search holds `beta`, and only Beta payment is listed.
  - "unknown filter values fall back to All": set `location.hash = '#/transactions?category=nope&kind=nope&period=soon'`, then render. Every row is listed, and the selects show All categories, All kinds and All periods.
  - "a period with no rows is still offered": `#/transactions?period=2023-07` → the Period select shows `2023-07`, and the view shows `No transactions match the filters.`
  - Every existing filter test still passes unchanged.
- In `tests/app-shell.test.ts`:
  - "a URL with filters opens Transactions filtered": import `['15/01/2025', 'Alpha payment', -1]` and `['05/01/2024', 'Delta payment', -4]` through `importRows`, set `location.hash = '#/transactions?period=2024'`, render App. Only Delta payment is listed, and the Transactions link has `aria-current="page"`.
  - "the Transactions nav link clears filters": from there, click the "Transactions" link. The Period select shows All periods, and every row is listed.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/transaction-filters.test.ts tests/app-shell.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** `hashQuery.ts`, the App path matching and the TransactionsView filter state from the query. Move any mutation anchor whose line changed, and confirm it with `node scripts/mutate.mjs --only <id>`.
- [ ] **Step 3: Verify and commit** `Hold Transactions filters in the URL`.

---

### Task 7: Dashboard state in the URL and drill-down

**Files:**
- Modify: `src/ui/views/DashboardView.svelte`
- Create: `tests/dashboard-drilldown.test.ts`
- Test: `tests/dashboard.test.ts` (one test)

**Interfaces:** consumes `readQuery`, `replaceQuery` and `onHashChange` from Task 6.

**Behavior:**
- Dashboard state lives in the query as `type`, `period`, `baseline` and `tab` (`spending` | `income`). It is read on mount and on `hashchange`, and written with `replaceQuery`.
- Defaults: `month`, the default period, `mean`, `spending`.
- A `period` that is not in the chosen type's span falls back to the default.
- Each category name is a link to `#/transactions?period={period}&category={categoryId}`, or `category=uncategorized` for Uncategorized, built with `URLSearchParams`.
- The total row's name links to `#/transactions?period={period}`.

**Test data:** MIXED from Task 4 and its categories, `freezeDate('2025-06-15T12:00:00')`. These tests render `App` and start from `location.hash = '#/dashboard'`.

**Definition of done:**
- In `tests/dashboard-drilldown.test.ts`:
  - "a category row opens Transactions filtered to it, and Back restores the Dashboard":
    - Choose Period `2025-03` and Baseline Median, then click the "Groceries" link.
    - The Transactions heading shows. Period shows `2025-03`, Category shows `Groceries`, and only Grocer Mar is listed.
    - Then call `history.back()`. The Dashboard shows Period `2025-03` and Baseline Median.
  - "uncategorized drills to both signs, and Back restores the Income tab":
    - Period 2025-05, click the "Income" tab, then click the "Uncategorized" link.
    - Category shows `Uncategorized`, and exactly Mystery out and Mystery in are listed.
    - After `history.back()`, the Income tab is selected.
  - "the total row opens the period unfiltered by category": click "Total spending" for 2025-05. Period shows `2025-05`, Category shows All categories, and all 10 May rows are listed, transfers and both conversion rows included.
  - "a row with only a baseline drills into an empty period": Period `2025-04`, click "Groceries". Period shows `2025-04`, and the view shows `No transactions match the filters.`
- In `tests/dashboard.test.ts`:
  - "an unknown period in the URL falls back to the default": `location.hash = '#/dashboard?period=1999-01'`, render DashboardView with MONTHS. Period shows `2025-05`.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard.test.ts tests/dashboard-drilldown.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** query-backed state and the links.
- [ ] **Step 3: Verify and commit** `Drill down from the Dashboard to Transactions`.

---

### Task 8: Mutations and phase gate

**Files:**
- Modify: `scripts/mutations.mjs`

- [ ] **Step 1: Draft the mutation list and get approval.**
  - Each mutation names the new or changed test it proofreads, plus a one-line change in `src/`. Every new or changed test gets at least one.
  - Each mutation changes exactly one thing, still typechecks (watch `noUnusedLocals`), and changes behavior rather than compilation.
  - Candidates:
    - Rate tie goes to the later rate (`<=` → `<`).
    - The later candidate ignores the month limit.
    - The later candidate is dropped.
    - The pool includes the current period.
    - The pool includes the compared period.
    - Threshold 3 → 2.
    - The mean skips empty periods.
    - Mean rounding truncates.
    - The median drops the even-count average.
    - Previous ignores the span start.
    - The total baseline sums category baselines.
    - Transfer not excluded; ignore not excluded.
    - Uncategorized goes by category type instead of by sign.
    - Spending not negated.
    - A tab follows sign instead of category type.
    - `effectiveDate` → `postingDate` in bucketing.
    - Row visibility ignores the baseline.
    - Sort ascending.
    - Missing-rate count ignores pool periods.
    - Missing-rate plural.
    - Default period is the current one.
    - Period type change keeps the old period.
    - `deltaPct` null test flipped.
    - The percent rounds by truncation.
    - Unknown filter value accepted.
    - The active period not offered.
    - The query not written on filter change.
    - The drill-down link drops the category.
    - The drill-down link drops the period.
    - Dashboard state not read from the query.
    - The tab arrow key does nothing.

  **Present the list to the user and wait for approval.**
- [ ] **Step 2: Apply.**
  - Add the approved mutations to `scripts/mutations.mjs` after the last phase 4 entry. Run each with `node scripts/mutate.mjs --only <id>` after `npm run fixtures`.
  - Every mutation must be caught by an assertion. A mutation caught only by `console.error` or a crash needs an added assertion.
  - For a surviving mutation, strengthen the test, or record it as equivalent with its reasoning. Never weaken a mutation.
- [ ] **Step 3: Phase gate.**
  - `npm run typecheck` passes.
  - `npm run test:all` passes, earlier phases included.
  - `scratch/` is absent.
  - Every "Required behavior coverage" bullet in the spec maps to a test.
- [ ] **Step 4: Commit** `Prove phase 5 comparison by mutation`, and give the phase report in the session: what was built, the mutation outcome in a line, and any equivalent mutations with reasoning.

## Coverage map

| Spec coverage bullet | Test |
|---|---|
| Values for each period type and baseline | Task 2 default, Task 3 months/quarters/years |
| Income tab; uncategorized split by sign | Task 4 |
| Current period excluded from baselines, pickable, in progress | Task 2 (the June test; option label) |
| Default period is the last complete one | Task 2 default, Task 3 resets, Task 7 fallback |
| Fewer than 3 complete periods | Task 2 insufficient, Task 3 first period |
| Mean counts zero, including empty months | Task 2 default (April; Transport in February) |
| Transfer and ignore excluded, paired conversions too | Task 4 |
| Refund lowers spending | Task 4 |
| Month-boundary card payment | Task 4 |
| Zero baseline shows "—" | Task 3 previous, Task 4 Uncategorized |
| Missing-rate count, excluded from totals | Task 5 |
| Drill-down to category and period; Back restores | Task 7 |
| Uncategorized drill-down | Task 7 |
| Filters survive remount; nav link clears them | Task 6 |
| Rate lookup (four cases, cross-month) | Task 1 |
