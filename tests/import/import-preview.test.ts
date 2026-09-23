import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../../src/App.svelte';
import { loadFixture } from '../helpers/loadFixture';
import expected from '../../fixtures/expected.json';

async function importStatement(name: string) {
  const screen = await render(App);
  await screen.getByLabelText('Statement file').upload(await loadFixture(name));
  return screen;
}

test('reports the detected header row and currency columns', async () => {
  const screen = await importStatement('statement-sample');

  await expect.element(screen.getByText('Header row: 5')).toBeVisible();
  await expect.element(screen.getByText('Currencies: GEL, USD, EUR, GBP')).toBeVisible();
});

test('counts parsed rows per Details kind', async () => {
  const screen = await importStatement('statement-sample');
  const counts = screen.getByRole('table', { name: 'Counts per kind' });

  for (const [kind, total] of [
    ['card', '5'],
    ['conversion', '2'],
    ['fee', '1'],
    ['service', '2'],
    ['transfer', '1'],
    ['other', '1'],
  ]) {
    await expect.element(counts.getByRole('row', { name: `${kind} ${total}` })).toBeVisible();
  }
});

test('the header row is found by scanning, not by a fixed index', async () => {
  const screen = await importStatement('header-at-top');

  await expect.element(screen.getByText('Header row: 1')).toBeVisible();
  await expect.element(screen.getByText('Currencies: GEL')).toBeVisible();
});

test('a blank row is skipped, not reported as a failure', async () => {
  const screen = await importStatement('header-at-top');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect.element(rows.getByRole('row', { name: /^4 2025-01-02 / })).toBeVisible();
  await expect.element(rows.getByRole('row')).toHaveLength(3);
  await expect.element(screen.getByRole('table', { name: 'Failed rows' })).not.toBeInTheDocument();
});

test('all three date cell forms yield the same date', async () => {
  const screen = await importStatement('date-forms');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  for (const rowNumber of [2, 3, 4, 5]) {
    await expect
      .element(rows.getByRole('row', { name: new RegExp(`^${rowNumber} 2025-03-14 2025-03-14 `) }))
      .toBeVisible();
  }
});

test('a Date cell is read as UTC, not in the local timezone', async () => {
  const screen = await importStatement('date-forms');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  // Row 5 holds 2025-03-14T21:00Z, which is 2025-03-15 01:00 in Asia/Tbilisi.
  await expect.element(rows.getByRole('row', { name: /^5 2025-03-14 / })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^5 2025-03-15 / })).not.toBeInTheDocument();
});

test('a card payment across a month boundary keeps both dates', async () => {
  const screen = await importStatement('statement-sample');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect
    .element(rows.getByRole('row', { name: /^8 2025-04-01 2025-03-31 card Courier Gamma / }))
    .toBeVisible();
});

test('amounts display exactly, from numeric and string cells alike', async () => {
  const screen = await importStatement('statement-sample');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect.element(rows.getByRole('row', { name: /^6 .* Shop Alpha -45\.50 GEL / })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^9 .* Meals Delta -30\.10 EUR / })).toBeVisible();
  await expect
    .element(rows.getByRole('row', { name: /^10 .* Currency conversion 273\.50 GEL / }))
    .toBeVisible();
});

test('per-kind fields are extracted from Details', async () => {
  const screen = await importStatement('statement-sample');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect
    .element(rows.getByRole('row', { name: /^7 .* Stream Beta -12\.00 USD 1004 1111 .*12\.00 USD/ }))
    .toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^9 .* 1003 5678 / })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^11 .* conversion .* 2\.735 / })).toBeVisible();
  await expect
    .element(rows.getByRole('row', { name: /^12 .* fee Bank Mu -1\.50 GEL 10000000001 / }))
    .toBeVisible();
  await expect
    .element(rows.getByRole('row', { name: /^13 .* service Phone Kappa -50\.88 GEL 10000000002 / }))
    .toBeVisible();
});

test('an unrecognised Details format is kept as other with its raw text', async () => {
  const screen = await importStatement('statement-sample');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect
    .element(
      rows.getByRole('row', {
        name: /^14 .* other .* Payment - Amount: GEL20\.00; Standing order execution/,
      }),
    )
    .toBeVisible();
});

test('a row with two currency amounts fails without aborting the import', async () => {
  const screen = await importStatement('statement-sample');
  const failed = screen.getByRole('table', { name: 'Failed rows' });

  await expect
    .element(failed.getByRole('row', { name: /^17 Amount in more than one currency \(GEL, USD\) / }))
    .toBeVisible();

  const parsed = screen.getByRole('table', { name: 'Parsed rows' });
  await expect.element(parsed.getByRole('row')).toHaveLength(13);
});

test('a row with no currency amount fails', async () => {
  const screen = await importStatement('statement-sample');
  const failed = screen.getByRole('table', { name: 'Failed rows' });

  await expect
    .element(failed.getByRole('row', { name: /^18 No amount in any currency column / }))
    .toBeVisible();
});

