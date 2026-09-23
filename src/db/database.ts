import Dexie, { type Table } from 'dexie';
import { CURRENCY_CONVERSION } from '../categorize/seed';
import { DERIVED_KEYS, type Category, type ImportBatch, type Rule, type StoredTransaction } from '../domain/types';

const DATABASE_NAME = 'budget-my';

export class BudgetDatabase extends Dexie {
  transactions!: Table<StoredTransaction, string>;
  importBatches!: Table<ImportBatch, string>;
  categories!: Table<Category, string>;
  rules!: Table<Rule, string>;

  constructor() {
    super(DATABASE_NAME);

    this.version(1).stores({
      transactions:
        'id, effectiveDate, postingDate, kind, counterparty, currency, importBatchId, categoryId',
      importBatches: 'id, importedAt',
    });

    this.version(2)
      .stores({
        transactions: 'id, postingDate, currency, importBatchId, categoryId',
        importBatches: 'id, importedAt',
      })
      .upgrade((transaction) =>
        transaction
          .table('transactions')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            for (const key of [...DERIVED_KEYS, 'conversionPairId', 'rowNumber']) delete row[key];
          }),
      );

    this.version(3)
      .stores({
        transactions: 'id, postingDate, currency, importBatchId, manualCategoryId',
        importBatches: 'id, importedAt',
        categories: 'id, name',
        rules: 'id, priority, categoryId',
      })
      .upgrade((transaction) =>
        transaction
          .table('transactions')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            row.manualCategoryId = row.categorySource === 'manual' ? row.categoryId : null;
            delete row.categoryId;
            delete row.categorySource;
          })
          .then(() => transaction.table('categories').add(CURRENCY_CONVERSION)),
      );
  }
}

export const db = new BudgetDatabase();

db.on('populate', (transaction) => {
  transaction.table('categories').add(CURRENCY_CONVERSION);
});

// A query in flight when the connection closes belongs to a surface nobody is looking at.
export function isDatabaseClosed(error: unknown): boolean {
  return error instanceof Error && error.name === 'DatabaseClosedError';
}

export async function openDatabase(): Promise<void> {
  if (db.isOpen()) return;
  try {
    await db.open();
  } catch (error) {
    if (isDatabaseClosed(error)) return;
    throw error;
  }
}

export function closeDatabase(): void {
  db.close();
}
