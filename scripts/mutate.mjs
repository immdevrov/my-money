import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { MUTATIONS } from './mutations.mjs';

const TEST = 'npm run --silent test:mutate --';
const CHECK = 'npm run --silent typecheck';
const JOURNAL = 'scripts/.mutation-journal.json';
const LOGS = 'mutation-logs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function restoreFromJournal(reason) {
  if (!existsSync(JOURNAL)) return false;
  const { file, original, id } = JSON.parse(readFileSync(JOURNAL, 'utf8'));
  writeFileSync(file, original);
  rmSync(JOURNAL, { force: true });
  console.error(`\n[restored ${file} from in-flight mutation ${id}] ${reason}`);
  return true;
}

if (args.includes('--restore')) {
  process.exit(restoreFromJournal('on request') ? 0 : (console.log('nothing to restore'), 0));
}

restoreFromJournal('left by a previous interrupted run');

let inFlight = null;
function abort(signal) {
  if (inFlight) {
    writeFileSync(inFlight.file, inFlight.original);
    rmSync(JOURNAL, { force: true });
    console.error(`\n[aborted on ${signal}: restored ${inFlight.file}]`);
    inFlight = null;
  }
  process.exit(130);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => abort(signal));
}
process.on('uncaughtException', (error) => {
  if (inFlight) writeFileSync(inFlight.file, inFlight.original);
  rmSync(JOURNAL, { force: true });
  throw error;
});

