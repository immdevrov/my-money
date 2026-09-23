import { segmentAfter } from './classify';

const PAYMENT_CODE = /payment code\s*[-:]?\s*([^\s,;]+)/i;

export type ServiceFields = { payee: string | null; paymentCode: string | null };

export function parseService(body: string): ServiceFields {
  const code = PAYMENT_CODE.exec(body);
  return {
    payee: segmentAfter(body, 'payment service,'),
    paymentCode: code?.[1] ?? null,
  };
}
