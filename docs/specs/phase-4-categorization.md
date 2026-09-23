# Phase 4 — Categorization

Every transaction shows a category or is visibly uncategorized. The app ships with no opinion about the user's spending: no seeded rules, and one seeded category that the code itself needs. Its job is to make creating categories and rules fast, from the transactions the user is looking at.

## Scope

In:
- Categories and rules: model, storage, assignment.
- Transactions view: category column, inline assignment, "apply to all" rule creation, and every filter.
- Rules view and Categories view.
- Category colour tokens.

Out:
- Aggregation, totals and the dashboard (phase 5). This phase only guarantees what they rely on: every paired conversion carries a `transfer`-type category.
- Backup and restore of categories and rules (phase 7).

## Data model

### Stored

Only facts and user decisions are stored.

```ts
StoredTransaction = RowFacts & {
  id: string
  importBatchId: string
  manualCategoryId: string | null     // replaces categoryId + categorySource
}

Category = {
  id: string
  name: string
  type: 'expense' | 'income' | 'transfer' | 'ignore'
  color: string                       // a palette token name, e.g. '--palette-3'
}

Rule = {
  id: string
  field: 'counterparty' | 'mcc' | 'details' | 'kind'
  match: 'equals' | 'contains' | 'regex'
  pattern: string
  categoryId: string
  priority: number
}
```

- New category and rule ids come from `crypto.randomUUID()`.
- The seeded category has the fixed id `currency-conversion`.

### Derived on every read

```ts
Transaction = StoredTransaction & DerivedFields & {
  paired: boolean
  categoryId: string | null
  categorySource: 'system' | 'rule' | 'manual' | null
  ruleId: string | null               // the rule that won, when categorySource is 'rule'
}
```

A rule edit, insert, delete or reorder changes only what the next read computes. No stored row is rewritten, and there is no re-apply pass.

### Schema version 3

- Adds tables `categories` (`id, name`) and `rules` (`id, priority, categoryId`).
- `transactions` gains the index `manualCategoryId`.
- Upgrade from v2:
  - Set `manualCategoryId` to the old `categoryId` where `categorySource` was `'manual'`, otherwise `null`.
  - Then delete `categoryId` and `categorySource`.

### Seeding

- The only seeded category is `{ id: 'currency-conversion', name: 'Currency conversion', type: 'transfer', color: '--palette-12' }`.
- No rules are seeded.
- Seeding runs exactly once per database: in Dexie's `populate` event for a new database, and inside the v3 upgrade for an existing v2 database. Opening the database never re-seeds, so a renamed Currency conversion keeps its name.

## Assignment

`src/categorize/assign.ts` is pure: no UI or DB imports.

```ts
assignCategory(row: Candidate, rules: Rule[]): Assignment
matchesRule(rule: Rule, row: Candidate): boolean

type Candidate = { paired: boolean; kind; counterparty; mcc; details; manualCategoryId }
type Assignment = { categoryId: string | null; categorySource: CategorySource | null; ruleId: string | null }
```

Evaluation order, first hit wins:

1. **System.** A paired conversion is assigned `currency-conversion`, with source `system`. Nothing below can override it: not a manual choice, not a rule.
2. **Manual.** When `manualCategoryId` is set, the source is `manual`.
3. **Rules.** Rules are evaluated by ascending `priority`, ties broken by `id`. The first matching rule gives source `rule` and its `ruleId`.
4. **Uncategorized.** Otherwise `categoryId`, `categorySource` and `ruleId` are all `null`.

An unpaired conversion row gets no system assignment. It goes through manual assignment and rules like any other row.

Both rows of a pair always carry the `transfer`-type Currency conversion, and neither can be overridden. That guarantee is what lets aggregation exclude a pair from income and spending, and count it once wherever transfers are included.

### Matching

- The field value is read from the derived row: `counterparty`, `mcc`, the raw `details`, or `kind`. A `null` value never matches.
- `equals`: both sides trimmed, case-insensitive.
- `contains`: case-insensitive substring.
- `regex`: `new RegExp(pattern)`, exactly as written. A pattern that does not compile matches nothing and never throws. The rule form already rejects such patterns, so this only guards against stored data such as a phase 7 restore.

### Priority

`src/categorize/order.ts` is pure.

```ts
insertRule(rules: Rule[], rule: Rule): Rule[]                  // new rule first
moveRule(rules: Rule[], id: string, direction: 'up' | 'down'): Rule[]
```

- Both functions return every rule with its priority renumbered to `(position + 1) × 10`.
- The repository writes the returned list in one transaction.
- A new rule, however it was created, goes first, so the latest intent wins until the user reorders.

## Rule creation from a transaction

This is the primary way rules come into existence.

