const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/mortgage.mjs');

const sample = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', f), 'utf8');
const close = (a, b, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('reads the servicer sample: two tax years, every row adds up', () => {
  const r = M.readMortgage(sample('mortgage_payment_history.csv'));
  assert.equal(r.rows.length, 24);
  assert.equal(r.hasInterest, true);
  assert.equal(r.skipped.length, 0);
  for (const x of r.rows) close(x.principal + x.interest + x.escrow + x.fees, x.payment);
  const years = M.byYear(r.rows);
  assert.deepEqual(years.map(y => y.year), [2024, 2025]);
  assert.equal(years[0].count, 12);
  assert.equal(years[0].partial, false);
  close(years[0].interest, r.rows.filter(x => x.year === 2024).reduce((s, x) => s + x.interest, 0));
  assert.ok(years[1].interest < years[0].interest, 'interest falls as the loan is paid down');
  assert.ok(years[1].endBalance < years[0].endBalance);
});

test('copes with other header names, US dates, negatives and brackets', () => {
  const csv = [
    'Payment Date,Total Payment,Principal,Interest Paid,Escrow Payment,Principal Balance',
    '1/1/2025,"($3,412.18)",426.98,"2,343.75",641.45,"449,573.02"',
    '02/01/2025,-3412.18,429.20,2341.53,641.45,449143.82'
  ].join('\n');
  const r = M.readMortgage(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].date, '2025-01-01');
  assert.equal(r.rows[0].payment, 3412.18);
  assert.equal(r.rows[0].interest, 2343.75);
  assert.equal(r.rows[0].balance, 449573.02);
});

test('works out interest when the file only has payment, principal and escrow', () => {
  const r = M.readMortgage('Date,Payment,Principal,Escrow\n2025-01-01,3412.18,426.98,641.45\n');
  assert.equal(r.hasInterest, true);
  assert.equal(r.rows[0].derived, true);
  close(r.rows[0].interest, 2343.75);
});

test('skips unreadable rows and exact duplicates, and says so', () => {
  const csv = 'Date,Payment,Principal,Interest\n2025-01-01,3000,500,2500\n2025-01-01,3000,500,2500\nnot a date,3000,500,2500\n2025-02-01,,,\n';
  const r = M.readMortgage(csv);
  assert.equal(r.rows.length, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.skipped.length, 2);
});

test('a file with no interest asks for loan terms; the estimate matches the servicer figures', () => {
  const only = M.readMortgage(sample('mortgage_payments_only.csv'));
  assert.equal(only.hasInterest, false);
  assert.equal(only.rows.length, 24);
  assert.equal(M.estimate(only.rows, { rate: '', balance: '' }).ok, false);

  const est = M.estimate(only.rows, { rate: 6.25, balance: 450000, escrow: 641.45 });
  assert.equal(est.ok, true);
  assert.ok(est.rows.every(x => x.estimated));
  const real = M.readMortgage(sample('mortgage_payment_history.csv')).rows;
  est.rows.forEach((x, i) => close(x.interest, real[i].interest, 0.02));
  close(M.byYear(est.rows)[1].interest, M.byYear(real)[1].interest, 0.5);
});

test('takes the mortgage payments out of bank transactions', () => {
  const rows = M.paymentsFromTransactions([
    { date: '2025-10-01', name: 'WEB AUTHORIZED PMT PACIFICA HOME LOANS', amount: -3412.18 },
    { date: '2025-10-02', name: 'ELECTRONIC DEPOSIT ACME', amount: 5000 },
    { date: '2025-10-03', name: 'COSTCO', amount: -90 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payment, 3412.18);
  assert.equal(rows[0].interest, null);
});

test('pivot and monthly agree with the yearly totals', () => {
  const rows = M.readMortgage(sample('mortgage_payment_history.csv')).rows;
  const years = M.byYear(rows);
  const p = M.pivot(rows, 'interest');
  assert.deepEqual(p.years, [2024, 2025]);
  assert.equal(p.cells.length, 12);
  close(p.totals[0], years[0].interest);
  close(p.totals[1], years[1].interest);
  const m = M.monthly(rows, 2025);
  close(m.interest.reduce((s, x) => s + x, 0), years[1].interest);
  close(M.pivot(rows, 'escrow').totals[0], years[0].escrow);
  assert.ok(p.max > 0);
});

test('deduction: no home office means all interest goes to Schedule A', () => {
  const d = M.deduction({ interest: 27000, filing: 'single', officeSqft: 0, homeSqft: 2000, otherItemized: 0, marginalRate: 0.24 });
  assert.equal(d.business, 0);
  assert.equal(d.personal, 27000);
  assert.equal(d.standard, 15750);
  assert.equal(d.itemize, true);
  close(d.personalSaved, (27000 - 15750) * 0.24);
});

test('deduction: the office share comes off the interest, the rest stays personal', () => {
  const d = M.deduction({ interest: 27000, filing: 'single', officeSqft: 200, homeSqft: 2000, otherItemized: 5000, marginalRate: 0.22 });
  assert.equal(d.officePct, 10);
  assert.equal(d.business, 2700);
  assert.equal(d.personal, 24300);
  assert.equal(d.itemized, 29300);
  close(d.businessSaved, 2700 * 0.22);
  // Without the mortgage this person would take the standard deduction, so the interest adds 29,300 - 15,750.
  close(d.personalSaved, (29300 - 15750) * 0.22);
  close(d.totalSaved, d.businessSaved + d.personalSaved);
});

test('deduction: when itemizing does not beat the standard deduction, no Schedule A benefit', () => {
  const d = M.deduction({ interest: 8000, filing: 'single', officeSqft: 0, homeSqft: 0, otherItemized: 0, marginalRate: 0.22 });
  assert.equal(d.itemize, false);
  assert.equal(d.personalSaved, 0);
  assert.equal(d.shortOfStandard, 15750 - 8000);
  const joint = M.deduction({ interest: 27000, filing: 'mfj', officeSqft: 0, homeSqft: 0, otherItemized: 0, marginalRate: 0.22 });
  assert.equal(joint.standard, 31500);
  assert.equal(joint.itemize, false);
});

test('deduction: debt over the limit is prorated, and older loans get the higher limit', () => {
  const capped = M.deduction({ interest: 60000, avgBalance: 1000000, filing: 'single', otherItemized: 0, marginalRate: 0.24 });
  assert.equal(capped.capped, true);
  assert.equal(capped.limit, 750000);
  close(capped.allowed, 45000);
  const old = M.deduction({ interest: 60000, avgBalance: 1000000, grandfathered: true, filing: 'single', otherItemized: 0, marginalRate: 0.24 });
  assert.equal(old.capped, false);
  assert.equal(old.allowed, 60000);
  const under = M.deduction({ interest: 27000, avgBalance: 440000, filing: 'single', otherItemized: 0, marginalRate: 0.24 });
  assert.equal(under.capped, false);
});

test('deduction: compares with the Form 1098 figure', () => {
  assert.equal(M.deduction({ interest: 27000, reported1098: '27000.40', filing: 'single' }).matches, true);
  const off = M.deduction({ interest: 27000, reported1098: '26000', filing: 'single' });
  assert.equal(off.matches, false);
  assert.equal(off.diff, 1000);
  assert.equal(M.deduction({ interest: 27000, reported1098: '', filing: 'single' }).diff, null);
});
