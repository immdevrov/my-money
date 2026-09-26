import type { Category, Transaction } from '../domain/types';
import { countRow, type Tab } from './count';
import { rateTableFrom } from './gel';
import { dashboardPeriods, periodOf, samePeriodLastYear, type PeriodType } from './period';

export type Baseline = 'mean' | 'median' | 'previous' | 'yearAgo';

export const WINDOW_SIZE: Record<PeriodType, number> = { month: 6, quarter: 4, year: 3 };

export type BaselineResult = {
  value: number | 'insufficient';
  delta: number | null;
  deltaPct: number | null;
};

export type ComparisonRow = {
  categoryId: string | null;
  name: string;
  current: number;
  mean: BaselineResult;
  median: BaselineResult;
  previous: BaselineResult;
  yearAgo: BaselineResult | null;
};

export type ComparisonTable = {
  rows: ComparisonRow[];
  total: ComparisonRow;
};

export type Comparison = {
  spending: ComparisonTable;
  income: ComparisonTable;
  missingRate: number;
};

type PeriodSums = Map<string, number>;

type TabBuckets = {
  byCategory: Map<string | null, PeriodSums>;
  total: PeriodSums;
};

type Scope = {
  period: string;
  window: string[];
  withYearAgo: boolean;
  yearAgo: string | null;
  sufficient: boolean;
};

const MIN_WINDOW = 3;
const MIN_MEDIAN_PERIODS = 3;
const UNCATEGORIZED = 'Uncategorized';
const TOTAL_NAMES: Record<Tab, string> = { spending: 'Total spending', income: 'Total income' };

function roundedDivide(numerator: number, denominator: number): number {
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  if (2 * Math.abs(remainder) >= Math.abs(denominator)) {
    return quotient + Math.sign(numerator) * Math.sign(denominator);
  }
  return quotient;
}

function addTo(sums: PeriodSums, period: string, amount: number) {
  sums.set(period, (sums.get(period) ?? 0) + amount);
}

function emptyBuckets(): TabBuckets {
  return { byCategory: new Map(), total: new Map() };
}

function valuesIn(sums: PeriodSums, periods: string[]): number[] {
  return periods.map((period) => sums.get(period) ?? 0);
}

function meanOf(sums: PeriodSums, window: string[]): number {
  const values = valuesIn(sums, window);
  return roundedDivide(
    values.reduce((sum, value) => sum + value, 0),
    values.length,
  );
}

function medianOf(sums: PeriodSums, window: string[]): number | 'insufficient' {
  const values = valuesIn(sums, window).filter((value) => value !== 0);
  if (values.length < MIN_MEDIAN_PERIODS) return 'insufficient';

  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return roundedDivide((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0), 2);
}

function valueAt(sums: PeriodSums, period: string | null | undefined): number | 'insufficient' {
  return period === null || period === undefined ? 'insufficient' : (sums.get(period) ?? 0);
}

function baselineResult(current: number, value: number | 'insufficient'): BaselineResult {
  if (value === 'insufficient') return { value, delta: null, deltaPct: null };
  const delta = current - value;
  const deltaPct = value === 0 ? null : roundedDivide(delta * 100, value);
  return { value, delta, deltaPct };
}

function comparisonRow(
  categoryId: string | null,
  name: string,
  sums: PeriodSums,
  scope: Scope,
): ComparisonRow {
  const current = sums.get(scope.period) ?? 0;
  const yearAgo = scope.withYearAgo ? baselineResult(current, valueAt(sums, scope.yearAgo)) : null;
  if (!scope.sufficient) {
    const insufficient = baselineResult(current, 'insufficient');
    return { categoryId, name, current, mean: insufficient, median: insufficient, previous: insufficient, yearAgo };
  }
  return {
    categoryId,
    name,
    current,
    mean: baselineResult(current, meanOf(sums, scope.window)),
    median: baselineResult(current, medianOf(sums, scope.window)),
    previous: baselineResult(current, valueAt(sums, scope.window[0])),
    yearAgo,
  };
}

function isShown(row: ComparisonRow): boolean {
  const baselines = [row.mean, row.median, row.previous, row.yearAgo];
  return (
    row.current !== 0 ||
    baselines.some((result) => result !== null && result.value !== 'insufficient' && result.value !== 0)
  );
}

function buildTable(
  tab: Tab,
  buckets: TabBuckets,
  categories: Map<string, Category>,
  scope: Scope,
): ComparisonTable {
  const rows: ComparisonRow[] = [];

  for (const [categoryId, sums] of buckets.byCategory) {
    const name = categoryId === null ? UNCATEGORIZED : (categories.get(categoryId)?.name ?? '');
    const row = comparisonRow(categoryId, name, sums, scope);
    if (isShown(row)) rows.push(row);
  }

  rows.sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

  const total = comparisonRow(null, TOTAL_NAMES[tab], buckets.total, scope);

  return { rows, total };
}

export function compare(input: {
  rows: Transaction[];
  categories: Category[];
  today: string;
  type: PeriodType;
  period: string;
}): Comparison {
  const { rows, today, type, period } = input;
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const table = rateTableFrom(rows);

  const { span } = dashboardPeriods(rows, today, type);
  const inSpan = new Set(span);
  const window = span.filter((candidate) => candidate < period).slice(0, WINDOW_SIZE[type]);

  const withYearAgo = type !== 'year';
  const yearAgoCandidate = samePeriodLastYear(period);
  const yearAgo = withYearAgo && inSpan.has(yearAgoCandidate) ? yearAgoCandidate : null;
  const sufficient = window.length >= MIN_WINDOW;
  const scope: Scope = { period, window, withYearAgo, yearAgo, sufficient };
  const onScreen = new Set([period, ...(sufficient ? window : []), ...(yearAgo === null ? [] : [yearAgo])]);

  const buckets: Record<Tab, TabBuckets> = { spending: emptyBuckets(), income: emptyBuckets() };
  let missingRate = 0;

  for (const row of rows) {
    const rowPeriod = periodOf(row.effectiveDate, type);
    if (!inSpan.has(rowPeriod)) continue;

    const counted = countRow(row, categories, table);
    if (counted.status === 'excluded') continue;
    if (counted.status === 'no-rate') {
      if (onScreen.has(rowPeriod)) missingRate += 1;
      continue;
    }

    const { tab, categoryId, amount } = counted;
    const sums = buckets[tab].byCategory.get(categoryId) ?? new Map<string, number>();
    buckets[tab].byCategory.set(categoryId, sums);
    addTo(sums, rowPeriod, amount);
    addTo(buckets[tab].total, rowPeriod, amount);
  }

  return {
    spending: buildTable('spending', buckets.spending, categories, scope),
    income: buildTable('income', buckets.income, categories, scope),
    missingRate,
  };
}
