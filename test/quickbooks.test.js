const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Q = require('../js/quickbooks.mjs');
const A = require('../js/accountable.mjs');
const I = require('../js/importer.mjs');

const sample = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'test_accountable_plan_usbank.csv'), 'utf8');
const txns = A.readTransactions(sample).transactions;

test('dates: three styles', () => {
  assert.equal(Q.formatDate('2026-03-05'), '03/05/2026');
  assert.equal(Q.formatDate('2026-03-05', 'DD/MM/YYYY'), '05/03/2026');
  assert.equal(Q.formatDate('2026-03-05', 'YYYY-MM-DD'), '2026-03-05');
  assert.throws(() => Q.formatDate('March 5'), /ISO/);
});

test('descriptions: unsafe characters are replaced and whitespace collapsed', () => {
  assert.equal(Q.cleanDescription('  DEBIT   PURCHASE\tAMAZON MKTPL*2K4L1 '), 'DEBIT PURCHASE AMAZON MKTPL*2K4L1');
  assert.equal(Q.cleanDescription('CAFÉ "MÜNCHEN" <b>'), 'CAF M NCHEN b');
  assert.equal(Q.cleanDescription('x'.repeat(300)).length, 150);
  assert.equal(Q.cleanDescription(null), '');
});

test('three-column layout keeps the sign of the amount', () => {
  const rows = Q.toRows([{ date: '2025-10-01', name: 'PAY', amount: 7625.05 }, { date: '2025-10-02', name: 'RENT', amount: -3412.18 }]);
  assert.deepEqual(rows, [['10/01/2025', 'PAY', '7625.05'], ['10/02/2025', 'RENT', '-3412.18']]);
});

test('four-column layout puts money in under Credit and money out under Debit, both positive', () => {
  const rows = Q.toRows([{ date: '2025-10-01', name: 'PAY', amount: 7625.05 }, { date: '2025-10-02', name: 'RENT', amount: -3412.18 }], { layout: 'four' });
  assert.deepEqual(rows, [['10/01/2025', 'PAY', '7625.05', ''], ['10/02/2025', 'RENT', '', '3412.18']]);
});

test('csv: header, CRLF endings and quoting of commas and quotes', () => {
  const csv = Q.toCsv([['10/01/2025', 'ACME, INC "WEST"', '-5.00']]);
  assert.equal(csv, 'Date,Description,Amount\r\n10/01/2025,"ACME, INC ""WEST""",-5.00\r\n');
});

test('chunking splits rows and never returns zero files', () => {
  assert.deepEqual(Q.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(Q.chunk([], 10), [[]]);
  assert.deepEqual(Q.chunk([1, 2], 0), [[1], [2]]);
});

test('full sample exports every row and the totals match', () => {
  const out = Q.buildExport(txns);
  assert.equal(out.files.length, 1);
  assert.equal(out.files[0].rows, 236);
  assert.equal(out.files[0].text.trim().split('\r\n').length, 237, 'header plus 236 rows');
  const net = Math.round((out.summary.moneyIn - out.summary.moneyOut) * 100) / 100;
  assert.equal(net, Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100);
});

test('a small row limit splits into numbered files that add back up', () => {
  const out = Q.buildExport(txns, { maxRows: 100 });
  assert.equal(out.files.length, 3);
  assert.deepEqual(out.files.map(f => f.rows), [100, 100, 36]);
  assert.equal(out.files[0].name, 'quickbooks-import-1-of-3.csv');
});

test('business-only scope exports just the business-tagged rows', () => {
  const business = txns.filter(t => I.tagLocal(t).tag === 'Business');
  assert.ok(business.length > 0 && business.length < txns.length);
  assert.equal(Q.buildExport(business).files[0].rows, business.length);
});
