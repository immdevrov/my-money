import { minorFromDecimal } from '../amount';

const MERCHANT = /Merchant:\s*([^,]*)/;
const MCC = /MCC:?\s*(\d{3,4})/;
const CARD_LAST4 = /Card(?:\s*(?:No\.?|Number|number))?\s*[:.]?\s*\*{0,6}(\d{4})\b/i;
const ORIGINAL = /Payment transaction amount and currency:\s*(-?[\d,.]+)\s*([A-Z]{3})/;

export type CardFields = {
  merchant: string | null;
  mcc: string | null;
  cardLast4: string | null;
  originalAmountMinor: number | null;
  originalCurrency: string | null;
};

export function parseCard(body: string): CardFields {
  const merchant = MERCHANT.exec(body)?.[1]?.trim();
  const original = ORIGINAL.exec(body);
  const originalAmount = original?.[1];
  const originalCurrency = original?.[2];

  return {
    merchant: merchant === undefined || merchant === '' ? null : merchant,
    mcc: MCC.exec(body)?.[1] ?? null,
    cardLast4: CARD_LAST4.exec(body)?.[1] ?? null,
    originalAmountMinor:
      originalAmount === undefined
        ? null
        : minorFromDecimal(originalAmount.replace(/,/g, '')).minor,
    originalCurrency: originalCurrency ?? null,
  };
}
