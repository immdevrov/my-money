const REQUESTED_KEY = 'budget-my:storage-persist-requested';

export async function requestPersistentStorage(): Promise<void> {
  try {
    if (localStorage.getItem(REQUESTED_KEY) !== null) return;
    localStorage.setItem(REQUESTED_KEY, new Date().toISOString());
    await navigator.storage?.persist?.();
  } catch {
    // Storage API unavailable or blocked; durability is best-effort.
  }
}
