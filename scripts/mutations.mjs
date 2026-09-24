const R = String.raw;

const HEADER = 'src/import/headerRow.ts';
const CLASSIFY = 'src/import/details/classify.ts';
const DATE = 'src/import/date.ts';
const AMOUNT = 'src/import/amount.ts';
const NORM = 'src/import/normalizeRow.ts';
const CARD = 'src/import/details/card.ts';
const FEE = 'src/import/details/fee.ts';
const SERVICE = 'src/import/details/service.ts';
const CONV = 'src/import/details/conversion.ts';
const TRANSFER = 'src/import/details/transfer.ts';
const VALIDATE = 'src/import/validate.ts';
const BUILD = 'src/import/buildPreview.ts';
const READ = 'src/import/readWorkbook.ts';
const IDENTITY = 'src/import/identity.ts';
const TXREPO = 'src/db/transactions.ts';
const DERIVE = 'src/import/derive.ts';
const IMPORTVIEW = 'src/ui/views/ImportView.svelte';
const TXVIEW = 'src/ui/views/TransactionsView.svelte';
const PAIR = 'src/pairing/pairConversions.ts';
const RATES = 'src/pairing/rates.ts';
const CONVERT = 'src/aggregate/convert.ts';
const GEL = 'src/aggregate/gel.ts';
const CATVIEW = 'src/ui/views/CategoriesView.svelte';
const CATFORM = 'src/ui/components/CategoryForm.svelte';
const SEED = 'src/categorize/seed.ts';
const DATABASE = 'src/db/database.ts';
const CATDB = 'src/db/categories.ts';
const ASSIGN = 'src/categorize/assign.ts';
const ORDER = 'src/categorize/order.ts';
const COUNTS = 'src/categorize/counts.ts';
const RULEDB = 'src/db/rules.ts';
const RULEVIEW = 'src/ui/views/RulesView.svelte';
const RULEVALIDATE = 'src/categorize/validate.ts';
const PERIOD = 'src/aggregate/period.ts';

const headerFilter = R`      .filter((cell) => cell.columnIndex > detailsIndex && cell.text !== '');`;

