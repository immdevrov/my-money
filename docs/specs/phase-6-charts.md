# Phase 6 — Dashboard charts

The Dashboard's tables answer "is this unusual?" row by row. Phase 6 adds two pictures of the same numbers: which categories moved against their usual level, and how spending and income ran month by month over the whole history. A chart shows only numbers the Dashboard already computes, and each chart carries a table of exactly what it plots.

## Scope

In:
- `src/ui/charts/Chart.svelte`, the one Chart.js wrapper.
- A grouped bar chart per comparison tab: each category's current value beside its mean.
- A line chart of monthly spending and income over the full history, with its own missing-rate count.
- Bar-click drill-down through the table rows' drill-down link.
- Chart color tokens in `tokens.css`, re-read when the color scheme changes.
- The `setColorScheme` test helper and its browser command.

Out:
- Manual rates (phase 7). A missing rate still excludes a transaction from every chart.
- Any chart that includes transfers.
- Per-category colors in charts. The category `color` is not used here (see Decisions).

## Counting

Charts count exactly as the comparison does: the same exclusions, the same tab per row, the same sign rules and the same GEL conversion (`docs/specs/phase-5-dashboard.md`, "Which rows count"). The classification of a row moves into one function that `compare` and the monthly totals both call, so the two cannot drift apart.

```ts
// src/aggregate/count.ts
type Counted =
  | { status: 'counted'; tab: 'spending' | 'income'; categoryId: string | null; amount: number } // amount: magnitude convention, minor units
  | { status: 'no-rate' }
  | { status: 'excluded' }

countRow(row: Transaction, categories: Map<string, Category>, table: Rate[]): Counted
```

- `excluded`: a `transfer`- or `ignore`-type category, or an uncategorized row of exactly 0.
- `no-rate`: a row that would be counted but has no GEL amount.
- `counted`: `amount` is the negated GEL sum for Spending and the plain sum for Income, as in the tables.

## Monthly totals

```ts
// src/aggregate/monthly.ts
monthlyTotals(input: { rows: Transaction[]; categories: Category[]; today: string }): {
  months: { month: string; spending: number; income: number }[]   // oldest first
  missingRate: number
}
```

- The months are the month span of the Dashboard: from the month of the earliest `effectiveDate` through the month containing `today`, empty months included as 0. They do not follow the Period type picker. A row dated after today's month counts nowhere.
- `spending` and `income` are the sums of every counted row in that month, so a month's value equals the "Total spending" or "Total income" current value of the month comparison for that month.
- `missingRate` counts every `no-rate` row in the span.

## Chart wrapper

`src/ui/charts/Chart.svelte` owns Chart.js creation, update and destruction. Nothing else imports `chart.js`.

```ts
type ChartSeries = { label: string; values: number[]; color: string }   // values: minor units; color: a CSS custom property name
props: {
  kind: 'bar' | 'line'
  name: string                // visible caption, and the accessible name of its data table
  labelHeader: string         // header of the data table's first column
  labels: string[]
  series: ChartSeries[]
  onselect?: (index: number) => void   // a click on the mark at labels[index]
}
```

- **Registration:** only `BarController`, `BarElement`, `LineController`, `LineElement`, `PointElement`, `CategoryScale`, `LinearScale`, `Legend` and `Tooltip`.
- **Lifecycle:** the chart is created on mount, updated in place with `chart.update()` when its labels, series or colors change, and destroyed on unmount.
- **Amounts:** plotted values stay integer minor units. Axis ticks and tooltips format them with `formatMinor`, and ticks are forced to integers, so no amount passes through floating-point division.
- **Colors:** each series color, the grid (`--border`) and the tick and legend text (`--text-muted`) are read from CSS custom properties with `getComputedStyle` every time the chart is built or updated. A `change` listener on `matchMedia('(prefers-color-scheme: dark)')` triggers an update, so the chart follows the scheme with no theming in script.
- **Animation:** off. The Dashboard rebuilds on every picker change, and moving bars would add nothing but motion.
- **Markup:**
  - A `figure` whose visible `figcaption` is `name`.
  - The canvas is `aria-hidden`. The data table is its text equivalent, and the comparison table's links are the keyboard route to every drill-down.
  - A visually hidden `table` with caption `name`: a column header `labelHeader`, then one column per series headed by its `label`. One row per label, the label as a row header, and each value formatted with `formatMinor`. It holds exactly the plotted data, nothing more.
- **Click:** when `onselect` is given, a click on a bar calls it with that bar's index, and the pointer shows as a hand over a bar.

## Tokens

