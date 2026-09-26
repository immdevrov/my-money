import type { Category, ImportBatch, Rule, StoredTransaction } from '../domain/types';

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
