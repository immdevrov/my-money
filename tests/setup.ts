import { afterEach, beforeEach, vi } from 'vitest';
import { db } from '../src/db/database';
import { setColorScheme } from './helpers/setColorScheme';

const DATABASE_NAME = 'budget-my';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Blocked is not done: Dexie closes on versionchange, then onsuccess fires.
  });
}

let captured: string[] = [];
let original: typeof console.error = console.error;

beforeEach(async () => {
  vi.useRealTimers();
  await setColorScheme('light');
  location.hash = '';
  localStorage.clear();
  db.close();
  await deleteDatabase(DATABASE_NAME);

  captured = [];
  original = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map((arg) => String(arg)).join(' '));
    original(...args);
  };
});

afterEach(() => {
  console.error = original;
  if (captured.length > 0) {
    const messages = captured.join('\n');
    captured = [];
    throw new Error(`console.error was called during this test:\n${messages}`);
  }
});