test('a row with an unreadable date fails, naming the offending cell', async () => {
  const screen = await importStatement('statement-sample');
  const failed = screen.getByRole('table', { name: 'Failed rows' });

  await expect
    .element(failed.getByRole('row', { name: /^19 Unreadable date "not a date" / }))
    .toBeVisible();

  await expect.element(failed.getByRole('row')).toHaveLength(4);
});

test('a missing Transactions sheet reports the sheets that were found', async () => {
  const screen = await importStatement('no-transactions-sheet');

  await expect
    .element(screen.getByText('No sheet named "Transactions". Sheets found: Summary, Data.'))
    .toBeVisible();
  await expect.element(screen.getByRole('table', { name: 'Parsed rows' })).not.toBeInTheDocument();
});

test('a non-currency column after Details aborts the import, naming the header', async () => {
  const screen = await importStatement('bad-currency-header');

  await expect
    .element(
      screen.getByText(
        'Unexpected column header after Details: "Balance". Expected a three-letter currency code.',
      ),
    )
    .toBeVisible();
});

test('a sheet without a Date and Details header reports no header row', async () => {
  const screen = await importStatement('no-header-row');

  await expect
    .element(screen.getByText('No header row found. Expected a row containing "Date" and "Details".'))
    .toBeVisible();
});

test('an amount with a third decimal warns and still imports, rounded half-up', async () => {
  const screen = await importStatement('statement-sample');

  await expect
    .element(
      screen.getByText('Row 16: amount has more than two decimals (-10.075), rounded to -10.08'),
    )
    .toBeVisible();

  const rows = screen.getByRole('table', { name: 'Parsed rows' });
  await expect.element(rows.getByRole('row', { name: /^16 .* Net Lambda -10\.08 GEL / })).toBeVisible();
});

test('warnings do not make rows fail', async () => {
  const screen = await importStatement('statement-sample');

  const warnings = screen.getByRole('list', { name: 'Warnings' });
  await expect.element(warnings.getByRole('listitem')).toHaveLength(1);

  const failed = screen.getByRole('table', { name: 'Failed rows' });
  await expect.element(failed.getByRole('row')).toHaveLength(4);
});

test('the whole preview matches the hand-authored oracle', async () => {
  const screen = await importStatement('statement-sample');
  const oracle = expected['statement-sample'];

  await expect.element(screen.getByText(`Header row: ${oracle.headerRowNumber}`)).toBeVisible();
  await expect
    .element(screen.getByText(`Currencies: ${oracle.currencies.join(', ')}`))
    .toBeVisible();

  const counts = screen.getByRole('table', { name: 'Counts per kind' });
  for (const [kind, total] of Object.entries(oracle.countsByKind)) {
    await expect.element(counts.getByRole('row', { name: `${kind} ${total}` })).toBeVisible();
  }

  const parsed = screen.getByRole('table', { name: 'Parsed rows' });
  const lastRow = oracle.rows[oracle.rows.length - 1]!;
  await expect
    .element(parsed.getByRole('row', { name: new RegExp(`^${lastRow[0]} `) }))
    .toBeVisible();

  const table = parsed.element() as HTMLTableElement;
  const header = [...(table.tHead?.rows[0]?.cells ?? [])].map((cell) => cell.textContent?.trim());
  expect(header).toEqual(oracle.columns);

  const body = [...(table.tBodies[0]?.rows ?? [])].map((row) =>
    [...row.cells].map((cell) => cell.textContent?.trim() ?? ''),
  );
  expect(body).toEqual(oracle.rows);
  expect(body.length).toBe(oracle.parsedCount);

  const failed = screen.getByRole('table', { name: 'Failed rows' });
  await expect.element(failed.getByRole('row')).toHaveLength(oracle.failedCount + 1);

  const warnings = screen.getByRole('list', { name: 'Warnings' });
  await expect.element(warnings.getByRole('listitem')).toHaveLength(oracle.warningCount);
});

test('blank header cells between currency columns are ignored', async () => {
  const screen = await importStatement('gapped-currency-columns');

  await expect.element(screen.getByText('Currencies: GEL, USD')).toBeVisible();
  await expect.element(screen.getByRole('table', { name: 'Failed rows' })).not.toBeInTheDocument();
});

test('a currency column after a gap still reads its own column', async () => {
  const screen = await importStatement('gapped-currency-columns');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect.element(rows.getByRole('row', { name: /^2 .* Gap GEL -3\.00 GEL / })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^3 .* Gap USD -4\.00 USD / })).toBeVisible();
});

test('a non-currency column header reports the whole header row', async () => {
  const screen = await importStatement('bad-currency-header');

  await expect
    .element(screen.getByText(/Header row cells: 1="Date", 2="Details", 3="GEL", 4="Balance"\./))
    .toBeVisible();
});

test('an outgoing transfer is its own kind, keyed on the beneficiary', async () => {
  const screen = await importStatement('statement-sample');
  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect
    .element(
      rows.getByRole('row', {
        name: /^20 .* transfer Test Beneficiary -1000\.00 GEL GE00XX0000000000000000GEL Example Bank EXAMPLE22 /,
      }),
    )
    .toBeVisible();
});