function run(command) {
  try {
    return { ok: true, out: execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const onlyIds = only ? only.split(',').map((s) => s.trim().toLowerCase()) : null;
const selected = onlyIds
  ? MUTATIONS.filter(([id]) => onlyIds.includes(id.split(/\s+/)[0].toLowerCase()))
  : MUTATIONS;
if (selected.length === 0) {
  console.log(`no mutation matches --only ${only}`);
  process.exit(1);
}

const anchorProblems = [];
for (const [id, file, oldText, newText] of selected) {
  const hits = readFileSync(file, 'utf8').split(oldText).length - 1;
  if (hits !== 1) anchorProblems.push(`${id}: anchor matched ${hits}x in ${file}`);
  if (oldText === newText) anchorProblems.push(`${id}: mutation is a no-op`);
}
if (anchorProblems.length > 0) {
  console.log('PREFLIGHT FAILED — the mutation list does not match the source:');
  for (const problem of anchorProblems) console.log(`  ${problem}`);
  process.exit(1);
}
console.log(`preflight  ${selected.length} anchors resolve uniquely`);

const ASSERTION = /AssertionError|Matcher did not succeed|VitestBrowserElementError|Cannot find element with locator/;

function failureKinds(out) {
  const section = out.split(/Failed Tests \d+/)[1] ?? out;
  const kinds = section
    .split(/\n\s*FAIL\s+/)
    .slice(1)
    .map((block) => {
      if (ASSERTION.test(block)) return 'assertion';
      if (block.includes('console.error was called')) return 'console-error';
      return 'crash';
    });
  if (kinds.length === 0 && /Failed to import test file|Unhandled Error/.test(out)) kinds.push('crash');
  return kinds;
}

function tally(kinds) {
  return ['assertion', 'console-error', 'crash', 'unknown']
    .map((kind) => [kind, kinds.filter((k) => k === kind).length])
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(', ');
}

function suite(bail) {
  const result = run(bail ? `${TEST} --bail=1` : TEST);
  const passed = (/Tests\s+(\d+) passed/.exec(result.out) ?? [])[1] ?? '?';
  return { ok: result.ok, passed, out: result.out };
}

mkdirSync(LOGS, { recursive: true });

const startedAt = Date.now();
process.stdout.write('baseline   ... ');
const baseCheck = run(CHECK);
if (Number((/(\d+) ERRORS/.exec(baseCheck.out) ?? [])[1] ?? (baseCheck.ok ? 0 : 1)) > 0) {
  writeFileSync(`${LOGS}/baseline.log`, baseCheck.out);
  console.log(`DOES NOT TYPECHECK — every mutation would report TYPECHECK-FAIL (see ${LOGS}/baseline.log)`);
  process.exit(1);
}
const before = suite(false);
if (!before.ok) {
  writeFileSync(`${LOGS}/baseline.log`, before.out);
  console.log(`NOT GREEN — refusing to mutate a failing tree (see ${LOGS}/baseline.log)`);
  process.exit(1);
}
console.log(`green, ${before.passed} tests\n`);

const results = [];
let caught = 0;
let survived = 0;
let notByAssertion = 0;

for (const [index, [id, file, oldText, newText]] of selected.entries()) {
  const label = `[${String(index + 1).padStart(2)}/${selected.length}] ${id}`.padEnd(46);
  const cellStart = Date.now();
  const original = readFileSync(file, 'utf8');

  inFlight = { id, file, original };
  writeFileSync(JOURNAL, JSON.stringify(inFlight));
  writeFileSync(file, original.replace(oldText, () => newText));

  let outcome;
  let log = '';
  try {
    const typecheck = run(CHECK);
    const errors = Number((/(\d+) ERRORS/.exec(typecheck.out) ?? [])[1] ?? (typecheck.ok ? 0 : 1));
    if (errors > 0) {
      log = typecheck.out;
      outcome = { status: 'TYPECHECK-FAIL', note: 'mutation does not typecheck' };
    } else {
      let tested = suite(true);
      log = tested.out;
      if (tested.ok) {
        outcome = { status: 'SURVIVED', note: 'suite still passed' };
      } else {
        let kinds = failureKinds(tested.out);
        // bail can stop on the console.error guard while a real assertion fails later.
        if (!kinds.includes('assertion')) {
          tested = suite(false);
          log = tested.out;
          kinds = failureKinds(tested.out);
        }
        outcome = kinds.includes('assertion')
          ? { status: 'CAUGHT', note: tally(kinds) }
          : { status: 'CAUGHT-NOT-BY-ASSERTION', note: tally(kinds) || 'no failure parsed' };
      }
    }
  } finally {
    writeFileSync(file, original);
    rmSync(JOURNAL, { force: true });
    inFlight = null;
  }

  writeFileSync(`${LOGS}/${id.split(/\s+/)[0]}.log`, log);

  if (outcome.status === 'CAUGHT') caught += 1;
  if (outcome.status === 'SURVIVED') survived += 1;
  if (outcome.status === 'CAUGHT-NOT-BY-ASSERTION') notByAssertion += 1;
  results.push({ id, file, status: outcome.status, note: outcome.note });

  const done = index + 1;
  const eta = Math.round((((Date.now() - startedAt) / done) * (selected.length - done)) / 1000);
  console.log(
    `${label} ${outcome.status.padEnd(23)} ${outcome.note.padEnd(26)}` +
      ` ${((Date.now() - cellStart) / 1000).toFixed(1)}s  caught ${caught} survived ${survived} weak ${notByAssertion}  eta ${eta}s`,
  );
}

process.stdout.write('\nrestored   ... ');
const after = suite(false);
console.log(after.ok ? `green, ${after.passed} tests` : 'NOT GREEN — TREE LEFT DIRTY, repair before continuing');

console.log('\nSUMMARY');
for (const status of ['CAUGHT', 'CAUGHT-NOT-BY-ASSERTION', 'SURVIVED', 'TYPECHECK-FAIL']) {
  const list = results.filter((r) => r.status === status);
  if (list.length === 0) continue;
  console.log(`  ${status}: ${list.length}`);
  if (status !== 'CAUGHT') for (const r of list) console.log(`      ${r.id}  (${r.note})`);
}
console.log(`  total ${results.length} in ${Math.round((Date.now() - startedAt) / 1000)}s`);

writeFileSync('mutation-results.json', JSON.stringify(results, null, 2));
process.exit(after.ok && survived === 0 && notByAssertion === 0 ? 0 : 1);
