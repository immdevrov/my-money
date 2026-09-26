import { db, openDatabase, type SettingsRow } from './database';

const MANUAL_RATES = 'manualRates';
const LAST_BACKUP_AT = 'lastBackupAt';

export function manualRatesOf(row: SettingsRow | undefined): Record<string, number> {
  return row?.key === MANUAL_RATES ? row.value : {};
}

export async function getManualRates(): Promise<Record<string, number>> {
  await openDatabase();
  return manualRatesOf(await db.settings.get(MANUAL_RATES));
}

export async function getLastBackupAt(): Promise<string | null> {
  await openDatabase();
  const row = await db.settings.get(LAST_BACKUP_AT);
  return row?.key === LAST_BACKUP_AT ? row.value : null;
}

export async function setManualRate(currency: string, rateScaled: number | null): Promise<void> {
  await openDatabase();
  await db.transaction('rw', db.settings, async () => {
    const rates = { ...manualRatesOf(await db.settings.get(MANUAL_RATES)) };
    if (rateScaled === null) delete rates[currency];
    else rates[currency] = rateScaled;
    await db.settings.put({ key: MANUAL_RATES, value: rates });
  });
}
