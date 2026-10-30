const test = require('node:test');
const assert = require('node:assert/strict');
// Rows also carry date and name; most tests only care about the ledger fields.
const strip = rows => rows.map(({ date, name, id, pending, ...r }) => r);
const { mapPlaidTransactions, mapAlpacaBars, mapAlpacaOrders } = require('../netlify/lib/mappers');

test('plaid: maps categories, signs and skips transfers', () => {
  const rows = mapPlaidTransactions([
    { date: '2025-03-01', amount: -4200, personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } },
    { date: '2025-03-02', amount: 1500, personal_finance_category: { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_RENT' } },
    { date: '2025-03-03', amount: 80, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' } },
    { date: '2025-03-04', amount: 40, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' } },
    { date: '2025-03-05', amount: 500, personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_SAVINGS' } },
    { date: '2025-03-06', amount: -25, personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'X' } }
  ]);
  assert.deepEqual(strip(rows), [
    { month: '2025-03', category: 'Salary', type: 'income', amount: 4200 },
    { month: '2025-03', category: 'Rent', type: 'expense', amount: 1500 },
    { month: '2025-03', category: 'Groceries', type: 'expense', amount: 80 },
    { month: '2025-03', category: 'Dining', type: 'expense', amount: 40 }
  ]);
});

test('plaid: paycheck miscategorised as food is still income; card payments are not', () => {
  const rows = mapPlaidTransactions([
    { date: '2025-03-07', amount: -810, name: 'Acme inc payroll ppd id', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' } },
    { date: '2025-03-14', amount: -2835, name: 'Payment Thank You-Mobile', personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }
  ]);
  assert.deepEqual(strip(rows), [{ month: '2025-03', category: 'Salary', type: 'income', amount: 810 }]);
  assert.equal(rows[0].date, '2025-03-07');
});

test('alpaca: bars and orders map onto the price series', () => {
  const prices = mapAlpacaBars([
    { t: '2025-06-16T04:00:00Z', c: 100 }, { t: '2025-06-17T04:00:00Z', c: 90 }, { t: '2025-06-18T04:00:00Z', c: 85 }
  ]);
  assert.deepEqual(prices[1], { date: '2025-06-17', close: 90 });

  const trades = mapAlpacaOrders([
    { side: 'sell', filled_qty: '10', filled_at: '2025-06-18T14:00:00Z' },
    { side: 'buy', filled_qty: '20', filled_at: '2025-06-16T14:00:00Z' },
    { side: 'buy', filled_qty: '0', filled_at: '2025-06-17T14:00:00Z' },
    { side: 'buy', filled_qty: '5', filled_at: null }
  ], prices);
  assert.deepEqual(trades, [
    { day: 0, side: 'buy', shares: 20 },
    { day: 2, side: 'sell', shares: 10 }
  ]);
});

test('functions: report not configured when keys are missing', async () => {
  for (const k of ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'ALPACA_KEY_ID', 'ALPACA_SECRET']) delete process.env[k];
  const plaid = await require('../netlify/functions/plaid').handler({});
  const alpaca = await require('../netlify/functions/alpaca').handler({ queryStringParameters: {} });
  assert.equal(JSON.parse(plaid.body).configured, false);
  assert.equal(JSON.parse(alpaca.body).configured, false);
});

test('alpaca function rejects a malformed symbol', async () => {
  process.env.ALPACA_KEY_ID = 'x'; process.env.ALPACA_SECRET = 'y';
  const res = await require('../netlify/functions/alpaca').handler({ queryStringParameters: { symbol: 'SPY&foo=1' } });
  assert.equal(res.statusCode, 400);
  delete process.env.ALPACA_KEY_ID; delete process.env.ALPACA_SECRET;
});
