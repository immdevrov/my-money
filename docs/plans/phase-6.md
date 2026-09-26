# Phase 6 Implementation Plan — Dashboard charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Dashboard plots each tab's categories against their mean, and monthly spending and income over the whole history. Every chart carries a hidden data table of exactly what it plots.

**Architecture:** One `Chart.svelte` wrapper owns Chart.js and renders the data table from the same labels and series it plots. `DashboardView` feeds it rows it already has from `compare(...)`, plus a new pure `monthlyTotals(...)`. Both share one row classification, `countRow`, so the chart and the tables count identically. Nothing new is stored.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Chart.js 4.5.1 (pinned exact), Dexie 4 `liveQuery`, Vitest 4 Browser Mode with `@vitest/browser-playwright`, vitest-browser-svelte.

**Spec:** `docs/specs/phase-6-charts.md`. It is the source of truth for every name, label and message quoted below.

## Global Constraints

- Everything in `CLAUDE.md` applies.
- **Chart.js** is imported only by `src/ui/charts/Chart.svelte`. Register only `BarController`, `BarElement`, `LineController`, `LineElement`, `PointElement`, `CategoryScale`, `LinearScale`, `Legend` and `Tooltip`. No Svelte chart wrapper package.
- **Money:** plotted values are integer minor units. Ticks and tooltips format with `formatMinor` from `src/import/amount.ts`, and ticks use `precision: 0`. No division of an amount.
- **Colors** come only from CSS custom properties read with `getComputedStyle` at render time: `--chart-spending`, `--chart-income`, `--chart-baseline`, `--border`, `--text-muted`. No hex in a component.
- **Derived, never stored:** monthly totals and their missing-rate count.
- **Test data is synthetic**, with made-up names and MCCs only.
- **TDD:** every behavior lands test-first. Watch the test fail for the expected reason, then implement.
- **Test surface:** `DashboardView`, rendered after `importRows` and `categorize`. No `App`: nothing in this phase is routing. Charts are asserted only through their data tables, located by `getByRole('table', { name })`, with cell text anchored by `exactly(...)`.
- **Timeouts:** tests that import and categorize take `{ timeout: 5000 }` (`SLOW`), as in `tests/dashboard.test.ts`.
- **Verify per task:** `npm run typecheck && npx vitest run --project behavior tests/dashboard-charts.test.ts`. A task that touches `src/aggregate/compare.ts`, `DashboardView.svelte`, `tests/setup.ts` or `vitest.config.ts` also runs `npm test`.
- **Commits:** one per task, one short line, no attribution.

**Human verification (at the finish, non-blocking):** the user runs `npm run dev` and opens `#/dashboard` with data, in light and dark:
- The bar chart sits above each comparison table, with a legend "Current" / "Mean (6 months)". Current bars are blue on Spending and orange on Income, and the mean bars are grey.
- Clicking a bar opens Transactions filtered to that category and period, and Back returns.
- The monthly chart sits below the tabs, with a blue Spending line and an orange Income line. Axis values read as amounts like `1500.00`, not raw minor units like `150000`.
- Switching the OS or devtools color scheme recolors the charts without a reload. The grid and tick text stay legible in dark.
- At phone width, the charts fit without horizontal page scroll.

---

### Task 1: Chart wrapper and the category bar charts

**Files:**
- Modify: `package.json`, `package-lock.json` (chart.js 4.5.1, already installed), `src/ui/styles/tokens.css`, `src/ui/views/DashboardView.svelte`
- Create: `src/ui/charts/Chart.svelte`, `tests/dashboard-charts.test.ts`

**Interfaces (Produces):**
```ts
// Chart.svelte props
type ChartSeries = { label: string; values: number[]; color: string }  // color: custom property name, e.g. '--chart-spending'
{ kind: 'bar' | 'line'; name: string; labelHeader: string; labels: string[]; series: ChartSeries[]; onselect?: (index: number) => void }
```

