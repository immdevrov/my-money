import type { DerivedFields, DetailsKind, RowFacts } from '../domain/types';
import { parseDetails, type ParsedDetails } from './details';

const COUNTERPARTY_MAX = 60;

function counterpartyFor(kind: DetailsKind, fields: ParsedDetails, details: string): string {
  const truncated = details.slice(0, COUNTERPARTY_MAX);
  if (kind === 'card') return fields.merchant ?? truncated;
  if (kind === 'fee' || kind === 'service') return fields.payee ?? truncated;
  if (kind === 'transfer') return fields.beneficiary ?? truncated;
  if (kind === 'conversion') return 'Currency conversion';
  return truncated;
}

export function deriveFields(row: Pick<RowFacts, 'postingDate' | 'details'>): DerivedFields {
  const fields = parseDetails(row.details);

  return {
    txDateTime: fields.txDateTime,
    effectiveDate: fields.txDateTime?.slice(0, 10) ?? row.postingDate,
    kind: fields.kind,
    counterparty: counterpartyFor(fields.kind, fields, row.details),
    merchant: fields.merchant,
    mcc: fields.mcc,
    cardLast4: fields.cardLast4,
    paymentCode: fields.paymentCode,
    conversionRateScaled: fields.conversionRateScaled,
    beneficiary: fields.beneficiary,
    account: fields.account,
    bank: fields.bank,
    originalAmountMinor: fields.originalAmountMinor,
    originalCurrency: fields.originalCurrency,
  };
}