1. The user picks a category in a row's category select. This is stored at once as that row's `manualCategoryId`, so dismissing what follows still keeps the choice.
2. An inline prompt appears under the row:
   > Apply **{category}** to all **{counterparty}** transactions? It would categorize **{N}** now, and future imports too.
   >
   > [Create rule] [Edit rule…] [No]
3. **Create rule** creates `counterparty equals {counterparty} → {category}` via `insertRule`, placing it first. In the same transaction it clears the originating row's `manualCategoryId`, since the rule now covers that row. No other row's manual assignment is touched.
4. **Edit rule…** opens a dialog:
   - **Based on:** radio options built from this row's own values: `Counterparty = {counterparty}`, `MCC = {mcc}` (only when the row has one), and `Kind = {kind}`. The user never types a value here. Each option is an `equals` rule.
   - **Category:** a select, preset to the category just picked.
   - A live count: "Would categorize {N} transactions".
   - **Save rule** behaves like step 3. **Cancel** leaves the manual assignment in place.
5. **No** closes the prompt, and the row stays `manual`.

**N** is the number of rows that would have the candidate rule as their winning rule if it were inserted first. It is computed with `assignCategory` over the current rows, with the originating row's manual assignment treated as cleared. System rows and other manual rows are therefore excluded.

Picking a category never triggers the prompt on a paired conversion, because those rows have no select.

## Category deletion

- `deleteCategory(id)` runs one Dexie transaction. It deletes the category, deletes every rule whose `categoryId` is `id`, and sets `manualCategoryId` to `null` on every transaction that referenced it.
- These are user decisions following from a user action, not a cache refresh.
- `currency-conversion` cannot be deleted, and its type cannot be changed. Its name and colour can be edited.

## Views

### Transactions

Category column:
- **Paired conversion rows:** plain text "Currency conversion".
- **Every other row:**
  - A select labelled "Category for {counterparty}". Its options are every category sorted by name, then "New category…". An "Uncategorized" placeholder option is present, disabled, only while the row is uncategorized. A rule's category can only be displaced by choosing another category, or by editing or reordering rules.
  - A source label: `rule` or `manual`, and nothing when uncategorized.
  - A "Reset category" button on `manual` rows only. It sets `manualCategoryId` to `null`, so the row falls back to rules or to uncategorized.
- **"New category…"** opens the category dialog (name, type, colour). Saving creates the category, assigns it to the row as in step 1 of rule creation, and shows the "apply to all" prompt.

Filters, combined with AND:

| Filter | Control | Options |
|---|---|---|
| Period | select "Period" | "All periods", then years (`2025`), quarters (`2025 Q1`) and months (`2025-02`) present in the data by `effectiveDate`, newest first, in option groups "Years", "Quarters", "Months" |
| Category | select "Category" | "All categories", "Uncategorized", then each category by name |
| Kind | select "Kind" | "All kinds", then each Details kind |
| Search | search input "Search" | case-insensitive substring of `counterparty` or `details` |

- The "Uncategorized" option of the category filter is the uncategorized filter. There is no separate checkbox.
- With transactions present but none matching, the view shows "No transactions match the filters." The empty-database message stays for an empty database.

### Rules

- A table named "Rules", in priority order. Columns: #, Field, Match, Pattern, Category, Matches, Actions.
- **Matches** is the number of transactions whose derived `ruleId` is this rule's id: the rows it actually categorizes.
- Actions:
  - **Edit** opens the rule form prefilled. Saving keeps the rule's position.
  - **Delete** removes the rule immediately.
  - **Move up** and **Move down** are disabled at the ends of the list. Every action button's accessible name includes the rule, e.g. "Move rule counterparty equals Shop Alpha up".
- The **Add rule** form has Field, Match, Pattern and Category, and a new rule is inserted first. Validation:
  - An empty pattern gives "Pattern is required."
  - A regex that does not compile gives "Pattern is not a valid regular expression."
- The rule form is one component, used by Add rule, Edit and the transaction "Edit rule…" dialog. The dialog restricts the form to "Based on" options.
- Empty state: "No rules yet. Pick a category on a transaction to create one."

### Categories