**Behavior:**
- Markup: `figure` › visible `figcaption` {name} › a sized box holding `<canvas aria-hidden="true">` › `table.visually-hidden` with `caption` {name}, header row `labelHeader` + each series `label` (`th scope="col"`), one body row per label (`th scope="row"` label, `td` `formatMinor(value)`).
- One `$effect` builds the config from props plus colors read off the canvas, then creates the chart on first run and afterwards assigns `data`/`options` and calls `chart.update()`. Unmount destroys it. A `matchMedia('(prefers-color-scheme: dark)')` `change` listener bumps a `$state` counter that effect reads.
- Options: `animation: false`, `responsive: true`, `maintainAspectRatio: false`, y ticks `precision: 0` with a `formatMinor` callback, tooltip label `"{series}: {formatMinor(value)}"`, grid color `--border`, tick and legend color `--text-muted`. Bars: `maxBarThickness: 24`, `borderRadius: 4`. Lines: `borderWidth: 2`, `pointRadius: 3`.
- `onClick` calls `onselect(elements[0].index)` when a bar is hit. `onHover` sets the canvas cursor to `pointer` over a bar when `onselect` is set.
- Tokens: add `--chart-spending #2a78d6 / #3987e5`, `--chart-income #eb6834 / #d95926`, `--chart-baseline #767676 / #a3a3a3` (light / dark).
- DashboardView:
  - A `rowHref(period, row)` function builds a category row's drill-down link (`categoryId ?? 'uncategorized'`). The table's name link and the bar click both use it; the bar click assigns `location.hash`.
  - Each tab panel renders, above its table and only when the table has category rows, a bar `Chart` named "Spending by category" / "Income by category", `labelHeader` "Category", labels = row names, series "Current" (`--chart-spending` or `--chart-income`), then — only when `total.mean.value !== 'insufficient'` — the mean series labelled as the Mean column header (`Mean (6 months)` etc.) in `--chart-baseline`.

**Test data:** `MONTHS`, `MIXED`, `MIXED_OPTIONS`, `MIXED_CATEGORIES` from `tests/helpers/dashboardData.ts`; `CATEGORIES` = Groceries/Grocer, Transport/Taxi, Unused. `freezeDate('2025-06-15T12:00:00')` throughout.

**Definition of done** (tests in `tests/dashboard-charts.test.ts`; rows as header then body, cells left to right):
- "the spending chart plots each category's current value and mean" (MONTHS, CATEGORIES):
  - Header `Category | Current | Mean (6 months)`, nothing after.
  - `Groceries | 120.00 | 57.50`, `Transport | 30.00 | 7.50`, and no fourth row (no total, no Unused).
  - Select Period `2025-06 (in progress)`: `Groceries | 40.00 | 70.00`, `Transport | 0.00 | 12.00`.
- "the income chart plots the income categories" (MIXED):
  - Spending: `Groceries | 110.00 | 57.50`, `Transport | 30.00 | 7.50`, `Uncategorized | 7.00 | 0.00`, no fifth row.
  - Click the Income tab: "Spending by category" is gone; `Salary | 1500.00 | 750.00`, `Uncategorized | 5.00 | 0.00`, no fourth row.
- "without a baseline the chart plots only the current values": rows `10/03/2025 Grocer Mar -80`, `10/05/2025 Grocer May -120`, Groceries. Header `Category | Current`, nothing after; `Groceries | 120.00`.
- "a tab with no category rows has no chart" (MONTHS, CATEGORIES): click Income. "Income comparison" is visible, and no "Income by category" table exists.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard-charts.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** the tokens, `Chart.svelte`, `rowHref` and the bar charts.
- [ ] **Step 3: Verify and commit** `Plot each tab's categories against their mean`.

---

### Task 2: Shared row counting and the monthly chart

**Files:**
- Create: `src/aggregate/count.ts`, `src/aggregate/monthly.ts`
- Modify: `src/aggregate/compare.ts` (classify through `countRow`), `src/ui/views/DashboardView.svelte`
- Test: `tests/dashboard-charts.test.ts`

