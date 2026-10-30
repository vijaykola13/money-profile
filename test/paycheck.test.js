const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/accountable.mjs');
const P = require('../js/paycheck.mjs');
const E = require('../js/engine.mjs');
const TAX = require('../js/tax2025.mjs').default;

const D = P.DEMO_IRREGULAR;

test('simulate: money is conserved and nothing goes negative', () => {
  const rows = P.simulate({ income: D.income, paycheck: 3000, taxRate: 0.25, startPot: 500 });
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  assert.ok(Math.abs(sum('income') - (sum('setAside') + sum('net'))) < 0.02, 'income = set-aside + net');
  const last = rows[rows.length - 1];
  assert.ok(Math.abs(500 + sum('net') - sum('paid') - last.pot) < 0.02, 'pot = start + net - paid');
  assert.ok(rows.every(r => r.pot >= 0 && r.paid <= 3000));
  assert.ok(Math.abs(last.taxPot - sum('setAside')) < 0.02);
});

test('a paycheck the pot cannot cover is a shortfall, not a negative balance', () => {
  const rows = P.simulate({ income: [1000, 0], paycheck: 2000, taxRate: 0.2, startPot: 0 });
  assert.equal(rows[0].paid, 800);
  assert.equal(rows[0].shortfall, 1200);
  assert.equal(rows[0].pot, 0);
  assert.equal(rows[1].paid, 0);
});

test('maxSafePaycheck is the largest whole-dollar amount with no shortfall', () => {
  const args = { income: D.income, taxRate: 0.25, startPot: 0 };
  const best = P.maxSafePaycheck(args);
  assert.ok(best > 0);
  assert.ok(P.simulate({ ...args, paycheck: best }).every(r => r.shortfall === 0));
  assert.ok(P.simulate({ ...args, paycheck: best + 1 }).some(r => r.shortfall > 0));
});

test('a starting pot raises the safe paycheck', () => {
  const base = P.maxSafePaycheck({ income: D.income, taxRate: 0.25, startPot: 0 });
  const more = P.maxSafePaycheck({ income: D.income, taxRate: 0.25, startPot: 6000 });
  assert.ok(more > base);
});

test('income by month fills quiet months and reads the sample bank file', () => {
  const r = P.incomeByMonth([{ date: '2025-01-05', amount: 100 }, { date: '2025-04-20', amount: 50 }], ['2025-01-01', '2025-04-30']);
  assert.deepEqual(r.months, ['2025-01', '2025-02', '2025-03', '2025-04']);
  assert.deepEqual(r.income, [100, 0, 0, 50]);

  const text = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'test_accountable_plan_usbank.csv'), 'utf8');
  const rows = A.classifyAll(A.readTransactions(text).transactions);
  const income = rows.filter(x => x.category === 'Owner draw / income' || x.category === 'Client payment');
  const out = P.incomeByMonth(income, rows.map(x => x.date));
  assert.equal(out.months.length, 12);
  assert.ok(out.income.every(x => x > 0));
});

test('swing is zero for steady income and positive for uneven income', () => {
  assert.equal(P.swing([100, 100, 100]), 0);
  assert.ok(P.swing(D.income) > 0.5);
  assert.equal(P.swing([0, 0]), 0);
});

test('suggested set-aside rate adds a buffer and rounds up', () => {
  assert.equal(P.suggestRate(20000, 100000), 0.22);
  assert.equal(P.suggestRate(0, 0), 0);
  assert.equal(P.suggestRate(90000, 100000), 0.6, 'capped');
  // Uses the real estimator: 1099 income of $60,000 should land between 15% and 40%.
  const t = E.estimateTax({ filingStatus: 'single', wages: 0, selfEmployment: 60000, withholding: null }, TAX);
  const rate = P.suggestRate(t.total, 60000);
  assert.ok(rate > 0.15 && rate < 0.4, `rate was ${rate}`);
});

test('summary reports totals, shortfalls and runway', () => {
  const rows = P.simulate({ income: D.income, paycheck: P.maxSafePaycheck({ income: D.income, taxRate: 0.25 }), taxRate: 0.25 });
  const s = P.summarize(rows, 3000);
  assert.equal(s.shortfalls, 0);
  assert.equal(s.totalIncome, D.income.reduce((a, b) => a + b, 0));
  assert.ok(s.minPot >= 0);
});
