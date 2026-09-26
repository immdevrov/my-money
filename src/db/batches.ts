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

export type BatchSummary = { batch: ImportBatch; transactions: number };

export async function listBatchesWithCounts(): Promise<BatchSummary[]> {
  await openDatabase();
  const batches = await db.importBatches.orderBy('importedAt').reverse().toArray();
  return await Promise.all(
    batches.map(async (batch) => ({
      batch,
      transactions: await db.transactions.where('importBatchId').equals(batch.id).count(),
    })),
  );
}

export async function deleteBatch(id: string): Promise<void> {
  await openDatabase();
  await db.transaction('rw', db.importBatches, db.transactions, async () => {
    await db.importBatches.delete(id);
    await db.transactions.where('importBatchId').equals(id).delete();
  });
}