**Interfaces:**
- Consumes: `Chart.svelte` from Task 1; `rateTableFrom`, `gelAmount` from `src/aggregate/gel.ts`; `dashboardPeriods`, `periodOf`, `periodLabel` from `src/aggregate/period.ts`.
- Produces:
```ts
// count.ts
type Tab = 'spending' | 'income'
type Counted =
  | { status: 'counted'; tab: Tab; categoryId: string | null; amount: number }
  | { status: 'no-rate' }
  | { status: 'excluded' }
countRow(row: Transaction, categories: Map<string, Category>, table: Rate[]): Counted

// monthly.ts
type MonthlyTotal = { month: string; spending: number; income: number }
monthlyTotals(input: { rows: Transaction[]; categories: Category[]; today: string }): { months: MonthlyTotal[]; missingRate: number }
```

**Behavior:**
- `countRow` holds today's `tabOf` + `gelAmount` + negation logic from `compare`. `compare` keeps its output identical: this half is a refactor proven by the existing dashboard tests.
- `monthlyTotals` walks the month span (`dashboardPeriods(rows, today, 'month').span`, reversed to oldest first), sums counted rows per month and tab, and counts `no-rate` rows inside the span.
- DashboardView, below the tab panels: a line `Chart` named "Monthly spending and income", `labelHeader` "Month", labels `periodLabel(month)` with ` (in progress)` appended for today's month, series "Spending" (`--chart-spending`) and "Income" (`--chart-income`). It uses its own `monthlyTotals` call, independent of the pickers.
- Below it, when `missingRate > 0`: `{N} transaction(s) excluded from monthly totals: no exchange rate.` Build it with the same pluralizing function as the comparison message.

**Definition of done:**
- "the monthly chart plots every month of the history" (MIXED, MIXED_CATEGORIES):
  - Header `Month | Spending | Income`.
  - `2025-01 | 120.00 | 0.00`, `2025-02 | 50.00 | 0.00`, `2025-03 | 90.00 | 1500.00`, `2025-04 | 0.00 | 1500.00`, `2025-05 | 147.00 | 1505.00`, `2025-06 (in progress) | 40.00 | 0.00`, and no eighth row.
  - May leaves out Savings (transfer), Hidden (ignore) and the paired conversion, and nets the Grocer refund.
  - No "excluded from monthly totals" text.
  - Choose Period type `Year`: the first body row still reads `2025-01 | 120.00 | 0.00` and the fifth `2025-05 | 147.00 | 1505.00`.
- "the monthly chart counts rows it leaves out for missing rates" (the `MISSING_RATE_SHORT_POOL` rows from `tests/dashboard.test.ts`, header `Date | Details | GEL | USD`, Groceries):
  - The comparison shows `1 transaction excluded from totals: no exchange rate.`
  - The monthly chart shows `2 transactions excluded from monthly totals: no exchange rate.`
  - Rows: `2025-03 | 80.00 | 0.00`, `2025-04 | 0.00 | 0.00`, `2025-05 | 120.00 | 0.00`, `2025-06 (in progress) | 0.00 | 0.00`.
