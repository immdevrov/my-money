import type { DetailsKind } from '../../domain/types';

export type DetailsParts = { head: string; body: string };

export function splitDetails(details: string): DetailsParts {
  const semicolon = details.indexOf(';');
  if (semicolon === -1) return { head: details.trim(), body: '' };
  return { head: details.slice(0, semicolon).trim(), body: details.slice(semicolon + 1).trim() };
}

export function classifyDetails(details: string): DetailsKind {
  const { body } = splitDetails(details);
  if (body.includes('Merchant:')) return 'card';
  if (body.includes('Beneficiary:')) return 'transfer';
  if (body.startsWith('Foreign Exchange') || body.startsWith('Automatic conversion')) {
    return 'conversion';
  }
  if (body.startsWith('Payment Fee')) return 'fee';
  if (body.startsWith('Payment,') && body.includes('payment service')) return 'service';
  return 'other';
}

export function segmentAfter(body: string, marker: string): string | null {
  const at = body.indexOf(marker);
  if (at === -1) return null;
  const rest = body.slice(at + marker.length);
  const comma = rest.indexOf(',');
  const segment = (comma === -1 ? rest : rest.slice(0, comma)).trim();
  return segment === '' ? null : segment;
}
