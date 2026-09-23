export type DetailsKind = 'card' | 'conversion' | 'service' | 'fee' | 'transfer' | 'other';

export const DETAILS_KINDS: readonly DetailsKind[] = [
  'card',
  'conversion',
  'service',
  'fee',
  'transfer',
  'other',
];

export type DerivedFields = {
  txDateTime: string | null;
  effectiveDate: string;
  kind: DetailsKind;
  counterparty: string;
  merchant: string | null;
  mcc: string | null;
  cardLast4: string | null;
  paymentCode: string | null;
  conversionRateScaled: number | null;
  beneficiary: string | null;
  account: string | null;
  bank: string | null;
  originalAmountMinor: number | null;
  originalCurrency: string | null;
};

export const DERIVED_KEYS: readonly (keyof DerivedFields)[] = [
  'txDateTime',
  'effectiveDate',
  'kind',
  'counterparty',
  'merchant',
  'mcc',
  'cardLast4',
  'paymentCode',
  'conversionRateScaled',
  'beneficiary',
  'account',
  'bank',
  'originalAmountMinor',
  'originalCurrency',
];

export type RowFacts = {
  postingDate: string;
  currency: string;
  amountMinor: number;
  details: string;
};

export type ParsedRow = { rowNumber: number } & RowFacts & DerivedFields;

export type RowCell = { column: number; value: string; present: boolean };

export type FailureReason =
  | { code: 'no-currency-value'; cells: RowCell[] }
  | { code: 'multiple-currency-values'; currencies: string[] }
  | { code: 'unparseable-date'; cell: string }
  | { code: 'unparseable-amount'; cell: string }
  | { code: 'missing-details' };

export type FailedRow = {
  rowNumber: number;
  details: string;
  reason: FailureReason;
};

export type RowWarning = {
  rowNumber: number;
  code: 'unexpected-precision';
  cell: string;
  rounded: string;
};

export type ImportPreview = {
  headerRowNumber: number;
  headerCells: string[];
  currencyColumns: { code: string; column: number }[];
  currencies: string[];
  rows: ParsedRow[];
  failed: FailedRow[];
  warnings: RowWarning[];
  countsByKind: Record<DetailsKind, number>;
};

export type WorkbookError =
  | { code: 'sheet-not-found'; sheetName: string; sheetsFound: string[] }
  | { code: 'header-row-not-found' }
  | { code: 'invalid-currency-header'; header: string; headerCells: string[] };

export type ReadResult =
  | { ok: true; rows: unknown[][] }
  | { ok: false; error: WorkbookError };

export type PreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: WorkbookError };

export type CategorySource = 'system' | 'rule' | 'manual';

export type CategoryType = 'expense' | 'income' | 'transfer' | 'ignore';

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
};

export type RuleField = 'counterparty' | 'mcc' | 'details' | 'kind';
export type RuleMatch = 'equals' | 'contains' | 'regex';

export type Rule = {
  id: string;
  field: RuleField;
  match: RuleMatch;
  pattern: string;
  categoryId: string;
  priority: number;
};

export type StoredTransaction = RowFacts & {
  id: string;
  importBatchId: string;
  manualCategoryId: string | null;
};

export type Transaction = StoredTransaction & DerivedFields;

export type BatchCounts = { imported: number; duplicate: number; failed: number };

export type ImportBatch = {
  id: string;
  fileName: string;
  importedAt: string;
  counts: BatchCounts;
};
