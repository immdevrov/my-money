import { CURRENCY_CONVERSION } from '../categorize/seed';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from './backupFormat';
import { db, openDatabase } from './database';
import { manualRatesOf } from './settings';

export async function exportBackup(): Promise<BackupFile> {
  await openDatabase();
  const [transactions, importBatches, categories, rules, rates] = await db.transaction(
    'r',
    db.transactions,
    db.importBatches,
    db.categories,
    db.rules,
    db.settings,
    () =>
      Promise.all([
        db.transactions.toArray(),
        db.importBatches.toArray(),
        db.categories.toArray(),
        db.rules.toArray(),
        db.settings.get('manualRates'),
      ]),
  );

  const exportedAt = new Date().toISOString();
  await db.settings.put({ key: 'lastBackupAt', value: exportedAt });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    transactions,
    importBatches,
    categories,
    rules,
    manualRates: manualRatesOf(rates),
  };
}

function clearAll(): Promise<unknown> {
  return Promise.all([
    db.transactions.clear(),
    db.importBatches.clear(),
    db.categories.clear(),
    db.rules.clear(),
    db.settings.clear(),
  ]);
}

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
      await clearAll();
      await db.categories.add(CURRENCY_CONVERSION);
    },
  );
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  await openDatabase();
  await db.transaction(
    'rw',
    db.transactions,
    db.importBatches,
    db.categories,
    db.rules,
    db.settings,
    async () => {
      await clearAll();
      await db.transactions.bulkAdd(backup.transactions);
      await db.importBatches.bulkAdd(backup.importBatches);
      await db.categories.bulkAdd(backup.categories);
      await db.rules.bulkAdd(backup.rules);
      if (!backup.categories.some((category) => category.id === CURRENCY_CONVERSION.id)) {
        await db.categories.add(CURRENCY_CONVERSION);
      }
      await db.settings.bulkPut([
        { key: 'manualRates', value: backup.manualRates },
        { key: 'lastBackupAt', value: backup.exportedAt },
      ]);
    },
  );
}