`tokens.css` gains chart roles, with light and dark values. Both pairs were checked with the dataviz palette validator against the raised surface: every check passes except the chroma floor, which the neutral fails by design.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--chart-spending` | `#2a78d6` | `#3987e5` | Spending: its line, and the current bars on the Spending tab |
| `--chart-income` | `#eb6834` | `#d95926` | Income: its line, and the current bars on the Income tab |
| `--chart-baseline` | `#767676` | `#a3a3a3` | Mean bars |

Grid lines use `--border`, and tick and legend text use `--text-muted`.

## Dashboard view

### Category bar chart

- Each tab panel shows a bar chart above its comparison table, named "Spending by category" or "Income by category".
- One group per category row of the table, in the table's order. The total row is not plotted: it would dwarf every category.
- Two series: "Current", in the tab's color, and the mean, labelled as its table column (`Mean (6 months)`, `Mean (4 quarters)`, `Mean (3 years)`), in the baseline color.
- When the window has fewer than 3 periods, every mean is insufficient, so the mean series is left out and the chart plots Current alone. Its data table then has no mean column.
- A tab with no category rows shows no chart.
- **Drill-down:** clicking a bar navigates to the same link as that category's name in the table, through one function that builds both.

### Monthly chart

- Below the tabs, a line chart named "Monthly spending and income", with the series "Spending" and "Income", one point per month, oldest first. The data table's first column is "Month".
- Months are labelled by `periodLabel`. The current month is labelled `{label} (in progress)`, as in the Period picker.
- It is the same whatever the period type, period and tab.
- When `missingRate` is above 0, it shows "{N} transaction(s) excluded from monthly totals: no exchange rate." below the chart, singular and plural following N, like the comparison's message.

## Test helper

- `setColorScheme(scheme: 'light' | 'dark')` in `tests/helpers/setColorScheme.ts` calls a browser command of the same name, defined in `vitest.config.ts`. The command runs Playwright's `page.emulateMedia({ colorScheme })`.
- `tests/setup.ts` resets the scheme to light before each test.

## Modules and files

```
src/aggregate/count.ts           countRow: the one classification of a row
src/aggregate/compare.ts         uses countRow
src/aggregate/monthly.ts         monthlyTotals
src/ui/charts/Chart.svelte       the Chart.js wrapper
src/ui/styles/tokens.css         + chart tokens
src/ui/views/DashboardView.svelte  bar charts, monthly chart, shared drill-down link
vitest.config.ts                 + setColorScheme command
tests/helpers/setColorScheme.ts
tests/setup.ts                   reset to light
tests/dashboard-charts.test.ts
```

## Required behavior coverage

- The Spending chart's data table lists each category's current value and mean, matching the comparison table, and follows a change of period.
- The Income chart's data table matches the Income comparison table.
- With fewer than 3 window periods, the bar chart plots Current only.
- A tab with no category rows has no chart.
- The monthly chart's data table lists every month of the history with its spending and income, empty months as 0.00, transfers, ignored rows and paired conversions excluded, and the current month labelled in progress. It does not change with the period type.
- The monthly chart counts the transactions it leaves out for missing rates, over the whole history.
- `setColorScheme('dark')` re-renders the charts without errors, and their data tables are unchanged.
- Bar-click drill-down builds its link with the same function as the table row and is not tested separately.

## Decisions

### The bar chart compares with the mean
The table shows four baselines. Four bars beside each current value would be unreadable at phone width. The mean is the one to plot: it is "your 6-month average", the figure a budget chart usually shows, and it exists for every row whenever the window is long enough. The median can be insufficient per row and would leave holes, and previous period and same period last year are single periods, noisier than a window. The table stays the place to read the others.

### Colors follow spending and income, not categories
The categories' own colors would make every bar a different hue, and a grouped chart would then need a second encoding to tell current from mean. Instead the tab's color marks the current value and a neutral marks the mean, and the same spending and income colors are used by the monthly lines. A color means the same thing wherever it appears on the page.

### The total is not a bar
The total is the sum of the other bars. Plotting it would squeeze every category into the bottom of the axis.

### The monthly chart ignores the period type
"Monthly income and expense over the full history" is a fixed view of the whole record. Following the picker would make it a second, smaller copy of the comparison.

### The monthly chart has its own missing-rate count
The comparison's count covers the periods its table depends on. The monthly chart shows every month, so rows outside those periods are missing from numbers on screen too. Widening the comparison's count would make it overstate what the table leaves out, so the chart states its own.

### The current month is plotted, and marked
The full history includes the month in progress. Leaving it out would hide recent spending. Labelling it in progress explains why it is lower.

### The canvas is hidden from assistive technology
The data table carries the chart's content in text, and the comparison table's links reach every drill-down from the keyboard. Exposing the canvas as an image as well would announce the same chart twice.

### Theme changes are not asserted on pixels
Tests never assert pixels, so no test can see a chart's colors. The dark-scheme test proves the update path runs without an error and leaves the plotted data intact. That a dark color is actually painted is checked by eye.
