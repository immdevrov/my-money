import { assignCategory } from '../categorize/assign';
import type { StoredTransaction, Transaction } from '../domain/types';
import { deriveFields } from '../import/derive';
import { pairConversions } from '../pairing/pairConversions';
import { db, openDatabase } from './database';

export async function existingIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  await openDatabase();
  const found = await db.transactions.where('id').anyOf(ids).primaryKeys();
  return new Set(found);
}

export async function putMany(rows: StoredTransaction[]): Promise<void> {
  if (rows.length === 0) return;
  await openDatabase();
  await db.transactions.bulkPut(rows);
}

export async function listAll(): Promise<Transaction[]> {
  await openDatabase();
  const [stored, rules] = await Promise.all([db.transactions.toArray(), db.rules.toArray()]);

  const derived = stored.map((row) => ({ ...row, ...deriveFields(row) }));
  const { pairs } = pairConversions(derived.filter((row) => row.kind === 'conversion'));
  const pairedIds = new Set(pairs.flatMap((pair) => [pair.gelId, pair.foreignId]));

  return derived.map((row) => {
    const paired = pairedIds.has(row.id);
    return { ...row, paired, ...assignCategory({ ...row, paired }, rules) };
  });
}

export async function setManualCategory(id: string, categoryId: string): Promise<void> {
  await openDatabase();
  await db.transactions.update(id, { manualCategoryId: categoryId });
}

export async function clearManualCategory(id: string): Promise<void> {
  await openDatabase();
  await db.transactions.update(id, { manualCategoryId: null });
}
