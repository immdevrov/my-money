const BENEFICIARY = /Beneficiary:\s*([^;]*)/;
const ACCOUNT = /Account:\s*([^;]*)/;
const BANK = /Bank:\s*([^;]*)/;

export type TransferFields = {
  beneficiary: string | null;
  account: string | null;
  bank: string | null;
};

function field(pattern: RegExp, body: string): string | null {
  const value = pattern.exec(body)?.[1]?.trim();
  return value === undefined || value === '' ? null : value;
}

export function parseTransfer(body: string): TransferFields {
  return {
    beneficiary: field(BENEFICIARY, body),
    account: field(ACCOUNT, body),
    bank: field(BANK, body),
  };
}
