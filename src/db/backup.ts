import { CURRENCY_CONVERSION } from '../categorize/seed';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from './backupFormat';
import { db, openDatabase } from './database';

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
    manualRates: rates?.key === 'manualRates' ? rates.value : {},
  };
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
