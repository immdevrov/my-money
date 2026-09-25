# Trailing baselines

**Status: adopted.** It replaces the pool rule in `docs/specs/phase-5-dashboard.md` ("Baselines"), which has been updated to match. Everything else in that spec stays.

## The change

Every baseline used to be computed over every other complete period in the history, including periods after the one being compared. Comparing March 2024 therefore used spending from 2025, and the mean shifted as the user clicked through periods.

Budgeting tools compare with what came before. The Dashboard now does the same: a period is compared with the periods just before it, and for months and quarters also with the same period a year earlier.

## Window

The **window** for a compared period P is the latest N complete periods before P, within the span.

| Period type | N |
|---|---|
| Month | 6 |
| Quarter | 4 |
| Year | 3 |

- Periods after P never count. P itself never counts. The current, in-progress period never counts, since it is never before a complete period, and when it is the compared period its window is the latest complete periods.
- Periods in the window with no transactions still exist and count as 0.
- Near the start of the history the window is shorter than N, because fewer earlier periods exist. It uses what there is.

## Baselines

- **Mean:** the sum over the window divided by the number of periods in the window, zeros included. It is rounded half-up, away from zero, in integer minor units.
- **Median:** over the window periods where the row's value is non-zero. The row needs at least 3 such periods, otherwise it is "insufficient data". An even count averages the two middle values.
- **Previous period:** the period immediately before P. It is always the newest window period.
- **Same period last year** (months and quarters only): the value in the same month or quarter one year before P. It is "insufficient data" when that period lies outside the span. Year view has no such column, since its previous period already is the year before.
- **Threshold:** the window must hold at least 3 periods. Otherwise every baseline of every row is "insufficient data", Previous period included. Same period last year needs no separate threshold: when it lies inside the span, the window is already full.
- **Total row:** computed from the per-period totals.

## Missing-rate count

It counts rows without a rate in the compared period, plus every window period when the window holds at least 3 periods, plus the same period last year when it lies inside the span.

## Display

- The column headers name the window, so a reader knows what "usual" means: `Mean (6 months)`, `Median (6 months)`, `Mean (4 quarters)`, `Mean (3 years)`. When the window is shorter than N near the start of the history, the header keeps N.
- The previous-period column names the period type: `Previous month`, `Previous quarter`, `Previous year`, with `vs previous month` and so on.
- Months and quarters add `Same month last year` / `Same quarter last year` and its "vs" column, last.

## Examples

Monthly test data: today 15 June 2025. Groceries spent 100, 50, 80, 0, 120 and 40 in January to June.

| Compared | Window | Mean | Median (non-zero) |
|---|---|---|---|
| 2025-06 (in progress) | Jan–May | 70.00 | 90.00 |
| 2025-05 | Jan–Apr | 57.50 | 80.00 |
| 2025-04 | Jan–Mar | 76.67 | 80.00 |
| 2025-03 | Jan–Feb | insufficient data | insufficient data |

Quarterly test data: Groceries spent 30, 60, 120 and 0 in the four quarters of 2024, and 40 in 2025 Q1.

| Compared | Window | Mean | Leave-one-out mean (before) | Same quarter last year |
|---|---|---|---|---|
| 2025 Q1 | 2024 Q1–Q4 | 52.50 | 52.50 | 30.00 |
| 2024 Q4 | 2024 Q1–Q3 | 70.00 | 62.50 | insufficient data |
| 2024 Q3 | 2024 Q1–Q2 | insufficient data | 32.50 | insufficient data |

The latest complete period, which is the Dashboard's default, gets the same numbers as before whenever the whole history fits in the window. Older periods change, and the first two periods of any history have no baseline.

## Decisions

### Only earlier periods count
A budget comparison asks whether spending is high compared with what the user was used to. Only what came before answers that. Later periods describe habits the user did not have yet, and including them makes an old period's baseline change whenever new data is imported.

### A fixed-length window, not all history
Habits change. An average over every earlier period lets spending from years ago dilute the comparison. A trailing window of the latest N periods reflects the user's recent normal, which is what budgeting tools usually show as "your 6-month average". The sizes are fixed at 6 months, 4 quarters and 3 years; there is no picker.

### The minimum stays at 3 periods
A window does not have to be full. Three periods are enough to say something about what is usual, and requiring a full window would hide baselines for the first half year of a monthly history.

### Same period last year is added, not swapped for Previous period
Seasonal spending, such as heating or holidays, is compared better with the same month a year earlier. Month-to-month change still answers a different question, so both columns are shown.

## Required behavior coverage

- The mean and median use only the N complete periods before the compared one, for each period type.
- A period after the compared one never changes its baseline.
- A window with fewer than 3 periods shows "insufficient data" in every baseline column.
- The current, in-progress period is compared with the latest complete periods.
- The column headers name the window and the period type.
- Months and quarters show the same period last year; years do not.
- The missing-rate count covers the compared period, the window and the same period last year.
