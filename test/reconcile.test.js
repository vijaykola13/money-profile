const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/accountable.mjs');
const R = require('../js/reconcile.mjs');

const text = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'test_accountable_plan_usbank.csv'), 'utf8');
const txns = A.readTransactions(text).transactions;
const START = 10000;
const net = R.round2(txns.reduce((s, t) => s + t.amount, 0));
const ending = R.round2(START + net);

const rowsOf = list => R.withKeys(list).map((r, i) => ({ ...r, id: i }));
const allIds = rows => new Set(rows.map(r => r.id));

test('checking: ticking everything reconciles the full sample to $0.00', () => {
  const rows = rowsOf(txns);
  assert.equal(R.difference('checking', START, ending, rows), 0);
  assert.deepEqual(R.suggestCauses({ type: 'checking', starting: START, ending, rows, tickedIds: allIds(rows) }), []);
});

test('difference updates as rows are ticked', () => {
  const rows = rowsOf(txns);
  assert.equal(R.difference('checking', START, ending, []), R.round2(START - ending));
  assert.equal(R.difference('checking', START, ending, rows.slice(0, 1)), R.round2(START + rows[0].amount - ending));
});

test('a missing mortgage row is caught and named', () => {
  const { transactions, removed } = R.dropDemoRow(txns);
  assert.ok(removed && /PACIFICA/.test(removed.name));
  assert.equal(transactions.length, txns.length - 1);

  const rows = rowsOf(transactions);
  const diff = R.difference('checking', START, ending, rows);
  assert.equal(diff, R.round2(-removed.amount), 'gap equals the missing amount with the opposite sign');

  const causes = R.suggestCauses({ type: 'checking', starting: START, ending, rows, tickedIds: allIds(rows) });
  const missing = causes.find(c => c.kind === 'missing');
  assert.ok(missing, 'suggests a missing transaction');
  assert.match(missing.detail, /PACIFICA/);
  assert.match(missing.detail, /2026-03/);
  assert.match(missing.detail, /3,412\.18/);
});

test('unticked rows that close the gap are called out', () => {
  const rows = rowsOf(txns);
  const ticked = new Set(rows.slice(0, rows.length - 3).map(r => r.id));
  const causes = R.suggestCauses({ type: 'checking', starting: START, ending, rows, tickedIds: ticked });
  assert.equal(causes[0].kind, 'unticked');
  assert.match(causes[0].detail, /closes the gap exactly/);
});

test('credit card: charges raise the balance owed', () => {
  const rows = rowsOf([
    { date: '2025-01-02', name: 'SHOP', amount: -50 },
    { date: '2025-01-03', name: 'PAYMENT', amount: 30 }
  ]);
  assert.equal(R.computedBalance('credit', 100, rows), 120); // 100 owed + 50 charge - 30 payment
  assert.equal(R.difference('credit', 100, 120, rows), 0);
});

test('duplicate and sign mistakes are suggested', () => {
  const dup = rowsOf([
    { date: '2025-01-02', name: 'COFFEE', amount: -5 },
    { date: '2025-01-02', name: 'COFFEE', amount: -5 },
    { date: '2025-01-03', name: 'RENT', amount: -100 }
  ]);
  const dupCauses = R.suggestCauses({ type: 'checking', starting: 1000, ending: 895, rows: dup, tickedIds: allIds(dup) });
  assert.ok(dupCauses.some(c => c.kind === 'duplicate'));

  const flip = rowsOf([{ date: '2025-01-02', name: 'REFUND', amount: -40 }, { date: '2025-01-03', name: 'RENT', amount: -100 }]);
  const flipCauses = R.suggestCauses({ type: 'checking', starting: 1000, ending: 940, rows: flip, tickedIds: allIds(flip) });
  assert.ok(flipCauses.some(c => c.kind === 'sign'));
});

test('finishing carries the balance forward and locks rows against re-import', () => {
  const rows = rowsOf(txns);
  const account = { type: 'checking', starting: START, asOf: '2025-09-30' };
  const next = R.carryForward(account, ending, rows);
  assert.equal(next.starting, ending);
  assert.equal(next.asOf, rows.map(r => r.date).sort().pop(), 'as of the last transaction date');

  const { fresh, skipped } = R.skipLocked(rowsOf(txns), rows.map(r => r.key));
  assert.equal(fresh.length, 0);
  assert.equal(skipped.length, txns.length);
});

test('identical rows on the same day get distinct keys', () => {
  const k = R.withKeys([{ date: 'd', name: 'n', amount: -1 }, { date: 'd', name: 'n', amount: -1 }]).map(r => r.key);
  assert.notEqual(k[0], k[1]);
});