export const MUTATIONS = [
  ['M1  header scan starts at row 0', HEADER,
    'for (let index = 0; index < rows.length; index += 1) {',
    'for (let index = 4; index < rows.length; index += 1) {'],
  ['M2  currency header guard', HEADER,
    R`const CURRENCY_CODE = /^[A-Z]{3}$/;`, R`const CURRENCY_CODE = /^.*$/;`],
  ['M3  blank header cells ignored', HEADER, headerFilter,
    R`      .filter((cell) => cell.columnIndex > detailsIndex);`],
  ['M23 currency columns follow Details', HEADER, headerFilter,
    R`      .filter((cell) => cell.columnIndex > dateIndex && cell.text !== '');`],
  ['M25 currency keeps absolute column', HEADER,
    'columnIndex: cell.columnIndex })),', 'columnIndex: cell.columnIndex + 1 })),'],
  ['M4  classify: card branch', CLASSIFY,
    R`if (body.includes('Merchant:')) return 'card';`, R`if (body.includes('Merchant::')) return 'card';`],
  ['M29 classify: transfer branch', CLASSIFY,
    R`if (body.includes('Beneficiary:')) return 'transfer';`,
    R`if (body.includes('Beneficiary::')) return 'transfer';`],
  ['M5a classify: conversion, Foreign Exchange', CLASSIFY,
    R`body.startsWith('Foreign Exchange')`, R`body.startsWith('foreign exchange')`],
  ['M5b classify: conversion, Automatic conversion', CLASSIFY,
    R`body.startsWith('Automatic conversion')`, R`body.startsWith('automatic conversion')`],
  ['M6  classify: fee branch', CLASSIFY,
    R`if (body.startsWith('Payment Fee')) return 'fee';`, R`if (body.startsWith('Payment Fees')) return 'fee';`],
  ['M7  classify: service marker', CLASSIFY,
    R`body.includes('payment service')`, R`body.includes('payment services')`],
  ['M8  Excel serial epoch', DATE,
    'const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);', 'const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 31);'],
  ['M9  Date cell read as UTC', DATE,
    R`  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');`,
    R`  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');`],
  ['M10 effectiveDate prefers txDateTime', DERIVE,
    'effectiveDate: fields.txDateTime?.slice(0, 10) ?? row.postingDate,',
    'effectiveDate: row.postingDate,'],
  ['M11 half-up rounding', AMOUNT,
    R`if (Number(fraction[decimals] ?? '0') >= 5) value += 1;`,
    R`if (Number(fraction[decimals] ?? '0') >= 50) value += 1;`],
  ['M12 extra-precision threshold', AMOUNT,
    'extraPrecision: fraction.length > decimals', 'extraPrecision: fraction.length > decimals + 1'],
  ['M16 numeric cell via String()', AMOUNT, 'raw = String(cell);', 'raw = cell.toFixed(2);'],
  ['M13 exactly-one-currency boundary', NORM,
    'if (present.length > 1 || only === undefined) {', 'if (present.length > 2 || only === undefined) {'],
  ['M17 counterparty truncation length', DERIVE, 'const COUNTERPARTY_MAX = 60;', 'const COUNTERPARTY_MAX = 20;'],
  ['M31 transfer counterparty is beneficiary', DERIVE,
    R`  if (kind === 'transfer') return fields.beneficiary ?? truncated;`,
    R`  if (kind === 'transfer') return truncated;`],
  ['M14 merchant before first comma', CARD,
    R`const MERCHANT = /Merchant:\s*([^,]*)/;`, R`const MERCHANT = /Merchant:\s*(.*)/;`],
  ['M19 card last4 pattern', CARD,
    R`const CARD_LAST4 = /Card(?:\s*(?:No\.?|Number|number))?\s*[:.]?\s*\*{0,6}(\d{4})\b/i;`,
    R`const CARD_LAST4 = /(\d{4})/;`],
  ['M20 conversion rate keeps decimals', CONV,
    R`const RATE = /rate:?\s*(\d+(?:\.\d+)?)/i;`, R`const RATE = /rate:?\s*(\d+)/i;`],
  ['M21 service payee segment', SERVICE,
    R`payee: segmentAfter(body, 'payment service,'),`, R`payee: segmentAfter(body, 'Payment,'),`],
  ['M28a payment code separator (service)', SERVICE,
    R`const PAYMENT_CODE = /payment code\s*[-:]?\s*([^\s,;]+)/i;`,
    R`const PAYMENT_CODE = /payment code\s*:?\s*([^\s,;]+)/i;`],
  ['M22 fee payee segment', FEE,
    R`payee: segmentAfter(body, 'payment service,') ?? segmentAfter(body, 'Payment Fee,'),`,
    R`payee: segmentAfter(body, 'Payment Fee,'),`],
  ['M28b payment code separator (fee)', FEE,
    R`const PAYMENT_CODE = /payment code\s*[-:]?\s*([^\s,;]+)/i;`,
    R`const PAYMENT_CODE = /payment code\s*:?\s*([^\s,;]+)/i;`],
  ['M30 beneficiary stops at semicolon', TRANSFER,
    R`const BENEFICIARY = /Beneficiary:\s*([^;]*)/;`, R`const BENEFICIARY = /Beneficiary:\s*(.*)/;`],
  ['M32 precision warning is emitted', VALIDATE,
    'if (extraPrecisionCell === null) return [];', 'if (extraPrecisionCell !== undefined) return [];'],
  ['M18 sheet selected by name', READ,
    'const match = sheets.find((sheet) => sheet.sheet === sheetName);', 'const match = sheets[0];'],
  ['M24 blank-row skip', BUILD,
    'if (row.every(isBlank)) continue;', 'if (row.every(isBlank) && row.length > 1000) continue;'],

  ['M33 occurrence index increments', IDENTITY,
    'seen.set(tuple, occurrence + 1);', 'seen.set(tuple, occurrence);'],
  ['M34 id carries the occurrence', IDENTITY,
    'return { ...row, id: rowId(row, occurrence) };', 'return { ...row, id: rowId(row, 0) };'],
  ['M35 id includes the amount', IDENTITY,
    'return JSON.stringify([row.postingDate, row.currency, row.amountMinor, row.details, occurrence]);',
    'return JSON.stringify([row.postingDate, row.currency, row.details, occurrence]);'],
  ['M36 known ids are the duplicates', IDENTITY,
    'if (existing.has(row.id)) duplicates.push(row);', 'if (!existing.has(row.id)) duplicates.push(row);'],
  ['M37 existing ids are reported', TXREPO,
    'return new Set(found);', 'return new Set(found.slice(0, 0));'],
  ['M38 putMany persists', TXREPO,
    'if (rows.length === 0) return;', 'if (rows.length >= 0) return;'],
  ['M39 listAll reads the table', TXREPO,
    "const [stored, rules] = await Promise.all([db.transactions.toArray(), db.rules.toArray()]);",
    "const [stored, rules] = await Promise.all([Promise.resolve([] as StoredTransaction[]), db.rules.toArray()]);"],
  ['M68 rows derive from their own details', TXREPO,
    'const derived = stored.map((row) => ({ ...row, ...deriveFields(row) }));',
    "const derived = stored.map((row) => ({ ...row, ...deriveFields({ ...row, details: '' }) }));"],
  ['M40 confirm persists new rows', IMPORTVIEW,
    'if (newRows.length === 0) return;', 'if (newRows.length > 0) return;'],
  ['M41 confirmed rows become duplicates', IMPORTVIEW,
    'duplicates = [...duplicates, ...newRows];', 'duplicates = [...duplicates];'],
  ['M42 sort direction follows ascending', TXVIEW,
    'const direction = ascending ? 1 : -1;', 'const direction = ascending ? -1 : 1;'],
  ['M43 default order is newest first', TXVIEW,
    'let ascending = $state(false);', 'let ascending = $state(true);'],
  ['M44 second click reverses', TXVIEW,
    'if (sortKey === key) ascending = !ascending;', 'if (sortKey === key) ascending = true;'],
  ['M45 chosen column becomes the sort key', TXVIEW,
    'sortKey = key;', "sortKey = 'effectiveDate';"],
  ['M46 aria-sort marks the chosen column', TXVIEW,
    "if (sortKey !== key) return 'none';", "if (sortKey === key) return 'none';"],
  ['M47 empty state threshold', TXVIEW,
    '{#if sorted.length === 0}', '{#if sorted.length <= 1}'],
  ['M48 amount carries its currency', TXVIEW,
    'return `${formatMinor(row.amountMinor)} ${row.currency}`;',
    'return `${formatMinor(row.amountMinor)}`;'],
  ['M49 counterparty column shows counterparty', TXVIEW,
    '<td>{row.counterparty}</td>', '<td>{row.details}</td>'],

  ['M50 rate scale matches its decimals', CONV,
    'const RATE_DECIMALS = 6;', 'const RATE_DECIMALS = 4;'],
  ['M51 rate trims every trailing zero', CONV,
    "replace(/0+$/, '')", "replace(/0$/, '')"],
  ['M52 rateless rows never pair', PAIR,
    'if (row.conversionRateScaled === null) {', 'if (row.conversionRateScaled !== null) {'],
  ['M53 pair key includes the rate', PAIR,
    'return `${row.postingDate}|${row.conversionRateScaled}`;', 'return `${row.postingDate}`;'],
  ['M54 pair requires opposite signs', PAIR,
    '=== -Math.sign(gel.amountMinor)', '=== Math.sign(gel.amountMinor)'],
  ['M55 leftover foreign rows are unpaired', PAIR,
    'for (const row of available) unpaired.push(row.id);',
    'for (const row of available.slice(0, 0)) unpaired.push(row.id);'],
  ['M56 base side of a pair is GEL', PAIR,
    "const BASE_CURRENCY = 'GEL';", "const BASE_CURRENCY = 'USD';"],
  ['M57 rate applies on or before the date', RATES,
    'if (rate.date <= date) {', 'if (rate.date < date) {'],
  ['M58 rate lookup filters by currency', RATES,
    'if (rate.currency !== currency) continue;', 'if (rate.currency === currency) continue;'],
  ['M59 rate table is oldest first', RATES,
    ': a.date < b.date ? -1 : 1,', ': a.date < b.date ? 1 : -1,'],
  ['M60 conversion rounds half-up', CONVERT,
    '? whole + 1 : whole;', '? whole : whole;'],
  ['M61 conversion keeps the sign', CONVERT,
    'return negative ? -rounded : rounded;', 'return negative ? rounded : rounded;'],
  ['M62 GEL rows need no rate', GEL,
    'if (row.currency === BASE_CURRENCY) return row.amountMinor;',
    'if (row.currency !== BASE_CURRENCY) return row.amountMinor;'],
  ['M63 missing rate is marked', TXVIEW,
    "const MISSING_RATE = 'no rate';", "const MISSING_RATE = '';"],
  ['M64 pair status is for conversions only', TXVIEW,
    "if (row.kind !== 'conversion') return '';", "if (row.kind === 'conversion') return '';"],
  ['M65 a pair id means paired', TXVIEW,
    "return row.paired ? 'paired' : 'unpaired';",
    "return row.paired ? 'unpaired' : 'paired';"],
  ['M66 rate table uses paired rows', GEL,
    'row.paired && row.currency !== BASE_CURRENCY',
    '!row.paired && row.currency !== BASE_CURRENCY'],
  ['M67 any unpaired conversion warns', IMPORTVIEW,
    '{#if unpairedCount > 0}', '{#if unpairedCount > 1}'],

  ['M69 colour name shown, not raw token', CATVIEW,
    `          <span class="swatch" style={\`background: var(\${category.color})\`}></span>
          {colourName(category.color)}`,
    `          <span class="swatch" style={\`background: var(\${category.color})\`} data-colour-name={colourName(category.color)}></span>
          {category.color}`],
  ['M70 seed type is transfer', SEED,
    `  type: 'transfer',`, `  type: 'expense',`],
  ['M71 currency-conversion delete button hidden', CATVIEW,
    `{#if category.id !== CURRENCY_CONVERSION_ID}`, `{#if category.id === CURRENCY_CONVERSION_ID}`],
  ['M72 empty name guard', CATFORM,
    `if (trimmed === '') {`, `if (trimmed.length > 0) {`],
  ['M73 duplicate name guard', CATFORM,
    `existing.name.trim().toLowerCase() === trimmed.toLowerCase(),`,
    `existing.name.trim().toLowerCase() !== trimmed.toLowerCase(),`],
  ['M74 edit always makes a new id', CATFORM,
    `onsave({ id: category?.id ?? crypto.randomUUID(), name: trimmed, type, color });`,
    `onsave({ id: crypto.randomUUID(), name: trimmed, type, color });`],
  ['M75 seeding runs only on populate/upgrade, never on open', DATABASE,
    `    await db.open();`,
    `    await db.open();
    await db.categories.put(CURRENCY_CONVERSION);`],
  ['M76 zero-count pluralization boundary', CATVIEW,
    `counts.rules === 1 ? '1 rule' :`, `counts.rules === 0 ? '1 rule' :`],
  ['M78 cascade deletes rules', CATDB,
    `await db.rules.where('categoryId').equals(id).delete();`,
    `await db.rules.where('categoryId').equals('').delete();`],
  ['M79 cascade clears manual assignments', CATDB,
    `await db.transactions.where('manualCategoryId').equals(id).modify({ manualCategoryId: null });`,
    `await db.transactions.where('manualCategoryId').equals('').modify({ manualCategoryId: null });`],

  ['M81 system before manual', ASSIGN,
    `  if (row.paired) {
    return { categoryId: CURRENCY_CONVERSION_ID, categorySource: 'system', ruleId: null };
  }

  if (row.manualCategoryId !== null) {
    return { categoryId: row.manualCategoryId, categorySource: 'manual', ruleId: null };
  }`,
    `  if (row.manualCategoryId !== null) {
    return { categoryId: row.manualCategoryId, categorySource: 'manual', ruleId: null };
  }

  if (row.paired) {
    return { categoryId: CURRENCY_CONVERSION_ID, categorySource: 'system', ruleId: null };
  }`],
  ['M82 manual before rules', ASSIGN,
    `  if (row.manualCategoryId !== null) {
    return { categoryId: row.manualCategoryId, categorySource: 'manual', ruleId: null };
  }

  for (const rule of [...rules].sort(byPriorityThenId)) {
    if (matchesRule(rule, row)) {
      return { categoryId: rule.categoryId, categorySource: 'rule', ruleId: rule.id };
    }
  }`,
    `  for (const rule of [...rules].sort(byPriorityThenId)) {
    if (matchesRule(rule, row)) {
      return { categoryId: rule.categoryId, categorySource: 'rule', ruleId: rule.id };
    }
  }

  if (row.manualCategoryId !== null) {
    return { categoryId: row.manualCategoryId, categorySource: 'manual', ruleId: null };
  }`],
  ['M83 ascending priority', ORDER,
    `if (a.priority !== b.priority) return a.priority - b.priority;`,
    `if (a.priority !== b.priority) return b.priority - a.priority;`],
  ['M84 new rule first', ORDER,
    `[rule, ...[...rules].sort(byPriorityThenId)]`, `[...[...rules].sort(byPriorityThenId), rule]`],
  ['M85 first match wins', ASSIGN,
    `for (const rule of [...rules].sort(byPriorityThenId)) {`,
    `for (const rule of [...rules].sort(byPriorityThenId).reverse()) {`],
  ['M86 case-folding in equals', ASSIGN,
    `return value.trim().toLowerCase() === rule.pattern.trim().toLowerCase();`,
    `return value.trim() === rule.pattern.trim().toLowerCase();`],
  ['M87 a null field value never matches', ASSIGN,
    `if (value === null) return false;`, `if (value === null) return true;`],
  ['M89 renumbering on move', ORDER,
    `  swapped[index] = b;
  swapped[target] = a;
  return renumber(swapped);`,
    `  swapped[index] = b;
  swapped[target] = a;
  return swapped;`],
  ['M90 move direction', ORDER,
    `const target = direction === 'up' ? index - 1 : index + 1;`,
    `const target = direction === 'up' ? index + 1 : index - 1;`],
  ['M91 winsByRule counts wins', COUNTS,
    `counts.set(row.ruleId, (counts.get(row.ruleId) ?? 0) + 1);`, `counts.set(row.ruleId, 1);`],
  ['M92 wouldCategorize clears the origin\'s manual assignment', COUNTS,
    `const manualCategoryId = row.id === originId ? null : row.manualCategoryId;`,
    `const manualCategoryId = row.id === originId ? row.manualCategoryId : null;`],
  ['M93 addRuleFromTransaction clears the origin', RULEDB,
    `await db.transactions.update(transactionId, { manualCategoryId: null });`,
    `await db.transactions.update(transactionId, { manualCategoryId: transactionId });`],

  ['M94 paired rows get system category', ASSIGN,
    `if (row.paired) {`, `if (!row.paired) {`],
  ['M95 new-category sentinel comparison', TXVIEW,
    `if (value === NEW_CATEGORY) {`, `if (value !== NEW_CATEGORY) {`],
  ['M96 setManualCategory persists the pick', TXREPO,
    `await db.transactions.update(id, { manualCategoryId: categoryId });`,
    `await db.transactions.update(categoryId, { manualCategoryId: id });`],
  ['M97 cancel clears the pending sentinel', TXVIEW,
    `if (newCategoryRow) clearPending(newCategoryRow.id);`, `if (newCategoryRow) clearPending('');`],
  ['M98 clearManualCategory actually clears', TXREPO,
    `await db.transactions.update(id, { manualCategoryId: null });`,
    `await db.transactions.update(id, { manualCategoryId: id });`],
  ['M99 resetCategory closes its own open prompt', TXVIEW,
    `if (promptRowId === row.id) closePrompt();`, `if (promptRowId !== row.id) closePrompt();`],
  ['M100 mcc based-on option extracts the wrong field', TXVIEW,
    `options.push({ field: 'mcc', value: row.mcc, label:`,
    `options.push({ field: 'mcc', value: row.kind, label:`],
  ['M101 edit-rule dialog cancel wiring', TXVIEW,
    `      onsave={saveRuleFromEdit}
      oncancel={closePrompt}
      ondraftchange={(draft) => (editRuleDraft = draft)}`,
    `      onsave={saveRuleFromEdit}
      oncancel={() => (editingRuleRow = null)}
      ondraftchange={(draft) => (editRuleDraft = draft)}`],
  ['M102 new-category prompt uses the saved category', TXVIEW,
    `      clearPending(row.id);
      showPrompt(row, category.id);`,
    `      clearPending(row.id);
      showPrompt(row, '');`],
  ['M103 picking another row replaces the prompt', TXVIEW,
    `  function showPrompt(row: Transaction, categoryId: string) {
    promptRowId = row.id;`,
    `  function showPrompt(row: Transaction, categoryId: string) {
    promptRowId = promptRowId ?? row.id;`],
  ['M104 "No" only closes the prompt', TXVIEW,
    `<button type="button" onclick={closePrompt}>No</button>`,
    `<button type="button" onclick={() => resetCategory(row)}>No</button>`],

  ['M105 empty rules message threshold', RULEVIEW,
    `{#if ruleList.length === 0}`, `{#if ruleList.length > 0}`],
  ['M106 edited fields overwrite the stored rule', RULEVIEW,
    `await updateRule({ ...editingRule, ...draft });`, `await updateRule({ ...draft, ...editingRule });`],
  ['M107 deleteRule removes the right id', RULEDB,
    `await db.rules.delete(id);`, `await db.rules.delete(id + 'x');`],
  ['M108 empty pattern guard', RULEVALIDATE,
    `if (pattern.trim() === '') return 'Pattern is required.';`,
    `if (pattern.trim() !== '') return 'Pattern is required.';`],
  ['M109 regex validated only in regex mode', RULEVALIDATE,
    `if (match === 'regex') {`, `if (match !== 'regex') {`],

  ['M110 period predicate', TXVIEW,
    `if (!inPeriod(row.effectiveDate, periodFilter)) return false;`,
    `if (inPeriod(row.effectiveDate, periodFilter)) return false;`],
  ['M111 category predicate', TXVIEW,
    `} else if (categoryFilter !== '' && row.categoryId !== categoryFilter) {`,
    `} else if (categoryFilter !== '' && row.categoryId === categoryFilter) {`],
  ['M112 uncategorized predicate', TXVIEW,
    `      if (categoryFilter === UNCATEGORIZED) {
        if (row.categoryId !== null) return false;`,
    `      if (categoryFilter === UNCATEGORIZED) {
        if (row.categoryId === null) return false;`],
  ['M113 kind predicate', TXVIEW,
    `if (kindFilter !== '' && row.kind !== kindFilter) return false;`,
    `if (kindFilter !== '' && row.kind === kindFilter) return false;`],
  ['M114 search case-folds the counterparty', TXVIEW,
    `!row.counterparty.toLowerCase().includes(search) &&`,
    `!row.counterparty.includes(search) &&`],
  ['M115 search falls back to details', TXVIEW,
    `        !row.counterparty.toLowerCase().includes(search) &&
        !row.details.toLowerCase().includes(search)`,
    `        !row.counterparty.toLowerCase().includes(search) ||
        !row.details.toLowerCase().includes(search)`],
  ['M116 no-match message threshold', TXVIEW,
    `{#if filtered.length === 0}`, `{#if filtered.length > 0}`],
  ['M117 year granularity', PERIOD,
    `if (period.length === 4) return effectiveDate.slice(0, 4) === period;`,
    `if (period.length === 4) return effectiveDate.slice(0, 3) === period;`],
  ['M118 quarter granularity', PERIOD,
    `return effectiveDate.slice(0, 4) === year && quarterOf(effectiveDate)`,
    `return effectiveDate.slice(0, 4) !== year && quarterOf(effectiveDate)`],
  ['M119 month granularity', PERIOD,
    `return effectiveDate.slice(0, 7) === period;`, `return effectiveDate.slice(0, 6) === period;`],
  ['M120 period options are deduplicated', PERIOD,
    `return [...new Set(values)].sort().reverse();`, `return [...values].sort().reverse();`],
  ['M121 period options are newest first', PERIOD,
    `return [...new Set(values)].sort().reverse();`, `return [...new Set(values)].sort();`],

  ['M122 default colour is the first unused token', CATFORM,
    `return PALETTE.find((entry) => !used.has(entry.token))?.token ?? '--palette-1';`,
    `return PALETTE.find((entry) => used.has(entry.token))?.token ?? '--palette-1';`],
  ['M123 uncategorized placeholder is disabled', TXVIEW,
    `<option value={UNCATEGORIZED} disabled selected>Uncategorized</option>`,
    `<option value={UNCATEGORIZED} selected>Uncategorized</option>`],
  ['M124 currency-conversion type stays disabled', CATFORM,
    `const typeDisabled = untrack(() => category?.id === CURRENCY_CONVERSION_ID);`,
    `const typeDisabled = untrack(() => category?.id !== CURRENCY_CONVERSION_ID);`],

  ['M125 new-category dialog opens modal', TXVIEW,
    `if (newCategoryRow && !dialogEl.open) dialogEl.showModal();`,
    `if (newCategoryRow && !dialogEl.open) dialogEl.show();`],
  ['M126 edit-rule dialog opens modal', TXVIEW,
    `if (editingRuleRow && !dialogEl.open) dialogEl.showModal();`,
    `if (editingRuleRow && !dialogEl.open) dialogEl.show();`],
  ['M127 delete-category dialog opens modal', CATVIEW,
    `if (deleteTarget && !dialogEl.open) dialogEl.showModal();`,
    `if (deleteTarget && !dialogEl.open) dialogEl.show();`],
  ['M128 new-category dialog Escape resets state', TXVIEW,
    `  function onNewCategoryDialogClose() {
    if (newCategoryRow) cancelNewCategory();
  }`,
    `  function onNewCategoryDialogClose() {
  }`],
  ['M130 category form dialog opens modal', CATVIEW,
    `if (formOpen && !dialogEl.open) dialogEl.showModal();`,
    `if (formOpen && !dialogEl.open) dialogEl.show();`],
  ['M131 rule form dialog opens modal', RULEVIEW,
    `if (formOpen && !dialogEl.open) dialogEl.showModal();`,
    `if (formOpen && !dialogEl.open) dialogEl.show();`],
  ['M132 category form dialog Escape resets state', CATVIEW,
    `  function onFormDialogClose() {
    if (formOpen) closeForm();
  }`,
    `  function onFormDialogClose() {
  }`],
  ['M133 rule form dialog Escape resets state', RULEVIEW,
    `if (formOpen) closeForm();`, `if (!formOpen) closeForm();`],
  ['M134 no earlier rate falls back to a later one', RATES,
    `if (before === null) return after;`, `if (before === null) return null;`],
  ['M135 a later rate is confined to the same month', RATES,
    `rate.date.slice(0, 7) === month`, `rate.date.slice(0, 7) !== month`],
  ['M136 the nearer candidate wins', RATES,
    `afterDistance < beforeDistance ? after : before`, `afterDistance > beforeDistance ? after : before`],
  ['M137 a tie goes to the earlier rate', RATES,
    `afterDistance < beforeDistance`, `afterDistance <= beforeDistance`],
];
