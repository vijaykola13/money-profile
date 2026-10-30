const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const I = require('../js/importer.mjs');
const A = require('../js/accountable.mjs');

const sample = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'test_accountable_plan_usbank.csv'), 'utf8');
const sampleTxns = A.readTransactions(sample).transactions;

const load = text => {
  const table = I.parseCsv(text);
  return { headers: table[0], rows: table.slice(1) };
};

test('dates: common bank formats become ISO, bad ones become null', () => {
  assert.equal(I.toIsoDate('2025-10-01'), '2025-10-01');
  assert.equal(I.toIsoDate('3/5/2026'), '2026-03-05');
  assert.equal(I.toIsoDate('3/5/26'), '2026-03-05');
  assert.equal(I.toIsoDate('Oct 5, 2025'), '2025-10-05');
  assert.equal(I.toIsoDate('5-Oct-2025'), '2025-10-05');
  assert.equal(I.toIsoDate('2/31/2026'), null);
  assert.equal(I.toIsoDate('sometime in March'), null);
});

test('clean US Bank export maps with no changes', () => {
  const { headers, rows } = load(sample);
  const guess = I.guessMapping(headers);
  const v = I.validateMapping(headers, rows, guess);
  assert.deepEqual(v.errors, []);
  assert.equal(headers[v.mapping.date], 'Date');
  assert.equal(headers[v.mapping.name], 'Name');
  assert.equal(headers[v.mapping.amount], 'Amount');
  const { transactions, skipped, duplicates } = I.applyMapping(rows, v.mapping);
  assert.equal(transactions.length, 236);
  assert.equal(skipped.length + duplicates.length, 0);
});

test('messy export: debit/credit columns, running balance, junk column, bad row, duplicate line', () => {
  const messy = I.makeMessyDemo(sample);
  const { headers, rows } = load(messy);
  const guess = I.guessMapping(headers);
  assert.equal(headers[guess.balance], 'Running Bal.');
  assert.equal(guess.amount, -1, 'there is no single amount column');

  const v = I.validateMapping(headers, rows, guess);
  assert.deepEqual(v.errors, []);
  assert.equal(headers[v.mapping.debit], 'Withdrawals');
  assert.equal(headers[v.mapping.credit], 'Deposits');

  const r = I.applyMapping(rows, v.mapping);
  assert.equal(r.transactions.length, 236, 'every real transaction is read');
  assert.equal(r.skipped.length, 1, 'the garbled row goes to needs review');
  assert.match(r.skipped[0].reason, /Date/);
  assert.equal(r.duplicates.length, 1, 'the duplicated line is skipped');

  // Signs and amounts agree with the original file.
  const total = x => Math.round(x.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  assert.equal(total(r.transactions), total(sampleTxns));
});

test('a Balance column picked as the amount is rejected; Debit and Credit are used instead', () => {
  const { headers, rows } = load(I.makeMessyDemo(sample));
  const balanceIdx = headers.indexOf('Running Bal.');
  const bad = {
    date: headers.indexOf('Posted'), name: headers.indexOf('Description'), amount: balanceIdx,
    debit: headers.indexOf('Withdrawals'), credit: headers.indexOf('Deposits'), balance: -1
  };
  const v = I.validateMapping(headers, rows, bad);
  assert.ok(v.notes.some(n => /Rejected "Running Bal\."/.test(n)));
  assert.equal(v.mapping.amount, -1, 'a Withdrawals-only column is not a safe stand-in for the amount');
  assert.deepEqual(v.errors, []);
  assert.equal(I.applyMapping(rows, v.mapping).transactions.length, 236, 'deposits are not lost');
});

test('running balance is detected by its values even when the header does not say so', () => {
  const lines = ['Date,Description,Amount,Total'];
  let total = 1000;
  for (let i = 1; i <= 8; i++) { total = Math.round((total - 10 * i) * 100) / 100; lines.push(`2025-01-0${i},SHOP ${i},${-10 * i},${total}`); }
  const { headers, rows } = load(lines.join('\n'));
  const bad = { date: 0, name: 1, amount: 3, debit: -1, credit: -1, balance: -1 }; // "Total" is the balance
  const v = I.validateMapping(headers, rows, bad);
  assert.equal(v.mapping.amount, 2, 'repaired to the real Amount column');
  assert.ok(v.notes.length >= 1);
});

test('mapping problems are reported, not guessed around', () => {
  const { headers, rows } = load('Foo,Bar\nx,y\nz,w\n');
  const v = I.validateMapping(headers, rows, I.guessMapping(headers));
  assert.ok(v.errors.length >= 2);
});

test('AI mapping names become indexes and unknown names are dropped', () => {
  const m = I.mappingFromNames(['Posted', 'Details', 'Amt'], { date: 'posted', name: 'Details', amount: 'Amt', balance: 'Nope' });
  assert.deepEqual([m.date, m.name, m.amount, m.balance], [0, 1, 2, -1]);
});

test('header key is stable across case and spacing', () => {
  assert.equal(I.headerKey([' Date ', 'Name']), I.headerKey(['date', 'name']));
});

test('tagging: business signals, personal costs and uncertain merchants', () => {
  const t = n => I.tagLocal({ name: n, amount: -50 });
  assert.equal(t('DEBIT PURCHASE GITHUB INC').tag, 'Business');
  assert.equal(t('DEBIT PURCHASE ADOBE CREATIVE').tag, 'Business');
  assert.equal(t('DEBIT PURCHASE TRADER JOE S #021').tag, 'Personal');
  assert.equal(t('DEBIT PURCHASE 24 HOUR FITNESS').tag, 'Personal');
  assert.equal(t('DEBIT PURCHASE STARBUCKS STORE 08812').confidence, 'low');
  assert.equal(t('SOMETHING NEVER SEEN').confidence, 'low');
  assert.equal(I.tagLocal({ name: 'MOBILE CHECK DEPOSIT', amount: 900 }).tag, 'Business');
  assert.ok(t('DEBIT PURCHASE GITHUB INC').reason.length > 5);
});

test('every sample transaction gets a tag and a reason', () => {
  const tags = sampleTxns.map(I.tagLocal);
  assert.ok(tags.every(x => (x.tag === 'Business' || x.tag === 'Personal') && x.reason));
});

test('merchant keys ignore store numbers and bank prefixes', () => {
  assert.equal(I.merchantKey('DEBIT PURCHASE RALPHS #0123'), I.merchantKey('DEBIT PURCHASE RALPHS #0456'));
  assert.notEqual(I.merchantKey('DEBIT PURCHASE RALPHS #0123'), I.merchantKey('DEBIT PURCHASE VONS #2105'));
});

test('AI tags are cleaned: unknown tags dropped, reasons trimmed to one short line', () => {
  assert.equal(I.cleanAiTag({ tag: 'Maybe', reason: 'x' }), null);
  assert.equal(I.cleanAiTag({ tag: 'Business', reason: '   ' }), null);
  const c = I.cleanAiTag({ tag: 'Business', reason: 'A\n   very   long '.repeat(40) });
  assert.ok(c.reason.length <= 140 && !c.reason.includes('\n'));
  assert.equal(c.source, 'ai');
});
