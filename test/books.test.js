const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/accountable.mjs');
const D = require('../js/dataset.mjs');
const T = require('../js/taxplan.mjs');
const F = require('../js/forecast.mjs');
const P = require('../js/paycheck.mjs');
const I = require('../js/importer.mjs');
const B = require('../js/books.mjs');

const sample = fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', 'test_accountable_plan_usbank.csv'), 'utf8');
const txns = A.readTransactions(sample).transactions;

test('dataset: canonical CSV round-trips and describes the span', () => {
  const csv = D.toCanonicalCsv(txns);
  const back = D.fromCanonicalCsv(csv);
  assert.equal(back.length, txns.length);
  assert.deepEqual(back[5], txns[5]);
  const d = D.describe(txns);
  assert.equal(d.count, 236);
  assert.equal(d.months, 12);
  assert.equal(D.describe([]).count, 0);
  // Commas and quotes in a name survive.
  const odd = D.fromCanonicalCsv(D.toCanonicalCsv([{ date: '2025-01-02', name: 'ACME, "WEST" INC', amount: -5 }]));
  assert.equal(odd[0].name, 'ACME, "WEST" INC');
});

test('tax planner: due dates move off weekends', () => {
  const q25 = T.quarters(2025).map(q => q.due);
  assert.deepEqual(q25, ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15']); // Jun 15 2025 is a Sunday
  const q26 = T.quarters(2026).map(q => q.due);
  assert.deepEqual(q26, ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15']);
  assert.equal(T.nextBusinessDay('2026-02-14'), '2026-02-16'); // Saturday to Monday
});

test('tax planner: safe harbor uses the smaller of 90% current and prior-year tax', () => {
  assert.deepEqual(T.requiredAnnual({ currentYearTax: 10000 }), { amount: 9000, basis: "90% of this year's estimated tax" });
  assert.equal(T.requiredAnnual({ currentYearTax: 10000, priorYearTax: 6000 }).amount, 6000);
  assert.equal(T.requiredAnnual({ currentYearTax: 10000, priorYearTax: 6000, priorAgiOver150k: true }).amount, 6600);
  assert.equal(T.requiredAnnual({ currentYearTax: 10000, priorYearTax: 20000 }).amount, 9000);
});

test('tax planner: schedule compares what is set aside with what is due', () => {
  const monthly = { months: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'], income: [4000, 4000, 4000, 4000, 4000] };
  const rows = T.schedule({ taxYear: 2026, required: 8000, taxRate: 0.25, monthly, today: '2026-05-01' });
  assert.equal(rows[0].amountDue, 2000);
  assert.equal(rows[0].setAside, 3000); // 12,000 income through March at 25%
  assert.equal(rows[0].status, 'Covered'); // due Apr 15, already past
  assert.equal(rows[1].cumulativeRequired, 4000);
  assert.equal(rows[1].setAside, 5000);
  assert.equal(rows[1].status, 'On track'); // due Jun 15, still ahead
  assert.equal(rows[2].status, 'No data yet', 'data does not reach August');

  const lean = T.schedule({ taxYear: 2026, required: 16000, taxRate: 0.1, monthly, today: '2026-05-01' });
  assert.equal(lean[0].status, 'Short');
  assert.equal(lean[0].gap, 2800);
});

test('forecast: expected uses the recent average and lean uses the recent low', () => {
  const f = F.projectPot({ history: [0, 6000, 9000, 3000], paycheck: 3000, taxRate: 0.25, startPot: 2000 });
  assert.equal(f.expectedIncome, 6000);
  assert.equal(f.leanIncome, 3000);
  assert.equal(f.expected.length, 3);
  assert.ok(f.lean[2].pot <= f.expected[2].pot, 'lean never ends ahead of expected');
  assert.ok(f.lean.some(r => r.shortfall > 0), 'a lean run can fall short');
});

test('learned tags beat the rules', () => {
  const t = { name: 'DEBIT PURCHASE TRADER JOE S #021', amount: -40 };
  assert.equal(I.tagLocal(t).tag, 'Personal');
  const learned = { [I.merchantKey(t.name)]: 'Business' };
  assert.equal(I.applyLearned(I.tagLocal(t), t.name, learned).tag, 'Business');
  assert.equal(I.applyLearned(I.tagLocal(t), t.name, learned).source, 'you');
  assert.equal(I.applyLearned(I.tagLocal(t), t.name, {}).tag, 'Personal');
  assert.equal(B.tagFor(t, learned).tag, 'Business');
});

test('books summary ties the tabs together on the sample file', () => {
  const b = B.summarizeBooks(txns, { today: '2026-10-30' });
  assert.equal(b.empty, false);
  assert.equal(b.span.count, 236);
  assert.equal(b.monthly.months.length, 12);
  assert.equal(b.plan.total, 11655.8);
  assert.ok(b.recommended > 0);
  assert.equal(b.pot.shortfalls, 0, 'the recommended paycheck had no short month');
  assert.equal(b.forecast.expected.length, 3);
  assert.equal(b.tax.quarterly.length, 4);
  assert.equal(b.tax.taxYear, 2026);
  assert.ok(b.rate > 0.1 && b.rate < 0.5);
  assert.ok(b.tags.business > 0 && b.tags.personal > b.tags.business);
  assert.ok(b.tags.needsReview > 0);
});

test('learned tags change the books totals', () => {
  const plain = B.summarizeBooks(txns, { today: '2026-10-30' });
  const grocer = txns.find(t => /TRADER JOE/.test(t.name));
  const learned = { [I.merchantKey(grocer.name)]: 'Business' };
  const taught = B.summarizeBooks(txns, { learned, today: '2026-10-30' });
  assert.ok(taught.tags.business > plain.tags.business);
  assert.equal(Math.round((taught.tags.business + taught.tags.personal) * 100), Math.round((plain.tags.business + plain.tags.personal) * 100));
});

test('an empty dataset is reported, not computed', () => {
  assert.equal(B.summarizeBooks([]).empty, true);
});

test('income months feed the paycheck engine', () => {
  const b = B.summarizeBooks(txns, { today: '2026-10-30' });
  const again = P.maxSafePaycheck({ income: b.monthly.income, taxRate: b.rate });
  assert.equal(again, b.recommended);
});
