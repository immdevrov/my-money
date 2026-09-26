import { CURRENCY_CONVERSION } from '../categorize/seed';
import { db, openDatabase } from './database';

export async function wipeAll(): Promise<void> {
  await openDatabase();
  await db.transaction(
    'rw',
    db.transactions,
    db.importBatches,
    db.categories,
    db.rules,
    db.settings,
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.importBatches.clear(),
        db.categories.clear(),
        db.rules.clear(),
        db.settings.clear(),
      ]);
      await db.categories.add(CURRENCY_CONVERSION);
    },
  );
}
