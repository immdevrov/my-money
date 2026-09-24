# Phase 5 — Dashboard comparison

The Dashboard answers one question: how did a period's spending and income compare with what is usual? It compares a chosen period against three baselines side by side (mean, median and previous period), per category and in total, and every category row leads to the transactions behind it.

## Scope

In:
- The pure comparison engine: period bucketing, baselines, deltas, GEL conversion for totals.
- Dashboard view: period type and period pickers, Spending and Income tabs with comparison tables, the missing-rate exclusion count.
- Drill-down from a comparison row to Transactions filtered to that category and period.
- Transactions filters held in the URL.
- The `freezeDate` test helper.
- Rate lookup: a later rate in the same month can apply when it is nearer.

Out:
- Charts (phase 6).
- Manual rates (phase 7). Until then, a missing rate always excludes a transaction.
- Any view that includes transfers. No phase 5 total includes a `transfer`-type category, so the rule "a conversion pair counts once wherever transfers are included" has no consumer yet. It still binds the first view that does.

## Amounts

Nothing here is stored. Every number is computed from `listAll()` on every read.

### GEL conversion

`src/aggregate/gel.ts` is pure.

```ts
rateTableFrom(rows: Transaction[]): Rate[]
gelAmount(row: Transaction, table: Rate[]): number | null     // minor units; null = no rate
```

- `rateTableFrom` builds the table from paired foreign-currency conversion rows, as `(postingDate, currency, conversionRateScaled)`. This moves the logic that `TransactionsView` holds today, and `TransactionsView` switches to it, so both views convert identically.
- A GEL row returns its `amountMinor`.
- A non-GEL row converts with `toGelMinor` at `rateFor(table, currency, effectiveDate)`, or returns `null` when there is no rate.

### Rate lookup

`rateFor` in `src/pairing/rates.ts` changes, so the Transactions GEL column and the Dashboard totals change together. For a row in currency C with `effectiveDate` D, there are two candidates:
- **Before:** the latest rate for C dated on or before D, of any age.
- **After:** the earliest rate for C dated after D, in the same calendar month as D.

Whichever candidate is fewer days from D wins. A tie goes to the earlier one. With neither candidate, the row has no rate.

### Which rows count

- A row whose category has type `transfer` or `ignore` is excluded. Paired conversions fall out here, since they are always assigned the `transfer`-type Currency conversion.
- A row with no GEL amount is excluded from every total. It is counted instead (see "Missing-rate count").
- Every other row is counted in exactly one tab:

| Row | Tab |
|---|---|
| Category of type `expense` | Spending, under that category |
| Category of type `income` | Income, under that category |
| Uncategorized, amount < 0 | Spending, under "Uncategorized" |
| Uncategorized, amount > 0 | Income, under "Uncategorized" |

- The type of a row's category decides its tab, not the row's sign. Within a category, amounts net: a refund in an expense category lowers that category's spending.
- Tables show magnitudes. Spending for a category is the negated sum of its GEL amounts, and income is the plain sum. Either can be negative when refunds or reversals outweigh the rest, and it is then shown negative.

## Periods

`src/aggregate/period.ts` keeps `periodOptions` and `inPeriod` and gains:

```ts
type PeriodType = 'month' | 'quarter' | 'year'

periodOf(date: string, type: PeriodType): string       // '2025-03' | '2025-Q1' | '2025'
periodsInSpan(earliest: string, today: string, type: PeriodType): string[]   // newest first
previousPeriod(period: string): string
periodLabel(period: string): string                    // '2025-03' | '2025 Q1' | '2025'
```

- Period values and labels are the same as the Transactions period filter uses.
- Rows are bucketed by `effectiveDate`. A month-boundary card payment counts in the month it was made, not the month it was posted.
- `today` is the local date in `YYYY-MM-DD` form, read with `new Date()` when the Dashboard computes, never cached.
- **The span** runs from the period containing the earliest `effectiveDate` of any row, excluded rows included, through the period containing `today`. Periods inside the span that have no transactions exist and count as 0. A row dated after today's period is outside the span and counts nowhere.
- **The current period** is the one containing `today`. It is incomplete. Every period before it in the span is complete. A span's first period is complete even when the data starts partway through it.

## Comparison

`src/aggregate/compare.ts` is pure.

```ts
type Baseline = 'mean' | 'median' | 'previous'

compare(input: {
  rows: Transaction[]
  categories: Category[]
  today: string
  type: PeriodType
  period: string
}): Comparison

type Comparison = {
  spending: ComparisonTable
  income: ComparisonTable
  missingRate: number
}

type ComparisonTable = {
  rows: ComparisonRow[]
  total: ComparisonRow
}

type ComparisonRow = {
  categoryId: string | null                  // null = Uncategorized, or the total row
  name: string
  current: number                            // minor units, GEL
  mean: BaselineResult
  median: BaselineResult
  previous: BaselineResult
}

type BaselineResult = {
  value: number | 'insufficient'
  delta: number | null                       // null when the value is insufficient
  deltaPct: number | null                    // whole percent; null when the value is insufficient or 0
}
```

