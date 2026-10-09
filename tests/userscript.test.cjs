// Tests use Node.js built-ins only (no npm install needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'copilot-workday-budget.user.js'), 'utf8'
);

function loadBudgetHelpers(initialStorage = {}) {
  const values = new Map(Object.entries(initialStorage));
  // Expose otherwise-private pure helpers in the test VM without changing the
  // actual published userscript.
  const instrumented = script.replace(
    '  function update() {',
    '  globalThis.__budgetTest = { calculate, statusFor, workdays, currentVacationDays, includeToday };\n  function update() {'
  );
  assert.notEqual(instrumented, script, 'Expected test hook was not inserted');
  const sandbox = {
    document: { documentElement: {} },
    location: { pathname: '/not-a-matching-page' },
    MutationObserver: class { observe() {} },
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => { values.set(key, value); },
    setInterval: () => 0,
    setTimeout: () => 0,
    Intl, Date, Number, Math, String, Set, console
  };
  vm.runInNewContext(instrumented, sandbox, { filename: 'copilot-workday-budget.user.js' });
  return { ...sandbox.__budgetTest, values };
}

test('shipping metadata points at the canonical GitHub repository', () => {
  const expected = 'https://raw.githubusercontent.com/Nimetko/copilot-workday-budget/main/copilot-workday-budget.user.js';
  assert.match(script, /^\/\/ @version\s+1\.5\.1\s*$/m);
  assert.ok(script.includes(`// @updateURL    ${expected}`));
  assert.ok(script.includes(`// @downloadURL  ${expected}`));
  assert.match(script, /^\/\/ @match\s+https:\/\/github\.com\/settings\/copilot\/features\*\s*$/m);
});

test('October 2026: budget correctly counts weekdays and vacation', () => {
  const { calculate } = loadBudgetHelpers();
  const data = calculate(new Date(2026, 9, 9, 12, 0), 6242, 15000, 2, true);
  assert.equal(data.monthWeekdays, 22);
  assert.equal(data.remainingWorkdays, 14);
  assert.equal(data.left, 8758);
  assert.equal(data.plannedDaily, 750);
  assert.ok(Math.abs(data.availableDaily - 8758 / 14) < 0.001);
});

test('unchecking Include today removes the current weekday', () => {
  const { calculate } = loadBudgetHelpers();
  const today = new Date(2026, 9, 9, 12, 0);
  const on = calculate(today, 1000, 15000, 0, true);
  const off = calculate(today, 1000, 15000, 0, false);
  assert.equal(on.remainingWorkdays - off.remainingWorkdays, 1);
});

test('vacation days never exceed available remaining weekdays', () => {
  const { calculate } = loadBudgetHelpers();
  const data = calculate(new Date(2026, 9, 30, 12, 0), 100, 15000, 31, true);
  assert.equal(data.effectiveVacation, 1);
  assert.equal(data.remainingWorkdays, 0);
  assert.equal(data.availableDaily, null);
});

test('budget exhausted is reported even before end of month', () => {
  const { calculate, statusFor } = loadBudgetHelpers();
  const data = calculate(new Date(2026, 9, 9, 12, 0), 15000, 15000, 0, true);
  assert.equal(statusFor(15000, 15000, data).label, 'Budget exhausted');
});

test('v1.4 vacation dates migrate to the current month count', () => {
  const { currentVacationDays, values } = loadBudgetHelpers({
    copilotVacationDates: [
      '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-12', '2026-09-15'
    ]
  });
  assert.equal(currentVacationDays('2026-10-09'), 2);
  assert.equal(values.get('copilotRemainingVacationDays:2026-10'), 2);
});

test('Include today preference expires at the next calendar day', () => {
  const { includeToday } = loadBudgetHelpers({
    copilotIncludeTodayByDate: { date: '2026-10-09', include: false }
  });
  assert.equal(includeToday('2026-10-09'), false);
  assert.equal(includeToday('2026-10-10'), true);
});
