import type { DetailsKind } from '../../domain/types';
import { parseTxDateTime } from '../date';
import { parseCard } from './card';
import { classifyDetails, splitDetails } from './classify';
import { parseConversionRate } from './conversion';
import { parseFee } from './fee';
import { parseService } from './service';
import { parseTransfer } from './transfer';

export { classifyDetails } from './classify';

export type ParsedDetails = {
  kind: DetailsKind;
  merchant: string | null;
  mcc: string | null;
  cardLast4: string | null;
  txDateTime: string | null;
  originalAmountMinor: number | null;
  originalCurrency: string | null;
  conversionRateScaled: number | null;
  beneficiary: string | null;
  account: string | null;
  bank: string | null;
  payee: string | null;
  paymentCode: string | null;
};

const EMPTY = {
  merchant: null,
  mcc: null,
  cardLast4: null,
  txDateTime: null,
  originalAmountMinor: null,
  originalCurrency: null,
  conversionRateScaled: null,
  beneficiary: null,
  account: null,
  bank: null,
  payee: null,
  paymentCode: null,
} as const;

export function parseDetails(details: string): ParsedDetails {
  const { body } = splitDetails(details);
  const kind = classifyDetails(details);
  const base = { kind, ...EMPTY };

  if (kind === 'card') {
    return { ...base, ...parseCard(body), txDateTime: parseTxDateTime(body) };
  }

  if (kind === 'transfer') {
    return { ...base, ...parseTransfer(body) };
  }

  if (kind === 'conversion') {
    return { ...base, conversionRateScaled: parseConversionRate(body) };
  }

  if (kind === 'fee') {
    return { ...base, ...parseFee(body) };
  }

  if (kind === 'service') {
    return { ...base, ...parseService(body) };
  }

  return base;
}
