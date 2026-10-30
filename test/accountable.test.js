const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/accountable.mjs');
const sample = n => fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', n), 'utf8');

const input = sample('test_accountable_plan_usbank.csv');
const key = sample('test_accountable_plan_answer_key.csv');

test('csv: reads the US Bank export and ignores a Balance column', () => {
  const r = A.readTransactions(input);
  assert.equal(r.transactions.length, 236);
  assert.equal(r.skipped.length, 0);

  const withBalance = A.readTransactions('Date,Name,Balance,Amount\n2025-01-02,ACME,1000.00,-5.00\n2025-01-03,SHOP,995.00,-7.50\n');
  assert.equal(withBalance.mapping.amount, 3, 'Amount must be column 3, not Balance');
  assert.equal(withBalance.transactions[0].amount, -5);
  assert.ok(withBalance.warnings.some(w => /Balance/.test(w)));
});

test('csv: rows it cannot read are reported, not guessed', () => {
  const r = A.readTransactions('Date,Name,Amount\n2025-01-02,ACME,-5.00\nnot-a-date,ODD,-1.00\n2025-01-04,NOAMT,\n');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.skipped.length, 2);
});

test('classifier matches the answer key on every transaction', () => {
  const rows = A.classifyAll(A.readTransactions(input).transactions);
  const s = A.scoreAgainstKey(rows, key);
  assert.deepEqual(s.mismatches, []);
  assert.equal(s.matched, 236);
  assert.equal(s.missing, 0);
  assert.equal(s.categoryOk, 236);
  assert.equal(s.eligibilityOk, 236);
  assert.equal(s.amountOk, 236);
});

test('totals match the key: 73 eligible, $11,656 overall', () => {
  const sum = A.summarize(A.classifyAll(A.readTransactions(input).transactions));
  assert.equal(sum.eligibleCount, 73);
  assert.equal(sum.buckets['Home office'], 6721.43);
  assert.equal(sum.buckets.Medical, 3298.93);
  assert.equal(sum.buckets['Company car'], 1635.44);
  assert.equal(sum.total, 11655.8);
  assert.equal(sum.needsReview, 0);
});

test('look-alikes are told apart', () => {
  const c = n => A.classify({ date: '2025-01-01', name: n, amount: -100 });
  assert.equal(c('DEBIT PURCHASE CVS/PHARMACY RX #9921').eligible, true);
  assert.equal(c('DEBIT PURCHASE CVS/PHARMACY #9921').eligible, false);
  assert.equal(c('ELECTRONIC WITHDRAWAL GEICO AUTO POL 2290').eligible, false);
  assert.equal(c('ELECTRONIC WITHDRAWAL PROGRESSIVE INS POL 7781').pct, 80);
  assert.equal(c('DEBIT PURCHASE VCA ANIMAL HOSPITAL').eligible, false);
  assert.equal(c('DEBIT PURCHASE 24 HOUR FITNESS').eligible, false);
  assert.equal(c('WEB AUTHORIZED PMT COX COMMUNICATIONS').eligible, false);
  assert.equal(c('WEB AUTHORIZED PMT CHASE CREDIT CRD').eligible, false);
  assert.equal(c('SOMETHING NEVER SEEN BEFORE').needsReview, true);
});

test('plan percentages are inputs and credits are never reimbursable', () => {
  const plan = { ...A.DEFAULT_PLAN, homeOffice: 20 };
  assert.equal(A.classify({ date: '2025-01-01', name: 'WEB AUTHORIZED PMT PACIFICA HOME LOANS', amount: -1000 }, plan).reimbursable, 200);
  assert.equal(A.classify({ date: '2025-01-01', name: 'ELECTRONIC DEPOSIT ACME', amount: 5000 }).reimbursable, 0);
});

test('manual override changes the bucket and the amount', () => {
  const row = { id: 0, ...A.classify({ date: '2025-01-01', name: 'SOMETHING NEW', amount: -200 }) };
  const edited = A.applyOverride(row, 'Medical');
  assert.equal(edited.reimbursable, 200);
  assert.equal(edited.edited, true);
  assert.equal(A.applyOverride(edited, 'Not eligible').reimbursable, 0);
});
