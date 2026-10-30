// Pure converters from provider payloads (Plaid, Alpaca) to the shapes engine.js expects.
// Kept free of network code so they are unit tested with fixtures.

const SKIP = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'BANK_FEES']);
const PAYROLL = /payroll|direct dep|salary|paycheck/i;

// Plaid reports outflows as positive amounts and inflows as negative.
function mapPlaidTransactions(added) {
  const rows = [];
  for (const t of added) {
    const pfc = t.personal_finance_category || {};
    const primary = pfc.primary || '';
    const detailed = pfc.detailed || '';
    if (SKIP.has(primary) || !t.date) continue;
    const month = t.date.slice(0, 7);

    if (primary === 'INCOME' || t.amount < 0) {
      // Test data sometimes files paychecks under other categories, so also match on the payee name.
      if (primary === 'INCOME' || primary === '' || PAYROLL.test(t.name || '')) {
        rows.push({ month, category: 'Salary', type: 'income', amount: Math.abs(t.amount) });
      }
      continue; // refunds, card payments and other credits are ignored
    }
    rows.push({ month, category: expenseCategory(primary, detailed), type: 'expense', amount: t.amount });
  }
  return rows;
}

function expenseCategory(primary, detailed) {
  switch (primary) {
    case 'RENT_AND_UTILITIES': return detailed.includes('RENT') ? 'Rent' : 'Utilities';
    case 'FOOD_AND_DRINK': return detailed.includes('GROCERIES') ? 'Groceries' : 'Dining';
    case 'TRANSPORTATION': return 'Transport';
    case 'ENTERTAINMENT': return 'Entertainment';
    case 'GENERAL_MERCHANDISE': return 'Shopping';
    case 'GENERAL_SERVICES': return detailed.includes('INSURANCE') ? 'Insurance' : 'Other';
    case 'LOAN_PAYMENTS': return detailed.includes('CAR') ? 'Car payment' : 'Debt payment';
    default: return 'Other';
  }
}

function mapAlpacaBars(bars) {
  return bars.map(b => ({ date: b.t.slice(0, 10), close: b.c }));
}

// Orders -> trades indexed by day in the price series (first bar on or after the fill date).
function mapAlpacaOrders(orders, prices) {
  const trades = [];
  for (const o of orders) {
    const qty = Number(o.filled_qty);
    if (!o.filled_at || !(qty > 0)) continue;
    const date = o.filled_at.slice(0, 10);
    const day = prices.findIndex(p => p.date >= date);
    if (day < 0) continue;
    trades.push({ day, side: o.side, shares: qty });
  }
  return trades.sort((a, b) => a.day - b.day);
}

module.exports = { mapPlaidTransactions, mapAlpacaBars, mapAlpacaOrders, expenseCategory };