Every row carries all three baselines. There is no baseline parameter: the Dashboard shows them side by side.

### Baselines

- **The pool** is every complete period in the span except the compared one. It may include periods after the compared period.
- A baseline needs at least 3 periods in the pool. With fewer, all three baselines of every row, including the total's, are `'insufficient'`.
- **Mean:** the sum over the pool divided by the pool size, counting 0 for a period where the category has no rows. It is rounded half-up, away from zero, in integer minor units.
- **Median:** over the pool periods where the row's value is non-zero only. A period with no spending in the category, or with a net of exactly 0, is left out. The row needs at least 3 such periods; with fewer, its median is `'insufficient'`, independently of other rows. For an even count, it is the mean of the two middle values, rounded the same way as the mean.
- **Previous:** the value in the period immediately before the compared one. It needs the pool threshold, and also that the previous period lies inside the span. Otherwise it is `'insufficient'`.
- The total row's baselines are computed from the per-period totals, not by summing category baselines. For the median, the non-zero rule applies to the per-period totals. A median of totals is not a sum of medians.

### Rows

- A category, or Uncategorized, gets a row when its current value or any of its three baselines is non-zero. An insufficient baseline counts as zero for this test.
- Rows are sorted by `current` descending, then by name.
- For each baseline: `delta = current − value`, and `deltaPct = delta × 100 / value`, rounded half-up away from zero to a whole percent, in integer arithmetic. `deltaPct` is `null` when the value is 0.
- The total row is named "Total spending" or "Total income". Its `current` is the sum over every counted row in the tab, so it equals the sum of the table's rows.

### Missing-rate count

`missingRate` counts rows that would be counted but have no GEL amount, and whose period is one that a number on screen depends on:
- the compared period, plus
- when the pool has at least 3 periods: every pool period. The previous period, whenever it lies inside the span, is itself a pool period.

## Routing and the URL

### Hash query

- A route may carry a query: `#/transactions?period=2025-03&category=abc`, encoded with `URLSearchParams`.
- `src/ui/hashQuery.ts` reads the query from `location.hash` and writes it with `history.replaceState`, so filter and picker changes do not add history entries.
- App matches routes on the path before `?`.
- A view reads its query on mount and again on every `hashchange`. It re-reads on `hashchange` because navigating between two queries of the same route does not remount the view.

### Transactions filters

- The four filters are held in the query as `period`, `category` (a category id or `uncategorized`), `kind` and `q`. Changing a control rewrites the query. Empty values are omitted, so the Transactions nav link (`#/transactions`) shows the view unfiltered.
- Unknown values are ignored, and the filter falls back to "All".
- The period select always offers the active period, even when no row falls in it, so a drill-down into an empty period still shows the period it filtered to.

### Dashboard state

- The Dashboard holds `type`, `period` and `tab` in its query, so Back from a drill-down restores the same view.
- Defaults: `month`; the most recent complete period, or the current period when none is complete; `spending`.
- Any other key, such as a `baseline` left in an old link, is ignored.
- A `period` that does not belong to the chosen type's span falls back to the default.
- Changing the period type resets the period to that type's default.

### Drill-down

- Each category name in a comparison table is a link to `#/transactions?period={period}&category={categoryId | uncategorized}`.
- Uncategorized drills to every uncategorized row in the period, of either sign, because the category filter has no direction.
- The total row's name links to `#/transactions?period={period}`.
- These are ordinary links, so Back returns to the Dashboard.

## Dashboard view

`src/ui/views/DashboardView.svelte` reads `listAll()` and `listCategories()` through `liveQuery` and renders `compare(...)`. It computes nothing itself.

- **Pickers:**
  - A "Period type" select: Month, Quarter, Year.
  - A "Period" select: every period in the span, newest first, by label. The current period is labelled "{label} (in progress)".
  - There is no baseline picker.
- **Missing rates:** "{N} transaction(s) excluded from totals: no exchange rate." The singular and plural follow N. The message is hidden when N is 0.
- **Tabs:** a `tablist` named "Comparison" with the tabs "Spending" and "Income". Each tab has `aria-selected` and controls its `tabpanel`, and only the selected panel is rendered. Arrow keys move between the tabs.
- **Tables:** each panel holds a table named "Spending comparison" or "Income comparison".
  - Columns: Category, Current, Mean, vs mean, Median, vs median, Previous period, vs previous period. The total row is last.
  - Amounts use `formatMinor`. A "vs" cell shows the change and its percent together: `+62.50 (+109%)`, `-12.50 (-24%)`, `0.00 (0%)`, or `+120.00 (—)` when `deltaPct` is `null`. The change has a `+` sign when positive.
  - An insufficient baseline shows "insufficient data" in its value column, and its "vs" cell is empty.
  - The table sits in a container that scrolls horizontally, so the page itself never scrolls sideways at phone width.
  - A tab with no category rows shows only its total row.
- **Empty database:** "No transactions yet. Import a statement to see the dashboard." No pickers are shown.

