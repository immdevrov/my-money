import { db, openDatabase } from './database';

const MANUAL_RATES = 'manualRates';

export async function getManualRates(): Promise<Record<string, number>> {
  await openDatabase();
  const row = await db.settings.get(MANUAL_RATES);
  return row?.key === MANUAL_RATES ? row.value : {};
}

export async function setManualRate(currency: string, rateScaled: number | null): Promise<void> {
  await openDatabase();
  await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get(MANUAL_RATES);
    const rates = { ...(row?.key === MANUAL_RATES ? row.value : {}) };
    if (rateScaled === null) delete rates[currency];
    else rates[currency] = rateScaled;
    await db.settings.put({ key: MANUAL_RATES, value: rates });
  });
}
