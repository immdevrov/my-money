import type { Category, Transaction } from '../domain/types';
import { gelAmount, rateTableFrom } from './gel';
import { dashboardPeriods, periodOf, previousPeriod, type PeriodType } from './period';

export type Baseline = 'mean' | 'median' | 'previous';

export type ComparisonRow = {
  categoryId: string | null;
  name: string;
  current: number;
  baseline: number | 'insufficient';
  delta: number | null;
  deltaPct: number | null;
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

type Tab = 'spending' | 'income';

type PeriodSums = Map<string, number>;

type TabBuckets = {
  byCategory: Map<string | null, PeriodSums>;
  total: PeriodSums;
};

const MIN_POOL = 3;
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

function tabOf(row: Transaction, category: Category | undefined): Tab | null {
  if (category === undefined) {
    if (row.amountMinor < 0) return 'spending';
    if (row.amountMinor > 0) return 'income';
    return null;
  }
  if (category.type === 'expense') return 'spending';
  if (category.type === 'income') return 'income';
  return null;
}

function addTo(sums: PeriodSums, period: string, amount: number) {
  sums.set(period, (sums.get(period) ?? 0) + amount);
}

function emptyBuckets(): TabBuckets {
  return { byCategory: new Map(), total: new Map() };
}

function baselineValue(sums: PeriodSums, baseline: Baseline, periods: string[]): number {
  const values = periods.map((period) => sums.get(period) ?? 0);

  if (baseline === 'previous') return values[0] ?? 0;

  if (baseline === 'mean') {
    return roundedDivide(
      values.reduce((sum, value) => sum + value, 0),
      values.length,
    );
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return roundedDivide((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0), 2);
}

function comparisonRow(
  categoryId: string | null,
  name: string,
  current: number,
  baseline: number | 'insufficient',
): ComparisonRow {
  if (baseline === 'insufficient') {
    return { categoryId, name, current, baseline, delta: null, deltaPct: null };
  }
  const delta = current - baseline;
  const deltaPct = baseline === 0 ? null : roundedDivide(delta * 100, baseline);
  return { categoryId, name, current, baseline, delta, deltaPct };
}

function buildTable(
  tab: Tab,
  buckets: TabBuckets,
  categories: Map<string, Category>,
  period: string,
  baselineOf: (sums: PeriodSums) => number | 'insufficient',
): ComparisonTable {
  const rows: ComparisonRow[] = [];

  for (const [categoryId, sums] of buckets.byCategory) {
    const name = categoryId === null ? UNCATEGORIZED : (categories.get(categoryId)?.name ?? '');
    const row = comparisonRow(categoryId, name, sums.get(period) ?? 0, baselineOf(sums));
    const shownBaseline = row.baseline === 'insufficient' ? 0 : row.baseline;
    if (row.current !== 0 || shownBaseline !== 0) rows.push(row);
  }

  rows.sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

  const total = comparisonRow(
    null,
    TOTAL_NAMES[tab],
    buckets.total.get(period) ?? 0,
    baselineOf(buckets.total),
  );

  return { rows, total };
}

export function compare(input: {
  rows: Transaction[];
  categories: Category[];
  today: string;
  type: PeriodType;
  period: string;
  baseline: Baseline;
}): Comparison {
  const { rows, today, type, period, baseline } = input;
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const table = rateTableFrom(rows);

  const { span, current } = dashboardPeriods(rows, today, type);
  const inSpan = new Set(span);
  const pool = span.filter((candidate) => candidate !== current && candidate !== period);

  const previousCandidate = previousPeriod(period);
  const previous = inSpan.has(previousCandidate) ? previousCandidate : null;
  const baselinePeriods = baseline === 'previous' ? (previous === null ? [] : [previous]) : pool;
  const sufficient = pool.length >= MIN_POOL && baselinePeriods.length > 0;
  const onScreen = new Set(sufficient ? [period, ...baselinePeriods] : [period]);

  const buckets: Record<Tab, TabBuckets> = { spending: emptyBuckets(), income: emptyBuckets() };
  let missingRate = 0;

  for (const row of rows) {
    const rowPeriod = periodOf(row.effectiveDate, type);
    if (!inSpan.has(rowPeriod)) continue;

    const category = row.categoryId === null ? undefined : categories.get(row.categoryId);
    const tab = tabOf(row, category);
    if (tab === null) continue;

    const gel = gelAmount(row, table);
    if (gel === null) {
      if (onScreen.has(rowPeriod)) missingRate += 1;
      continue;
    }

    const amount = tab === 'spending' ? -gel : gel;
    const key = category === undefined ? null : category.id;
    const sums = buckets[tab].byCategory.get(key) ?? new Map<string, number>();
    buckets[tab].byCategory.set(key, sums);
    addTo(sums, rowPeriod, amount);
    addTo(buckets[tab].total, rowPeriod, amount);
  }

  const baselineOf = (sums: PeriodSums): number | 'insufficient' =>
    sufficient ? baselineValue(sums, baseline, baselinePeriods) : 'insufficient';

  return {
    spending: buildTable('spending', buckets.spending, categories, period, baselineOf),
    income: buildTable('income', buckets.income, categories, period, baselineOf),
    missingRate,
  };
}