- Move `MISSING_RATE_SHORT_POOL` into `tests/helpers/dashboardData.ts` so both files import it.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard-charts.test.ts`, then `npm test`.

- [ ] **Step 1: Failing tests** above.
- [ ] **Step 2: Implement** `countRow`, switch `compare` to it, run `npx vitest run --project behavior tests/dashboard.test.ts` green, then `monthlyTotals` and the chart.
- [ ] **Step 3: Verify and commit** `Chart monthly spending and income over the whole history`.

---

### Task 3: Color scheme command and the dark re-render

**Files:**
- Modify: `vitest.config.ts` (browser `commands: { setColorScheme }`), `tests/setup.ts` (reset to light before each test)
- Create: `tests/helpers/setColorScheme.ts`
- Test: `tests/dashboard-charts.test.ts`

**Interfaces (Produces):**
```ts
// vitest.config.ts: a BrowserCommand<['light' | 'dark']> that calls context.page.emulateMedia({ colorScheme })
// tests/helpers/setColorScheme.ts
setColorScheme(scheme: 'light' | 'dark'): Promise<void>   // commands.setColorScheme from 'vitest/browser'; declares the BrowserCommands augmentation
```

**Definition of done:**
- "charts re-render in the dark color scheme" (MIXED, MIXED_CATEGORIES):
  - Render, wait for `Groceries | 110.00 | 57.50` in "Spending by category".
  - `await setColorScheme('dark')`, and `matchMedia('(prefers-color-scheme: dark)').matches` is true.
  - "Spending by category" still reads `Groceries | 110.00 | 57.50`, and "Monthly spending and income" still reads `2025-05 | 147.00 | 1505.00`.
  - Click Income: "Income by category" reads `Salary | 1500.00 | 750.00`. That chart is created in dark.
  - No `console.error` and no unhandled error, which `tests/setup.ts` and Vitest enforce.
- Every other test still runs in light, since setup resets the scheme.

**Verify:** `npm run typecheck && npx vitest run --project behavior tests/dashboard-charts.test.ts`, then `npm test`.

- [ ] **Step 1: Helper and command**, then the failing test. It cannot fail on the chart before the command exists, so first confirm it fails for the missing command.
- [ ] **Step 2: Fix** whatever the dark update path exposes.
- [ ] **Step 3: Verify and commit** `Re-render charts when the color scheme changes`.

---

### Task 4: Mutations and phase gate

- [ ] **Step 1: List mutations** in `scratch/`, one per line: the targeted test and a one-line change in `src/`. Candidates:
  - Chart table drops the last series column (`series.slice(0, -1)`).
  - Chart table formats the raw minor units instead of `formatMinor`.
  - Bar labels take `row.categoryId` instead of `row.name`.
  - Bar chart plots the total row too.
  - Bar mean series uses `median` instead of `mean`.
  - The mean series is kept when insufficient (plots 0) instead of being dropped.
  - The bar chart is shown for a tab with no rows.
  - Income tab passes the spending table to its chart.
  - `monthlyTotals` follows the picked period type instead of `'month'`.
  - `monthlyTotals` drops the empty-month zero-fill (only months with rows).
  - Monthly months newest first.
  - Monthly spending not negated.
  - Monthly `countRow` bypassed for transfers (counts `transfer` type).
  - Monthly missing-rate counts only the compared period.
  - The in-progress suffix dropped from the current month's label.
  - Monthly note hidden.
  - `countRow`: uncategorized zero goes to spending (should be excluded) — equivalent candidate, checked.
  - Theme: the scheme listener is not registered.
- [ ] **Step 2: Apply** with the `mutation-testing` skill's runner. A mutation caught only by `console.error` or a crash needs an assertion. A survivor gets a stronger test or an equivalence note with reasoning.
- [ ] **Step 3: Gate:** `npm run typecheck`, `npm run test:all`, `scratch/` deleted, every spec coverage bullet mapped below.
- [ ] **Step 4: Commit** any test strengthening, then report in the session.

## Coverage map

| Spec coverage bullet | Test |
|---|---|
| Spending chart matches the comparison table and follows the period | Task 1 spending |
| Income chart matches the Income table | Task 1 income |
| Fewer than 3 window periods plots Current only | Task 1 without a baseline |
| No category rows, no chart | Task 1 no rows |
| Monthly: every month, empty as 0.00, exclusions, in progress, independent of period type | Task 2 monthly |
| Monthly missing-rate count over the whole history | Task 2 missing rates |
| Dark scheme re-renders without errors, data intact | Task 3 |
| Bar-click drill-down shares the row's link builder | Not tested separately, per spec |
