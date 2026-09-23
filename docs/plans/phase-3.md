# Phase 3 Implementation Plan — Pairing, rates, GEL amounts

**Goal:** Conversion rows pair up, a rate table falls out of those pairs, and the Transactions table shows each row's GEL amount and each conversion's pair status.

**Architecture:** `pairing/` detects pairs and owns the rate table. `aggregate/` converts an amount at a rate. Both are pure, with no UI or DB imports, per `CLAUDE.md`. The rate is carried as a scaled integer end to end; no float ever touches money.

**Spec:** `docs/spec.md` — Currency, Data model, "Required behavior coverage / Phase 3".

## Global Constraints

- Everything in `CLAUDE.md` applies. Additions specific to this phase:
- **Rates are scaled integers.** A rate is stored as an integer scaled by `1e6` (`2.7350` → `2735000`), parsed digit-wise from the rate's text. `amountMinor * rateScaled / 1e6` with half-up rounding stays inside `2^53` for any realistic statement, so no step is floating point.
- `conversionRate: number | null` is replaced by `conversionRateScaled: number | null`. A float rate is never stored, and pair matching compares integers, so equality is exact.
- Pairing runs over **all** unpaired conversion rows in the database after each import, not only the new batch. That is what lets a pair split across two files resolve.
- Rates are never fetched. They come from the user's own conversion pairs, with a manual per-currency fallback arriving in phase 7.
- Base-currency amounts are computed for display, never stored.
- Gate per task: `npm run typecheck && npm test`, escalating to `npm run test:all` for any task touching `src/import/**`, `src/ui/views/ImportView.svelte`, or `src/App.svelte`.

---

### Task 1: Scaled decimals and the rate as an integer

**Files:** `src/import/amount.ts`, `src/import/details/conversion.ts`, `src/import/details/index.ts`, `src/import/normalizeRow.ts`, `src/domain/types.ts`, `src/ui/views/ImportView.svelte`, `scripts/mutations.mjs`

**Interfaces:**
```ts
scaledFromDecimal(raw: string, decimals: number): { value: number; extraPrecision: boolean }
minorFromDecimal(raw: string): { minor: number; extraPrecision: boolean }   // = scaledFromDecimal(raw, 2)
parseConversionRate(body: string): number | null                            // scaled by RATE_SCALE
formatRate(scaled: number): string                                          // 2735000 → "2.735"
```
- `minorFromDecimal` becomes a thin wrapper so the digit-wise algorithm exists once. M11 and M12 anchor on the generalized lines and are updated in the same commit.
- `formatRate` trims trailing zeros, so the Import view still shows `2.735`.

**Definition of done:** the Import view's Rate column reads the same as before; no float rate is stored anywhere.

**Verify:** `npm run typecheck && npm run test:all`

---

### Task 2: Conversion pairing

**Files:** `src/pairing/pairConversions.ts`, `src/db/transactions.ts`

**Interfaces:**
```ts
type ConversionRow = { id: string; postingDate: string; currency: string; amountMinor: number; conversionRateScaled: number | null }
pairConversions(rows: ConversionRow[]): { pairs: { pairId: string; gelId: string; foreignId: string }[]; unpaired: string[] }

unpairedConversions(): Promise<Transaction[]>
setPairIds(assignments: { id: string; conversionPairId: string }[]): Promise<void>
```
- Match on `(postingDate, conversionRateScaled, opposite direction)`. The GEL side is `currency === 'GEL'`; the foreign side is anything else. Never match on computed amounts — bank rounding differs by 0.01–0.02.
- Within one `(date, rate)` group, pair GEL sides to foreign sides in `id` order, so the result is deterministic. Leftovers on either side are unpaired.
- A row with no rate is never paired.

**Behavior tests:** the fixture's conversion rows show as paired; an unpaired conversion shows an unpaired status; a pair split across two files pairs after the second import.

---

### Task 3: Rate table and GEL amounts

**Files:** `src/pairing/rates.ts`, `src/aggregate/convert.ts`, `src/ui/views/TransactionsView.svelte`

**Interfaces:**
```ts
buildRateTable(pairs: { date: string; currency: string; rateScaled: number }[]): Rate[]   // sorted by date
rateFor(table: Rate[], currency: string, onOrBefore: string): Rate | null                 // nearest earlier
toGelMinor(amountMinor: number, rateScaled: number): number                               // integer, half-up
```
- A GEL row needs no rate and shows its own amount.
- A non-GEL row with no rate on or before its `effectiveDate` shows the missing-rate marker and is excluded from totals later.

**Behavior tests:** a non-GEL transaction shows its GEL amount at the nearest earlier rate; a transaction with no earlier rate shows the marker; a rate is not applied to a date before it exists.

---

### Task 4: Pair status in the Transactions table

**Files:** `src/ui/views/TransactionsView.svelte`, `src/ui/views/ImportView.svelte`

**Definition of done:** a `Pair status` column reads `paired` or `unpaired` for conversion rows and is empty for every other kind. The Import view warns when an import leaves a conversion unpaired.

---

### Task 5: Mutation pass and phase report

Phase 1 and 2 mutations are re-proven, since `amount.ts`, `normalizeRow.ts`, `ImportView` and `TransactionsView` all change. Mutations are listed for approval before any are applied.

---

## Open risk, carried from phase 1

The conversion Details format is **unverified against the real export** — no conversion row has ever been seen (`docs/spec.md`, Details parsing). Phase 3's classification, pairing key and rate table all rest on it. The assumptions are confined to `src/import/details/conversion.ts` and the pairing key in `pairConversions.ts`, so a correction is a small, local change rather than a redesign.

A second consequence, independent of whether the format is right: rates exist only on dates the user converted, so a foreign transaction dated before the first conversion in its currency has no rate at all. Card rows already carry `originalAmountMinor` and `originalCurrency`, which imply a rate whenever the original currency differs from the posted one; that is a denser second source, held in reserve rather than built, because it bakes in the bank's FX margin and is not in the spec. `buildRateTable` takes rows in, so adding it later is one more input, not a redesign.
