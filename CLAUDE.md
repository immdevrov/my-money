# Personal Budget App — working rules

This file holds only rules that apply to every session.

## Constraints
- Client-only SPA. No backend. No network requests carrying financial data.
- Stack: Vite (plain, not SvelteKit), TypeScript (strict), Svelte 5 with runes, read-excel-file (pinned exact version), Dexie (IndexedDB), Chart.js v4, Vitest 4 Browser Mode with the `@vitest/browser-playwright` provider, vitest-browser-svelte.
- Dev-only tooling: `write-excel-file` and `tsx`, for the synthetic fixture generator.
- xlsx reading:
  - `import/readWorkbook.ts` is the only file that imports read-excel-file.
  - It returns plain row arrays (`unknown[][]`) for a sheet selected by name. Everything else in `import/` consumes those arrays.
  - read-excel-file changed its API across major versions 7, 8 and 9. Before writing the adapter, read the installed package's README and type definitions in `node_modules/read-excel-file`. Do not rely on remembered API.
  - If read-excel-file fails on the real export, replace the adapter with SheetJS (tarball from cdn.sheetjs.com). Nothing else changes.
- Charts:
  - One `ui/charts/Chart.svelte` wrapper owns Chart.js create, update, and destroy.
  - No third-party Svelte chart wrapper packages.
  - Register only the Chart.js controllers, elements, and scales in use.
  - Chart colors are read from CSS custom properties at render time.
  - The wrapper re-renders on `prefers-color-scheme` change, so theming lives in CSS only.
  - Every chart also renders a visually hidden data table, named after the chart, containing exactly the plotted data.
- Styling:
  - `src/ui/styles/tokens.css` is the single source of color, spacing, and type scale, as CSS custom properties for light and dark via `prefers-color-scheme`.
  - Components and charts consume those tokens. No component hardcodes a color.
- Reactive DB reads use Dexie `liveQuery`, consumed through Svelte store syntax.
- `App.svelte` opens the Dexie connection on mount and closes it on unmount. No module-level open connection. Tests rely on this for database reset and for simulating a page reload.
- Money stored as integer minor units. No floating-point arithmetic on amounts; decimals are parsed digit-wise.
- **Derived data is never stored.** The database holds only what the statement said — `postingDate`, `currency`, `amountMinor`, `details` — plus decisions only a user can make (`manualCategoryId`, categories, rules) and the identity needed to dedup. Everything computed from those facts is derived at read time, every time: what a matcher reads from `details` (`kind`, `counterparty`, `mcc`, `cardLast4`, `conversionRateScaled`, `effectiveDate`), conversion pairing, and system and rule category assignment.
- Storing a derived value turns it into a cache, and a cache goes stale the moment a matcher is corrected. A fix to a parser must apply to data already imported, without a re-import and without a migration. Re-importing recalculates nothing: it is a dedup check, not a repair mechanism.
- This trades work at read time for correctness. That trade is deliberate. Performance is addressed if and when it is measured to be a problem, not in advance.
- Import, pairing, categorization, currency conversion, and aggregation are pure modules with no UI or DB imports. They are verified only through behavior tests.
- Accessibility is mandatory, because tests locate elements by role and label:
  - Every interactive element has an accessible name.
  - Tabular data uses semantic `<table>` with header cells.
- The app reads the current date with `new Date()` or `Date.now()` at the moment of use. Never cache it at module load.

## Fixtures and privacy
- Claude never reads the user's real bank export. The user runs imports themselves and reports what the Import view shows.
- The repo is public. `.gitignore` ignores `*.xlsx` everywhere and `budget-my-backup-*.json`. There is no allow-list, so no statement can be committed by accident.
- All fixtures are synthetic and generated. `npm run fixtures` regenerates every `.xlsx` in `fixtures/` from `scripts/make-fixtures.ts`, and runs before `test:import` and `test:all`.
- `fixtures/statement-sample.xlsx` is the high-fidelity synthetic export: multiple sheets, header below row 0, one row per Details kind, all three date cell forms, and the deliberate failure and warning cases.
- `fixtures/expected.json` is hand-authored, never generated.

## Deployment and storage
- Public GitHub repo, built and deployed to GitHub Pages by a GitHub Actions workflow.
- Vite `base` is the repo path.
- Routing is hash-based.
- The Dexie database name and every `localStorage` key are namespaced to this app, because `github.io` is one origin shared by every Pages project on the account.
- From phase 2: request `navigator.storage.persist()` once on first load, feature-detected and failure-tolerant.

