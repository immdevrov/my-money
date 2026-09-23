import { CURRENCY_CONVERSION_ID } from '../categorize/seed';
import type { Category } from '../domain/types';
import { db, openDatabase } from './database';

export async function listCategories(): Promise<Category[]> {
  await openDatabase();
  const categories = await db.categories.toArray();
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveCategory(category: Category): Promise<void> {
  await openDatabase();
  await db.categories.put(category);
}

export async function deletionImpact(id: string): Promise<{ rules: number; manual: number }> {
  await openDatabase();
  const [rules, manual] = await Promise.all([
    db.rules.where('categoryId').equals(id).count(),
    db.transactions.where('manualCategoryId').equals(id).count(),
  ]);
  return { rules, manual };
}

export async function deleteCategory(id: string): Promise<void> {
  if (id === CURRENCY_CONVERSION_ID) {
    throw new Error('Currency conversion cannot be deleted.');
  }

  await openDatabase();
  await db.transaction('rw', db.categories, db.rules, db.transactions, async () => {
    await db.categories.delete(id);
    await db.rules.where('categoryId').equals(id).delete();
    await db.transactions.where('manualCategoryId').equals(id).modify({ manualCategoryId: null });
  });
}
