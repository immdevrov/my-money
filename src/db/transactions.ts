import type { StoredTransaction, Transaction } from '../domain/types';
import { deriveFields } from '../import/derive';
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
  const stored = await db.transactions.toArray();
  return stored.map((row) => ({ ...row, ...deriveFields(row) }));
}