App's `dashboard` route renders DashboardView instead of StubView.

## Modules and files

```
src/aggregate/period.ts        + PeriodType, periodOf, periodsInSpan, previousPeriod, periodLabel
src/aggregate/gel.ts           rateTableFrom, gelAmount
src/pairing/rates.ts           rateFor: nearest rate, later candidate limited to the same month
src/aggregate/compare.ts       compare, Comparison types
src/ui/hashQuery.ts            read and replace the hash query
src/ui/views/DashboardView.svelte
src/ui/views/TransactionsView.svelte   filters from the hash query; GEL via gel.ts
src/App.svelte                 route on the path before '?'; dashboard route
tests/helpers/freezeDate.ts
```

## Required behavior coverage

- With `freezeDate`, the Spending table's values match hand-computed expectations for each period type (month, quarter, year), with the mean, median and previous-period columns side by side.
- The Income tab shows income categories and uncategorized inflows. Uncategorized outflows appear under Spending.
- The current incomplete period is excluded from baselines, but can be picked and is labelled in progress.
- The default period is the most recent complete one.
- Fewer than 3 complete periods shows "insufficient data".
- The mean counts zero for months in which a category is absent, including months with no transactions at all.
- The median leaves out zero periods. A row with fewer than 3 non-zero periods shows "insufficient data" in Median while other rows show a value. An even count of non-zero periods averages the two middle values.
- Transfer- and ignore-type categories, including paired conversions, are excluded from totals.
- A refund in an expense category lowers that category's spending.
- A month-boundary card payment is counted in its effective month.
- A zero baseline shows "—" as the percent in its "vs" cell.
- The missing-rate exclusion count is shown, and the rows it counts are excluded from totals.
- Rate lookup, in the Transactions GEL column:
  - With no earlier rate, a later rate in the same month applies.
  - A later same-month rate that is closer than an earlier rate beats it.
  - An earlier rate that is closer, or the same distance away, beats a later one.
  - A later rate never applies across a month boundary. This replaces the phase 3 test "a rate is not applied to a transaction dated before it", whose row and rate share a month.
- Clicking a comparison table row opens Transactions filtered to that category and period. Back returns to the Dashboard with the same period type, period and tab.
- Uncategorized drill-down shows the period's uncategorized rows.
- Transactions filters survive a remount through the URL. The Transactions nav link clears them.

## Decisions

### Spending and income are tabs, not sections
Spending has many categories and income has few. Two tables stacked on one page would bury income under a long spending list, and one signed table would mix two questions. Tabs keep each table short and put the question the user asks most first.

### A category's type decides its tab; uncategorized rows go by sign
A categorized row's meaning comes from the user's choice of category, so a refund in Groceries lowers grocery spending rather than showing up as income. An uncategorized row carries no such choice, and its sign is the only evidence of what it is.

### The baseline pool is the calendar span
Every period from the first data period to the last complete one counts, including empty ones. An empty month is real information: nothing was spent. The first period counts even if the export starts partway through it. That rule is predictable from dates alone, and a heuristic for a partial first month would be a guess.

### The pool is every other complete period, not only earlier ones
This follows the parent spec as written. The baseline describes what is usual across all the history there is, not what was known at the time. The same threshold of 3 applies to "previous" as well, so all three baselines share one rule for when there is enough data.

### The default period is the last complete one
A finished period is the comparison that means something on first view. The current period is still selectable, labelled in progress.

### Rows appear only when non-zero
A long spending list full of zeros hides the categories that moved. A category appears when it has a current value or a baseline, so a category that dropped to zero is still shown.

### The missing-rate count covers every number on screen
A baseline can be lowered by missing rates just as much as the current value. Counting only the compared period would hide that.

### All three baselines are shown side by side
A picker that switched one Baseline column between mean, median and previous period gave a table that could not say which baseline it showed, and it hid the other two answers. Showing all three at once answers "is this unusual?" from several angles at a glance. Each change shares one cell with its percent, so the table stays at 8 columns, and the table scrolls inside its own box at phone width.

### The median ignores zero periods
A month with no spending in a category says little about what a typical month of that spending costs, and zeros drag the median toward 0 for anything not bought every month. The median therefore describes a typical period in which the category occurred. It needs 3 such periods per row, so one or two occurrences never pose as a typical value. The mean keeps counting zeros, because it answers a different question: the average cost per period, over all periods.

### A nearby later rate in the same month is fair
Phase 3 applied only rates on or before a transaction's date. A foreign payment made a few days before the month's conversion then had no rate, and dropped out of every total, although that conversion's rate is a fair estimate of its cost. The nearest rate is the best estimate in either direction. A later rate is limited to the same calendar month, so a conversion never reaches back across a month boundary to price older spending.

### The URL owns the Transactions filters and the Dashboard state
Drill-down needs to pass filters between views. Making the hash query the only store of filter state means a drill-down, a reload and Back all show the same thing, with no second copy of the state to keep in sync. `replaceState` keeps filter edits out of the history, while a drill-down link is a real navigation that Back undoes.
