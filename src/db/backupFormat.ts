import {
  CATEGORY_TYPES,
  RULE_FIELDS,
  RULE_MATCHES,
  type Category,
  type ImportBatch,
  type Rule,
  type StoredTransaction,
} from '../domain/types';

export const BACKUP_FORMAT = 'budget-my-backup';
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  transactions: StoredTransaction[];
  importBatches: ImportBatch[];
  categories: Category[];
  rules: Rule[];
  manualRates: Record<string, number>;
};

export type BackupTable = 'transactions' | 'importBatches' | 'categories' | 'rules' | 'manualRates';

export type BackupError =
  | { code: 'not-json' }
  | { code: 'not-a-backup' }
  | { code: 'newer-version'; version: number }
  | { code: 'invalid-exported-at' }
  | { code: 'missing-table'; table: BackupTable }
  | { code: 'invalid-entry'; table: BackupTable; entry: number };

type Failure = { ok: false; error: BackupError };
type Parsed<T> = { ok: true; value: T } | Failure;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

function failure(error: BackupError): Failure {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.some((candidate) => candidate === value);
}

function readTransaction(value: unknown): StoredTransaction | null {
  if (!isObject(value)) return null;
  const { id, postingDate, currency, amountMinor, details, importBatchId, manualCategoryId } = value;
  if (
    !isString(id) ||
    !isString(postingDate) ||
    !ISO_DATE.test(postingDate) ||
    !isString(currency) ||
    !CURRENCY_CODE.test(currency) ||
    !isInteger(amountMinor) ||
    !isString(details) ||
    !isString(importBatchId) ||
    !(manualCategoryId === null || isString(manualCategoryId))
  ) {
    return null;
  }
  return { id, postingDate, currency, amountMinor, details, importBatchId, manualCategoryId };
}

function readImportBatch(value: unknown): ImportBatch | null {
  if (!isObject(value)) return null;
  const { id, fileName, importedAt, counts } = value;
  if (!isString(id) || !isString(fileName) || !isString(importedAt) || !isObject(counts)) {
    return null;
  }
  const { imported, duplicate, failed } = counts;
  if (!isInteger(imported) || !isInteger(duplicate) || !isInteger(failed)) return null;
  return { id, fileName, importedAt, counts: { imported, duplicate, failed } };
}

function readCategory(value: unknown): Category | null {
  if (!isObject(value)) return null;
  const { id, name, type, color } = value;
  if (!isString(id) || !isString(name) || !isString(color) || !isOneOf(CATEGORY_TYPES, type)) {
    return null;
  }
  return { id, name, type, color };
}

function readRule(value: unknown): Rule | null {
  if (!isObject(value)) return null;
  const { id, field, match, pattern, categoryId, priority } = value;
  if (
    !isString(id) ||
    !isString(pattern) ||
    !isString(categoryId) ||
    !isOneOf(RULE_FIELDS, field) ||
    !isOneOf(RULE_MATCHES, match) ||
    !isInteger(priority)
  ) {
    return null;
  }
  return { id, field, match, pattern, categoryId, priority };
}

function readList<T>(
  root: Record<string, unknown>,
  table: BackupTable,
  read: (value: unknown) => T | null,
): Parsed<T[]> {
  const list = root[table];
  if (!Array.isArray(list)) return failure({ code: 'missing-table', table });
  const rows: T[] = [];
  for (const [index, entry] of list.entries()) {
    const row = read(entry);
    if (row === null) return failure({ code: 'invalid-entry', table, entry: index + 1 });
    rows.push(row);
  }
  return { ok: true, value: rows };
}

function readManualRates(root: Record<string, unknown>): Parsed<Record<string, number>> {
  const table = 'manualRates';
  const rates = root[table];
  if (!isObject(rates)) return failure({ code: 'missing-table', table });
  const result: Record<string, number> = {};
  for (const [index, [currency, rate]] of Object.entries(rates).entries()) {
    if (!CURRENCY_CODE.test(currency) || !isInteger(rate) || rate <= 0) {
      return failure({ code: 'invalid-entry', table, entry: index + 1 });
    }
    result[currency] = rate;
  }
  return { ok: true, value: result };
}

export function parseBackup(
  text: string,
): { ok: true; backup: BackupFile } | { ok: false; error: BackupError } {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return failure({ code: 'not-json' });
  }

  if (!isObject(root) || root.format !== BACKUP_FORMAT) return failure({ code: 'not-a-backup' });
  if (typeof root.version !== 'number') return failure({ code: 'not-a-backup' });
  if (root.version > BACKUP_VERSION) return failure({ code: 'newer-version', version: root.version });
  if (!isString(root.exportedAt)) return failure({ code: 'invalid-exported-at' });

  const transactions = readList(root, 'transactions', readTransaction);
  if (!transactions.ok) return transactions;
  const importBatches = readList(root, 'importBatches', readImportBatch);
  if (!importBatches.ok) return importBatches;
  const categories = readList(root, 'categories', readCategory);
  if (!categories.ok) return categories;
  const rules = readList(root, 'rules', readRule);
  if (!rules.ok) return rules;
  const manualRates = readManualRates(root);
  if (!manualRates.ok) return manualRates;

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: root.exportedAt,
      transactions: transactions.value,
      importBatches: importBatches.value,
      categories: categories.value,
      rules: rules.value,
      manualRates: manualRates.value,
    },
  };
}

const DAY_MS = 86_400_000;

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function localDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function backupFileName(exportedAt: string): string {
  return `${BACKUP_FORMAT}-${localDateText(new Date(exportedAt))}.json`;
}

export function calendarDaysSince(iso: string, now: Date): number {
  return localDayNumber(now) - localDayNumber(new Date(iso));
}