## Architecture
```
src/
  domain/      types shared by all modules
  import/      readWorkbook adapter, header detection, row normalization, Details matchers
  pairing/     conversion pair detection, rate table
  categorize/  system assignment, rule engine
  aggregate/   period bucketing, baselines, comparisons, currency conversion
  db/          Dexie schema, repositories
  ui/          views, components, charts, style tokens
tests/         behavior tests, setup file, helpers
  import/      import tests, split out of the default run
fixtures/      generated synthetic fixtures (gitignored), expected values
scripts/       synthetic fixture generator
scratch/       last-resort temporary tests and mutation lists (gitignored, deleted every phase)
docs/          specs and plans
```
- `ui` and `db` may import domain modules.
- Domain modules never import `ui` or `db`.

## Testing strategy

### Tooling
- Vitest 4 Browser Mode with the `@vitest/browser-playwright` provider, Chromium, headless.
- `vitest-browser-svelte` renders the app. Always `await render(...)`.
- Browser-context imports come from `vitest/browser`.
- Chromium runs with timezone `Asia/Tbilisi`, set through the provider's Playwright context options (`timezoneId`). Results must not depend on the machine's timezone.
- Vitest 4 changed the Browser Mode API: provider packages replaced string providers, and `vitest/browser` replaced `@vitest/browser/context`. Before writing config or tests, read the installed Vitest and vitest-browser-svelte docs and types. Do not rely on remembered pre-4 API.
- Three Vitest projects:
  - `behavior`: `tests/**/*.test.ts` except `tests/import/**`, Browser Mode. `npm test` runs only this project, and needs no fixtures.
  - `import`: `tests/import/**/*.test.ts`, Browser Mode. Runs with `npm run test:import`, which regenerates fixtures first.
  - `scratch`: `scratch/**`, Node environment or Browser Mode, `passWithNoTests`. Runs with `npm run test:scratch`.
- `npm run test:all` regenerates fixtures, then runs `behavior` and `import` together. It is the gate for a phase.
- Import parsing is settled, so its tests are split out of the default loop rather than paid for on every run. They are not optional: anything touching `src/import/` is verified with `npm run test:all`, never `npm test` alone.

### Permanent suite: behavior tests, integration-scoped
- Behavior is what a test asserts; integration is how much it renders to get there. Both words are load-bearing, and neither replaces the other.
- A test renders the smallest surface that contains the behavior it covers: a view with its real dependencies, or `App` when the behavior is routing, the database lifecycle, or navigation between views. Rendering `App` for a behavior that lives in one view is an end-to-end test and buys nothing but runtime.
- Integration, not isolation: a rendered component keeps its real collaborators — real import modules, real Dexie, real stores. What is under test is how the pieces behave together.
- Banned in the permanent suite:
  - Unit tests of a single function's return value.
  - jsdom and happy-dom.
  - `toMatchScreenshot` and any other screenshot or visual-regression assertion.
- A test drives only the rendered surface, as a user would: click, type, select, upload files with `userEvent.upload`. It never calls a component's internals or sets props to simulate a user action.
- A test asserts only on what a user can perceive: text, table contents, counts, messages, downloaded file contents.
- DOM assertions use `expect.element(...)`, which retries.
- Locators: `getByRole`, `getByLabelText`, `getByText`. Use `data-testid` only where no accessible handle exists.
- Locators match substrings by default (`browser.locators.exact` is `false`). When a test's point is that one field is rendered rather than a longer one containing it, anchor the match with a regex — `{ name: /^Bank Mu$/ }`. A bare string passes against the very value the test exists to rule out; this let a real mutation survive.
- Tests never read or write IndexedDB directly and never mock app modules. Platform-level exceptions are confined to `tests/setup.ts` and `tests/helpers/`.
- Charts are never asserted pixel-wise. Tests assert against each chart's accessible data table.

### Isolation and environment (`tests/setup.ts`)
- `fileParallelism: false` for both browser projects. All test files share one origin and therefore one IndexedDB.
- Before each test:
  - Delete the app database.
  - Reset `location.hash`.
  - Restore real timers.
- Any `console.error` fails the test.
- Unhandled errors fail the run (never set `dangerouslyIgnoreUnhandledErrors`).

### Fixtures versus hardcoded statements
- The `import` project proves parsing, so it uses the generated `.xlsx` fixtures on disk and `loadFixture`.
- The `behavior` project assumes parsing already works. Its tests build a minimal statement in memory with `makeStatement(rows)` and upload that, so `npm test` needs no fixtures and no `pretest`.
- This is not mocking. `makeStatement` produces a real `.xlsx` Blob, and the test uploads it through the file input like any user, so the whole import path still runs. What it avoids is depending on the generated fixtures and re-proving parsing outside the project that owns it.
- A behavior test declares the rows it needs inline. Never add a disk fixture for a persistence, pairing, categorization, comparison, or settings test.

