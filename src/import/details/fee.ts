import { segmentAfter } from './classify';

const PAYMENT_CODE = /payment code\s*[-:]?\s*([^\s,;]+)/i;

export type FeeFields = { payee: string | null; paymentCode: string | null };

export function parseFee(body: string): FeeFields {
  const code = PAYMENT_CODE.exec(body);
  return {
    payee: segmentAfter(body, 'payment service,') ?? segmentAfter(body, 'Payment Fee,'),
    paymentCode: code?.[1] ?? null,
  };
}
