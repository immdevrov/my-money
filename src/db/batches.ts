import type { BatchCounts, ImportBatch } from '../domain/types';
import { db, openDatabase } from './database';

export async function createBatch(fileName: string, counts: BatchCounts): Promise<string> {
  const batch: ImportBatch = {
    id: crypto.randomUUID(),
    fileName,
    importedAt: new Date().toISOString(),
    counts,
  };

  await openDatabase();
  await db.importBatches.put(batch);
  return batch.id;
}

export async function listBatches(): Promise<ImportBatch[]> {
  await openDatabase();
  return await db.importBatches.toArray();
}