### Helpers (`tests/helpers/`)
- `loadFixture(path)`: loads a fixture through a Vite `?url` import, fetches it, and returns a `File` for `userEvent.upload`. Used only by the `import` project.
- `makeStatement(rows)`: builds a minimal one-sheet `Transactions` workbook in the browser with `write-excel-file/browser` and returns a `File`. The default header is `Date | Details | GEL`; callers pass plain row tuples.
- `freezeDate(iso)`: `vi.useFakeTimers({ toFake: ['Date'] })` plus `vi.setSystemTime`, called before render. Fake only `Date`: faking timers can stall Dexie and `liveQuery`.
- `remount(component)`: unmounts the current component and renders a fresh instance of it. This is the substitute for a page reload, since Browser Mode cannot reload the page under test. Reload behaviour that depends on the database lifecycle remounts `App`, because `App` owns the connection.
- `captureDownload()`: spies on `URL.createObjectURL` and returns the Blob the app hands to it.
- `setColorScheme(scheme)`: a custom browser command defined in the Vitest config. It calls Playwright's `emulateMedia` through the provider's command context.

### Scratch tests
- Avoid them. A scratch test is allowed only when a behavior test fails and the defect cannot be localized from its output plus reading the involved code.
- Before writing one, state in the session which behavior test failed and why it cannot localize the defect.
- Scratch tests add no dependencies. They use only what the project already has: Vitest in the Node environment, or Browser Mode with vitest-browser-svelte. Never install jsdom, happy-dom, or anything else for them.
- Scratch tests live only in `scratch/`, which is gitignored, and run in the `scratch` project.
- Before a phase is done:
  - Every behavior a scratch test verified is covered by a behavior test.
  - `scratch/` is deleted.

### Mutation testing
A mutation proofreads a test: break the behavior the test covers in `src/`, confirm that test fails, restore the code. It is a check on the tests, nothing more, and it is never the headline of a report.

Mutations are not code. The list for a change is written to `scratch/`, run with the `mutation-testing` skill's runner, and deleted with `scratch/`.

- Mutations secure **new or changed tests**. Earlier mutations are never re-run: a proven test stays proven until the logic around it changes, and that change brings its own mutations.
- Mutations targeting `tests/import/` need the fixtures: run `npm run fixtures` first.
- Every new or changed test gets at least one mutation that breaks, in `src/`, the behavior that test asserts.
- Each mutation changes exactly one thing and must still pass typecheck.
- Kinds of mutation to apply, wherever the code has them:
  - Conditions: negate, flip boundaries (`<` ↔ `<=`), remove a branch.
  - Constants: change thresholds (for example, 3 complete periods → 2), swap category types, alter priority order.
  - Arithmetic and rounding: half-up → truncate, drop a sign, change the minor-unit factor.
  - Data flow: swap `effectiveDate` and `postingDate`, skip dedup, skip zero-filling, skip transfer exclusion, return early or return empty.
  - Parsing: loosen or tighten a matcher, extract the wrong field or segment.
  - UI: drop a filter predicate, render a wrong column value, pass a wrong drill-down parameter.
- A mutation counts as caught only when an assertion in the test it targets fails. If only an uncaught error or `console.error` catches it, add an assertion that catches the behavior change.
- A mutation its targeted test does not catch is resolved in one of two ways:
  - Add or strengthen a behavior test until it is caught.
  - Record it as an equivalent mutation, with the reasoning, in the phase report.
- Never weaken or drop a mutation to get a clean result.

## Working rules
- Implement one phase per session. Do not start the next phase unprompted.
- Plan before coding: list files, module APIs, and the phase's behavior tests, then wait for approval. The approved plan is written to `docs/plans/phase-N.md`.
- After implementation, list the planned mutations (targeted test, one-line change) for approval before applying them.
- Each phase ends with a report given in the session, not as a file: what was built, every mutation with its outcome, and every mutation recorded as equivalent with its reasoning.
- A phase is done only when:
  - Typecheck passes.
  - `npm run test:all` passes, including all earlier phases' tests.
  - Every required behavior for the phase has a test.
  - The scratch tests cleanup is complete.
  - Every mutation for the phase is caught or recorded as equivalent, per the Mutation testing rules.