- A table named "Categories", sorted by name. Columns: Name, Type, Colour (a swatch plus the colour's name), Actions (Edit, Delete).
- Currency conversion has no Delete button, and its type is not editable.
- **Add category** form: Name, Type (default `expense`), Colour (default: the first palette colour no category uses, else the first palette colour).
  - A name is required.
  - A name equal to an existing category's name, ignoring case, is rejected: "A category with this name already exists."
  - The same form component backs the "New category…" dialog.
- **Delete** opens a confirmation dialog:
  > Delete {name}? {r} rule(s) and {m} manual assignment(s) will be removed.
  >
  > [Delete] [Cancel]

  Singular and plural forms follow the counts ("1 rule", "2 rules").

### Routing

App's `rules` and `categories` routes render RulesView and CategoriesView instead of StubView.

## Colours

- `src/ui/styles/tokens.css` defines `--palette-1` … `--palette-12`, each with a light value and a dark value.
- `src/ui/palette.ts` maps each token to a name: Blue, Teal, Green, Lime, Yellow, Orange, Red, Pink, Purple, Indigo, Brown, Grey. Colour selects show these names.
- A swatch is drawn with `var(--palette-N)`. No component contains a colour literal.

## Modules and files

```
src/domain/types.ts            Category, Rule, CategoryType, RuleField, RuleMatch; StoredTransaction, Transaction as above
src/categorize/assign.ts       assignCategory, matchesRule
src/categorize/order.ts        insertRule, moveRule
src/categorize/seed.ts         CURRENCY_CONVERSION (the seeded category)
src/db/database.ts             schema v3, populate + upgrade seeding
src/db/transactions.ts         listAll (derive, pair, assign), setManualCategory, clearManualCategory
src/db/categories.ts           listCategories, saveCategory, deleteCategory (cascade), deletionImpact
src/db/rules.ts                listRules, saveRules (whole list, one transaction), deleteRule, createRuleFrom (rule insert + clear originating manual)
src/ui/palette.ts              palette token → name
src/ui/styles/tokens.css       --palette-1 … --palette-12
src/ui/components/RuleForm.svelte
src/ui/components/CategoryForm.svelte
src/ui/views/TransactionsView.svelte
src/ui/views/RulesView.svelte
src/ui/views/CategoriesView.svelte
src/App.svelte                 routes
```

`listAll()` derives, pairs and assigns every row on every read, and Rules-view match counts come from the same `listAll()`. That is linear work per read and is accepted deliberately. Performance is revisited only when measured.

## Required behavior coverage

- After import, a paired conversion shows Currency conversion on both rows, not editable, and every other row is uncategorized.
- A manual category survives a remount.
- "Apply to all" creates a counterparty rule that categorizes every matching row, including the originating one, as `rule`. The prompt's count equals the rows categorized.
- "No" leaves only the picked row assigned.
- "Edit rule…" based on MCC categorizes the rows with that MCC.
- "New category…" creates a category and assigns it to the row.
- "Reset category" returns a manual row to its rule category or to uncategorized.
- A manual assignment survives rule changes.
- No rule can recategorize a paired conversion, while an unpaired conversion follows rules.
- `equals` matching ignores case.
- The Rules view shows each rule's match count, and a new rule is listed first.
- Reordering rule priority changes the outcome and the counts.
- Editing or deleting a rule changes which rows it categorizes.
- An invalid regex is rejected with its message.
- Categories can be created and renamed, and rows show the change.
- Deleting a category confirms with the counts, removes its rules, and leaves its rows uncategorized.
- Currency conversion cannot be deleted.
- Seeding happens once: a renamed Currency conversion keeps its name after a remount.
- Each Transactions filter (period at year, quarter and month; category; uncategorized; kind; search) produces the expected rows. Filters combine, and no match shows the no-match message.

## Decisions

### Category assignment is derived, not stored
Only `manualCategoryId` is stored, because a user's choice cannot be recomputed. System and rule assignments are pure functions of the row and the current rules. Storing them would make them a cache, and every rule edit would need a re-apply pass that could be forgotten or interrupted. Derived, a rule change is correct on the next read by construction.

### No seeded rules, one seeded category
Seeded merchants, MCCs and spending categories are guesses about one person's spending, and the earlier seed list was invented rather than taken from real data. The app's job is to make the user's own rules cheap to create, from the transactions in front of them. Currency conversion is seeded only because the system assignment refers to it by id.

### Match count counts wins, not pattern matches
A rule's count is the rows it actually categorizes. Counts then change visibly when priority changes, and they add up to the number of rule-categorized rows. Counting every pattern match would hide shadowing.

### `equals` and `contains` ignore case
The user cannot see how the bank capitalizes a merchant across statements, so a rule created from one row must keep matching the same merchant written differently. `regex` stays exact so it remains a precise tool.

### A new rule goes first
The most recent rule reflects the user's latest intent, and a rule created from a row must visibly take effect on that row. With no seeded rules there is no reserved band to stay above. Renumbering to position × 10 on every write means priorities never collide.

### Deleting a category cascades to its rules and manual assignments
A rule that points at a deleted category would keep matching and return a dead id: the row would show no category yet not be counted as uncategorized. Cascading removes user decisions that no longer have a target. It is not a re-apply pass, because nothing derived is written.

### Colours are palette tokens
A category stores a token name, never a colour, so light and dark theming stays in `tokens.css` and no component hardcodes a colour. A shared palette serves user-created categories, which a per-category token could not.
